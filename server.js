require('dotenv').config();
const express = require('express');
const compression = require('compression');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const cron = require('node-cron');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 8080;

// ─── Aqui configuramos los límites de cada plan de club (fuente única de verdad) ──
const PLAN_LIMITS = {
    free:       { maxActivities: 1,  maxGroupsPerActivity: 1  },
    club_lite:  { maxActivities: 3,  maxGroupsPerActivity: 10 },
    club_pro:   { maxActivities: 5,  maxGroupsPerActivity: 15 },
    club_elite: { maxActivities: 10, maxGroupsPerActivity: 30 },
    elite:      { maxActivities: 10, maxGroupsPerActivity: 30 }, // alias que usa el club global
};
// Devuelve los límites del plan indicado, o los del plan "free" si el plan no existe
const getPlanLimits = (plan) => PLAN_LIMITS[plan] || PLAN_LIMITS['free'];
// ─────────────────────────────────────────────────────────────────────────────

// El mercader itinerante aparece los domingos (0) y martes (2): dos oportunidades de compra por semana
function isMerchantDay(date = new Date()) {
    const day = date.getDay();
    return day === 0 || day === 2;
}

function getCurrentISOWeek(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Aqui configuramos el pool de conexiones a Heroku Postgres
// max:10 se mantiene dentro del límite de 25 conexiones del plan hobby/basic de Heroku Postgres
// idleTimeoutMillis libera las conexiones inactivas para que el dyno no las retenga abiertas
// connectionTimeoutMillis evita peticiones colgadas cuando todas las conexiones están ocupadas
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// Aqui inicializamos y migramos todas las tablas de la base de datos al arrancar
const initDB = async () => {
    if (!process.env.DATABASE_URL) {
        console.warn('No DATABASE_URL found. Skipping database initialization.');
        return;
    }

    try {
        // --- 0. MIGRACIONES DE MÁXIMA PRIORIDAD (corrigen caídas y bloqueos del servidor) ---
        // Aqui nos aseguramos de que la tabla de jefes (bosses) exista antes que nada
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_bosses (
                boss_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                club_id UUID,
                name VARCHAR(255) NOT NULL,
                total_hp INTEGER NOT NULL,
                current_hp INTEGER,
                image_url VARCHAR(1024),
                reward_points INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                category VARCHAR(50) DEFAULT 'monster',
                rarity_weight INTEGER DEFAULT 100,
                loot_table JSONB DEFAULT '[]',
                exp_reward INTEGER DEFAULT 50,
                attack_interval_min INTEGER DEFAULT 1000,
                attack_interval_max INTEGER DEFAULT 10000,
                min_damage INTEGER DEFAULT 10,
                max_damage INTEGER DEFAULT 20,
                team_healing_pool INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `).catch(() => { });

        // Aqui añadimos columnas nuevas una a una con IF NOT EXISTS para no romper bases de datos ya existentes
        await pool.query(`ALTER TABLE tul_bosses ADD COLUMN IF NOT EXISTS min_damage INTEGER DEFAULT 10`).catch(() => { });
        await pool.query(`ALTER TABLE tul_bosses ADD COLUMN IF NOT EXISTS max_damage INTEGER DEFAULT 20`).catch(() => { });
        await pool.query(`ALTER TABLE tul_bosses ADD COLUMN IF NOT EXISTS attack_interval_min INTEGER DEFAULT 1000`).catch(() => { });
        await pool.query(`ALTER TABLE tul_bosses ADD COLUMN IF NOT EXISTS attack_interval_max INTEGER DEFAULT 10000`).catch(() => { });
        await pool.query(`ALTER TABLE tul_bosses DROP COLUMN IF EXISTS base_damage`).catch(() => { });

        // 0. Catálogo de cinturones (tul_belts)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_belts (
                id SERIAL PRIMARY KEY,
                belt_level INTEGER UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                color_hex VARCHAR(50)
            );
        `);

        // 1. Tabla de clubs (tul_clubs): cada club tiene su propio plan y logo
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_clubs (
                club_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                logo VARCHAR(1024),
                plan VARCHAR(50) DEFAULT 'free',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // --- FIN DE LAS MIGRACIONES CRÍTICAS DE JEFES ---

        // 2. Tabla de usuarios: datos personales, cinturón, rol y club al que pertenece
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                surname VARCHAR(255),
                email VARCHAR(255) UNIQUE NOT NULL,
                username VARCHAR(255) UNIQUE,
                password VARCHAR(255) NOT NULL,
                belt VARCHAR(255),
                phone VARCHAR(50),
                birthday DATE,
                profile_picture VARCHAR(1024),
                media_consent BOOLEAN DEFAULT false,
                ad_removal BOOLEAN DEFAULT false,
                role VARCHAR(50) DEFAULT 'student',
                club_id UUID REFERENCES tul_clubs(club_id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Histórico de cinturones por usuario (tul_user_belts): registra cada cambio de nivel
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_user_belts (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                belt_level INTEGER NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 4. Catálogo de tuls (formas/patrones): nombre, vídeo, número de movimientos y cinturón requerido
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_tuls (
                tul_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL UNIQUE,
                video_url VARCHAR(1024),
                moves INTEGER,
                meaning TEXT,
                belt_requirement INTEGER
            );
        `);

        // Aqui forzamos el índice único sobre tul_tuls(name) para bases de datos ya existentes
        // (la restricción UNIQUE de CREATE TABLE solo se aplica a tablas nuevas, no a las que ya existían)
        await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tul_tuls_name ON tul_tuls (name)`);

        // Si la tabla está vacía, la rellenamos con los datos del fichero tulsData.json
        const tulCount = await pool.query('SELECT COUNT(*) FROM tul_tuls');
        if (parseInt(tulCount.rows[0].count) === 0) {
            try {
                const tulsData = require('./tulsData.json');
                for (const tul of tulsData) {
                    await pool.query(
                        `INSERT INTO tul_tuls (name, moves, belt_requirement)
                         VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING`,
                        [tul.name, tul.moves || null, tul.rankRequirement ?? null]
                    );
                }
                console.log(`[DB] Seeded ${tulsData.length} tuls into tul_tuls`);
            } catch (seedErr) {
                console.error('[DB] Could not seed tul_tuls:', seedErr.message);
            }
        }

        // 5. Actividades del club (p.ej. Taekwondo, Ballet)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_activities (
                activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                club_id UUID REFERENCES tul_clubs(club_id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                icon VARCHAR(255)
            );
        `);

        // 6. Grupos/clases dentro de cada actividad (p.ej. "Infantil 18:00")
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_groups (
                group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                activity_id UUID REFERENCES tul_activities(activity_id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                time VARCHAR(255),
                max_students INTEGER
            );
        `);

        // 7. Relación N a N entre alumnos y grupos (qué alumno está en qué clase)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_group_students (
                group_id UUID REFERENCES tul_groups(group_id) ON DELETE CASCADE,
                student_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                PRIMARY KEY (group_id, student_id)
            );
        `);

        // 7b. Histórico de altas y bajas de alumnos en los grupos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_enrollment_history (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                club_id UUID NOT NULL,
                group_id UUID,
                student_id UUID,
                student_name TEXT NOT NULL,
                group_name TEXT NOT NULL,
                activity_name TEXT NOT NULL,
                action VARCHAR(20) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 8. Asistencia: un registro por alumno, grupo y día (con marca de si fue automática)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_attendance (
                attendance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                group_id UUID REFERENCES tul_groups(group_id) ON DELETE CASCADE,
                student_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                date DATE NOT NULL,
                status VARCHAR(50) NOT NULL,
                is_auto BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (group_id, student_id, date)
            );
        `);

        // 9. Evaluaciones de tuls (forma evaluada, instructor, nota y comentario general)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_evaluations (
                evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                instructor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
                tul_id UUID REFERENCES tul_tuls(tul_id) ON DELETE SET NULL,
                tul_name TEXT,
                evaluation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                summary_comment TEXT
            );
        `);
        // Añadimos la columna tul_name a bases de datos antiguas que no la tenían
        await pool.query(`ALTER TABLE tul_evaluations ADD COLUMN IF NOT EXISTS tul_name TEXT`);
        await pool.query(`ALTER TABLE tul_evaluations ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES tul_activities(activity_id) ON DELETE SET NULL`).catch(() => { });

        // Aqui clasificamos las actividades por tipo, para que la app sepa cuál es "Taekwondo ITF"
        // y pueda limitar a ella los tuls, las evaluaciones y el panel de práctica
        await pool.query(`ALTER TABLE tul_activities ADD COLUMN IF NOT EXISTS activity_type VARCHAR(50) DEFAULT 'general'`).catch(() => { });
        await pool.query(`
            UPDATE tul_activities
            SET activity_type = 'taekwondo_itf'
            WHERE activity_type = 'general' AND (name ILIKE '%taekwondo%' OR name ILIKE '%itf%')
        `).catch(() => { });

        // Progresión genérica por (usuario, actividad): generaliza el sistema de cinturones
        // para admitir otras escalas (niveles de Inglés, grados de Ballet) además de Taekwondo
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_user_progression (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                activity_id UUID REFERENCES tul_activities(activity_id) ON DELETE CASCADE,
                activity_type VARCHAR(50) NOT NULL,
                level_order INTEGER NOT NULL,
                level_name VARCHAR(255) NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, activity_id)
            );
        `).catch(() => { });
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_tul_user_progression_user ON tul_user_progression (user_id)`).catch(() => { });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_user_progression_history (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                activity_id UUID REFERENCES tul_activities(activity_id) ON DELETE SET NULL,
                activity_type VARCHAR(50) NOT NULL,
                level_order INTEGER NOT NULL,
                level_name VARCHAR(255) NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `).catch(() => { });
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_tul_user_progression_history_user ON tul_user_progression_history (user_id, activity_id)`).catch(() => { });

        // Migración única: crea filas de progresión de Taekwondo ITF a partir del cinturón
        // global que ya tenía cada alumno matriculado, para no perder su progreso previo
        await pool.query(`
            INSERT INTO tul_user_progression (user_id, activity_id, activity_type, level_order, level_name)
            SELECT DISTINCT u.user_id, a.activity_id, 'taekwondo_itf',
                   COALESCE(u.belt_level, 0), COALESCE(u.belt, 'Blanco (10º Gup)')
            FROM users u
            JOIN tul_group_students gs ON gs.student_id = u.user_id
            JOIN tul_groups g ON gs.group_id = g.group_id
            JOIN tul_activities a ON g.activity_id = a.activity_id
            WHERE a.activity_type = 'taekwondo_itf'
            ON CONFLICT (user_id, activity_id) DO NOTHING
        `).catch(() => { });

        // Registro de experiencia (solo inserciones): guarda de qué actividad y fuente viene
        // cada cantidad de exp ganada, para poder generar informes por actividad sin tocar tul_rpg
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_exp_log (
                log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                activity_id UUID REFERENCES tul_activities(activity_id) ON DELETE SET NULL,
                source VARCHAR(50) NOT NULL,
                exp_amount INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `).catch(() => { });
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_tul_exp_log_user_activity ON tul_exp_log (user_id, activity_id)`).catch(() => { });

        await pool.query(`ALTER TABLE tul_groups ADD COLUMN IF NOT EXISTS max_students INTEGER`);
        await pool.query(`ALTER TABLE tul_groups ADD COLUMN IF NOT EXISTS min_age INTEGER`);
        await pool.query(`ALTER TABLE tul_groups ADD COLUMN IF NOT EXISTS max_age INTEGER`);
        await pool.query(`ALTER TABLE tul_groups ADD COLUMN IF NOT EXISTS sessions JSONB`);

        // Aulas/salas de cada club, con su capacidad y color para el calendario
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_aulas (
                aula_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                club_id UUID REFERENCES tul_clubs(club_id) ON DELETE CASCADE,
                name VARCHAR(100) NOT NULL,
                capacity INTEGER,
                description TEXT,
                color VARCHAR(20) DEFAULT '#3182CE',
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        // 10. Notas por movimiento dentro de cada evaluación de tul
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_evaluation_movements (
                movement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                evaluation_id UUID REFERENCES tul_evaluations(evaluation_id) ON DELETE CASCADE,
                move_index INTEGER NOT NULL,
                score INTEGER NOT NULL,
                comment TEXT
            );
        `);

        // 10b. Evaluaciones por categorías/rúbricas (Inglés, Ballet); Taekwondo sigue usando tul_evaluations
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_category_evaluations (
                evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                student_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                instructor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
                activity_id UUID REFERENCES tul_activities(activity_id) ON DELETE SET NULL,
                activity_type VARCHAR(50) NOT NULL,
                evaluation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                summary_comment TEXT
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_category_evaluation_scores (
                score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                evaluation_id UUID REFERENCES tul_category_evaluations(evaluation_id) ON DELETE CASCADE,
                category_key VARCHAR(50) NOT NULL,
                score INTEGER NOT NULL,
                comment TEXT
            );
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_tul_category_eval_scores_eval ON tul_category_evaluation_scores (evaluation_id)`).catch(() => { });

        // 11. Vocabulario para el juego de palabras (término + significado, por club)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_vocabulary (
                vocabulary_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                club_id UUID REFERENCES tul_clubs(club_id) ON DELETE CASCADE,
                term TEXT NOT NULL,
                meaning TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 12. Puntos acumulados de cada usuario
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_puntos (
                user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
                points NUMERIC DEFAULT 0
            );
        `);

        // 12b. Solicitudes de "Pedir Técnica": el instructor propone una técnica para que el grupo la practique
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_technique_requests (
                request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                club_id UUID REFERENCES tul_clubs(club_id) ON DELETE CASCADE,
                group_id UUID REFERENCES tul_groups(group_id) ON DELETE CASCADE,
                vocabulary_id UUID REFERENCES tul_vocabulary(vocabulary_id) ON DELETE SET NULL,
                technique_name TEXT NOT NULL,
                image_url TEXT,
                instructor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
                activity_id UUID REFERENCES tul_activities(activity_id) ON DELETE SET NULL,
                request_date DATE NOT NULL DEFAULT CURRENT_DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_technique_evaluations (
                evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                request_id UUID REFERENCES tul_technique_requests(request_id) ON DELETE CASCADE,
                student_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                instructor_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
                score INTEGER NOT NULL,
                comment TEXT,
                points_awarded INTEGER DEFAULT 0,
                evaluation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (request_id, student_id)
            );
        `);

        // 13. Clanes: agrupaciones de usuarios dentro de un club, con su emblema
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_clans (
                clan_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                club_id UUID REFERENCES tul_clubs(club_id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                emblem VARCHAR(1024),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 14. Miembros de cada clan, con su rol (líder, miembro, etc.)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_clan_members (
                clan_id UUID REFERENCES tul_clans(clan_id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                role VARCHAR(50) DEFAULT 'member',
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (clan_id, user_id)
            );
        `);

        // 15. Jefes (bosses) de las batallas: vida, daño, recompensas y tabla de loot
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_bosses (
                boss_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                club_id UUID REFERENCES tul_clubs(club_id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                total_hp INTEGER NOT NULL,
                current_hp INTEGER,
                image_url VARCHAR(1024),
                reward_points INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                category VARCHAR(50) DEFAULT 'monster',
                rarity_weight INTEGER DEFAULT 100,
                loot_table JSONB DEFAULT '[]',
                exp_reward INTEGER DEFAULT 50,
                attack_interval_min INTEGER DEFAULT 1000,
                attack_interval_max INTEGER DEFAULT 10000,
                min_damage INTEGER DEFAULT 10,
                max_damage INTEGER DEFAULT 20,
                team_healing_pool INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 16. Progreso de cada clan contra cada jefe (vida restante y última vez que lo atacaron)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_clan_boss_progress (
                clan_id UUID REFERENCES tul_clans(clan_id) ON DELETE CASCADE,
                boss_id UUID REFERENCES tul_bosses(boss_id) ON DELETE CASCADE,
                current_hp INTEGER NOT NULL,
                last_attacked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (clan_id, boss_id)
            );
        `);

        // 17. Artículos de la tienda/mercado de cada club (precio en puntos, tipo, stock, etc.)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_market_items (
                item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                club_id UUID REFERENCES tul_clubs(club_id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                cost_points INTEGER NOT NULL,
                type VARCHAR(50) DEFAULT 'virtual',
                image_url VARCHAR(1024),
                stock INTEGER DEFAULT -1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 18. Inventario: artículos que posee cada usuario y si ya los ha usado
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_inventory (
                inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                item_id UUID REFERENCES tul_market_items(item_id) ON DELETE CASCADE,
                is_used BOOLEAN DEFAULT false,
                acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);



        // 19. Mensajes del chat interno de cada clan
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_clan_chat (
                message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                clan_id UUID REFERENCES tul_clans(clan_id) ON DELETE CASCADE,
                user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                user_name VARCHAR(255),
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 20. Datos de personaje RPG de cada usuario: clase, nivel, exp, vida y puntos de habilidad
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_rpg (
                user_id UUID PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
                rpg_class VARCHAR(50) NOT NULL,
                level INTEGER DEFAULT 1,
                exp INTEGER DEFAULT 0,
                hp INTEGER DEFAULT 100,
                max_hp INTEGER DEFAULT 100,
                skill_points INTEGER DEFAULT 0,
                max_weight INTEGER DEFAULT 100
            );
        `);

        // 21. Registro de tickets de soporte (versión mejorada con prioridad y asignación)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tickets_registrosoporte (
                id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                subject VARCHAR(255) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(50) DEFAULT 'open',
                priority VARCHAR(20) DEFAULT 'low',
                due_date TIMESTAMP,
                assigned_to UUID REFERENCES users(user_id) ON DELETE SET NULL,
                app_label TEXT[] DEFAULT ARRAY['Learning Dungeon'],
                dev_response TEXT,
                email_sent BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 22. Participantes en cada batalla de jefe (corrige el error 500 al borrar un clan)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_boss_participants (
                boss_id UUID, 
                clan_id UUID, 
                user_id UUID, 
                PRIMARY KEY(boss_id, clan_id, user_id)
            );
        `);

        // 23. Inscripciones al evento de demostración (nombre y email)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_demoregistrations (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // --- AQUI INICIALIZAMOS EL CLUB GLOBAL (el club oficial al que pertenecen todos por defecto) ---
        const GLOBAL_CLUB_ID = '00000000-0000-4000-a000-000000000000';
        await pool.query(`
            INSERT INTO tul_clubs (club_id, name, logo, plan)
            VALUES ($1, 'Learning Dungeon Official', 'https://aimeducation.es/wp-content/uploads/2023/04/Logo-AIM-Education-Transparente.png', 'elite')
            ON CONFLICT (club_id) DO UPDATE SET name = EXCLUDED.name
        `, [GLOBAL_CLUB_ID]);

        // 12. Aqui aplicamos migraciones sueltas sobre tablas ya existentes
        await pool.query(`ALTER TABLE tul_clans ADD COLUMN IF NOT EXISTS logo TEXT`).catch(() => { });
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255) UNIQUE`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS belt_level INTEGER`);
        await pool.query(`ALTER TABLE tul_clan_boss_progress ADD COLUMN IF NOT EXISTS boss_level INTEGER DEFAULT 1`);
        await pool.query(`ALTER TABLE tul_clan_boss_progress ADD COLUMN IF NOT EXISTS last_rare_spawn_date TIMESTAMP`).catch(() => { });
        await pool.query(`ALTER TABLE users DROP COLUMN IF EXISTS rpg_class`);
        await pool.query(`ALTER TABLE users ALTER COLUMN profile_picture TYPE TEXT`).catch(() => { });

        await pool.query(`ALTER TABLE tul_attendance ADD COLUMN IF NOT EXISTS is_auto BOOLEAN DEFAULT FALSE`).catch(() => { });
        await pool.query(`ALTER TABLE tul_attendance ADD CONSTRAINT unique_attendance_per_group_student_date UNIQUE (group_id, student_id, date)`).catch(() => { });

        // --- MIGRACIONES DE LA REFORMA DEL RPG (las de jefes se movieron al principio del archivo) ---
        await pool.query(`ALTER TABLE tul_bosses ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'monster'`).catch(() => { });
        await pool.query(`ALTER TABLE tul_bosses ADD COLUMN IF NOT EXISTS rarity_weight INTEGER DEFAULT 100`).catch(() => { });
        await pool.query(`ALTER TABLE tul_bosses ADD COLUMN IF NOT EXISTS loot_table JSONB DEFAULT '[]'`).catch(() => { });
        await pool.query(`ALTER TABLE tul_bosses ADD COLUMN IF NOT EXISTS exp_reward INTEGER DEFAULT 50`).catch(() => { });

        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'equippable'`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS rarity VARCHAR(50) DEFAULT 'common'`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS special_effects JSONB DEFAULT '[]'`).catch(() => { });
        await pool.query(`ALTER TABLE tul_vocabulary ADD COLUMN IF NOT EXISTS belt_level INTEGER DEFAULT 0`).catch(() => { });
        await pool.query(`ALTER TABLE tul_vocabulary ADD COLUMN IF NOT EXISTS activity_type VARCHAR(50) DEFAULT 'taekwondo_itf'`).catch(() => { });
        await pool.query(`ALTER TABLE tul_vocabulary ADD COLUMN IF NOT EXISTS content_type VARCHAR(20) DEFAULT 'text'`).catch(() => { });
        await pool.query(`ALTER TABLE tul_vocabulary ADD COLUMN IF NOT EXISTS image_url TEXT`).catch(() => { });
        await pool.query(`ALTER TABLE tul_vocabulary ADD COLUMN IF NOT EXISTS topic TEXT`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS activity_type VARCHAR(50)`).catch(() => { });

        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS current_hp INTEGER DEFAULT 100`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS strength INTEGER DEFAULT 5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS vitality INTEGER DEFAULT 5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS agility INTEGER DEFAULT 5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS focus INTEGER DEFAULT 5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS mana INTEGER DEFAULT 50`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS max_mana INTEGER DEFAULT 50`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS potency INTEGER DEFAULT 5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS combat_stats TEXT`);
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS is_merchant_exclusive BOOLEAN DEFAULT false`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS is_in_base_store BOOLEAN DEFAULT true`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS is_merchant_sellable BOOLEAN DEFAULT false`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS is_merchant_buyable BOOLEAN DEFAULT false`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS sell_price_min INTEGER`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS sell_price_max INTEGER`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS buy_price_min INTEGER`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS buy_price_max INTEGER`).catch(() => { });
        await pool.query(`UPDATE tul_market_items SET is_in_base_store = true WHERE is_in_base_store IS NULL`).catch(() => { });

        // --- AQUI MIGRAMOS EL SISTEMA DE SOPORTE A SU NUEVA ESTRUCTURA ---
        // 1. Si existe la tabla antigua, copiamos sus datos a la nueva y la eliminamos
        await pool.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'tul_registrosoporte') THEN
                    -- Volcamos los datos antiguos en la nueva estructura de tabla
                    INSERT INTO tickets_registrosoporte (id, user_id, subject, description, status, dev_response, email_sent, created_at)
                    SELECT id, user_id, subject, description, status, dev_response, email_sent, created_at
                    FROM tul_registrosoporte
                    ON CONFLICT (id) DO NOTHING;

                    -- Borramos la tabla vieja una vez los datos están a salvo
                    DROP TABLE tul_registrosoporte;
                END IF;
            END $$;
        `).catch((e) => { console.error('Migration Error (Support):', e); });

        // 2. Añadimos las columnas nuevas (si todavía no existen)
        await pool.query(`ALTER TABLE tickets_registrosoporte ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'low'`).catch(() => { });
        await pool.query(`ALTER TABLE tickets_registrosoporte ADD COLUMN IF NOT EXISTS due_date TIMESTAMP`).catch(() => { });
        await pool.query(`ALTER TABLE tickets_registrosoporte ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(user_id) ON DELETE SET NULL`).catch(() => { });
        // 2. Añadimos más columnas nuevas
        await pool.query(`ALTER TABLE tickets_registrosoporte ADD COLUMN IF NOT EXISTS app_label TEXT[] DEFAULT ARRAY['Learning Dungeon']`).catch(() => { });
        // 2. Migramos app_label de forma segura y autorreparable
        // Optimización: solo ejecutamos la lógica pesada si hace falta de verdad

        try {
            const checkData = await pool.query(`
                SELECT count(*) as count FROM tickets_registrosoporte 
                WHERE column_default IS NULL AND data_type = 'character varying' AND column_name = 'app_label'
            `).catch(() => ({ rows: [] }));

            const typeCheck = await pool.query(`
                SELECT data_type FROM information_schema.columns 
                WHERE table_name = 'tickets_registrosoporte' AND column_name = 'app_label'
            `);
            const currentType = typeCheck.rows[0]?.data_type;

            if (currentType === 'character varying' || currentType === 'text') {
                console.log('[MIGRATION] app_label is string. Converting to TEXT[]...');
                await pool.query('ALTER TABLE tickets_registrosoporte ALTER COLUMN app_label DROP DEFAULT').catch(() => { });
                await pool.query('ALTER TABLE tickets_registrosoporte ALTER COLUMN app_label TYPE TEXT[] USING array[app_label]::TEXT[]');
                await pool.query("ALTER TABLE tickets_registrosoporte ALTER COLUMN app_label SET DEFAULT ARRAY['Learning Dungeon']");
            } else if (currentType === 'ARRAY') {
                // Solo aplanamos el array si detectamos anidación, para no ralentizar cada arranque
                const needsRepair = await pool.query(`SELECT 1 FROM tickets_registrosoporte WHERE array_ndims(app_label) > 1 LIMIT 1`);
                if (needsRepair.rowCount > 0) {
                    console.log('[MIGRATION] Nesting detected, repairing...');
                    await pool.query(`
                        UPDATE tickets_registrosoporte 
                        SET app_label = (SELECT array_agg(DISTINCT elem) FROM unnest(app_label) AS elem)
                        WHERE array_ndims(app_label) > 1
                    `);
                }
            }
        } catch (e) {
            console.error('[MIGRATION ERROR] Support logic:', e.message);
        }


        // 3. Nos aseguramos de que exista la columna dev_role en users
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS dev_role VARCHAR(50) DEFAULT 'student'`).catch(() => { });

        // 4. Actividades asignadas a cada instructor
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS activity_ids UUID[]`).catch(() => { });

        // ── Aqui creamos los índices de rendimiento ───────────────────────────
        // Son las columnas que más aparecen en cláusulas WHERE / JOIN.
        // CREATE INDEX IF NOT EXISTS es idempotente: se puede repetir en cada arranque sin problema.
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_club_id              ON users (club_id)',
            'CREATE INDEX IF NOT EXISTS idx_users_email                ON users (email)',
            'CREATE INDEX IF NOT EXISTS idx_users_role                 ON users (role)',
            'CREATE INDEX IF NOT EXISTS idx_tul_group_students_group   ON tul_group_students (group_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_group_students_student ON tul_group_students (student_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_groups_activity        ON tul_groups (activity_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_activities_club        ON tul_activities (club_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_evaluations_student    ON tul_evaluations (student_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_evaluations_date       ON tul_evaluations (evaluation_date)',
            'CREATE INDEX IF NOT EXISTS idx_tul_evaluation_movements   ON tul_evaluation_movements (evaluation_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_attendance_student     ON tul_attendance (student_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_attendance_group_date  ON tul_attendance (group_id, date)',
            'CREATE INDEX IF NOT EXISTS idx_tul_clan_members_clan      ON tul_clan_members (clan_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_clan_members_user      ON tul_clan_members (user_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_clans_club             ON tul_clans (club_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_bosses_club_active     ON tul_bosses (club_id, is_active)',
            'CREATE INDEX IF NOT EXISTS idx_tul_market_items_club      ON tul_market_items (club_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_inventory_user          ON tul_inventory (user_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_user_belts_user        ON tul_user_belts (user_id)',
            'CREATE INDEX IF NOT EXISTS idx_tul_rpg_user               ON tul_rpg (user_id)',
        ];
        for (const sql of indexes) {
            await pool.query(sql).catch(e => console.warn('Index skipped:', e.message));
        }
        // ─────────────────────────────────────────────────────────────────────

        // Aqui rellenamos users.belt_level a partir de tul_user_belts para los alumnos cuyo
        // belt_level sigue a 0/null (el texto del cinturón vive en users.belt, que es la columna de referencia).
        await pool.query(`
            UPDATE users u
            SET belt_level = ub.belt_level
            FROM (
                SELECT DISTINCT ON (user_id) user_id, belt_level
                FROM tul_user_belts
                ORDER BY user_id, updated_at DESC
            ) ub
            WHERE u.user_id = ub.user_id
              AND (u.belt_level IS NULL OR u.belt_level = 0)
              AND ub.belt_level > 0
        `).catch((e) => { console.warn('Belt_level backfill skipped:', e.message); });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS buy_price_max INTEGER`).catch(() => { });

        // 4. Sincronizamos la secuencia de IDs de los tickets (operación barata)
        await pool.query(`SELECT setval('tickets_registrosoporte_id_seq', (SELECT COALESCE(MAX(id), 0) FROM tickets_registrosoporte), true)`).catch(() => { });

        // Aqui lanzamos en segundo plano (sin await) las tareas de limpieza más pesadas, para no retrasar el arranque
        (async () => {
            try {
                // Solo limpiamos duplicados si la restricción todavía no existe
                const hasConstraint = await pool.query(`SELECT 1 FROM pg_constraint WHERE conname = 'unique_market_item_name_per_club'`);
                if (hasConstraint.rows.length === 0) {
                    await pool.query(`
                        DELETE FROM tul_market_items 
                        WHERE item_id NOT IN (
                            SELECT MIN(item_id) 
                            FROM tul_market_items 
                            GROUP BY club_id, name
                        )
                    `);
                    await pool.query(`ALTER TABLE tul_market_items ADD CONSTRAINT unique_market_item_name_per_club UNIQUE (club_id, name)`).catch(() => { });
                }
            } catch (e) { }
        })();

        await pool.query(`ALTER TABLE tul_inventory ADD COLUMN IF NOT EXISTS is_equipped BOOLEAN DEFAULT false`).catch(() => { });

        // Aqui migramos los usuarios sin username en segundo plano para no bloquear el arranque
        (async () => {
            try {
                await pool.query(`
                    UPDATE users 
                    SET username = 'Learning Dungeon_' || left(md5(random()::text), 8)
                    WHERE username IS NULL
                `);
            } catch (e) { }
        })();

        // Aqui forzamos el rol de líder para el admin (el email se configura con la variable de entorno ADMIN_EMAIL)
        if (process.env.ADMIN_EMAIL) {
            pool.query(
                `UPDATE tul_clan_members SET role = 'leader'
                 WHERE user_id = (SELECT user_id FROM users WHERE email = $1)
                 AND clan_id = (SELECT clan_id FROM tul_clans WHERE name = 'Aim Education' LIMIT 1)`,
                [process.env.ADMIN_EMAIL]
            ).catch(() => { });
        }

        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS skill_points INTEGER DEFAULT 0`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS max_weight FLOAT DEFAULT 100`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS strength INTEGER DEFAULT 5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS vitality INTEGER DEFAULT 5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS agility INTEGER DEFAULT 5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS focus INTEGER DEFAULT 5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS potency INTEGER DEFAULT 5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS mana_stat INTEGER DEFAULT 5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS weight FLOAT DEFAULT 0.5`).catch(() => { });
        await pool.query(`ALTER TABLE tul_rpg ADD COLUMN IF NOT EXISTS max_weight INTEGER DEFAULT 100`).catch(() => { });
        await pool.query(`ALTER TABLE tul_market_items ADD COLUMN IF NOT EXISTS weight NUMERIC DEFAULT 0.5`).catch(() => { });

        // ==========================================
        // Aqui sembramos los catálogos por defecto en la base de datos
        // ==========================================

        // Sembramos los cinturones
        try {
            await pool.query(`ALTER TABLE tul_belts ADD CONSTRAINT belts_belt_level_key UNIQUE(belt_level)`).catch(() => { });
            await pool.query(`
                INSERT INTO tul_belts (belt_level, name) VALUES 
                (0, 'Blanco (10º Gup)'),
                (1, 'Punta Amarilla (9º Gup)'),
                (2, 'Amarillo (8º Gup)'),
                (3, 'Punta Verde (7º Gup)'),
                (4, 'Verde (6º Gup)'),
                (5, 'Punta Azul (5º Gup)'),
                (6, 'Azul (4º Gup)'),
                (7, 'Punta Roja (3º Gup)'),
                (8, 'Rojo (2º Gup)'),
                (9, 'Punta Negra (1º Gup)'),
                (10, 'I Dan (Negro)'),
                (11, 'II Dan (Negro)'),
                (12, 'III Dan (Negro)'),
                (13, 'IV Dan (Negro)'),
                (14, 'V Dan (Negro)'),
                (15, 'VI Dan (Negro)'),
                (16, 'VII Dan (Negro)'),
                (17, 'VIII Dan (Negro)'),
                (18, 'IX Dan (Negro)')
                ON CONFLICT (belt_level) DO NOTHING;
            `);
        } catch (beltErr) {
            console.error('Error seeding belts table normally:', beltErr);
            try {
                const countRes = await pool.query('SELECT COUNT(*) FROM tul_belts');
                if (parseInt(countRes.rows[0].count) === 0) {
                    await pool.query(`
                        INSERT INTO tul_belts (belt_level, name) VALUES 
                        (0, 'Blanco (10º Gup)'),
                        (1, 'Punta Amarilla (9º Gup)'),
                        (2, 'Amarillo (8º Gup)'),
                        (3, 'Punta Verde (7º Gup)'),
                        (4, 'Verde (6º Gup)'),
                        (5, 'Punta Azul (5º Gup)'),
                        (6, 'Azul (4º Gup)'),
                        (7, 'Punta Roja (3º Gup)'),
                        (8, 'Rojo (2º Gup)'),
                        (9, 'Punta Negra (1º Gup)'),
                        (10, 'I Dan (Negro)'),
                        (11, 'II Dan (Negro)'),
                        (12, 'III Dan (Negro)'),
                        (13, 'IV Dan (Negro)'),
                        (14, 'V Dan (Negro)'),
                        (15, 'VI Dan (Negro)'),
                        (16, 'VII Dan (Negro)'),
                        (17, 'VIII Dan (Negro)'),
                        (18, 'IX Dan (Negro)')
                    `);
                }
            } catch (fallbackErr) {
                console.error('Fallback belt seeding totally failed:', fallbackErr);
            }
        }

        // Sembramos todos los tuls (en segundo plano para evitar el timeout de arranque)
        setTimeout(async () => {
            try {
                const tulsPath = path.join(__dirname, 'tulsData.json');
                if (fs.existsSync(tulsPath)) {
                    const tulsData = JSON.parse(fs.readFileSync(tulsPath, 'utf8'));
                    for (const tul of tulsData) {
                        await pool.query(`
                            INSERT INTO tul_tuls (name, moves, meaning, belt_requirement, video_url)
                            SELECT $1, $2, $3, $4, $5
                            WHERE NOT EXISTS (SELECT 1 FROM tul_tuls WHERE name = $1);
                        `, [tul.name, tul.moves, tul.meaning.es || tul.meaning.en, tul.rankRequirement, tul.videoId]);
                    }
                    console.log(`[BACKGROUND] Seeded ${tulsData.length} Tuls.`);
                }
            } catch (e) {
                console.error('Error seeding Tuls in background:', e);
            }
        }, 5000);

        // --- Aqui sembramos los artículos del sistema RPG en cada club ---
        try {
            const systemItemsRes = await pool.query('SELECT club_id FROM tul_clubs');
            const resetItemImg = 'https://cdn-icons-png.flaticon.com/512/3233/3233959.png';
            for (const club of systemItemsRes.rows) {
                await pool.query(`
                    INSERT INTO tul_market_items (
                        club_id, name, description, cost_points, item_type, image_url, stock, 
                        is_in_base_store, is_merchant_sellable, is_merchant_exclusive,
                        buy_price_min, buy_price_max
                    )
                    VALUES ($1, 'Piedra de Reinicio de Clase', 'Un cristal místico que permite borrar tu memoria marcial y elegir una nueva clase RPG.', 2500, 'consumable', $2, 999, false, true, true, 2000, 3000)
                    ON CONFLICT (club_id, name) DO UPDATE SET
                        description = EXCLUDED.description,
                        is_in_base_store = false,
                        is_merchant_sellable = true,
                        is_merchant_exclusive = true,
                        buy_price_min = 2000,
                        buy_price_max = 3000;
                `, [club.club_id, resetItemImg]);
            }
        } catch (seedErr) { console.error('Error seeding system items:', seedErr); }

        await pool.query(`ALTER TABLE tul_clans ADD COLUMN IF NOT EXISTS bank_points INTEGER DEFAULT 0`).catch(() => { });
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_loot_chests (
                chest_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                club_id UUID REFERENCES tul_clubs(club_id) ON DELETE CASCADE,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                image_url VARCHAR(1024),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `).catch(() => { });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_loot_pool (
                pool_id SERIAL PRIMARY KEY,
                chest_id UUID REFERENCES tul_loot_chests(chest_id) ON DELETE CASCADE,
                item_id UUID REFERENCES tul_market_items(item_id) ON DELETE CASCADE,
                weight INTEGER DEFAULT 1
            );
        `).catch(() => { });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_clan_inventory (
                clan_inventory_id SERIAL PRIMARY KEY,
                clan_id UUID REFERENCES tul_clans(clan_id) ON DELETE CASCADE,
                item_id UUID REFERENCES tul_market_items(item_id) ON DELETE CASCADE,
                quantity INTEGER DEFAULT 1,
                acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(clan_id, item_id)
            );
        `).catch(() => { });

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tul_active_buffs (
                buff_id SERIAL PRIMARY KEY,
                user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
                multiplier NUMERIC DEFAULT 1.0,
                expires_at TIMESTAMP NOT NULL
            );
        `).catch(() => { });

        console.log('Postgres complete relational database tables verified/initialized & seeded.');
    } catch (err) {
        console.error('Error initializing database tables:', err);
    }
};

const activeLobbies = {};

// --- Aqui guardamos el estado en memoria de los jefes de la demo ---
let demoState = {
    bosses: [
        { id: 1, name: "Guerrero Sombra", totalHp: 5000, hp: 5000, img: "https://i.postimg.cc/fL3K610Y/Persian-Warrior.png" },
        { id: 2, name: "Dragón de Obsidiana", totalHp: 10000, hp: 10000, img: "https://i.postimg.cc/yNGhXnrd/Obsidian-Dragon.png" },
        { id: 3, name: "Caballero Oscuro", totalHp: 15000, hp: 15000, img: "https://i.postimg.cc/CL4j6wQx/Black-Knight.png" }
    ],
    currentBossIndex: 0,
    players: {},
    bossAttackInterval: null,
    intermissionTimer: null,
    intermissionSeconds: 0
};

// --- Aqui guardamos el estado en memoria del jefe del modo arbitraje ---
let arbitrajeState = {
    boss: {
        name: "Maestra Ana María",
        hp: 10000,
        totalHp: 10000,
        level: 1,
        damagePerError: 10,
        img: "https://i.postimg.cc/GmsLL3mZ/Sin-titulo.png"
    },
    players: {} // socketId -> { name, hp, damage, deaths }
};

// Aqui extraemos el userId verificado del token JWT que llega en el handshake del socket (si lo hay)
io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            socket.data.userId = decoded.userId;
        } catch {
            // Token inválido: el socket se conecta igualmente, pero no confiamos en el userId del payload
        }
    }
    next();
});

io.on('connection', (socket) => {
    // --- Aqui gestionamos los sockets de la sala de demostración ---
    socket.on('demo_tv_join', () => {
        socket.join('demo_tv');
        const boss = demoState.bosses[demoState.currentBossIndex];
        socket.emit('demo_state_update', { boss });
        if(demoState.intermissionSeconds > 0) {
            socket.emit('demo_intermission_tick', demoState.intermissionSeconds);
        }
    });

    socket.on('demo_player_join', () => {
        socket.join('demo_players');
        demoState.players[socket.id] = { id: socket.id, hp: 100 };
        socket.emit('demo_player_state', demoState.players[socket.id]);

        // Empezar a atacar cada 15 segundos si no estaba ya atacando y no estamos en intermision
        if (!demoState.bossAttackInterval && demoState.intermissionSeconds <= 0) {
            demoState.bossAttackInterval = setInterval(() => {
                io.to('demo_players').emit('demo_boss_attack', { damage: 5 });
            }, 15000);
        }
    });

    socket.on('demo_attack', (damage) => {
        if(demoState.intermissionSeconds > 0) return; // Ignoramos los ataques mientras dura la intermisión
        const boss = demoState.bosses[demoState.currentBossIndex];
        if (boss.hp > 0) {
            boss.hp = Math.max(0, boss.hp - damage);
            io.to('demo_tv').emit('demo_boss_hit', { damage, newHp: boss.hp });
            if (boss.hp === 0) {
                io.to('demo_players').emit('demo_boss_dead');
                io.to('demo_tv').emit('demo_boss_dead');
                if(demoState.bossAttackInterval) {
                   clearInterval(demoState.bossAttackInterval);
                   demoState.bossAttackInterval = null;
                }

                // Iniciar intermisión de 2 minutos (120 segundos)
                demoState.intermissionSeconds = 120;
                if(demoState.intermissionTimer) clearInterval(demoState.intermissionTimer);
                
                demoState.intermissionTimer = setInterval(() => {
                    demoState.intermissionSeconds--;
                    io.to('demo_tv').emit('demo_intermission_tick', demoState.intermissionSeconds);
                    
                    if(demoState.intermissionSeconds <= 0) {
                        clearInterval(demoState.intermissionTimer);
                        demoState.intermissionTimer = null;
                        
                        // Siguiente boss
                        demoState.currentBossIndex = (demoState.currentBossIndex + 1) % demoState.bosses.length;
                        const newBoss = demoState.bosses[demoState.currentBossIndex];
                        newBoss.hp = newBoss.totalHp;
                        
                        io.to('demo_tv').emit('demo_state_update', { boss: newBoss });
                        io.to('demo_players').emit('demo_new_boss');
                        
                        if (Object.keys(demoState.players).length > 0 && !demoState.bossAttackInterval) {
                            demoState.bossAttackInterval = setInterval(() => {
                                io.to('demo_players').emit('demo_boss_attack', { damage: 5 });
                            }, 15000);
                        }
                    }
                }, 1000);
            }
        }
    });

    socket.on('demo_change_boss', (index) => {
        if (index >= 0 && index < demoState.bosses.length) {
            demoState.currentBossIndex = index;
            const boss = demoState.bosses[demoState.currentBossIndex];
            io.to('demo_tv').emit('demo_state_update', { boss });
        }
    });

    socket.on('demo_revive_boss', () => {
        const boss = demoState.bosses[demoState.currentBossIndex];
        boss.hp = boss.totalHp;
        io.to('demo_tv').emit('demo_state_update', { boss });

        // Reiniciamos el intervalo de ataques si hay jugadores conectados
        if (Object.keys(demoState.players).length > 0 && !demoState.bossAttackInterval) {
            demoState.bossAttackInterval = setInterval(() => {
                io.to('demo_players').emit('demo_boss_attack', { damage: 5 });
            }, 15000);
        }
    });

    socket.on('disconnect', () => {
        if (demoState.players[socket.id]) {
            delete demoState.players[socket.id];
            if (Object.keys(demoState.players).length === 0 && demoState.bossAttackInterval) {
                clearInterval(demoState.bossAttackInterval);
                demoState.bossAttackInterval = null;
            }
        }
    });
    // --- Fin de los sockets de la demo ---

    // --- Aqui gestionamos los sockets del modo arbitraje ---


    socket.on('arb_tv_join', () => {
        socket.join('arb_tv');
        socket.emit('arb_state_update', { boss: arbitrajeState.boss });
    });

    socket.on('arb_player_join', (data) => {
        socket.join('arb_players');
        if (!arbitrajeState.players[socket.id]) {
            arbitrajeState.players[socket.id] = {
                id: socket.id,
                name: data.name || "Árbitro Anónimo",
                hp: 100,
                damage: 0,
                deaths: 0
            };
        }
        socket.emit('arb_player_state', arbitrajeState.players[socket.id]);
        socket.emit('arb_state_update', { boss: arbitrajeState.boss });
    });

    socket.on('arb_submit_answer', (isCorrect) => {
        const player = arbitrajeState.players[socket.id];
        if (!player || player.hp <= 0) return;

        if (isCorrect) {
            if (arbitrajeState.boss.hp <= 0) return;
            const damage = 50;
            arbitrajeState.boss.hp = Math.max(0, arbitrajeState.boss.hp - damage);
            player.damage += damage;
            
            io.to('arb_tv').emit('arb_boss_hit', { 
                damage, 
                newHp: arbitrajeState.boss.hp,
                playerName: player.name 
            });

            if (arbitrajeState.boss.hp <= 0) {
                // ¡Jefe derrotado! Calculamos el ranking de jugadores por daño infligido
                const ranking = Object.values(arbitrajeState.players)
                    .sort((a, b) => b.damage - a.damage);

                io.to('arb_tv').emit('arb_boss_defeated', { ranking, level: arbitrajeState.boss.level });
                io.to('arb_players').emit('arb_boss_defeated');

                // Aqui escalamos el jefe: duplicamos su vida y su daño para la siguiente ronda
                setTimeout(() => {
                    arbitrajeState.boss.level += 1;
                    arbitrajeState.boss.totalHp *= 2;
                    arbitrajeState.boss.hp = arbitrajeState.boss.totalHp;
                    arbitrajeState.boss.damagePerError *= 2;

                    io.to('arb_tv').emit('arb_state_update', { boss: arbitrajeState.boss });
                    io.to('arb_players').emit('arb_new_boss', { boss: arbitrajeState.boss });
                }, 10000); // Dejamos 10 segundos para ver el ranking
            }
        } else {
            const penalty = arbitrajeState.boss.damagePerError;
            player.hp = Math.max(0, player.hp - penalty);
            if (player.hp <= 0) {
                player.deaths += 1;
                socket.emit('arb_player_dead');
            }
            socket.emit('arb_player_state', player);
        }
    });

    socket.on('arb_revive', () => {
        const player = arbitrajeState.players[socket.id];
        if (player) {
            player.hp = 100;
            socket.emit('arb_player_state', player);
        }
    });

    socket.on('arb_revive_boss', () => {
        arbitrajeState.boss.hp = arbitrajeState.boss.totalHp;
        io.to('arb_tv').emit('arb_state_update', { boss: arbitrajeState.boss });
        io.to('arb_players').emit('arb_new_boss', { boss: arbitrajeState.boss });
    });

    socket.on('disconnect', () => {
        if (demoState.players[socket.id]) {
            delete demoState.players[socket.id];
            if (Object.keys(demoState.players).length === 0 && demoState.bossAttackInterval) {
                clearInterval(demoState.bossAttackInterval);
                demoState.bossAttackInterval = null;
            }
        }
        if (arbitrajeState.players[socket.id]) {
            // Conservamos los datos del jugador para el ranking aunque se desconecte;
            // si hiciera falta, aquí podríamos marcarlo como inactivo.
        }
    });
    // --- Fin de los sockets del modo arbitraje ---

    socket.on('join_clan', (clanId) => {
        socket.join(`clan_${clanId}`);
    });

    socket.on('send_message', async (data) => {
        const { clanId, userName, message } = data;
        // Usamos el userId verificado del handshake JWT; nunca confiamos en la identidad que manda el cliente
        const userId = socket.data.userId || data.userId;
        try {
            // Aqui filtramos palabras malsonantes e insultos antes de guardar el mensaje
            const badWords = [
                'puta', 'putas', 'puto', 'putos', 'mierda', 'mierdas',
                'cabron', 'cabrones', 'cabrona', 'joder', 'coño',
                'polla', 'follar', 'sexo', 'imbecil', 'imbécil', 'imbeciles', 'imbéciles',
                'gilipollas', 'idiota', 'idiotas', 'retrasado', 'retrasada', 'retrasados', 'retrasadas',
                'subnormal', 'subnormales', 'tonto', 'tonta', 'estupido', 'estupida', 'estúpido', 'estúpidos',
                'maricon', 'maricón', 'maricones', 'zorra', 'zorras', 'guarra', 'guarras',
                'hijo de puta', 'hija de puta', 'malnacido', 'bastardo', 'pendejo', 'pendeja', 'pendejos',
                'mamahuevo', 'chupapollas', 'comemierda', 'capullo', 'porno'
            ];
            let cleanMessage = message;
            badWords.forEach(word => {
                const cleanRegex = new RegExp(`\\b${word}\\b`, 'gi');
                cleanMessage = cleanMessage.replace(cleanRegex, '***');
            });

            const res = await pool.query(
                `INSERT INTO tul_clan_chat (clan_id, user_id, user_name, message) VALUES ($1, $2, $3, $4) RETURNING *`,
                [clanId, userId, userName, cleanMessage]
            );
            io.to(`clan_${clanId}`).emit('new_message', res.rows[0]);
        } catch (e) { console.error('Chat error', e); }
    });

    socket.on('create_lobby', (data) => {
        const { clanId, userId, userName, isPublic, rpgClass } = data;
        const lobbyId = Math.random().toString(36).substr(2, 6).toUpperCase();
        activeLobbies[lobbyId] = {
            id: lobbyId, clanId, leaderId: userId, isPublic,
            players: [{ id: userId, name: userName, rpgClass }]
        };
        socket.join(`lobby_${lobbyId}`);
        io.to(`clan_${clanId}`).emit('lobbies_updated');
        socket.emit('lobby_created', activeLobbies[lobbyId]);
    });

    socket.on('join_lobby', (data) => {
        const { lobbyId, userId, userName, rpgClass, clanId } = data;
        const lobby = activeLobbies[lobbyId];
        if (lobby && lobby.players.length < 4) {
            const exists = lobby.players.some(p => p.id === userId);
            if (!exists) {
                lobby.players.push({ id: userId, name: userName, rpgClass });
            }
            socket.join(`lobby_${lobbyId}`);
            io.to(`lobby_${lobbyId}`).emit('lobby_update', lobby);
            io.to(`clan_${clanId}`).emit('lobbies_updated');
        } else {
            socket.emit('lobby_error', 'El grupo está lleno o no existe.');
        }
    });

    socket.on('leave_lobby', (data) => {
        const { lobbyId, userId, clanId } = data;
        const lobby = activeLobbies[lobbyId];
        if (lobby) {
            lobby.players = lobby.players.filter(p => p.id !== userId);
            socket.leave(`lobby_${lobbyId}`);
            if (lobby.players.length === 0) {
                delete activeLobbies[lobbyId];
            } else if (lobby.leaderId === userId) {
                lobby.leaderId = lobby.players[0].id;
            }
            io.to(`lobby_${lobbyId}`).emit('lobby_update', activeLobbies[lobbyId] || null);
            io.to(`clan_${clanId}`).emit('lobbies_updated');
        }
    });

    socket.on('start_game_sync', (lobbyId) => {
        const lobby = activeLobbies[lobbyId];
        if (lobby) {
            io.to(`lobby_${lobbyId}`).emit('game_starting');
        }
    });
});

// Middlewares
app.use(compression()); // Comprimimos todas las respuestas con gzip — gran ahorro de ancho de banda en Heroku
app.use(express.json({ limit: '10mb' }));

// ─── Aqui configuramos la autenticación por JWT ──────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production';

// Middleware que valida el token Bearer y cuelga el payload decodificado en req.user
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato esperado: "Bearer <token>"
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(403).json({ error: 'Invalid or expired token.' });
    }
};

// Middleware que solo deja pasar a usuarios con devRole = 'superadmin'
const requireSuperadmin = (req, res, next) => {
    if (!req.user || req.user.devRole !== 'superadmin') {
        return res.status(403).json({ error: 'Superadmin access required.' });
    }
    next();
};

// Aqui protegemos todas las operaciones de escritura; las rutas GET quedan públicas
const PUBLIC_POST_PATHS = ['/login', '/register'];
app.use('/api', (req, res, next) => {
    if (req.method === 'GET') return next();
    if (PUBLIC_POST_PATHS.includes(req.path)) return next();
    authenticateToken(req, res, next);
});
// ─────────────────────────────────────────────────────────────────────────────

// --- Aqui exponemos las rutas y la API de la demo ---
app.get('/arbitraje/mobile', (req, res) => {
    res.sendFile(path.join(__dirname, 'arbitraje', 'mobile.html'));
});
app.use('/demo', express.static(path.join(__dirname, 'demo')));
app.use('/arbitraje', express.static(path.join(__dirname, 'arbitraje')));

app.post('/api/demo/register', async (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
    try {
        await pool.query('INSERT INTO tul_demoregistrations (name, email) VALUES ($1, $2)', [name, email]);
        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Demo registration error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/demo/questions', async (req, res) => {
    try {
        // Buscamos el vocabulario perteneciente al club "Aim Education"
        const aimEducationRes = await pool.query("SELECT club_id FROM tul_clubs WHERE name ILIKE '%Aim Education%' LIMIT 1");
        if (aimEducationRes.rows.length === 0) {
            return res.status(200).json({ success: true, questions: [] });
        }
        const clubId = aimEducationRes.rows[0].club_id;
        const qRes = await pool.query('SELECT term, meaning FROM tul_vocabulary WHERE club_id = $1 ORDER BY RANDOM() LIMIT 50', [clubId]);
        res.status(200).json({ success: true, questions: qRes.rows });
    } catch (err) {
        console.error('Demo questions error:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// Endpoints de la API
// --- Aqui registramos un usuario nuevo ---
app.post('/api/register', async (req, res) => {
    // Extraemos los campos que env\u00eda el cliente de Learning Dungeon (React Native)
    const { name, surname, email, password, belt, phone, birthday, mediaConsent, adRemoval } = req.body;

    // Comprobamos que est\u00e9n presentes los campos obligatorios
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    try {
        // Generamos el username: 2 primeras letras del nombre + 2 primeras del apellido + d\u00eda y mes de nacimiento
        const cleanAccents = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
        const namePart = cleanAccents(name.trim().split(' ')[0]).substring(0, 2);
        const surnamePart = surname ? cleanAccents(surname.trim().split(' ')[0]).substring(0, 2) : 'es';

        let bdPart = '0000';
        if (birthday) {
            const dateObj = new Date(birthday);
            if (!isNaN(dateObj.getTime())) {
                bdPart = `${String(dateObj.getDate()).padStart(2, '0')}${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
            }
        }
        let baseUsername = `${namePart}${surnamePart}${bdPart}`;

        // Si ya existe ese username exacto, le a\u00f1adimos 4 d\u00edgitos aleatorios para desambiguar
        const checkUser = await pool.query('SELECT 1 FROM users WHERE username = $1', [baseUsername]);
        if (checkUser.rows.length > 0) {
            baseUsername = `${baseUsername}${Math.floor(1000 + Math.random() * 9000)}`;
        }

        // Encriptamos la contrase\u00f1a antes de guardarla
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Consulta parametrizada para evitar inyecci\u00f3n SQL
        const query = `
            INSERT INTO users(
                        name, surname, email, username, password, belt, phone, birthday, media_consent, ad_removal
                    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING user_id, name, email, username, role, created_at;
                    `;

        const values = [
            name,
            surname || null,
            email.toLowerCase(),
            baseUsername,
            hashedPassword, // Contraseña ya encriptada con bcrypt
            belt || 'Blanco (10º Gup)',
            phone || null,
            birthday || null,
            mediaConsent || false,
            adRemoval || false
        ];

        const result = await pool.query(query, values);
        const newUser = result.rows[0];

        // --- Aqui sincronizamos el contacto con HubSpot en tiempo real (si está configurado) ---
        if (process.env.HUBSPOT_ACCESS_TOKEN) {
            try {
                const hubspotResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        properties: {
                            email: email.toLowerCase(),
                            firstname: name,
                            lastname: surname || '',
                            phone: phone || ''
                        }
                    })
                });

                if (!hubspotResponse.ok) {
                    const errorResponse = await hubspotResponse.json();
                    if (hubspotResponse.status !== 409) { // El 409 es normal si el contacto ya existe; lo ignoramos en silencio
                        console.warn('HubSpot Sync Warning (non-fatal):', errorResponse);
                    }
                }
            } catch (hubspotErr) {
                console.error('HubSpot Sync Network Error (non-fatal):', hubspotErr);
            }
        }

        // Devolvemos el usuario recién creado (sin la contraseña)
        res.status(201).json({ success: true, user: newUser });

    } catch (err) {
        console.error('API Error during /register:', err);
        // Capturamos el error de restricción única de PostgreSQL cuando el email ya existe
        if (err.code === '23505' && err.constraint === 'users_email_key') {
            return res.status(409).json({ error: 'This email is already registered.' });
        }
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// --- Aqui gestionamos el login del usuario ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email/Username and password are required.' });
    }

    try {
        const isEmail = email.includes('@');
        // Buscamos al usuario por email o por username, juntando datos del club y del cinturón dinámico
        const query = `
            SELECT u.*, c.name as organization_name, c.logo as organization_logo, c.plan as club_plan,
                   rpg.rpg_class as rpg_class,
                   rpg.level as rpg_level,
                   rpg.exp as rpg_exp,
                   (SELECT belt_level FROM tul_user_belts WHERE user_id = u.user_id ORDER BY updated_at DESC LIMIT 1) as dynamic_rank
            FROM users u
            LEFT JOIN tul_clubs c ON u.club_id = c.club_id
            LEFT JOIN tul_rpg rpg ON u.user_id = rpg.user_id
            WHERE ${isEmail ? 'u.email = $1' : 'u.username = $1'}
        `;
        const result = await pool.query(query, [email.toLowerCase()]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = result.rows[0];

        // Resolvemos el rango: belt_level en users es la caché numérica de users.belt
        const finalRank = user.belt_level != null ? parseInt(user.belt_level)
            : (user.dynamic_rank != null ? parseInt(user.dynamic_rank) : 0);

        // Comparamos la contraseña en texto plano recibida contra el hash bcrypt guardado
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Quitamos el hash de la contraseña antes de devolver el perfil del usuario
        delete user.password;

        let organizationId = user.club_id;
        let organizationName = user.organization_name;

        if (user.role === 'club_owner' && !organizationId) {
            const newClubRes = await pool.query(
                "INSERT INTO tul_clubs (name, plan) VALUES ($1, $2) RETURNING club_id",
                [`${user.name}'s Club`, user.plan || 'club_lite']
            );
            organizationId = newClubRes.rows[0].club_id;
            organizationName = `${user.name}'s Club`;
            await pool.query("UPDATE users SET club_id = $1 WHERE user_id = $2", [organizationId, user.user_id]);
        }

        // Aqui transformamos las columnas de Postgres al formato UserProfile que espera el cliente
        const userProfile = {
            id: user.user_id,
            name: `${user.name} ${user.surname || ''}`.trim(),
            email: user.email,
            username: user.username,
            rank: finalRank,
            beltName: user.belt || 'Blanco (10º Gup)',
            belt_level: finalRank,
            role: user.role || 'student',
            plan: user.plan && user.plan !== 'free' ? user.plan : (user.club_plan || 'free'),
            organizationId: organizationId || undefined,
            organizationName: organizationName || undefined,
            organizationLogo: user.organization_logo || undefined,
            profilePicture: user.profile_picture || undefined,
            rpgClass: user.rpg_class || 'unassigned',
            devRole: user.dev_role || 'student',
            mediaConsent: user.media_consent,
            hasPurchasedAdRemoval: user.ad_removal
        };

        const token = jwt.sign(
            { userId: userProfile.id, role: userProfile.role, devRole: userProfile.devRole },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.status(200).json({ success: true, user: userProfile, token });
    } catch (err) {
        console.error('API Error during /login:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// --- Aqui actualizamos el username del usuario ---
app.put('/api/users/:userId/username', async (req, res) => {
    const { userId } = req.params;
    const { username } = req.body;

    if (!username || typeof username !== 'string' || username.trim() === '') {
        return res.status(400).json({ error: 'A valid username is required.' });
    }

    try {
        const cleanUsername = username.trim().toLowerCase();
        await pool.query('UPDATE users SET username = $1 WHERE user_id = $2', [cleanUsername, userId]);
        res.status(200).json({ success: true, username: cleanUsername });
    } catch (err) {
        console.error('API Error during /users/:userId/username:', err);
        // Capturamos el error de restricción única de PostgreSQL cuando el username ya está cogido
        if (err.code === '23505' && err.constraint === 'users_username_key') {
            return res.status(409).json({ error: 'This username is already taken.' });
        }
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// --- Aqui actualizamos la foto de perfil del usuario ---
app.put('/api/users/:userId/profile-picture', async (req, res) => {
    const { userId } = req.params;
    const { image } = req.body;

    if (!image || typeof image !== 'string') {
        return res.status(400).json({ error: 'Image data is required.' });
    }
    const validPrefixes = ['data:image/jpeg;base64,', 'data:image/png;base64,', 'data:image/webp;base64,'];
    if (!validPrefixes.some(p => image.startsWith(p))) {
        return res.status(400).json({ error: 'Invalid image format. Must be JPEG, PNG or WebP.' });
    }
    if (image.length > 14 * 1024 * 1024) { // ~10MB reales una vez descontada la sobrecarga de base64
        return res.status(413).json({ error: 'Image too large. Maximum size is 10MB.' });
    }

    try {
        await pool.query('UPDATE users SET profile_picture = $1 WHERE user_id = $2', [image, userId]);
        res.status(200).json({ success: true, profilePicture: image });
    } catch (err) {
        console.error('API Error during /users/:userId/profile-picture:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// --- Aqui asignamos o cambiamos la clase RPG del usuario ---
app.put('/api/users/:userId/rpg-class', async (req, res) => {
    const { userId } = req.params;
    const { rpgClass } = req.body;

    if (!rpgClass) {
        return res.status(400).json({ error: 'RPG class is required.' });
    }

    const normalizedClass = rpgClass.charAt(0).toUpperCase() + rpgClass.slice(1);

    try {
        await pool.query(
            `INSERT INTO tul_rpg (user_id, rpg_class, level, exp, max_hp, current_hp, max_mana, mana, skill_points, strength, vitality, agility, potency, focus)
             VALUES ($1, $2, 1, 0, 100, 100, 50, 50, 5, 5, 5, 5, 5, 5)
             ON CONFLICT (user_id)
             DO UPDATE SET rpg_class = EXCLUDED.rpg_class`,
            [userId, normalizedClass]
        );
        res.status(200).json({ success: true, rpgClass: normalizedClass });
    } catch (err) {
        console.error('API Error during /users/:userId/rpg-class:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});


// --- Aqui un admin puede resetear la contraseña de cualquier usuario ---
app.put('/api/users/:userId/password/admin', async (req, res) => {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        await pool.query('UPDATE users SET password = $1 WHERE user_id = $2', [hashedPassword, userId]);
        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (err) {
        console.error('API Error during admin password reset:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// --- Aqui actualizamos la progresión del alumno en una actividad concreta (genérico para cualquier escala, no solo cinturones) ---
app.put('/api/users/:userId/progression', async (req, res) => {
    const { userId } = req.params;
    const { activityId, levelOrder, levelName, assigned_by_user_id: assignedByUserId = null } = req.body;

    if (!activityId || !levelName || levelOrder === undefined || levelOrder === null) {
        return res.status(400).json({ error: 'activityId, levelOrder and levelName are required.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Averiguamos el tipo de la actividad y confirmamos que el alumno está matriculado en ella
        const activityCheck = await client.query(`
            SELECT a.activity_id, a.activity_type
            FROM tul_activities a
            WHERE a.activity_id = $1
              AND EXISTS (
                  SELECT 1 FROM tul_group_students gs
                  JOIN tul_groups g ON gs.group_id = g.group_id
                  WHERE gs.student_id = $2 AND g.activity_id = a.activity_id
              )
        `, [activityId, userId]);
        if (activityCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'El alumno no está inscrito en esta actividad.' });
        }
        const activityType = activityCheck.rows[0].activity_type;

        // Las reglas de permisos dependen del activity_type: solo en Taekwondo se exige que quien
        // promociona tenga al menos cierto rango Dan propio
        if (assignedByUserId) {
            const assignerRes = await client.query('SELECT role, belt_level, belt FROM users WHERE user_id = $1', [assignedByUserId]);
            if (assignerRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Assigner not found' });
            }
            const assigner = assignerRes.rows[0];

            if (activityType === 'taekwondo_itf') {
                if (assigner.role === 'instructor') {
                    const aRank = assigner.belt_level !== null ? parseInt(assigner.belt_level, 10) : 0;
                    const nRank = parseInt(levelOrder, 10);
                    if (aRank < 10) {
                        await client.query('ROLLBACK');
                        return res.status(403).json({ error: 'Debes ser mínimo I Dan para promover alumnos.' });
                    }
                    if (nRank >= aRank) {
                        await client.query('ROLLBACK');
                        return res.status(403).json({ error: 'Solo puedes otorgar hasta un cinturón por debajo del tuyo.' });
                    }
                } else if (assigner.role !== 'club_owner') {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ error: 'Rol no autorizado para promover.' });
                }
            } else {
                // En el resto de actividades (Inglés, Ballet, ...) no se exige un rango propio mínimo para evaluar alumnos
                if (assigner.role !== 'instructor' && assigner.role !== 'club_owner') {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ error: 'Rol no autorizado para promover.' });
                }
            }
        }

        // Guardamos el registro genérico de progresión por actividad (estado actual + histórico)
        await client.query(
            `INSERT INTO tul_user_progression (user_id, activity_id, activity_type, level_order, level_name, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (user_id, activity_id) DO UPDATE
                 SET level_order = excluded.level_order, level_name = excluded.level_name, updated_at = NOW()`,
            [userId, activityId, activityType, levelOrder, levelName]
        );
        await client.query(
            `INSERT INTO tul_user_progression_history (user_id, activity_id, activity_type, level_order, level_name, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
            [userId, activityId, activityType, levelOrder, levelName]
        );

        // Escritura doble: para Taekwondo mantenemos sincronizado el cinturón global del usuario,
        // ya que otras partes de la app (multiplicador de combate, acceso a tuls, BeltDisplay) siguen leyendo de ahí
        if (activityType === 'taekwondo_itf') {
            await client.query(
                'UPDATE users SET belt = $1, belt_level = $2 WHERE user_id = $3',
                [levelName, levelOrder, userId]
            );
            await client.query(
                'INSERT INTO tul_user_belts (user_id, belt_level, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
                [userId, levelOrder]
            );
        }

        await client.query('COMMIT');
        res.status(200).json({ success: true, message: 'Progression updated successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('API Error during /users/:userId/progression:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    } finally {
        client.release();
    }
});

// Aqui devolvemos todos los registros de progresión por actividad de un usuario (sirve para
// rellenar el modal de promoción genérico de los instructores, que al no estar matriculados
// vía tul_group_students no aparecen en getStudentGroups)
app.get('/api/users/:userId/progression', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT up.activity_id as "activityId", up.activity_type as "activityType",
                   up.level_order as "levelOrder", up.level_name as "levelName",
                   a.name as "activityName"
            FROM tul_user_progression up
            JOIN tul_activities a ON a.activity_id = up.activity_id
            WHERE up.user_id = $1
        `, [req.params.userId]);
        res.status(200).json({ success: true, progressions: result.rows });
    } catch (err) {
        console.error('API Error during GET user progression:', err);
        res.status(500).json({ error: err.message });
    }
});

// Aqui promocionamos el rango Dan personal del propio instructor en Taekwondo (es una
// cualificación suya, no la progresión de un alumno — distinto de PUT /api/users/:userId/progression)
app.put('/api/users/:userId/belt', async (req, res) => {
    const { userId } = req.params;
    const { beltName, beltLevel, assigned_by_user_id: assignedByUserId = null } = req.body;

    if (!beltName || beltLevel === undefined || beltLevel === null) {
        return res.status(400).json({ error: 'beltName and beltLevel are required.' });
    }

    try {
        if (assignedByUserId) {
            const assignerRes = await pool.query('SELECT role, belt_level, belt FROM users WHERE user_id = $1', [assignedByUserId]);
            if (assignerRes.rows.length === 0) return res.status(404).json({ error: 'Assigner not found' });

            const assigner = assignerRes.rows[0];

            if (assigner.role === 'instructor') {
                const aRank = assigner.belt_level !== null ? parseInt(assigner.belt_level, 10) : 0;
                const nRank = parseInt(beltLevel, 10);
                if (aRank < 10) {
                    return res.status(403).json({ error: 'Debes ser mínimo I Dan para promover alumnos.' });
                }
                if (nRank >= aRank) {
                    return res.status(403).json({ error: 'Solo puedes otorgar hasta un cinturón por debajo del tuyo.' });
                }
            } else if (assigner.role !== 'club_owner') {
                return res.status(403).json({ error: 'Rol no autorizado para promover.' });
            }
        }

        await pool.query(
            'UPDATE users SET belt = $1, belt_level = $2 WHERE user_id = $3',
            [beltName, beltLevel, userId]
        );
        await pool.query(
            'INSERT INTO tul_user_belts (user_id, belt_level, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING',
            [userId, beltLevel]
        );

        res.status(200).json({ success: true, message: 'Belt updated successfully' });
    } catch (err) {
        console.error('API Error during /users/:userId/belt:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// --- Aqui gestionamos las actividades de un club ---
app.get('/api/clubs/:clubId/activities', async (req, res) => {
    try {
        const result = await pool.query('SELECT activity_id as id, club_id as "organizationId", name, icon, activity_type as "activityType" FROM tul_activities WHERE club_id = $1', [req.params.clubId]);
        res.status(200).json({ success: true, activities: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clubs/:clubId/activities', async (req, res) => {
    const { name, icon, activityType } = req.body;
    try {
        // Aqui comprobamos que no se supere el límite de actividades del plan del club
        const clubRes = await pool.query('SELECT plan FROM tul_clubs WHERE club_id = $1', [req.params.clubId]);
        const plan = clubRes.rows[0]?.plan || 'free';
        const limits = getPlanLimits(plan);
        const countRes = await pool.query('SELECT COUNT(*) FROM tul_activities WHERE club_id = $1', [req.params.clubId]);
        if (parseInt(countRes.rows[0].count) >= limits.maxActivities) {
            return res.status(403).json({
                error: `Tu plan (${plan}) permite un máximo de ${limits.maxActivities} actividad(es). Actualiza tu suscripción para añadir más.`
            });
        }

        const result = await pool.query(
            'INSERT INTO tul_activities (club_id, name, icon, activity_type) VALUES ($1, $2, $3, $4) RETURNING activity_id as id, club_id as "organizationId", name, icon, activity_type as "activityType"',
            [req.params.clubId, name, icon, activityType || 'general']
        );
        res.status(201).json({ success: true, activity: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clubs/:clubId/activities/:activityId', async (req, res) => {
    try {
        await pool.query('DELETE FROM tul_activities WHERE activity_id = $1 AND club_id = $2', [req.params.activityId, req.params.clubId]);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clubs/:clubId/activities/:activityId', async (req, res) => {
    const { name, icon, activityType } = req.body;
    try {
        const result = await pool.query(
            'UPDATE tul_activities SET name = $1, icon = $2, activity_type = COALESCE($3, activity_type) WHERE activity_id = $4 AND club_id = $5 RETURNING activity_id as id, club_id as "organizationId", name, icon, activity_type as "activityType"',
            [name, icon, activityType, req.params.activityId, req.params.clubId]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Activity not found' });
        res.status(200).json({ success: true, activity: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Aqui gestionamos los grupos/clases del club ---
app.get('/api/clubs/:clubId/groups', async (req, res) => {
    try {
        const query = `
            SELECT g.group_id as id, g.activity_id as "activityId", g.name, g.time,
                   g.max_students as "maxStudents", g.min_age as "minAge", g.max_age as "maxAge", g.sessions,
                   (SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id) as "studentCount"
            FROM tul_groups g
            JOIN tul_activities a ON g.activity_id = a.activity_id
            WHERE a.club_id = $1
        `;
        const result = await pool.query(query, [req.params.clubId]);
        res.status(200).json({ success: true, groups: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clubs/:clubId/groups', async (req, res) => {
    const { activityId, name, time, maxStudents, sessions, minAge, maxAge } = req.body;
    try {
        // Aqui comprobamos que no se supere el límite de grupos por actividad del plan del club
        const clubRes = await pool.query('SELECT plan FROM tul_clubs WHERE club_id = $1', [req.params.clubId]);
        const plan = clubRes.rows[0]?.plan || 'free';
        const limits = getPlanLimits(plan);
        const countRes = await pool.query('SELECT COUNT(*) FROM tul_groups WHERE activity_id = $1', [activityId]);
        if (parseInt(countRes.rows[0].count) >= limits.maxGroupsPerActivity) {
            return res.status(403).json({
                error: `Tu plan (${plan}) permite un máximo de ${limits.maxGroupsPerActivity} grupo(s) por actividad. Actualiza tu suscripción para añadir más.`
            });
        }

        const maxStudentsVal = maxStudents ? parseInt(maxStudents) : null;
        const minAgeVal = minAge ? parseInt(minAge) : null;
        const maxAgeVal = maxAge ? parseInt(maxAge) : null;
        const sessionsVal = sessions && Array.isArray(sessions) && sessions.length > 0 ? JSON.stringify(sessions) : null;

        const result = await pool.query(
            `INSERT INTO tul_groups (activity_id, name, time, max_students, sessions, min_age, max_age)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
             RETURNING group_id as id, activity_id as "activityId", name, time,
                       max_students as "maxStudents", sessions, min_age as "minAge", max_age as "maxAge",
                       0 as "studentCount"`,
            [activityId, name, time, maxStudentsVal, sessionsVal, minAgeVal, maxAgeVal]
        );
        res.status(201).json({ success: true, group: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clubs/:clubId/groups/:groupId', async (req, res) => {
    try {
        await pool.query('DELETE FROM tul_groups WHERE group_id = $1', [req.params.groupId]);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clubs/:clubId/groups/:groupId', async (req, res) => {
    const { name, time, maxStudents, sessions, minAge, maxAge } = req.body;
    try {
        const maxStudentsVal = maxStudents != null && maxStudents !== '' ? parseInt(maxStudents) : null;
        const minAgeVal = minAge != null && minAge !== '' ? parseInt(minAge) : null;
        const maxAgeVal = maxAge != null && maxAge !== '' ? parseInt(maxAge) : null;
        const sessionsVal = sessions && Array.isArray(sessions) && sessions.length > 0 ? JSON.stringify(sessions) : null;

        const result = await pool.query(
            `UPDATE tul_groups
             SET name = $1, time = $2, max_students = $3, sessions = $4::jsonb, min_age = $5, max_age = $6
             WHERE group_id = $7
             RETURNING group_id as id, activity_id as "activityId", name, time,
                       max_students as "maxStudents", sessions, min_age as "minAge", max_age as "maxAge"`,
            [name, time, maxStudentsVal, sessionsVal, minAgeVal, maxAgeVal, req.params.groupId]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Group not found' });
        res.status(200).json({ success: true, group: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint ligero que devuelve el cinturón actual de cualquier usuario.
// users.belt es la columna de texto de referencia; tul_belts aporta el nivel numérico equivalente.
app.get('/api/users/:userId/rank', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COALESCE(belt, 'Blanco (10º Gup)') as "beltText",
                COALESCE(belt_level, 0)             as "currentRank"
            FROM users
            WHERE user_id = $1
        `, [req.params.userId]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.status(200).json({ success: true, ...result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/:userId/groups', async (req, res) => {
    try {
        const query = `
            SELECT g.group_id as id, g.activity_id as "activityId", g.name, g.time,
                   g.max_students as "maxStudents", g.min_age as "minAge", g.max_age as "maxAge", g.sessions,
                   a.name as "activityName", a.icon as "activityIcon", a.activity_type as "activityType",
                   up.level_order as "progressionLevelOrder", up.level_name as "progressionLevelName",
                   (SELECT COUNT(*) FROM tul_group_students gs2 WHERE gs2.group_id = g.group_id) as "studentCount"
            FROM tul_groups g
            JOIN tul_group_students gs ON g.group_id = gs.group_id
            JOIN tul_activities a ON g.activity_id = a.activity_id
            LEFT JOIN tul_user_progression up ON up.user_id = gs.student_id AND up.activity_id = g.activity_id
            WHERE gs.student_id = $1
        `;
        const result = await pool.query(query, [req.params.userId]);
        res.status(200).json({ success: true, groups: result.rows });
    } catch (err) {
        console.error('API Error during GET student groups:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- Aqui gestionamos los instructores del club ---
app.get('/api/clubs/:clubId/instructors', async (req, res) => {
    try {
        const query = `
            SELECT user_id as id, email, name, surname, belt, birthday, role, activity_ids as "activityIds"
            FROM users
            WHERE club_id = $1 AND (role = 'instructor' OR role = 'club_owner')
            ORDER BY role DESC, name ASC
        `;
        const result = await pool.query(query, [req.params.clubId]);
        const formatted = result.rows.map(r => ({
            id: r.id, email: r.email, name: `${r.name} ${r.surname || ''}`.trim(), belt: r.belt,
            birthday: r.birthday ? r.birthday.toISOString().split('T')[0] : null,
            role: r.role, activityIds: r.activityIds || []
        }));
        res.status(200).json({ success: true, instructors: formatted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clubs/:clubId/instructors', async (req, res) => {
    const { email } = req.body;
    try {
        const userRes = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        if (userRes.rows.length === 0) {
            return res.status(404).json({ error: 'not_found' });
        }

        const user = userRes.rows[0];

        if (user.club_id === req.params.clubId && user.role === 'instructor') {
            return res.status(400).json({ error: 'already_added' });
        }

        const result = await pool.query(
            "UPDATE users SET club_id = $1, role = 'instructor' WHERE email = $2 RETURNING user_id as id, email, name, surname",
            [req.params.clubId, email.toLowerCase()]
        );

        const r = result.rows[0];
        const formatted = { id: r.id, email: r.email, name: `${r.name} ${r.surname || ''}`.trim() };

        res.status(200).json({ success: true, user: formatted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clubs/:clubId/instructors/:instructorId/activities', async (req, res) => {
    try {
        const { activityIds } = req.body;
        await pool.query(
            `UPDATE users SET activity_ids = $1 WHERE user_id = $2 AND club_id = $3`,
            [activityIds || [], req.params.instructorId, req.params.clubId]
        );
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/clubs/:clubId/instructors/:instructorId', async (req, res) => {
    try {
        await pool.query(
            "UPDATE users SET club_id = NULL, role = 'student' WHERE user_id = $1 AND club_id = $2",
            [req.params.instructorId, req.params.clubId]
        );
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Aqui gestionamos los alumnos del club ---
app.get('/api/clubs/:clubId/students', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT user_id as id, email, CONCAT(name, ' ', surname) as name,
                    COALESCE(belt, 'Blanco (10º Gup)') as belt, birthday
             FROM users WHERE club_id = $1 AND role = 'student'`,
            [req.params.clubId]
        );
        res.status(200).json({ success: true, students: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Aqui gestionamos las aulas/salas del club ---
app.get('/api/clubs/:clubId/aulas', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT aula_id as id, name, capacity, description, color FROM tul_aulas WHERE club_id = $1 ORDER BY name',
            [req.params.clubId]
        );
        res.status(200).json({ success: true, aulas: result.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clubs/:clubId/aulas', async (req, res) => {
    const { name, capacity, description, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre del aula es obligatorio.' });
    try {
        const result = await pool.query(
            `INSERT INTO tul_aulas (club_id, name, capacity, description, color)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING aula_id as id, name, capacity, description, color`,
            [req.params.clubId, name.trim(), capacity ? parseInt(capacity) : null, description || null, color || '#3182CE']
        );
        res.status(201).json({ success: true, aula: result.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/clubs/:clubId/aulas/:aulaId', async (req, res) => {
    const { name, capacity, description, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'El nombre del aula es obligatorio.' });
    try {
        const result = await pool.query(
            `UPDATE tul_aulas SET name=$1, capacity=$2, description=$3, color=$4
             WHERE aula_id=$5 AND club_id=$6
             RETURNING aula_id as id, name, capacity, description, color`,
            [name.trim(), capacity ? parseInt(capacity) : null, description || null, color || '#3182CE', req.params.aulaId, req.params.clubId]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: 'Aula no encontrada.' });
        res.status(200).json({ success: true, aula: result.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/clubs/:clubId/aulas/:aulaId', async (req, res) => {
    try {
        await pool.query('DELETE FROM tul_aulas WHERE aula_id=$1 AND club_id=$2', [req.params.aulaId, req.params.clubId]);
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/clubs/:clubId/all_groups', async (req, res) => {
    try {
        const query = `
            SELECT g.group_id as id,
                   g.activity_id as "activityId",
                   a.name as "activityName",
                   a.icon as "activityIcon",
                   a.activity_type as "activityType",
                   g.name, g.time,
                   g.min_age as "minAge",
                   g.max_age as "maxAge",
                   g.max_students as "maxStudents",
                   g.sessions,
                   (SELECT COUNT(*) FROM tul_group_students gs WHERE gs.group_id = g.group_id) as "studentCount"
            FROM tul_groups g
            JOIN tul_activities a ON g.activity_id = a.activity_id
            WHERE a.club_id = $1
            ORDER BY a.name, g.name
        `;
        const result = await pool.query(query, [req.params.clubId]);
        res.status(200).json({ success: true, groups: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clubs/:clubId/students', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'invalid_email' });

    try {
        // Buscamos al usuario por su email
        const userCheck = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: 'not_found' });
        }

        const userToEnroll = userCheck.rows[0];
        if (userToEnroll.role !== 'student') {
            return res.status(400).json({ error: 'wrong_role' });
        }
        if (userToEnroll.club_id == req.params.clubId) {
            return res.status(400).json({ error: 'already_added' });
        }

        const result = await pool.query(
            "UPDATE users SET club_id = $1 WHERE email = $2 RETURNING user_id as id, email, name, surname",
            [req.params.clubId, email.toLowerCase()]
        );

        const r = result.rows[0];
        const formatted = { id: r.id, email: r.email, name: `${r.name} ${r.surname || ''}`.trim() };

        res.status(200).json({ success: true, student: formatted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Aqui creamos directamente una cuenta de alumno nueva (sin que tenga que registrarse antes)
app.post('/api/clubs/:clubId/students/create', authenticateToken, async (req, res) => {
    const { name, surname, email, phone, birthday } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name_email_required' });

    try {
        const emailLower = email.toLowerCase().trim();
        const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [emailLower]);
        if (existing.rows.length > 0) return res.status(409).json({ error: 'already_exists' });

        // Generamos el username (misma lógica que en /api/register)
        const cleanAccents = (str) => str ? str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() : '';
        const namePart = cleanAccents(name.trim().split(' ')[0]).substring(0, 2);
        const surnamePart = surname ? cleanAccents(surname.trim().split(' ')[0]).substring(0, 2) : 'al';
        let bdPart = '0000';
        if (birthday) {
            const d = new Date(birthday);
            if (!isNaN(d.getTime()))
                bdPart = `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}`;
        }
        let username = `${namePart}${surnamePart}${bdPart}`;
        const taken = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
        if (taken.rows.length > 0) username = `${username}${Math.floor(1000 + Math.random() * 9000)}`;

        // Generamos una contraseña temporal legible al azar (sin caracteres ambiguos: 0/O, 1/l/I)
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        const tempPassword = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const hashed = await bcrypt.hash(tempPassword, 10);

        const result = await pool.query(
            `INSERT INTO users (name, surname, email, username, password, phone, birthday, role, club_id, belt)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'student', $8, 'Blanco (10º Gup)')
             RETURNING user_id as id, name, surname, email, birthday, belt`,
            [name.trim(), surname?.trim() || null, emailLower, username, hashed,
             phone?.trim() || null, birthday || null, req.params.clubId]
        );

        const u = result.rows[0];
        res.status(201).json({
            success: true,
            student: {
                id: u.id,
                name: `${u.name} ${u.surname || ''}`.trim(),
                email: u.email,
                birthday: u.birthday ? u.birthday.toISOString().split('T')[0] : null,
                belt: u.belt
            },
            tempPassword
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clubs/:clubId/students/:studentId', async (req, res) => {
    try {
        await pool.query(
            "UPDATE users SET club_id = NULL WHERE user_id = $1 AND club_id = $2 AND role = 'student'",
            [req.params.studentId, req.params.clubId]
        );
        // Aqui también lo sacamos de cualquier grupo de este club al que estuviera apuntado
        await pool.query(
            `DELETE FROM tul_group_students gs 
             USING tul_groups g, tul_activities a
             WHERE gs.group_id = g.group_id AND g.activity_id = a.activity_id 
             AND a.club_id = $1 AND gs.student_id = $2`,
            [req.params.clubId, req.params.studentId]
        );
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/groups/:groupId/students', async (req, res) => {
    try {
        const query = `
            SELECT u.user_id as id, u.email, CONCAT(u.name, ' ', COALESCE(u.surname, '')) as name,
                   COALESCE(u.belt_level, 0)           as rank,
                   COALESCE(u.belt, 'Blanco (10º Gup)') as "beltName",
                   u.media_consent                      as "mediaConsent",
                   g.activity_id                        as "activityId",
                   a.activity_type                      as "activityType",
                   up.level_order                       as "progressionLevelOrder",
                   up.level_name                        as "progressionLevelName"
            FROM users u
            JOIN tul_group_students gs ON u.user_id = gs.student_id
            JOIN tul_groups g ON gs.group_id = g.group_id
            JOIN tul_activities a ON g.activity_id = a.activity_id
            LEFT JOIN tul_user_progression up ON up.user_id = u.user_id AND up.activity_id = g.activity_id
            WHERE gs.group_id = $1
        `;
        const result = await pool.query(query, [req.params.groupId]);

        const students = result.rows.map(s => ({
            ...s,
            name: s.name.trim()
        }));

        res.status(200).json({ success: true, students });
    } catch (err) {
        console.error('API Error during GET group students:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/groups/:groupId/students/enroll', async (req, res) => {
    const { studentId } = req.body;
    try {
        // Comprobamos el límite máximo de alumnos del grupo antes de matricular
        const groupRes = await pool.query(
            'SELECT max_students FROM tul_groups WHERE group_id = $1',
            [req.params.groupId]
        );
        const maxStudents = groupRes.rows[0]?.max_students;
        if (maxStudents !== null && maxStudents !== undefined) {
            const countRes = await pool.query(
                'SELECT COUNT(*) FROM tul_group_students WHERE group_id = $1',
                [req.params.groupId]
            );
            const currentCount = parseInt(countRes.rows[0].count);
            if (currentCount >= maxStudents) {
                return res.status(403).json({
                    error: `Este grupo ya está lleno (${currentCount}/${maxStudents} alumnos). Aumenta el límite o elige otro grupo.`
                });
            }
        }

        const insertRes = await pool.query(
            'INSERT INTO tul_group_students (group_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
            [req.params.groupId, studentId]
        );
        if (insertRes.rowCount > 0) {
            // Registramos el alta en el histórico de matriculaciones
            const infoRes = await pool.query(
                `SELECT u.club_id, TRIM(CONCAT(u.name,' ',COALESCE(u.surname,''))) as student_name,
                        g.name as group_name, a.name as activity_name
                 FROM users u
                 JOIN tul_groups g ON g.group_id = $1
                 JOIN tul_activities a ON a.activity_id = g.activity_id
                 WHERE u.user_id = $2`,
                [req.params.groupId, studentId]
            );
            if (infoRes.rows.length > 0) {
                const { club_id, student_name, group_name, activity_name } = infoRes.rows[0];
                await pool.query(
                    `INSERT INTO tul_enrollment_history (club_id, group_id, student_id, student_name, group_name, activity_name, action)
                     VALUES ($1, $2, $3, $4, $5, $6, 'enrolled')`,
                    [club_id, req.params.groupId, studentId, student_name, group_name, activity_name]
                );
            }
        }
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/groups/:groupId/students/:studentId/enroll', async (req, res) => {
    try {
        // Registramos la baja en el histórico de matriculaciones antes de borrar
        const infoRes = await pool.query(
            `SELECT u.club_id, TRIM(CONCAT(u.name,' ',COALESCE(u.surname,''))) as student_name,
                    g.name as group_name, a.name as activity_name
             FROM users u
             JOIN tul_groups g ON g.group_id = $1
             JOIN tul_activities a ON a.activity_id = g.activity_id
             WHERE u.user_id = $2`,
            [req.params.groupId, req.params.studentId]
        );
        if (infoRes.rows.length > 0) {
            const { club_id, student_name, group_name, activity_name } = infoRes.rows[0];
            await pool.query(
                `INSERT INTO tul_enrollment_history (club_id, group_id, student_id, student_name, group_name, activity_name, action)
                 VALUES ($1, $2, $3, $4, $5, $6, 'unenrolled')`,
                [club_id, req.params.groupId, req.params.studentId, student_name, group_name, activity_name]
            );
        }
        await pool.query(
            'DELETE FROM tul_group_students WHERE group_id = $1 AND student_id = $2',
            [req.params.groupId, req.params.studentId]
        );
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Aqui gestionamos el mercado/tienda del club ---
app.get('/api/clubs/:clubId/market', async (req, res) => {
    try {
        const isSunday = isMerchantDay();
        const isAdmin = req.query.isAdmin === 'true';

        let query = `
            SELECT item_id as id, name, description, cost_points as "costPoints", type, image_url as "imageUrl", stock,
                   combat_stats as "combatStats", item_type as "itemType", rarity, special_effects as "specialEffects",
                   is_merchant_exclusive, is_in_base_store, is_merchant_sellable, is_merchant_buyable,
                   sell_price_min, sell_price_max, buy_price_min, buy_price_max, activity_type as "activityType"
            FROM tul_market_items
            WHERE club_id = $1
        `;

        if (!isAdmin && !isSunday) {
            query += " AND (is_merchant_exclusive = false OR is_merchant_exclusive IS NULL)";
        }

        query += " ORDER BY created_at DESC";

        const result = await pool.query(query, [req.params.clubId]);
        res.status(200).json({ success: true, items: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Aqui consumimos un objeto consumible del inventario y aplicamos sus efectos ---
app.post('/api/users/:userId/inventory/:inventoryId/consume', async (req, res) => {
    const { userId, inventoryId } = req.params;
    try {
        await pool.query('BEGIN');

        // Obtenemos el objeto del inventario y comprobamos que sea realmente consumible
        const itemRes = await pool.query(`
            SELECT i.inventory_id, m.name, m.item_type, m.special_effects, m.club_id
            FROM tul_inventory i
            JOIN tul_market_items m ON i.item_id = m.item_id
            WHERE i.inventory_id = $1 AND i.user_id = $2 AND m.item_type = 'consumable'
        `, [inventoryId, userId]);

        if (itemRes.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Item not found or not consumable' });
        }

        const item = itemRes.rows[0];
        const effects = Array.isArray(item.special_effects) ? item.special_effects : [];

        // Compatibilidad con la "Piedra de Reinicio" antigua si no tiene efectos definidos
        if (effects.length === 0 && item.name === 'Piedra de Reinicio de Clase') {
            await pool.query('UPDATE tul_rpg SET rpg_class = $1 WHERE user_id = $2', ['unassigned', userId]);
        }

        // Buscamos el clan del usuario, por si algún efecto necesita aportar puntos al clan
        const clanRes = await pool.query('SELECT clan_id FROM tul_clan_members WHERE user_id = $1', [userId]);
        const clanId = clanRes.rows.length > 0 ? clanRes.rows[0].clan_id : null;

        for (const effect of effects) {
            try {
                switch (effect.type) {
                    case 'heal_hp':
                        await pool.query('UPDATE tul_rpg SET current_hp = LEAST(max_hp, current_hp + $1) WHERE user_id = $2', [parseInt(effect.value) || 0, userId]);
                        break;
                    case 'heal_mana':
                        await pool.query('UPDATE tul_rpg SET mana = LEAST(max_mana, mana + $1) WHERE user_id = $2', [parseInt(effect.value) || 0, userId]);
                        break;
                    case 'full_restore':
                        await pool.query('UPDATE tul_rpg SET current_hp = max_hp, mana = max_mana WHERE user_id = $1', [userId]);
                        break;
                    case 'add_stat':
                        const validStats = ['strength', 'potency', 'agility', 'focus', 'vitality', 'mana_stat'];
                        if (validStats.includes(effect.stat)) {
                            await pool.query(`UPDATE tul_rpg SET ${effect.stat} = ${effect.stat} + $1 WHERE user_id = $2`, [parseInt(effect.value) || 0, userId]);
                            // Caso especial: si cambia la vitalidad, recalculamos también la vida máxima
                            if (effect.stat === 'vitality') {
                                await pool.query('UPDATE tul_rpg SET max_hp = 100 + (vitality * 10) WHERE user_id = $1', [userId]);
                            }
                        }
                        break;
                    case 'reset_class':
                        await pool.query('UPDATE tul_rpg SET rpg_class = $1 WHERE user_id = $2', ['unassigned', userId]);
                        break;
                    case 'add_xp':
                        await addXPAndCheckLevel(userId, parseInt(effect.value) || 0, 'item_consumable');
                        break;
                    case 'add_points':
                        await pool.query('INSERT INTO tul_puntos (user_id, points) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET points = tul_puntos.points + $2', [userId, parseFloat(effect.value) || 0]);
                        break;
                    case 'buff':
                        const expiresAt = new Date(Date.now() + (parseInt(effect.durationMinutes) || 0) * 60000);
                        await pool.query('INSERT INTO tul_active_buffs (user_id, multiplier, expires_at) VALUES ($1, $2, $3)', [userId, parseFloat(effect.multiplier) || 1.0, expiresAt]);
                        break;
                    case 'clan_points':
                        if (clanId) {
                            await pool.query('UPDATE tul_clans SET bank_points = bank_points + $1 WHERE clan_id = $2', [parseInt(effect.value) || 0, clanId]);
                        }
                        break;
                    case 'chest':
                        // Aqui sorteamos un objeto del cofre por peso: cada item tiene una probabilidad
                        // proporcional a su "weight" sobre el total, y recorremos la lista restando pesos
                        // hasta que el número aleatorio cae dentro del rango del item elegido
                        const poolRes = await pool.query('SELECT item_id, weight FROM tul_loot_pool WHERE chest_id = $1', [effect.chestId]);
                        if (poolRes.rows.length > 0) {
                            const totalWeight = poolRes.rows.reduce((sum, r) => sum + r.weight, 0);
                            let random = Math.random() * totalWeight;
                            let selectedItemId = null;
                            for (const row of poolRes.rows) {
                                if (random < row.weight) {
                                    selectedItemId = row.item_id;
                                    break;
                                }
                                random -= row.weight;
                            }
                            if (selectedItemId) {
                                await pool.query('INSERT INTO tul_inventory (user_id, item_id) VALUES ($1, $2)', [userId, selectedItemId]);
                            }
                        }
                        break;
                }
            } catch (effErr) {
                console.error(`Error processing effect ${effect.type}:`, effErr);
            }
        }

        // Eliminamos el objeto del inventario una vez consumido
        await pool.query('DELETE FROM tul_inventory WHERE inventory_id = $1', [inventoryId]);

        await pool.query('COMMIT');
        res.status(200).json({ success: true, message: 'Item consumido con éxito' });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clubs/:clubId/market', async (req, res) => {
    const {
        name, description, costPoints, type, imageUrl, stock, combatStats,
        itemType, rarity, specialEffects, isMerchantExclusive,
        isInBaseStore, isMerchantSellable, isMerchantBuyable,
        sellPriceMin, sellPriceMax, buyPriceMin, buyPriceMax, activityType
    } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO tul_market_items (
                club_id, name, description, cost_points, type, image_url, stock,
                combat_stats, item_type, rarity, special_effects, is_merchant_exclusive,
                is_in_base_store, is_merchant_sellable, is_merchant_buyable,
                sell_price_min, sell_price_max, buy_price_min, buy_price_max, activity_type
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
             RETURNING item_id as id, name, description, cost_points as "costPoints", type, image_url as "imageUrl", stock,
                       combat_stats as "combatStats", item_type as "itemType", rarity, special_effects as "specialEffects",
                       is_merchant_exclusive, is_in_base_store, is_merchant_sellable, is_merchant_buyable,
                       sell_price_min, sell_price_max, buy_price_min, buy_price_max, activity_type as "activityType"`,
            [
                req.params.clubId, name, description, costPoints, type || 'virtual', imageUrl,
                stock !== undefined ? stock : -1, combatStats ? JSON.stringify(combatStats) : null,
                itemType || 'equippable', rarity || 'common', JSON.stringify(specialEffects || []),
                isMerchantExclusive || false, isInBaseStore ?? true, isMerchantSellable || false,
                isMerchantBuyable || false, sellPriceMin, sellPriceMax, buyPriceMin, buyPriceMax,
                activityType || null
            ]
        );
        res.status(201).json({ success: true, item: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clubs/:clubId/market/:itemId', async (req, res) => {
    const {
        name, description, costPoints, type, imageUrl, stock, combatStats,
        itemType, rarity, specialEffects, isMerchantExclusive,
        isInBaseStore, isMerchantSellable, isMerchantBuyable,
        sellPriceMin, sellPriceMax, buyPriceMin, buyPriceMax, activityType
    } = req.body;
    try {
        const result = await pool.query(
            `UPDATE tul_market_items
             SET name = $1, description = $2, cost_points = $3, type = $4, image_url = $5, stock = $6,
                 combat_stats = $7, item_type = $8, rarity = $9, special_effects = $10,
                 is_merchant_exclusive = $11, is_in_base_store = $12, is_merchant_sellable = $13,
                 is_merchant_buyable = $14, sell_price_min = $15, sell_price_max = $16,
                 buy_price_min = $17, buy_price_max = $18, activity_type = $19
             WHERE item_id = $20 AND club_id = $21
             RETURNING item_id as id`,
            [
                name, description, costPoints, type, imageUrl, stock !== undefined ? stock : -1,
                JSON.stringify(combatStats), itemType, rarity, JSON.stringify(specialEffects || []),
                isMerchantExclusive || false, isInBaseStore ?? true, isMerchantSellable || false,
                isMerchantBuyable || false, sellPriceMin, sellPriceMax, buyPriceMin, buyPriceMax,
                activityType || null,
                req.params.itemId, req.params.clubId
            ]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clubs/:clubId/market/:itemId', async (req, res) => {
    try {
        await pool.query('DELETE FROM tul_market_items WHERE item_id = $1 AND club_id = $2', [req.params.itemId, req.params.clubId]);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Aqui gestionamos los cofres de loot del club ---
app.get('/api/clubs/:clubId/chests', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tul_loot_chests WHERE club_id = $1 ORDER BY created_at DESC', [req.params.clubId]);
        res.status(200).json({ success: true, chests: result.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clubs/:clubId/chests', async (req, res) => {
    const { name, description, imageUrl } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO tul_loot_chests (club_id, name, description, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.params.clubId, name, description, imageUrl]
        );
        res.status(201).json({ success: true, chest: result.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/clubs/:clubId/chests/:chestId', async (req, res) => {
    const { name, description, imageUrl } = req.body;
    try {
        await pool.query(
            'UPDATE tul_loot_chests SET name = $1, description = $2, image_url = $3 WHERE chest_id = $4 AND club_id = $5',
            [name, description, imageUrl, req.params.chestId, req.params.clubId]
        );
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/clubs/:clubId/chests/:chestId', async (req, res) => {
    try {
        await pool.query('DELETE FROM tul_loot_chests WHERE chest_id = $1 AND club_id = $2', [req.params.chestId, req.params.clubId]);
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/chests/:chestId/pool', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.*, m.name, m.image_url as "imageUrl", m.rarity 
            FROM tul_loot_pool p
            JOIN tul_market_items m ON p.item_id = m.item_id
            WHERE p.chest_id = $1
        `, [req.params.chestId]);
        res.status(200).json({ success: true, pool: result.rows });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/chests/:chestId/pool', async (req, res) => {
    const { itemId, weight } = req.body;
    try {
        await pool.query(
            'INSERT INTO tul_loot_pool (chest_id, item_id, weight) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [req.params.chestId, itemId, weight || 1]
        );
        res.status(201).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/chests/:chestId/pool/:itemId', async (req, res) => {
    try {
        await pool.query('DELETE FROM tul_loot_pool WHERE chest_id = $1 AND item_id = $2', [req.params.chestId, req.params.itemId]);
        res.status(200).json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/clubs/:clubId/market/restore-system-items', async (req, res) => {
    const { clubId } = req.params;
    const resetItemImg = 'https://cdn-icons-png.flaticon.com/512/3233/3233959.png';
    try {
        await pool.query(`
            INSERT INTO tul_market_items (
                club_id, name, description, cost_points, item_type, image_url, stock, 
                is_in_base_store, is_merchant_sellable, is_merchant_exclusive,
                buy_price_min, buy_price_max
            )
            VALUES ($1, 'Piedra de Reinicio de Clase', 'Un cristal místico que permite borrar tu memoria marcial y elegir una nueva clase RPG.', 2500, 'consumable', $2, 999, false, true, true, 2000, 3000)
            ON CONFLICT (club_id, name) DO UPDATE SET
                description = EXCLUDED.description,
                is_in_base_store = false,
                is_merchant_sellable = true,
                is_merchant_exclusive = true,
                buy_price_min = 2000,
                buy_price_max = 3000
        `, [clubId, resetItemImg]);
        res.status(200).json({ success: true, message: 'System items restored successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/market/buy', async (req, res) => {
    const { userId, itemId, costPoints } = req.body;
    try {
        await pool.query('BEGIN');

        // Buscamos el artículo para obtener su precio real (no nos fiamos del que manda el cliente)
        const itemRes = await pool.query('SELECT cost_points FROM tul_market_items WHERE item_id = $1', [itemId]);
        if (itemRes.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Item not found' });
        }
        const actualCost = parseFloat(itemRes.rows[0].cost_points);

        // Consultamos el saldo de puntos actual del usuario
        const pointsRes = await pool.query('SELECT points FROM tul_puntos WHERE user_id = $1', [userId]);
        if (pointsRes.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ error: 'No points record found for user' });
        }
        const currentPoints = parseFloat(pointsRes.rows[0].points);

        if (currentPoints < actualCost) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ error: 'Not enough points' });
        }

        // Restamos los puntos gastados
        await pool.query('UPDATE tul_puntos SET points = points - $1 WHERE user_id = $2', [actualCost, userId]);

        // Añadimos el artículo al inventario del usuario
        await pool.query('INSERT INTO tul_inventory (user_id, item_id) VALUES ($1, $2)', [userId, itemId]);

        await pool.query('COMMIT');
        res.status(200).json({ success: true, remainingPoints: currentPoints - actualCost });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// --- Aqui exponemos los endpoints del mercader itinerante ---
app.get('/api/merchant/deals', async (req, res) => {
    const { userId, clubId } = req.query;
    try {
        const today = new Date().toISOString().split('T')[0];
        const isSunday = isMerchantDay();

        if (!isSunday) {
            return res.status(403).json({ error: 'The merchant only appears on Sundays and Tuesdays!' });
        }

        // Generamos una semilla simple a partir de la fecha y el userId, para que las ofertas
        // del mercader se mantengan fijas durante todo el día para ese usuario
        const seedStr = `${today}-${userId}`;
        let hash = 0;
        for (let i = 0; i < seedStr.length; i++) {
            hash = (hash << 5) - hash + seedStr.charCodeAt(i);
            hash |= 0;
        }

        const poolRes = await pool.query(
            `SELECT item_id as id, name, description, buy_price_min, buy_price_max, image_url, type, item_type, rarity, combat_stats
             FROM tul_market_items 
             WHERE club_id = $1 AND is_merchant_sellable = true`,
            [clubId]
        );

        let poolItems = poolRes.rows;
        if (poolItems.length < 1) {
            // Si el club no tiene artículos vendibles propios, recurrimos al catálogo global
            const globalRes = await pool.query(
                `SELECT item_id as id, name, description, buy_price_min, buy_price_max, image_url, type, item_type, rarity, combat_stats
                  FROM tul_market_items 
                  WHERE club_id = '00000000-0000-4000-a000-000000000000' AND is_merchant_sellable = true`
            );
            poolItems = globalRes.rows;
        }

        if (poolItems.length === 0) return res.status(200).json({ deals: [] });

        // Generador pseudoaleatorio determinista a partir de la semilla, para elegir hasta 6 ofertas
        const seededRandom = (s) => {
            let t = s + 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        const deals = [];
        const maxDeals = Math.min(6, poolItems.length);
        const usedIndices = new Set();

        let s = hash;
        while (deals.length < maxDeals) {
            const index = Math.floor(seededRandom(s++) * poolItems.length);
            if (!usedIndices.has(index)) {
                const item = poolItems[index];
                const priceMin = item.buy_price_min || 100;
                const priceMax = item.buy_price_max || 500;
                const finalPrice = Math.floor(priceMin + seededRandom(s++) * (priceMax - priceMin));

                deals.push({
                    ...item,
                    costPoints: finalPrice,
                    combatStats: typeof item.combat_stats === 'string' ? JSON.parse(item.combat_stats) : item.combat_stats
                });
                usedIndices.add(index);
            }
        }

        res.status(200).json({ deals });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/merchant/sell', async (req, res) => {
    const { userId, inventoryId } = req.body;
    try {
        const isSunday = isMerchantDay();
        if (!isSunday) {
            return res.status(403).json({ error: 'The merchant only buys items on Sundays and Tuesdays!' });
        }

        await pool.query('BEGIN');

        const itemRes = await pool.query(`
            SELECT i.inventory_id, m.name, m.sell_price_min, m.sell_price_max, m.is_merchant_buyable
            FROM tul_inventory i
            JOIN tul_market_items m ON i.item_id = m.item_id
            WHERE i.inventory_id = $1 AND i.user_id = $2
        `, [inventoryId, userId]);

        if (itemRes.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: 'Item not found in inventory' });
        }

        const item = itemRes.rows[0];
        if (!item.is_merchant_buyable) {
            await pool.query('ROLLBACK');
            return res.status(400).json({ error: 'The merchant is not interested in this item.' });
        }

        // Calculamos la recompensa al azar dentro del rango de precio de venta configurado para el artículo
        const priceMin = item.sell_price_min || 10;
        const priceMax = item.sell_price_max || 50;
        const reward = Math.floor(priceMin + Math.random() * (priceMax - priceMin));

        // Quitamos el artículo del inventario
        await pool.query('DELETE FROM tul_inventory WHERE inventory_id = $1', [inventoryId]);

        // Abonamos los puntos obtenidos por la venta
        await pool.query('INSERT INTO tul_puntos (user_id, points) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET points = tul_puntos.points + $2', [userId, reward]);

        await pool.query('COMMIT');
        res.status(200).json({ success: true, reward, message: `Has vendido ${item.name} por ${reward} puntos.` });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/:userId/inventory', async (req, res) => {
    try {
        const inventoryRes = await pool.query(`
            SELECT i.inventory_id, i.is_equipped, i.acquired_at, m.item_id, m.name, m.description, m.cost_points, m.type, m.image_url, m.combat_stats as "combatStats", m.item_type, m.weight, m.is_merchant_buyable, m.sell_price_min, m.sell_price_max
            FROM tul_inventory i
            JOIN tul_market_items m ON i.item_id = m.item_id
            WHERE i.user_id = $1
        `, [req.params.userId]);

        const rpgRes = await pool.query('SELECT * FROM tul_rpg WHERE user_id = $1', [req.params.userId]);
        const pointsRes = await pool.query('SELECT points FROM tul_puntos WHERE user_id = $1', [req.params.userId]);

        const inventory = inventoryRes.rows;
        // Sumamos el peso de todos los objetos del inventario para mostrar la carga total que lleva el usuario
        const totalWeight = inventory.reduce((sum, item) => sum + (parseFloat(item.weight) || 0), 0);

        res.status(200).json({
            success: true,
            inventory,
            totalWeight,
            stats: rpgRes.rows[0] || null,
            oro: pointsRes.rows[0]?.points || 0
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users/:userId/points', async (req, res) => {
    try {
        const pointsRes = await pool.query('SELECT points FROM tul_puntos WHERE user_id = $1', [req.params.userId]);

        // Calculamos la racha de asistencia: contamos días consecutivos "present" empezando por el más reciente
        const attRes = await pool.query(`
            SELECT status FROM tul_attendance 
            WHERE student_id = $1 
            ORDER BY date DESC LIMIT 30
        `, [req.params.userId]);

        let streak = 0;
        for (let row of attRes.rows) {
            if (row.status === 'present') streak++;
            else break;
        }

        res.status(200).json({
            success: true,
            points: parseFloat(pointsRes.rows[0]?.points) || 0,
            streak
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/:userId/rpg/upgrade', async (req, res) => {
    // El cliente llama "mana_stat" al atributo asignable (para distinguirlo del recurso de maná actual); aquí lo normalizamos
    const stat = req.body.stat === 'mana_stat' ? 'mana' : req.body.stat;
    const userId = req.params.userId;

    try {
        const rpgRes = await pool.query('SELECT * FROM tul_rpg WHERE user_id = $1', [userId]);
        if (rpgRes.rows.length === 0) return res.status(404).json({ error: 'Stats not found' });

        const stats = rpgRes.rows[0];
        if ((stats.skill_points || 0) <= 0) {
            return res.status(400).json({ error: 'No skill points available' });
        }

        const statKey = stat === 'mana' ? 'mana_stat' : stat;
        if ((stats[statKey] || 5) >= 100) {
            return res.status(400).json({ error: 'Stat already at maximum level (100)' });
        }

        let updateQuery = '';
        let params = [userId];

        switch (stat) {
            case 'strength':
                updateQuery = 'UPDATE tul_rpg SET strength = COALESCE(strength, 5) + 1, max_weight = COALESCE(max_weight, 100) + 20, skill_points = skill_points - 1 WHERE user_id = $1';
                break;
            case 'vitality':
                updateQuery = 'UPDATE tul_rpg SET vitality = COALESCE(vitality, 5) + 1, max_hp = COALESCE(max_hp, 100) + 20, current_hp = current_hp + 20, skill_points = skill_points - 1 WHERE user_id = $1';
                break;
            case 'mana':
                updateQuery = 'UPDATE tul_rpg SET mana_stat = COALESCE(mana_stat, 5) + 1, max_mana = COALESCE(max_mana, 50) + 20, mana = mana + 20, skill_points = skill_points - 1 WHERE user_id = $1';
                break;
            case 'agility':
                updateQuery = 'UPDATE tul_rpg SET agility = COALESCE(agility, 5) + 1, skill_points = skill_points - 1 WHERE user_id = $1';
                break;
            case 'potency':
                updateQuery = 'UPDATE tul_rpg SET potency = COALESCE(potency, 5) + 1, skill_points = skill_points - 1 WHERE user_id = $1';
                break;
            case 'focus':
                updateQuery = 'UPDATE tul_rpg SET focus = COALESCE(focus, 5) + 1, skill_points = skill_points - 1 WHERE user_id = $1';
                break;
            default:
                return res.status(400).json({ error: 'Invalid stat' });
        }

        await pool.query(updateQuery, params);
        res.status(200).json({ success: true, message: `Upgraded ${stat}!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/users/:userId/inventory/:inventoryId/equip', async (req, res) => {
    const { isEquipped, itemType, isTwoHanded } = req.body;
    try {
        await pool.query('BEGIN');

        const equipStatus = isEquipped === true || isEquipped === 'true';

        if (equipStatus) {
            // Aqui resolvemos qué desequipar según el slot del nuevo objeto, para que el RPG no permita combinaciones inválidas
            // Si equipamos un arma a dos manos, desequipamos lo que hubiera en mano derecha e izquierda
            if (isTwoHanded) {
                await pool.query(`
                    UPDATE tul_inventory SET is_equipped = false 
                    WHERE user_id = $1 AND inventory_id IN (
                        SELECT i.inventory_id FROM tul_inventory i 
                        JOIN tul_market_items m ON i.item_id = m.item_id 
                        WHERE m.type IN ('weapon_1h_right', 'weapon_1h_left', 'weapon_2h')
                    )`, [req.params.userId]);
            }
            // Si equipamos un arma a una mano, desequipamos cualquier arma a dos manos y la del mismo slot
            else if (itemType === 'weapon_1h_right' || itemType === 'weapon_1h_left') {
                await pool.query(`
                    UPDATE tul_inventory SET is_equipped = false 
                    WHERE user_id = $1 AND inventory_id IN (
                        SELECT i.inventory_id FROM tul_inventory i 
                        JOIN tul_market_items m ON i.item_id = m.item_id 
                        WHERE m.type IN ($2, 'weapon_2h')
                    )`, [req.params.userId, itemType]);
            }
            // Para el resto de slots (casco, pechera, etc.), desequipamos solo los del mismo tipo exacto
            else {
                await pool.query(`
                    UPDATE tul_inventory SET is_equipped = false 
                    WHERE user_id = $1 AND inventory_id IN (
                        SELECT i.inventory_id FROM tul_inventory i 
                        JOIN tul_market_items m ON i.item_id = m.item_id 
                        WHERE m.type = $2
                    )`, [req.params.userId, itemType]);
            }
        }

        // Aplicamos el cambio de estado (equipar/desequipar) sobre el objeto seleccionado
        await pool.query('UPDATE tul_inventory SET is_equipped = $1 WHERE inventory_id = $2 AND user_id = $3', [equipStatus, req.params.inventoryId, req.params.userId]);

        await pool.query('COMMIT');
        res.status(200).json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

// --- Aqui gestionamos los jefes (bosses) del club ---
app.get('/api/clubs/:clubId/bosses', async (req, res) => {
    try {
        const result = await pool.query('SELECT boss_id as id, name, total_hp as "totalHp", image_url as "imageUrl", reward_points as "rewardPoints", is_active as "isActive", category, rarity_weight as "rarityWeight", loot_table as "lootTable", exp_reward as "expReward", attack_interval_min as "attackIntervalMin", attack_interval_max as "attackIntervalMax", min_damage as "minDamage", max_damage as "maxDamage" FROM tul_bosses WHERE club_id = $1 ORDER BY created_at DESC', [req.params.clubId]);
        res.status(200).json({ success: true, bosses: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clubs/:clubId/bosses', async (req, res) => {
    const { name, totalHp, imageUrl, rewardPoints, category, rarityWeight, lootTable, expReward, attackIntervalMin, attackIntervalMax, minDamage, maxDamage } = req.body;
    try {
        await pool.query('BEGIN');
        // Desactivamos el jefe activo anterior, ya que solo puede haber uno activo por club
        await pool.query('UPDATE tul_bosses SET is_active = false WHERE club_id = $1', [req.params.clubId]);

        const result = await pool.query(
            `INSERT INTO tul_bosses (club_id, name, total_hp, current_hp, image_url, reward_points, is_active, category, rarity_weight, loot_table, exp_reward, attack_interval_min, attack_interval_max, min_damage, max_damage) 
             VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11, $12, $13, $14) 
             RETURNING boss_id as id`,
            [
                req.params.clubId, name, totalHp, totalHp, imageUrl, rewardPoints || 0,
                category || 'monster', rarityWeight || 100, JSON.stringify(lootTable || []),
                expReward || 50,
                attackIntervalMin || 1000,
                attackIntervalMax || 10000,
                minDamage || 10,
                maxDamage || 20
            ]
        );
        await pool.query('COMMIT');
        res.status(201).json({ success: true, bossId: result.rows[0].id });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clubs/:clubId/bosses/:bossId', async (req, res) => {
    const { name, totalHp, imageUrl, rewardPoints, category, rarityWeight, lootTable, expReward, attackIntervalMin, attackIntervalMax, minDamage, maxDamage, isActive } = req.body;
    try {
        await pool.query('BEGIN');
        if (isActive === true) {
            await pool.query('UPDATE tul_bosses SET is_active = false WHERE club_id = $1', [req.params.clubId]);
        }

        await pool.query(
            `UPDATE tul_bosses SET name = $1, total_hp = $2, image_url = $3, reward_points = $4, is_active = $5, 
                                   category = $6, rarity_weight = $7, loot_table = $8, exp_reward = $9, 
                                   attack_interval_min = $10, attack_interval_max = $11, min_damage = $12, max_damage = $15
             WHERE boss_id = $13 AND club_id = $14`,
            [
                name, totalHp, imageUrl, rewardPoints, isActive,
                category, rarityWeight, JSON.stringify(lootTable), expReward,
                attackIntervalMin, attackIntervalMax, minDamage,
                req.params.bossId, req.params.clubId, maxDamage
            ]
        );
        await pool.query('COMMIT');
        res.status(200).json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clubs/:clubId/bosses/:bossId', async (req, res) => {
    try {
        await pool.query('DELETE FROM tul_bosses WHERE boss_id = $1 AND club_id = $2', [req.params.bossId, req.params.clubId]);
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/clubs/:clubId/bosses/active', async (req, res) => {
    try {
        const bossRes = await pool.query('SELECT boss_id as id, name, total_hp as "totalHp", COALESCE(current_hp, total_hp) as "currentHp", image_url as "imageUrl", reward_points as "rewardPoints", COALESCE(team_healing_pool, 0) as "teamHealingPool", min_damage as "minDamage", max_damage as "maxDamage", attack_interval_min as "attackIntervalMin", attack_interval_max as "attackIntervalMax", category FROM tul_bosses WHERE club_id = $1 AND is_active = true LIMIT 1', [req.params.clubId]);
        if (bossRes.rows.length === 0) return res.status(404).json({ error: 'No active boss' });
        res.status(200).json({ success: true, boss: bossRes.rows[0] });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- Aqui gestionamos los clanes y el escalado de jefes según su progreso ---

app.get('/api/clubs/:clubId/clans', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tul_clans WHERE club_id = $1 ORDER BY name ASC', [req.params.clubId]);
        res.status(200).json({ success: true, clans: result.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clubs/:clubId/clans', async (req, res) => {
    try {
        const resdb = await pool.query('INSERT INTO tul_clans (club_id, name) VALUES ($1, $2) RETURNING *', [req.params.clubId, req.body.name]);
        // Quien crea el clan pasa a ser su primer miembro y además su líder
        await pool.query("INSERT INTO tul_clan_members (clan_id, user_id, role) VALUES ($1, $2, 'leader')", [resdb.rows[0].clan_id, req.body.userId]);
        res.status(201).json({ success: true, clan: resdb.rows[0] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clans/:clanId/join', async (req, res) => {
    try {
        const count = await pool.query('SELECT count(*) FROM tul_clan_members WHERE clan_id = $1', [req.params.clanId]);
        if (parseInt(count.rows[0].count) >= 50) return res.status(400).json({ error: 'El Clan está lleno (Max 50)' });
        await pool.query('INSERT INTO tul_clan_members (clan_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.params.clanId, req.body.userId]);
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clans/:clanId/leave', async (req, res) => {
    try {
        const { userId } = req.body;
        // Comprobamos que quien abandona no sea el líder (el líder debe transferir o eliminar el clan)
        const roleRes = await pool.query('SELECT role FROM tul_clan_members WHERE clan_id = $1 AND user_id = $2', [req.params.clanId, userId]);
        if (roleRes.rows.length > 0 && roleRes.rows[0].role === 'leader') {
            return res.status(400).json({ error: 'El líder no puede abandonar el clan, debes eliminarlo.' });
        }
        await pool.query('DELETE FROM tul_clan_members WHERE clan_id = $1 AND user_id = $2', [req.params.clanId, userId]);
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/clans/:clanId', async (req, res) => {
    try {
        const leaderId = (req.body && req.body.userId) ? req.body.userId : req.query.userId;

        const roleRes = await pool.query('SELECT role FROM tul_clan_members WHERE clan_id = $1 AND user_id = $2', [req.params.clanId, leaderId]);
        if (roleRes.rows.length === 0 || roleRes.rows[0].role !== 'leader') {
            return res.status(403).json({ error: 'Solo el líder puede eliminar el clan.' });
        }
        // Borramos manualmente todas las asociaciones dependientes, por si las claves foráneas no estuvieran en cascada
        try {
            await pool.query('DELETE FROM tul_clan_chat WHERE clan_id = $1', [req.params.clanId]);
            await pool.query('DELETE FROM tul_boss_participants WHERE clan_id = $1', [req.params.clanId]);
            await pool.query('DELETE FROM tul_clan_boss_progress WHERE clan_id = $1', [req.params.clanId]);
            await pool.query('DELETE FROM tul_clan_members WHERE clan_id = $1', [req.params.clanId]);

            await pool.query('DELETE FROM tul_clans WHERE clan_id = $1', [req.params.clanId]);
            res.status(200).json({ success: true });
        } catch (dbError) {
            console.error('[CLAN DELETE ERROR]', dbError);
            res.status(500).json({ error: `No se pudo borrar el clan: ${dbError.message}` });
        }
    } catch (e) {
        console.error('[CLAN DELETE FATAL]', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/clans/:clanId/lobbies', (req, res) => {
    // Usamos el objeto global activeLobbies declarado al principio del archivo
    const publicLobbies = Object.values(activeLobbies).filter(l => l.clanId === req.params.clanId && l.isPublic);
    res.status(200).json({ success: true, lobbies: publicLobbies });
});

// Aqui devolvemos los miembros de un clan
app.get('/api/clans/:clanId/members', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, u.name, u.surname, u.profile_picture, u.username, rpg.rpg_class, rpg.level 
            FROM tul_clan_members m
            JOIN users u ON m.user_id = u.user_id
            LEFT JOIN tul_rpg rpg ON u.user_id = rpg.user_id
            WHERE m.clan_id = $1
            ORDER BY m.role DESC
        `, [req.params.clanId]);
        res.status(200).json({ success: true, members: result.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/clans/:clanId/members/:memberId', async (req, res) => {
    try {
        const userId = req.query.userId || req.body?.userId;
        if (!userId) return res.status(400).json({ error: 'userId requerido.' });

        // Consultamos el rol de quien hace la petición
        const authCheck = await pool.query(
            'SELECT role FROM tul_clan_members WHERE clan_id = $1 AND user_id = $2',
            [req.params.clanId, userId]
        );
        if (authCheck.rows.length === 0) return res.status(403).json({ error: 'No eres miembro de este clan.' });
        const requesterRole = authCheck.rows[0].role;

        // Consultamos el rol del miembro al que se quiere expulsar
        const targetCheck = await pool.query(
            'SELECT role FROM tul_clan_members WHERE clan_id = $1 AND user_id = $2',
            [req.params.clanId, req.params.memberId]
        );
        if (targetCheck.rows.length === 0) return res.status(404).json({ error: 'El miembro no existe.' });
        const targetRole = targetCheck.rows[0].role;

        // Reglas de permisos:
        // - El líder puede expulsar a oficiales y miembros normales
        // - El oficial solo puede expulsar a miembros normales (no a otros oficiales ni al líder)
        if (requesterRole === 'leader') {
            if (targetRole === 'leader') return res.status(403).json({ error: 'No puedes expulsarte a ti mismo como líder.' });
        } else if (requesterRole === 'officer') {
            if (targetRole !== 'member') return res.status(403).json({ error: 'Los oficiales solo pueden expulsar a miembros regulares.' });
        } else {
            return res.status(403).json({ error: 'No tienes permisos para expulsar miembros.' });
        }

        await pool.query('DELETE FROM tul_clan_members WHERE clan_id = $1 AND user_id = $2', [req.params.clanId, req.params.memberId]);
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clans/:clanId/members/:memberId', async (req, res) => {
    try {
        const { userId, role, newRole } = req.body;
        const targetRole = role || newRole;
        const authCheck = await pool.query('SELECT role FROM tul_clan_members WHERE clan_id = $1 AND user_id = $2', [req.params.clanId, userId]);
        if (authCheck.rows.length === 0 || authCheck.rows[0].role !== 'leader') {
            return res.status(403).json({ error: 'Solo el líder puede gestionar rangos.' });
        }
        await pool.query('UPDATE tul_clan_members SET role = $1 WHERE clan_id = $2 AND user_id = $3', [targetRole, req.params.clanId, req.params.memberId]);
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/clans/:clanId', async (req, res) => {
    try {
        const { userId, name, logo } = req.body;
        const authCheck = await pool.query('SELECT role FROM tul_clan_members WHERE clan_id = $1 AND user_id = $2', [req.params.clanId, userId]);
        if (authCheck.rows.length === 0 || authCheck.rows[0].role !== 'leader') return res.status(403).json({ error: 'No autorizado' });

        await pool.query('UPDATE tul_clans SET name = COALESCE($1, name), logo = COALESCE($2, logo) WHERE clan_id = $3', [name, logo, req.params.clanId]);
        res.status(200).json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Aqui gestionamos la bóveda y el banco de puntos del clan ---
app.get('/api/clans/:clanId/vault', async (req, res) => {
    try {
        const items = await pool.query(`
            SELECT v.*, m.name, m.image_url as "imageUrl", m.description, m.item_type as "itemType"
            FROM tul_clan_inventory v
            JOIN tul_market_items m ON v.item_id = m.item_id
            WHERE v.clan_id = $1
        `, [req.params.clanId]);
        const bank = await pool.query('SELECT bank_points FROM tul_clans WHERE clan_id = $1', [req.params.clanId]);
        res.status(200).json({ success: true, inventory: items.rows, bankPoints: bank.rows[0]?.bank_points || 0 });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/clans/:clanId/vault/deposit', async (req, res) => {
    const { userId, inventoryId, amountPoints } = req.body;
    try {
        await pool.query('BEGIN');
        if (amountPoints > 0) {
            const pointsRes = await pool.query('SELECT points FROM tul_puntos WHERE user_id = $1', [userId]);
            if (pointsRes.rows.length === 0 || pointsRes.rows[0].points < amountPoints) {
                await pool.query('ROLLBACK');
                return res.status(400).json({ error: 'No tienes suficientes puntos' });
            }
            await pool.query('UPDATE tul_puntos SET points = points - $1 WHERE user_id = $2', [amountPoints, userId]);
            await pool.query('UPDATE tul_clans SET bank_points = bank_points + $1 WHERE clan_id = $2', [amountPoints, req.params.clanId]);
        }
        if (inventoryId) {
            const itemRes = await pool.query('SELECT item_id FROM tul_inventory WHERE inventory_id = $1 AND user_id = $2', [inventoryId, userId]);
            if (itemRes.rows.length === 0) {
                await pool.query('ROLLBACK');
                return res.status(404).json({ error: 'Item no encontrado' });
            }
            const itemId = itemRes.rows[0].item_id;
            await pool.query('DELETE FROM tul_inventory WHERE inventory_id = $1', [inventoryId]);
            await pool.query(`
                INSERT INTO tul_clan_inventory (clan_id, item_id, quantity) 
                VALUES ($1, $2, 1) 
                ON CONFLICT (clan_id, item_id) DO UPDATE SET quantity = tul_clan_inventory.quantity + 1
            `, [req.params.clanId, itemId]);
        }
        await pool.query('COMMIT');
        res.status(200).json({ success: true });
    } catch (e) { await pool.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
});

app.post('/api/clans/:clanId/vault/grant', async (req, res) => {
    const { userId, itemId, targetUserId, amountPoints } = req.body;
    try {
        await pool.query('BEGIN');
        const authCheck = await pool.query('SELECT role FROM tul_clan_members WHERE clan_id = $1 AND user_id = $2', [req.params.clanId, userId]);
        if (authCheck.rows.length === 0 || (authCheck.rows[0].role !== 'leader' && authCheck.rows[0].role !== 'officer')) {
            await pool.query('ROLLBACK');
            return res.status(403).json({ error: 'Permiso denegado' });
        }

        if (amountPoints > 0) {
            const bankRes = await pool.query('SELECT bank_points FROM tul_clans WHERE clan_id = $1', [req.params.clanId]);
            if (bankRes.rows[0].bank_points < amountPoints) {
                await pool.query('ROLLBACK');
                return res.status(400).json({ error: 'Fondos del clan insuficientes' });
            }
            await pool.query('UPDATE tul_clans SET bank_points = bank_points - $1 WHERE clan_id = $2', [amountPoints, req.params.clanId]);
            await pool.query('UPDATE tul_puntos SET points = points + $1 WHERE user_id = $2', [amountPoints, targetUserId]);
        }

        if (itemId) {
            const stockRes = await pool.query('SELECT quantity FROM tul_clan_inventory WHERE clan_id = $1 AND item_id = $2 FOR UPDATE', [req.params.clanId, itemId]);
            if (stockRes.rows.length === 0 || stockRes.rows[0].quantity <= 0) {
                await pool.query('ROLLBACK');
                return res.status(400).json({ error: 'Sin stock en bóveda' });
            }
            if (stockRes.rows[0].quantity === 1) {
                await pool.query('DELETE FROM tul_clan_inventory WHERE clan_id = $1 AND item_id = $2', [req.params.clanId, itemId]);
            } else {
                await pool.query('UPDATE tul_clan_inventory SET quantity = quantity - 1 WHERE clan_id = $1 AND item_id = $2', [req.params.clanId, itemId]);
            }
            await pool.query('INSERT INTO tul_inventory (user_id, item_id) VALUES ($1, $2)', [targetUserId, itemId]);
        }
        await pool.query('COMMIT');
        res.status(200).json({ success: true });
    } catch (e) { await pool.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
});

app.get('/api/clans/:clanId/chat', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tul_clan_chat WHERE clan_id = $1 ORDER BY created_at ASC LIMIT 100', [req.params.clanId]);
        res.status(200).json({ success: true, messages: result.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/clans/:clanId/bosses/active', async (req, res) => {
    try {
        // Buscamos el jefe activo del club al que pertenece este clan
        const clubRes = await pool.query('SELECT club_id FROM tul_clans WHERE clan_id = $1', [req.params.clanId]);
        if (!clubRes.rows.length) return res.status(404).json({ error: 'Clan not found' });

        const bossRes = await pool.query('SELECT boss_id as id, name, total_hp as "totalHp", image_url as "imageUrl", reward_points as "rewardPoints" FROM tul_bosses WHERE club_id = $1 AND is_active = true LIMIT 1', [clubRes.rows[0].club_id]);
        if (!bossRes.rows.length) return res.status(404).json({ error: 'No active boss for this club' });
        const boss = bossRes.rows[0];

        // Si el clan todavía no tiene progreso registrado contra este jefe, lo creamos con su vida total
        await pool.query(`
            INSERT INTO tul_clan_boss_progress (clan_id, boss_id, current_hp, boss_level) 
            VALUES ($1, $2, $3, 1) 
            ON CONFLICT DO NOTHING
        `, [req.params.clanId, boss.id, boss.totalHp]);

        // Recuperamos el progreso actual del clan contra este jefe
        const progRes = await pool.query('SELECT current_hp, boss_level FROM tul_clan_boss_progress WHERE clan_id = $1 AND boss_id = $2', [req.params.clanId, boss.id]);

        const prog = progRes.rows[0];
        // Cada nivel de jefe duplica su vida total: multiplicador = 2^(nivel - 1)
        const multiplier = Math.pow(2, prog.boss_level - 1);
        const effectiveTotalHp = boss.totalHp * multiplier;

        res.status(200).json({
            success: true, boss: {
                ...boss,
                totalHp: effectiveTotalHp,
                currentHp: prog.current_hp,
                bossLevel: prog.boss_level,
                multiplier
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bosses/attack', async (req, res) => {
    const { clanId, bossId, userId, rpgClass, correctAnswers, manaConsumed = 0, playerHp } = req.body;

    if (!clanId) {
        let dmg = correctAnswers;
        return res.status(200).json({ success: true, damageDealt: dmg, currentHp: 0, bossLevel: 1 });
    }

    try {
        await pool.query('BEGIN');

        // --- 1. Guardamos la vida actual del jugador ---
        if (typeof playerHp === 'number') {
            await pool.query('UPDATE tul_rpg SET current_hp = $1 WHERE user_id = $2', [Math.max(0, playerHp), userId]);
        }

        const userRes = await pool.query('SELECT belt, belt_level FROM users WHERE user_id = $1', [userId]);
        const userBelt = userRes.rows[0];
        const beltMultiplier = getBeltDamageMultiplier(userBelt.belt, userBelt.belt_level);

        const rpgRes = await pool.query('SELECT * FROM tul_rpg WHERE user_id = $1', [userId]);
        const rpg = rpgRes.rows[0] || { level: 1, strength: 5, potency: 5, mana: 50 };

        const invRes = await pool.query(`
            SELECT m.combat_stats as "combatStats" FROM tul_inventory i
            JOIN tul_market_items m ON i.item_id = m.item_id
            WHERE i.user_id = $1 AND i.is_equipped = true
        `, [userId]);

        // Acumulamos el multiplicador de daño de todos los objetos equipados que tengan ese efecto
        let inventoryDmgMultiplier = 1.0;
        for (const row of invRes.rows) {
            if (row.combat_stats) {
                try {
                    const stats = typeof row.combat_stats === 'string' ? JSON.parse(row.combat_stats) : row.combat_stats;
                    if (stats.damageMultiplier) inventoryDmgMultiplier *= parseFloat(stats.damageMultiplier);
                } catch (e) { }
            }
        }

        // Aqui calculamos el daño base por respuesta correcta según la clase RPG del jugador
        // (cada clase pondera de forma distinta sus atributos: fuerza, potencia, agilidad, enfoque...)
        let baseDamagePerAnswer = 5;
        if (rpgClass === 'Guerrero') {
            baseDamagePerAnswer += (rpg.strength || 0) * 1.5;
        } else if (rpgClass === 'Mago') {
            // El mago solo puede lanzar tantos hechizos como su maná disponible le permita;
            // las respuestas que no puede pagar con maná hacen un daño "débil" de respaldo
            const manaPricePerSpell = 8;
            const affordableSpells = Math.min(correctAnswers, Math.floor((rpg.mana + (correctAnswers * 5)) / manaPricePerSpell));
            const spellDamage = (rpg.potency || 0) * 3;
            const weakDamage = 2;
            baseDamagePerAnswer = (affordableSpells * spellDamage + (correctAnswers - affordableSpells) * weakDamage) / (correctAnswers || 1);
            const netManaChange = (affordableSpells * manaPricePerSpell) - (correctAnswers * 5);
            await pool.query('UPDATE tul_rpg SET mana = GREATEST(0, LEAST(max_mana, mana - $1)) WHERE user_id = $2', [netManaChange, userId]);
        } else if (rpgClass === 'Monje') {
            baseDamagePerAnswer += (rpg.strength || 0) * 0.8 + (rpg.agility || 0) * 1.2;
        } else if (rpgClass === 'Druida') {
            baseDamagePerAnswer += (rpg.strength || 0) * 0.6 + (rpg.potency || 0) * 0.6 + (rpg.focus || 0) * 0.4;
        } else {
            baseDamagePerAnswer += (rpg.strength || 0) * 0.5;
        }

        const totalDamageDealt = Math.floor(correctAnswers * baseDamagePerAnswer * beltMultiplier * inventoryDmgMultiplier);

        // Aqui localizamos el jefe "real" del clan: si el bossId que envía el cliente está desactualizado
        // (p.ej. porque el jefe cambió mientras jugaba), redirigimos el daño al jefe actual
        let progRes = await pool.query('SELECT boss_id, current_hp, boss_level, last_rare_spawn_date FROM tul_clan_boss_progress WHERE clan_id = $1 FOR UPDATE', [clanId]);
        
        if (!progRes.rows.length) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ error: "Boss track missing" });
        }

        let { boss_id: actualBossId, current_hp, boss_level, last_rare_spawn_date } = progRes.rows[0];
        
        // Si el cliente atacó a un jefe antiguo, aplicamos igualmente el daño al jefe vigente
        let effectiveBossId = bossId;
        if (actualBossId !== bossId) {
            console.log(`[COMBAT] Boss ID mismatch (Client: ${bossId}, DB: ${actualBossId}). Redirecting damage to current boss.`);
            effectiveBossId = actualBossId;
        }

        const wasBossAliveBeforeThisAttack = current_hp > 0;
        let new_hp = Math.max(0, current_hp - totalDamageDealt);
        let respawned = false;
        let newBossId = effectiveBossId;
        let lootEarned = [];

        // Solo lanzamos la lógica de "jefe derrotado y respawn" si el jefe seguía vivo antes
        // de este golpe y este ataque concreto lo ha llevado a 0 (evita duplicar recompensas)
        if (new_hp === 0 && wasBossAliveBeforeThisAttack && totalDamageDealt > 0) {
            const bossData = await pool.query('SELECT reward_points, total_hp, loot_table, category FROM tul_bosses WHERE boss_id = $1', [effectiveBossId]);
            const currentBoss = bossData.rows[0];
            // La recompensa en puntos también escala con el nivel del jefe (mismo multiplicador 2^(nivel-1))
            const reward = parseInt(currentBoss.reward_points || 0) * Math.pow(2, boss_level - 1);
            const rawLootTable = currentBoss.loot_table || [];

            // Repartimos la recompensa en puntos entre todos los participantes registrados de la batalla
            await pool.query(`
                INSERT INTO tul_puntos (user_id, points)
                SELECT user_id, $1 FROM tul_boss_participants WHERE boss_id = $2 AND clan_id = $3
                ON CONFLICT (user_id) DO UPDATE SET points = tul_puntos.points + $1
            `, [reward, effectiveBossId, clanId]);

            const participantsRes = await pool.query('SELECT user_id FROM tul_boss_participants WHERE boss_id = $1 AND clan_id = $2', [effectiveBossId, clanId]);
            const participants = participantsRes.rows;

            // Aqui tiramos el loot para cada participante: cada objeto de la tabla de botín tiene su propia
            // probabilidad ("chance") y cantidad, y se evalúa de forma independiente para cada jugador
            for (const p of participants) {
                const pLoot = [];
                for (const lootItem of rawLootTable) {
                    const roll = Math.random();
                    if (roll <= (lootItem.chance || 1)) {
                        for (let i = 0; i < (lootItem.quantity || 1); i++) {
                            await pool.query('INSERT INTO tul_inventory (user_id, item_id) VALUES ($1, $2)', [p.user_id, lootItem.itemId]);
                        }
                        if (p.user_id === userId) pLoot.push({ name: lootItem.name, quantity: lootItem.quantity || 1 });
                    }
                }
                if (p.user_id === userId) lootEarned = pLoot;
            }

            const clubRes = await pool.query('SELECT club_id FROM tul_clans WHERE clan_id = $1', [clanId]);
            const clubId = clubRes.rows[0].club_id;
            // Solo permitimos un jefe raro (miniboss/unique) por semana ISO; si ya salió uno esta semana, lo excluimos del sorteo
            const isSameWeek = last_rare_spawn_date ? (getCurrentISOWeek(new Date(last_rare_spawn_date)) === getCurrentISOWeek(new Date())) : false;

            let poolQuery = 'SELECT boss_id, total_hp FROM tul_bosses WHERE club_id = $1 AND is_active = true';
            if (isSameWeek) poolQuery += " AND category NOT IN ('miniboss', 'unique')";

            // Elegimos al azar el siguiente jefe entre los activos del club y subimos de nivel (la vida vuelve a escalar con 2^(nivel-1))
            const poolRes = await pool.query(poolQuery, [clubId]);
            if (poolRes.rows.length > 0) {
                const nextBoss = poolRes.rows[Math.floor(Math.random() * poolRes.rows.length)];
                newBossId = nextBoss.boss_id;
                boss_level += 1;
                new_hp = parseInt(nextBoss.total_hp) * Math.pow(2, boss_level - 1);

                const nextBossData = await pool.query('SELECT category FROM tul_bosses WHERE boss_id = $1', [newBossId]);
                if (['miniboss', 'unique'].includes(nextBossData.rows[0].category)) last_rare_spawn_date = new Date();
            } else {
                boss_level += 1;
                new_hp = parseInt(currentBoss.total_hp) * Math.pow(2, boss_level - 1);
            }

            respawned = true;
            await pool.query('DELETE FROM tul_boss_participants WHERE boss_id = $1 AND clan_id = $2', [effectiveBossId, clanId]);

            // Otorgamos experiencia extra por asestar el golpe que derrota al jefe
            await addXPAndCheckLevel(userId, Math.floor(totalDamageDealt / 2) + 50, 'boss_combat'); // Pequeño bonus por el golpe de gracia
        } else {
            // Experiencia normal por el golpe (proporcional al daño infligido)
            await addXPAndCheckLevel(userId, Math.floor(totalDamageDealt / 2), 'boss_combat');
        }

        await pool.query(
            'UPDATE tul_clan_boss_progress SET current_hp = $1, boss_level = $2, boss_id = $3, last_rare_spawn_date = $4 WHERE clan_id = $5',
            [new_hp, boss_level, newBossId, last_rare_spawn_date, clanId]
        );

        if (totalDamageDealt > 0) {
            await pool.query('INSERT INTO tul_boss_participants (boss_id, clan_id, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [effectiveBossId, clanId, userId]);
        }

        await pool.query('COMMIT');
        io.to(`clan_${clanId}`).emit('boss_hp_updated', { hp: new_hp, bossLevel: boss_level, respawned, newBossId });
        await pool.query('INSERT INTO tul_puntos (user_id, points) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET points = tul_puntos.points + $2', [userId, totalDamageDealt]);

        res.status(200).json({ success: true, damageDealt: totalDamageDealt, currentHp: new_hp, bossLevel: boss_level, respawned, lootEarned });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Combat Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- Aqui consultamos a qué club/clan pertenece cada usuario ---
app.get('/api/users/:userId/clan', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, cm.role FROM tul_clans c
            JOIN tul_clan_members cm ON c.clan_id = cm.clan_id
            WHERE cm.user_id = $1
        `, [req.params.userId]);
        res.status(200).json({ success: true, clan: result.rows[0] || null });
    } catch (err) { res.status(500).json({ error: err.message }) }
});

// Aqui devolvemos las evaluaciones del club combinando las de tuls y las de categorías/rúbricas,
// calculando para cada alumno la nota media de sus movimientos o de sus rúbricas evaluadas
app.get('/api/clubs/:clubId/evaluations', async (req, res) => {
    try {
        const { month, from, to, activityId, instructorId } = req.query;
        let dateCondition, queryParams;
        if (from && to) {
            dateCondition = "{alias}.evaluation_date >= $2::DATE AND {alias}.evaluation_date <= $3::DATE";
            queryParams = [req.params.clubId, from, to];
        } else {
            const m = parseInt(month) || new Date().getMonth() + 1;
            dateCondition = "EXTRACT(MONTH FROM {alias}.evaluation_date) = $2";
            queryParams = [req.params.clubId, m];
        }
        let extraConditions = '';
        if (activityId) {
            queryParams.push(activityId);
            extraConditions += ` AND EXISTS (
                SELECT 1 FROM tul_group_students gs2
                JOIN tul_groups g2 ON gs2.group_id = g2.group_id
                WHERE gs2.student_id = u.user_id AND g2.activity_id = $${queryParams.length}::UUID
            )`;
        }
        if (instructorId) {
            queryParams.push(instructorId);
            extraConditions += ` AND {alias}.instructor_id = $${queryParams.length}::UUID`;
        }
        const fillAlias = (sql, alias) => sql.split('{alias}').join(alias);

        const tulQuery = `
            SELECT
                u.user_id as "studentId",
                u.email as "studentEmail",
                COALESCE(u.belt, 'Blanco (10º Gup)')        as "beltName",
                COALESCE(u.belt_level, 0)                    as "rank",
                CONCAT(u.name, ' ', COALESCE(u.surname, '')) as "studentName",
                e.instructor_id as "instructorId",
                'tul' as "evaluationType",
                3 as "maxScore",
                (
                    SELECT g.activity_id
                    FROM tul_group_students gs
                    JOIN tul_groups g ON gs.group_id = g.group_id
                    JOIN tul_activities a ON g.activity_id = a.activity_id
                    WHERE gs.student_id = u.user_id AND a.club_id = $1
                    LIMIT 1
                ) as "activityId",
                (
                    SELECT ROUND(AVG(score), 1)
                    FROM tul_evaluation_movements em
                    WHERE em.evaluation_id = e.evaluation_id
                ) as score
            FROM tul_evaluations e
            JOIN users u ON e.student_id = u.user_id
            WHERE u.club_id = $1
            AND ${fillAlias(dateCondition, 'e')}
            ${fillAlias(extraConditions, 'e')}
        `;
        const categoryQuery = `
            SELECT
                u.user_id as "studentId",
                u.email as "studentEmail",
                COALESCE(u.belt, 'Blanco (10º Gup)')        as "beltName",
                COALESCE(u.belt_level, 0)                    as "rank",
                CONCAT(u.name, ' ', COALESCE(u.surname, '')) as "studentName",
                ce.instructor_id as "instructorId",
                'category' as "evaluationType",
                5 as "maxScore",
                ce.activity_id as "activityId",
                (
                    SELECT ROUND(AVG(score), 1)
                    FROM tul_category_evaluation_scores cs
                    WHERE cs.evaluation_id = ce.evaluation_id
                ) as score
            FROM tul_category_evaluations ce
            JOIN users u ON ce.student_id = u.user_id
            WHERE u.club_id = $1
            AND ${fillAlias(dateCondition, 'ce')}
            ${fillAlias(extraConditions, 'ce')}
        `;
        const [tulResult, categoryResult] = await Promise.all([
            pool.query(tulQuery, queryParams),
            pool.query(categoryQuery, queryParams)
        ]);
        const formatted = [...tulResult.rows, ...categoryResult.rows]
            .map(r => ({ ...r, score: r.score ? parseFloat(r.score) : 0 }));
        res.status(200).json({ success: true, evaluations: formatted });
    } catch (err) {
        console.error('API Error during GET club evals:', err);
        res.status(500).json({ error: err.message });
    }
});

// Aqui calculamos el resumen de asistencia por alumno (días presentes/total) para el club,
// con filtros opcionales por mes/rango de fechas, actividad o instructor (vía sesiones del grupo)
app.get('/api/clubs/:clubId/attendance', async (req, res) => {
    try {
        const { month, from, to, activityId, instructorId } = req.query;
        let dateCondition, queryParams;
        if (from && to) {
            dateCondition = 'a.date >= $2::DATE AND a.date <= $3::DATE';
            queryParams = [req.params.clubId, from, to];
        } else {
            const m = parseInt(month) || new Date().getMonth() + 1;
            dateCondition = 'EXTRACT(MONTH FROM a.date) = $2';
            queryParams = [req.params.clubId, m];
        }
        let extraConditions = '';
        const needsGroupJoin = activityId || instructorId;
        if (activityId) {
            queryParams.push(activityId);
            extraConditions += ` AND g.activity_id = $${queryParams.length}::UUID`;
        }
        if (instructorId) {
            queryParams.push(instructorId);
            extraConditions += ` AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(g.sessions, '[]'::jsonb)) sess
                WHERE sess->>'instructorId' = $${queryParams.length}
                AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(sess->'days') d
                    WHERE d::text::int = EXTRACT(DOW FROM a.date)::int
                )
            )`;
        }
        const query = `
            SELECT
                u.user_id as "studentId",
                u.email as "studentEmail",
                COALESCE(u.belt, 'Blanco (10º Gup)')       as "beltName",
                COALESCE(u.belt_level, 0)                   as "rank",
                CONCAT(u.name, ' ', COALESCE(u.surname, '')) as "studentName",
                COUNT(CASE WHEN a.status IN ('present', 'late') THEN 1 END) as present,
                COUNT(a.attendance_id) as total
            FROM tul_attendance a
            JOIN users u ON a.student_id = u.user_id
            ${needsGroupJoin ? 'JOIN tul_groups g ON a.group_id = g.group_id' : ''}
            WHERE u.club_id = $1
            AND ${dateCondition}
            ${extraConditions}
            GROUP BY u.user_id, u.email, u.belt_level, u.belt, u.name, u.surname
        `;
        const result = await pool.query(query, queryParams);
        const formatted = result.rows.map(r => ({ ...r, present: parseInt(r.present), total: parseInt(r.total) }));
        res.status(200).json({ success: true, attendance: formatted });
    } catch (err) {
        console.error('API Error during GET club attendance:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/clubs/:clubId/report/overview', async (req, res) => {
    try {
        const { activityId, instructorId } = req.query;
        const clubId = req.params.clubId;

        // Construimos el filtro de segmento (por actividad o por instructor), aplicado a nivel de grupo
        let segFilter = '';
        const segParams = [clubId];
        if (activityId) {
            segParams.push(activityId);
            segFilter = ` AND g.activity_id = $${segParams.length}::UUID`;
        } else if (instructorId) {
            segParams.push(instructorId);
            segFilter = ` AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(g.sessions, '[]'::jsonb)) sess
                WHERE sess->>'instructorId' = $${segParams.length}
            )`;
        }

        // Resumen acotado al segmento elegido (actividad o instructor) que alimenta los KPIs principales del informe
        const summaryRes = await pool.query(
            `WITH filtered_groups AS (
                SELECT g.group_id, g.max_students
                FROM tul_groups g
                JOIN tul_activities a ON g.activity_id = a.activity_id
                WHERE a.club_id = $1 ${segFilter}
            ),
            group_caps AS (
                SELECT fg.group_id,
                    CASE WHEN fg.max_students IS NOT NULL AND fg.max_students > 0 THEN fg.max_students
                         ELSE COUNT(gs.student_id) + 5 END AS capacity,
                    COUNT(gs.student_id) AS enrolled
                FROM filtered_groups fg
                LEFT JOIN tul_group_students gs ON gs.group_id = fg.group_id
                GROUP BY fg.group_id, fg.max_students
            )
            SELECT
                (SELECT COUNT(*) FROM filtered_groups)::int as group_count,
                (SELECT COALESCE(SUM(capacity), 0) FROM group_caps)::int as total_capacity,
                (SELECT COUNT(DISTINCT gs.student_id) FROM filtered_groups fg
                    JOIN tul_group_students gs ON gs.group_id = fg.group_id)::int as student_count,
                (SELECT COALESCE(ROUND(AVG(enrolled)), 0) FROM group_caps WHERE enrolled > 0)::int as avg_per_group`,
            segParams
        );

        const activitiesRes = await pool.query(
            `WITH group_caps AS (
                SELECT
                    g.group_id,
                    g.activity_id,
                    CASE
                        WHEN g.max_students IS NOT NULL AND g.max_students > 0 THEN g.max_students
                        ELSE COUNT(gs.student_id) + 5
                    END AS capacity
                FROM tul_groups g
                LEFT JOIN tul_group_students gs ON gs.group_id = g.group_id
                GROUP BY g.group_id, g.activity_id, g.max_students
            ),
            activity_summary AS (
                SELECT activity_id,
                    COUNT(group_id)::int AS group_count,
                    SUM(capacity)::int AS total_capacity
                FROM group_caps GROUP BY activity_id
            ),
            activity_students AS (
                SELECT g.activity_id, COUNT(DISTINCT gs.student_id)::int AS student_count
                FROM tul_groups g
                JOIN tul_group_students gs ON gs.group_id = g.group_id
                GROUP BY g.activity_id
            )
            SELECT
                a.activity_id as "activityId",
                a.name,
                COALESCE(s.group_count, 0) as "groupCount",
                COALESCE(s.total_capacity, 0) as "totalCapacity",
                COALESCE(st.student_count, 0) as "studentCount"
            FROM tul_activities a
            LEFT JOIN activity_summary s ON s.activity_id = a.activity_id
            LEFT JOIN activity_students st ON st.activity_id = a.activity_id
            WHERE a.club_id = $1
            ORDER BY "studentCount" DESC`,
            [req.params.clubId]
        );
        const groupsRes = await pool.query(
            `SELECT
                g.group_id as "groupId",
                g.name,
                a.name as "activityName",
                COALESCE(g.max_students, 0)::int as "maxStudents",
                COUNT(gs.student_id)::int as "studentCount"
             FROM tul_groups g
             JOIN tul_activities a ON g.activity_id = a.activity_id
             LEFT JOIN tul_group_students gs ON gs.group_id = g.group_id
             WHERE a.club_id = $1 ${segFilter}
             GROUP BY g.group_id, g.name, a.name, g.max_students
             ORDER BY a.name, g.name`,
            segParams
        );
        const summary = summaryRes.rows[0] || {};
        const totalStudents = parseInt(summary.student_count || 0);
        const totalCapacity = parseInt(summary.total_capacity || 0);
        const avgStudentsPerGroup = parseInt(summary.avg_per_group || 0);
        const activities = activitiesRes.rows.map(r => ({
            ...r,
            capacityPct: r.totalCapacity > 0 ? Math.round((r.studentCount / r.totalCapacity) * 100) : 0
        }));
        const groups = groupsRes.rows;
        res.status(200).json({
            success: true, totalStudents, totalCapacity, avgStudentsPerGroup,
            overallCapacityPct: totalCapacity > 0 ? Math.round((totalStudents / totalCapacity) * 100) : 0,
            activities, groups
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/clubs/:clubId/report/roster-changes', async (req, res) => {
    try {
        const { activityId, instructorId } = req.query;
        const now = new Date();
        const from = req.query.from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const to = req.query.to || now.toISOString().split('T')[0];

        // Para filtrar por segmento hace falta unir el historial de altas/bajas con tul_groups a través de group_id
        let segFilter = '';
        const params = [req.params.clubId, from, to];
        if (activityId) {
            params.push(activityId);
            segFilter = ` AND g.activity_id = $${params.length}::UUID`;
        } else if (instructorId) {
            params.push(instructorId);
            segFilter = ` AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(COALESCE(g.sessions, '[]'::jsonb)) sess
                WHERE sess->>'instructorId' = $${params.length}
            )`;
        }
        const segJoin = (activityId || instructorId) ? 'JOIN tul_groups g ON h.group_id = g.group_id' : '';

        const result = await pool.query(
            `SELECT h.student_id as "studentId", h.student_name as "studentName",
                    h.group_name as "groupName", h.activity_name as "activityName", h.action,
                    TO_CHAR(h.created_at, 'DD/MM/YYYY') as date
             FROM tul_enrollment_history h
             ${segJoin}
             WHERE h.club_id = $1
             AND DATE(h.created_at) >= $2::DATE AND DATE(h.created_at) <= $3::DATE
             ${segFilter}
             ORDER BY h.created_at DESC`,
            params
        );
        const enrolled = result.rows.filter(r => r.action === 'enrolled');
        const unenrolled = result.rows.filter(r => r.action === 'unenrolled');

        // Las cuentas nuevas no están ligadas a una actividad/instructor concreto, así que las omitimos si hay un filtro de segmento activo
        let newAccounts = [];
        if (!activityId && !instructorId) {
            const newAccountsRes = await pool.query(
                `SELECT user_id as "studentId",
                        TRIM(CONCAT(name, ' ', COALESCE(surname, ''))) as "studentName",
                        email, TO_CHAR(created_at, 'DD/MM/YYYY') as date
                 FROM users
                 WHERE club_id = $1 AND role = 'student'
                 AND DATE(created_at) >= $2::DATE AND DATE(created_at) <= $3::DATE
                 ORDER BY created_at DESC`,
                [req.params.clubId, from, to]
            );
            newAccounts = newAccountsRes.rows;
        }

        res.status(200).json({
            success: true,
            enrolled,
            unenrolled,
            totalEnrolled: enrolled.length,
            totalUnenrolled: unenrolled.length,
            newAccounts,
            totalNewAccounts: newAccounts.length
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Calculamos la tasa de abandono mes a mes (hasta 12 meses con datos), que alimenta la fórmula de duración media de la membresía:
//   retencionAnual = Π(1 - abandono_i)  para cada uno de los N meses con datos
//   abandonoMensualEquivalente = 1 - raiz_N-esima(retencionAnual)
//   duracionMediaEnMeses = 1 / abandonoMensualEquivalente
app.get('/api/clubs/:clubId/report/monthly-churn', async (req, res) => {
    try {
        const { activityId, instructorId } = req.query;
        const clubId = req.params.clubId;

        const buildSegFilter = (paramsArr) => {
            if (activityId) {
                paramsArr.push(activityId);
                return { filter: ` AND g.activity_id = $${paramsArr.length}::UUID`, needsJoin: true };
            }
            if (instructorId) {
                paramsArr.push(instructorId);
                return {
                    filter: ` AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(g.sessions, '[]'::jsonb)) sess WHERE sess->>'instructorId' = $${paramsArr.length})`,
                    needsJoin: true
                };
            }
            return { filter: '', needsJoin: false };
        };

        // Total de alumnos inscritos actualmente, acotado al segmento elegido
        const totalParams = [clubId];
        const totalSeg = buildSegFilter(totalParams);
        const totalRes = await pool.query(
            `SELECT COUNT(DISTINCT gs.student_id) as total
             FROM tul_group_students gs
             JOIN tul_groups g ON gs.group_id = g.group_id
             JOIN tul_activities a ON g.activity_id = a.activity_id
             WHERE a.club_id = $1 ${totalSeg.filter}`,
            totalParams
        );
        const currentTotal = parseInt(totalRes.rows[0]?.total || 0);

        // Buscamos el registro más antiguo del historial de altas/bajas disponible para este segmento
        const earliestParams = [clubId];
        const earliestSeg = buildSegFilter(earliestParams);
        const earliestJoin = earliestSeg.needsJoin ? 'JOIN tul_groups g ON h.group_id = g.group_id' : '';
        const earliestRes = await pool.query(
            `SELECT MIN(h.created_at) as earliest
             FROM tul_enrollment_history h ${earliestJoin}
             WHERE h.club_id = $1 ${earliestSeg.filter}`,
            earliestParams
        );
        const earliest = earliestRes.rows[0]?.earliest ? new Date(earliestRes.rows[0].earliest) : null;

        // Construimos hasta 12 ventanas mensuales hacia atrás, parando en cuanto nos quedamos sin datos históricos
        const now = new Date();
        const windows = [];
        for (let i = 0; i < 12; i++) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            if (earliest && start < earliest) break;
            windows.push({ start, end });
        }
        windows.reverse();

        const months = [];
        for (const w of windows) {
            const bajasParams = [clubId];
            const bajasSeg = buildSegFilter(bajasParams);
            bajasParams.push(w.start.toISOString(), w.end.toISOString());
            const fromIdx = bajasParams.length - 1;
            const toIdx = bajasParams.length;
            const bajasJoin = bajasSeg.needsJoin ? 'JOIN tul_groups g ON h.group_id = g.group_id' : '';
            const bajasRes = await pool.query(
                `SELECT COUNT(*)::int as cnt
                 FROM tul_enrollment_history h ${bajasJoin}
                 WHERE h.club_id = $1 ${bajasSeg.filter}
                 AND h.action = 'unenrolled'
                 AND h.created_at >= $${fromIdx} AND h.created_at < $${toIdx}`,
                bajasParams
            );
            const bajas = parseInt(bajasRes.rows[0]?.cnt || 0);

            // Reconstruimos cuántos alumnos había al empezar este mes partiendo del total actual
            // y restando/sumando los altas y bajas netas que ocurrieron desde entonces.
            const sinceParams = [clubId];
            const sinceSeg = buildSegFilter(sinceParams);
            sinceParams.push(w.start.toISOString());
            const sinceIdx = sinceParams.length;
            const sinceJoin = sinceSeg.needsJoin ? 'JOIN tul_groups g ON h.group_id = g.group_id' : '';
            const sinceRes = await pool.query(
                `SELECT
                    COUNT(*) FILTER (WHERE h.action = 'enrolled' AND h.created_at >= $${sinceIdx})::int as enrolled_since,
                    COUNT(*) FILTER (WHERE h.action = 'unenrolled' AND h.created_at >= $${sinceIdx})::int as unenrolled_since
                 FROM tul_enrollment_history h ${sinceJoin}
                 WHERE h.club_id = $1 ${sinceSeg.filter}`,
                sinceParams
            );
            const enrolledSince = parseInt(sinceRes.rows[0]?.enrolled_since || 0);
            const unenrolledSince = parseInt(sinceRes.rows[0]?.unenrolled_since || 0);
            const sociosInicio = Math.max(currentTotal - enrolledSince + unenrolledSince, 0);

            months.push({
                month: `${w.start.getFullYear()}-${String(w.start.getMonth() + 1).padStart(2, '0')}`,
                bajas,
                sociosInicio
            });
        }

        res.status(200).json({ success: true, months });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Aqui calculamos las estadisticas de gamificacion del club (nivel medio, distribucion de clases RPG y de niveles, top alumnos)
// Incluimos tambien a los alumnos que estan en clanes del club aunque su club_id sea distinto, porque pueden seguir entrenando alli
app.get('/api/clubs/:clubId/report/gamification', async (req, res) => {
    try {
        const statsRes = await pool.query(
            `SELECT u.user_id as "userId",
                TRIM(CONCAT(u.name, ' ', COALESCE(u.surname, ''))) as "studentName",
                COALESCE(r.level, 1)::int as level,
                COALESCE(r.exp, 0)::int as exp,
                COALESCE(r.rpg_class, 'Sin clase') as "rpgClass",
                (SELECT COUNT(*)::int FROM tul_inventory i WHERE i.user_id = u.user_id) as "itemCount"
             FROM users u
             LEFT JOIN tul_rpg r ON r.user_id = u.user_id
             WHERE (
                 u.club_id = $1
                 OR u.user_id IN (
                     SELECT cm.user_id FROM tul_clan_members cm
                     JOIN tul_clans c ON c.clan_id = cm.clan_id
                     WHERE c.club_id = $1
                 )
             )
             AND u.role IN ('student', 'instructor', 'club_owner')
             ORDER BY level DESC, exp DESC`,
            [req.params.clubId]
        );
        const students = statsRes.rows;
        const avgLevel = students.length > 0
            ? Math.round((students.reduce((s, st) => s + st.level, 0) / students.length) * 10) / 10 : 0;
        const classDist = {};
        students.forEach(s => { classDist[s.rpgClass] = (classDist[s.rpgClass] || 0) + 1; });
        const levelBuckets = { '1-5': 0, '6-10': 0, '11-20': 0, '21-50': 0, '51+': 0 };
        students.forEach(s => {
            if (s.level <= 5) levelBuckets['1-5']++;
            else if (s.level <= 10) levelBuckets['6-10']++;
            else if (s.level <= 20) levelBuckets['11-20']++;
            else if (s.level <= 50) levelBuckets['21-50']++;
            else levelBuckets['51+']++;
        });
        res.status(200).json({
            success: true, students, avgLevel, classDist, levelBuckets,
            topStudents: students.slice(0, 5),
            totalItemsCollected: students.reduce((s, st) => s + st.itemCount, 0)
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SINCRONIZACION DE ASISTENCIA ---
// Aqui el instructor marca manualmente la asistencia de un alumno a una sesion concreta (sobreescribe el registro automatico si lo hay)
app.all('/api/groups/:groupId/attendance', async (req, res) => {
    if (req.method !== 'POST' && req.method !== 'PUT') return res.status(405).end();
    const { studentId, date, status } = req.body;
    try {
        let pgDate = (date.includes('-') && date.split('-')[0].length === 4)
            ? date
            : date.split('-').reverse().join('-');
        
        // Quitamos la parte de la hora si la fecha llega como string ISO (la columna solo guarda la fecha)
        if (pgDate.includes('T')) pgDate = pgDate.split('T')[0];

        const existing = await pool.query(
            "SELECT attendance_id FROM tul_attendance WHERE group_id = $1 AND student_id = $2 AND date = $3",
            [req.params.groupId, studentId, pgDate]
        );

        if (existing.rows.length > 0) {
            await pool.query(
                "UPDATE tul_attendance SET status = $1, is_auto = FALSE WHERE attendance_id = $2",
                [status, existing.rows[0].attendance_id]
            );
        } else {
            await pool.query(
                "INSERT INTO tul_attendance (group_id, student_id, date, status, is_auto) VALUES ($1, $2, $3, $4, FALSE)",
                [req.params.groupId, studentId, pgDate, status]
            );
        }
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('API Error during sync attendance:', err);
        res.status(500).json({ error: err.message });
    }
});

// Aqui devolvemos el historial de asistencia del grupo agrupado por fecha: para cada día calculamos
// cuantos alumnos estuvieron presentes/llegaron tarde, cuantos faltaron y si ese registro fue generado
// automaticamente (is_auto) o ya fue verificado a mano por el instructor
app.get('/api/groups/:groupId/attendance/history', async (req, res) => {
    try {
        const query = `
            SELECT 
                TO_CHAR(date, 'DD-MM-YYYY') as date,
                COUNT(CASE WHEN status IN ('present', 'late') THEN 1 END)::int as present,
                COUNT(CASE WHEN status = 'absent' THEN 1 END)::int as absent,
                bool_and(is_auto) as is_auto
            FROM tul_attendance
            WHERE group_id = $1
            GROUP BY date
            ORDER BY MAX(date) DESC
        `;
        const result = await pool.query(query, [req.params.groupId]);
        res.status(200).json({ success: true, history: result.rows });
    } catch (err) {
        console.error('API Error during GET group attendance history:', err);
        res.status(500).json({ error: err.message });
    }
});

// Aqui devolvemos el detalle de asistencia de un grupo para un dia concreto, como un mapa
// { student_id: 'present' | 'absent' | 'late' } que la pantalla puede usar para pintar el listado del dia
app.get('/api/groups/:groupId/attendance/date/:date', async (req, res) => {
    try {
        // La fecha llega en formato DD-MM-YYYY desde el cliente y la convertimos a YYYY-MM-DD para Postgres
        const pgDate = req.params.date.split('-').reverse().join('-');
        const result = await pool.query(
            "SELECT student_id, status FROM tul_attendance WHERE group_id = $1 AND date = $2",
            [req.params.groupId, pgDate]
        );
        const records = {};
        result.rows.forEach(r => {
            records[r.student_id] = r.status;
        });
        res.status(200).json({ success: true, records });
    } catch (err) {
        console.error('API Error during GET group attendance by date:', err);
        res.status(500).json({ error: err.message });
    }
});

// Aqui marcamos como "verificado a mano" un dia completo de asistencia que el sistema habia
// generado automaticamente (is_auto = true), para que el instructor confirme que esos registros son correctos
app.post('/api/groups/:groupId/attendance/verify', async (req, res) => {
    try {
        const { date } = req.body;
        if (!date) return res.status(400).json({ error: 'Missing date' });

        const pgDate = date.split('-').reverse().join('-');
        await pool.query(
            "UPDATE tul_attendance SET is_auto = FALSE WHERE group_id = $1 AND date = $2",
            [req.params.groupId, pgDate]
        );
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('API Error during verify attendance:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- PETICIONES DE TECNICA ("Pedir Técnica") ---
// Aqui el instructor anuncia una tecnica concreta del catalogo de vocabulario a todo el grupo; cada peticion queda
// registrada para luego poder calificar a cada alumno individualmente sobre esa misma tecnica
app.post('/api/groups/:groupId/technique-requests', async (req, res) => {
    try {
        const { instructorId, activityId, vocabularyId, techniqueName, imageUrl } = req.body;
        if (!techniqueName) return res.status(400).json({ error: 'Missing techniqueName' });

        const groupRes = await pool.query(
            `SELECT g.activity_id, a.club_id
             FROM tul_groups g
             JOIN tul_activities a ON g.activity_id = a.activity_id
             WHERE g.group_id = $1`,
            [req.params.groupId]
        );
        if (groupRes.rows.length === 0) return res.status(404).json({ error: 'Group not found' });
        const { club_id: clubId, activity_id: groupActivityId } = groupRes.rows[0];

        const result = await pool.query(
            `INSERT INTO tul_technique_requests
                (club_id, group_id, vocabulary_id, technique_name, image_url, instructor_id, activity_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING request_id as id, club_id as "clubId", group_id as "groupId", vocabulary_id as "vocabularyId",
                       technique_name as "techniqueName", image_url as "imageUrl", instructor_id as "instructorId",
                       activity_id as "activityId", request_date as "requestDate"`,
            [clubId, req.params.groupId, vocabularyId || null, techniqueName, imageUrl || null, instructorId || null, activityId || groupActivityId]
        );
        res.status(201).json({ success: true, request: result.rows[0] });
    } catch (err) {
        console.error('API Error during POST technique request:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/technique-requests/:requestId/evaluations', async (req, res) => {
    try {
        const { studentId, instructorId, score, comment, pointsAwarded } = req.body;
        if (!studentId || score === undefined || score === null) {
            return res.status(400).json({ error: 'Missing studentId or score' });
        }

        const result = await pool.query(
            `INSERT INTO tul_technique_evaluations (request_id, student_id, instructor_id, score, comment, points_awarded)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (request_id, student_id) DO UPDATE
                SET score = EXCLUDED.score,
                    comment = EXCLUDED.comment,
                    points_awarded = EXCLUDED.points_awarded,
                    instructor_id = EXCLUDED.instructor_id,
                    evaluation_date = CURRENT_TIMESTAMP
             RETURNING evaluation_id as id, request_id as "requestId", student_id as "studentId",
                       instructor_id as "instructorId", score, comment, points_awarded as "pointsAwarded",
                       evaluation_date as "evaluationDate"`,
            [req.params.requestId, studentId, instructorId || null, score, comment || null, pointsAwarded || 0]
        );
        res.status(201).json({ success: true, evaluation: result.rows[0] });
    } catch (err) {
        console.error('API Error during POST technique evaluation:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- VOCABULARIO (catalogo de terminos y tecnicas) ---
// Estos endpoints gestionan el catalogo de vocabulario de un club: terminos de texto (p.ej. ingles/coreano)
// o entradas de tipo imagen (tecnicas con foto) que luego se usan tanto en el minijuego "Reto de Tecnicas"
// como en el flujo de "Pedir Tecnica" para anunciar una tecnica concreta al grupo
app.get('/api/clubs/:clubId/vocabulary', async (req, res) => {
    try {
        const { maxBeltLevel, activityType, contentType, topic } = req.query;
        let query = `
            SELECT vocabulary_id as id, term, meaning, belt_level as "beltLevel", activity_type as "activityType",
                   content_type as "contentType", image_url as "imageUrl", topic
            FROM tul_vocabulary
            WHERE club_id = $1
        `;
        const params = [req.params.clubId];

        if (activityType !== undefined) {
            params.push(activityType);
            query += ` AND activity_type = $${params.length}`;
        }

        if (maxBeltLevel !== undefined) {
            params.push(parseInt(maxBeltLevel));
            query += ` AND belt_level <= $${params.length}`;
        }

        if (contentType !== undefined) {
            params.push(contentType);
            query += ` AND content_type = $${params.length}`;
        }

        if (topic !== undefined) {
            params.push(topic);
            query += ` AND topic = $${params.length}`;
        }

        query += " ORDER BY created_at DESC";

        const result = await pool.query(query, params);
        res.status(200).json({ success: true, vocabulary: result.rows });
    } catch (err) {
        console.error('API Error during GET vocabulary:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/clubs/:clubId/vocabulary', async (req, res) => {
    try {
        const { term, meaning, beltLevel, activityType, contentType, imageUrl, topic } = req.body;
        if (!term) {
            return res.status(400).json({ error: 'Term is required' });
        }
        const finalContentType = contentType || 'text';
        // Las entradas de tipo imagen no tienen un "significado" real (solo nombre + foto), asi que
        // usamos el propio termino como significado para cumplir con la restriccion NOT NULL de la columna
        const finalMeaning = meaning || (finalContentType === 'image' ? term : null);
        if (!finalMeaning) {
            return res.status(400).json({ error: 'Term and meaning are required' });
        }
        const result = await pool.query(
            `INSERT INTO tul_vocabulary (club_id, term, meaning, belt_level, activity_type, content_type, image_url, topic)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING vocabulary_id as id, term, meaning, belt_level as "beltLevel", activity_type as "activityType",
                       content_type as "contentType", image_url as "imageUrl", topic`,
            [req.params.clubId, term, finalMeaning, beltLevel || 0, activityType || 'taekwondo_itf', finalContentType, imageUrl || null, topic || null]
        );
        res.status(201).json({ success: true, vocabulary: result.rows[0] });
    } catch (err) {
        console.error('API Error during POST vocabulary:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/clubs/:clubId/vocabulary/:vocabularyId', async (req, res) => {
    try {
        const { term, meaning, beltLevel, activityType, contentType, imageUrl, topic } = req.body;
        const finalContentType = contentType || 'text';
        const finalMeaning = meaning || (finalContentType === 'image' ? term : meaning);
        const result = await pool.query(
            `UPDATE tul_vocabulary
             SET term = $1, meaning = $2, belt_level = $3, activity_type = $4, content_type = $5, image_url = $6, topic = $7
             WHERE club_id = $8 AND vocabulary_id = $9
             RETURNING vocabulary_id as id, term, meaning, belt_level as "beltLevel", activity_type as "activityType",
                       content_type as "contentType", image_url as "imageUrl", topic`,
            [term, finalMeaning, beltLevel || 0, activityType || 'taekwondo_itf', finalContentType, imageUrl || null, topic || null, req.params.clubId, req.params.vocabularyId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Term not found' });
        res.status(200).json({ success: true, vocabulary: result.rows[0] });
    } catch (err) {
        console.error('API Error during PUT vocabulary:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/clubs/:clubId/vocabulary/:vocabularyId', async (req, res) => {
    try {
        await pool.query(
            "DELETE FROM tul_vocabulary WHERE club_id = $1 AND vocabulary_id = $2",
            [req.params.clubId, req.params.vocabularyId]
        );
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('API Error during DELETE vocabulary:', err);
        res.status(500).json({ error: err.message });
    }
});

// (ruta duplicada eliminada — GET /api/groups/:groupId/students ya esta gestionada mas arriba)

// --- SEGUIMIENTO DEL ALUMNO (EVALUACIONES Y ASISTENCIA) ---
// Aqui registramos una evaluacion completa de Tul (movimiento por movimiento), exclusiva de Taekwondo ITF:
// validamos que el alumno esta inscrito en una actividad de ese tipo, buscamos o creamos el Tul en el catalogo,
// guardamos la cabecera de la evaluacion y cada movimiento puntuado, y otorgamos una pequeña recompensa de experiencia
app.post('/api/evaluations', async (req, res) => {
    const { studentId, instructorId, tulName, tulId, summaryComment, movements, activityId } = req.body;

    if (!studentId || !instructorId || !tulName || !movements || !Array.isArray(movements)) {
        return res.status(400).json({ error: 'Missing required fields for evaluation.' });
    }
    if (!activityId) {
        return res.status(400).json({ error: 'activityId is required for TUL evaluations.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Los Tuls solo tienen sentido en Taekwondo ITF: comprobamos que la actividad es de ese tipo Y que el alumno esta inscrito en ella
        const activityCheck = await client.query(`
            SELECT a.activity_id
            FROM tul_activities a
            WHERE a.activity_id = $1
              AND a.activity_type = 'taekwondo_itf'
              AND EXISTS (
                  SELECT 1 FROM tul_group_students gs
                  JOIN tul_groups g ON gs.group_id = g.group_id
                  WHERE gs.student_id = $2 AND g.activity_id = a.activity_id
              )
        `, [activityId, studentId]);
        if (activityCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Student is not enrolled in a Taekwondo ITF activity.' });
        }

        // Buscamos el Tul primero por nombre exacto, luego ignorando mayusculas/minusculas, y si aun asi no existe lo creamos
        let tulRes = await client.query('SELECT tul_id FROM tul_tuls WHERE name = $1', [tulName]);
        if (tulRes.rows.length === 0) {
            tulRes = await client.query('SELECT tul_id FROM tul_tuls WHERE LOWER(name) = LOWER($1)', [tulName]);
        }
        if (tulRes.rows.length === 0) {
            // Creamos el Tul automaticamente para que una evaluacion nunca quede bloqueada por faltar en el catalogo
            // El INSERT directo es seguro aqui: las dos consultas SELECT de arriba ya confirmaron que no existe todavia
            tulRes = await client.query(
                'INSERT INTO tul_tuls (name) VALUES ($1) RETURNING tul_id',
                [tulName]
            );
        }
        const realTulId = tulRes.rows[0].tul_id;

        // Guardamos la cabecera de la evaluacion — siempre almacenamos tul_name como texto plano para mayor resiliencia
        // (asi el historico no se rompe aunque el Tul cambie de nombre o se elimine del catalogo mas adelante)
        const evalRes = await client.query(
            `INSERT INTO tul_evaluations (student_id, instructor_id, tul_id, tul_name, summary_comment, activity_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING evaluation_id`,
            [studentId, instructorId, realTulId, tulName, summaryComment || null, activityId]
        );

        const evaluationId = evalRes.rows[0].evaluation_id;

        // Guardamos la puntuacion y el comentario de cada movimiento individual del Tul
        for (const mov of movements) {
            await client.query(
                `INSERT INTO tul_evaluation_movements (evaluation_id, move_index, score, comment)
                 VALUES ($1, $2, $3, $4)`,
                [evaluationId, mov.moveIndex, mov.score, mov.comment || null]
            );
        }

        // Pequeña recompensa de experiencia por completar una evaluacion de Tul (solo Taekwondo, segun la validacion de arriba)
        await addXPAndCheckLevel(studentId, 25, 'tul_evaluation', activityId);

        await client.query('COMMIT');
        res.status(201).json({ success: true, evaluationId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('API Error during POST evaluation:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Evaluacion generica por categorias/rubrica (Inglés, Ballet... cualquier actividad con su propia entrada en EVALUATION_RUBRICS).
// Taekwondo ITF sigue usando POST /api/evaluations y el flujo de Tul movimiento por movimiento de arriba, sin tocar.
// Aqui guardamos una cabecera de evaluacion y una puntuacion+comentario por cada categoria de la rubrica de esa actividad
app.post('/api/category-evaluations', async (req, res) => {
    const { studentId, instructorId, activityId, summaryComment, scores } = req.body;

    if (!studentId || !instructorId || !activityId || !scores || !Array.isArray(scores) || scores.length === 0) {
        return res.status(400).json({ error: 'Missing required fields for evaluation.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Comprobamos que la actividad usa el flujo de rubrica por categorias (no Taekwondo ITF) y que el alumno esta inscrito en ella
        const activityCheck = await client.query(`
            SELECT a.activity_id, a.activity_type
            FROM tul_activities a
            WHERE a.activity_id = $1
              AND a.activity_type IS NOT NULL
              AND a.activity_type <> 'taekwondo_itf'
              AND EXISTS (
                  SELECT 1 FROM tul_group_students gs
                  JOIN tul_groups g ON gs.group_id = g.group_id
                  WHERE gs.student_id = $2 AND g.activity_id = a.activity_id
              )
        `, [activityId, studentId]);
        if (activityCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Student is not enrolled in an activity that uses category-based evaluations.' });
        }
        const activityType = activityCheck.rows[0].activity_type;

        const evalRes = await client.query(
            `INSERT INTO tul_category_evaluations (student_id, instructor_id, activity_id, activity_type, summary_comment)
             VALUES ($1, $2, $3, $4, $5) RETURNING evaluation_id`,
            [studentId, instructorId, activityId, activityType, summaryComment || null]
        );
        const evaluationId = evalRes.rows[0].evaluation_id;

        for (const s of scores) {
            await client.query(
                `INSERT INTO tul_category_evaluation_scores (evaluation_id, category_key, score, comment)
                 VALUES ($1, $2, $3, $4)`,
                [evaluationId, s.categoryKey, s.score, s.comment || null]
            );
        }

        await addXPAndCheckLevel(studentId, 25, 'category_evaluation', activityId);

        await client.query('COMMIT');
        res.status(201).json({ success: true, evaluationId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('API Error during POST category evaluation:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Aqui devolvemos TODAS las evaluaciones de un alumno (Tul, categoria/rubrica y tecnica) fusionadas en una
// unica lista ordenada por fecha. Si llegan los parametros opcionales month/year filtramos cada consulta para
// que el informe mensual de ProfileScreen solo muestre las evaluaciones de ese mes; sin ellos se devuelve el historico completo
app.get('/api/users/:userId/evaluations', async (req, res) => {
    try {
        const { month, year } = req.query;
        const hasMonthFilter = month !== undefined && year !== undefined;
        const monthFilterParams = hasMonthFilter ? [parseInt(month, 10), parseInt(year, 10)] : [];

        const tulQuery = `
            SELECT
                e.evaluation_id as id,
                e.evaluation_date as "rawDate",
                to_char(e.evaluation_date, 'DD-MM-YYYY') as date,
                COALESCE(t.name, e.tul_name, 'Tul desconocido') as tul,
                e.summary_comment as "summaryComment",
                3 as "maxScore",
                (
                    SELECT ROUND(AVG(score), 1)
                    FROM tul_evaluation_movements em
                    WHERE em.evaluation_id = e.evaluation_id
                ) as score,
                (
                    SELECT json_agg(json_build_object(
                        'moveIndex', move_index,
                        'score', score,
                        'comment', comment
                    ))
                    FROM tul_evaluation_movements em
                    WHERE em.evaluation_id = e.evaluation_id
                ) as movements
            FROM tul_evaluations e
            LEFT JOIN tul_tuls t ON e.tul_id = t.tul_id
            WHERE e.student_id = $1
            ${hasMonthFilter ? 'AND EXTRACT(MONTH FROM e.evaluation_date) = $2 AND EXTRACT(YEAR FROM e.evaluation_date) = $3' : ''}
        `;
        const categoryQuery = `
            SELECT
                ce.evaluation_id as id,
                ce.evaluation_date as "rawDate",
                to_char(ce.evaluation_date, 'DD-MM-YYYY') as date,
                ce.activity_type as "activityType",
                a.name as "activityName",
                ce.summary_comment as "summaryComment",
                5 as "maxScore",
                (
                    SELECT ROUND(AVG(score), 1)
                    FROM tul_category_evaluation_scores cs
                    WHERE cs.evaluation_id = ce.evaluation_id
                ) as score,
                (
                    SELECT json_agg(json_build_object(
                        'categoryKey', category_key,
                        'score', score,
                        'comment', comment
                    ))
                    FROM tul_category_evaluation_scores cs
                    WHERE cs.evaluation_id = ce.evaluation_id
                ) as "categoryScores"
            FROM tul_category_evaluations ce
            LEFT JOIN tul_activities a ON a.activity_id = ce.activity_id
            WHERE ce.student_id = $1
            ${hasMonthFilter ? 'AND EXTRACT(MONTH FROM ce.evaluation_date) = $2 AND EXTRACT(YEAR FROM ce.evaluation_date) = $3' : ''}
        `;
        const techniqueQuery = `
            SELECT
                te.evaluation_id as id,
                te.evaluation_date as "rawDate",
                to_char(te.evaluation_date, 'DD-MM-YYYY') as date,
                tr.technique_name as tul,
                tr.image_url as "imageUrl",
                te.comment as "summaryComment",
                5 as "maxScore",
                te.score as score,
                te.points_awarded as "pointsAwarded"
            FROM tul_technique_evaluations te
            JOIN tul_technique_requests tr ON te.request_id = tr.request_id
            WHERE te.student_id = $1
            ${hasMonthFilter ? 'AND EXTRACT(MONTH FROM te.evaluation_date) = $2 AND EXTRACT(YEAR FROM te.evaluation_date) = $3' : ''}
        `;
        const [tulResult, categoryResult, techniqueResult] = await Promise.all([
            pool.query(tulQuery, [req.params.userId, ...monthFilterParams]),
            pool.query(categoryQuery, [req.params.userId, ...monthFilterParams]),
            pool.query(techniqueQuery, [req.params.userId, ...monthFilterParams])
        ]);
        // Postgres devuelve null (no un array vacio) cuando json_agg no encuentra filas, asi que normalizamos
        // a [] y formateamos la puntuacion media a un decimal para que el frontend no tenga que preocuparse de esos casos
        const tulEvaluations = tulResult.rows.map(r => ({
            ...r,
            evaluationType: 'tul',
            movements: r.movements || [],
            score: r.score ? parseFloat(r.score).toFixed(1) : "0.0"
        }));
        const categoryEvaluations = categoryResult.rows.map(r => ({
            ...r,
            evaluationType: 'category',
            categoryScores: r.categoryScores || [],
            score: r.score ? parseFloat(r.score).toFixed(1) : "0.0"
        }));
        const techniqueEvaluations = techniqueResult.rows.map(r => ({
            ...r,
            evaluationType: 'technique',
            score: r.score ? parseFloat(r.score).toFixed(1) : "0.0"
        }));
        const formatted = [...tulEvaluations, ...categoryEvaluations, ...techniqueEvaluations]
            .sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate))
            .map(({ rawDate, ...rest }) => rest);
        res.status(200).json({ success: true, evaluations: formatted });
    } catch (err) {
        console.error('API Error during GET evaluations:', err);
        res.status(500).json({ error: err.message });
    }
});

// Aqui devolvemos la asistencia de un alumno como un mapa { 'YYYY-MM-DD': estado } para pintar el calendario
// de asistencia; igual que en evaluaciones, month/year son opcionales y permiten acotar el informe a un mes concreto
app.get('/api/users/:userId/attendance', async (req, res) => {
    try {
        const { month, year } = req.query;
        const hasMonthFilter = month !== undefined && year !== undefined;
        const query = `
            SELECT to_char(date, 'YYYY-MM-DD') as date_key, status
            FROM tul_attendance
            WHERE student_id = $1
            ${hasMonthFilter ? 'AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3' : ''}
            ORDER BY date DESC
        `;
        const params = hasMonthFilter
            ? [req.params.userId, parseInt(month, 10), parseInt(year, 10)]
            : [req.params.userId];
        const result = await pool.query(query, params);

        // Transformamos el array de filas en el formato de mapa { fecha: estado } que espera el frontend
        const attendanceMap = {};
        result.rows.forEach(r => {
            attendanceMap[r.date_key] = r.status;
        });
        res.status(200).json({ success: true, attendance: attendanceMap });
    } catch (err) {
        console.error('API Error during GET attendance:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- AYUDANTES DE PROGRESION RPG ---
// Aqui calculamos cuanta experiencia hace falta para subir del nivel indicado al siguiente
const getRequiredXPForLevel = (level) => {
    // 1->2: 100, 2->3: 300, 3->4: 600, 4->5: 1000...
    return 50 * level * (level + 1);
};

// Aqui traducimos el nombre/grado de un cinturon a un multiplicador de daño para las batallas contra jefes:
// cuanto mas alto el grado, mayor el multiplicador (de Blanco x1 hasta IX Dan x20)
const getBeltDamageMultiplier = (beltName, beltLevel) => {
    // El cinturon Blanco vale 1, el IX Dan vale 20.
    // El orden habitual es: Blanco, Amarillo, Verde, Azul, Rojo, Negro.
    // El Negro va de I Dan a IX Dan.
    const name = (beltName || '').toLowerCase();
    if (name.includes('ix dan')) return 20;
    if (name.includes('viii dan')) return 18.5;
    if (name.includes('vii dan')) return 17;
    if (name.includes('vi dan')) return 15.5;
    if (name.includes('v dan')) return 14;
    if (name.includes('iv dan')) return 12.5;
    if (name.includes('iii dan')) return 11.5;
    if (name.includes('ii dan')) return 10.5;
    if (name.includes('i dan')) return 10;

    // Cinturones de color: Blanco(1), Amarillo(2.5), Verde(4), Azul(5.5), Rojo(7), Negro(8.5)
    if (name.includes('negro')) return 8.5;
    if (name.includes('rojo')) return 7;
    if (name.includes('azul')) return 5.5;
    if (name.includes('verde')) return 4;
    if (name.includes('amarillo')) return 2.5;
    return 1; // Blanco o por defecto
};

// Aqui sumamos experiencia a un alumno y comprobamos si sube de nivel; si sube, aumentamos su vida maxima,
// le damos puntos de habilidad para repartir y registramos la ganancia en el log de experiencia (para estadisticas/depuracion)
async function addXPAndCheckLevel(userId, expToAdd, source = 'unknown', activityId = null) {
    const rpgRes = await pool.query('SELECT * FROM tul_rpg WHERE user_id = $1', [userId]);
    if (rpgRes.rows.length === 0) return;

    let { level, exp, rpg_class, strength, vitality, potency, max_mana, max_hp, skill_points } = rpgRes.rows[0];
    exp += expToAdd;

    let leveledUp = false;
    let skillPointsGained = 0;
    while (exp >= getRequiredXPForLevel(level)) {
        exp -= getRequiredXPForLevel(level);
        level += 1;
        leveledUp = true;
        skillPointsGained += 1;

        // Subida de estadisticas base al subir de nivel (sistema antiguo — ahora ademas damos puntos de habilidad para repartir)
        max_hp = (max_hp || 100) + 10;
    }

    await pool.query(
        `UPDATE tul_rpg SET level = $1, exp = $2, max_hp = $3, skill_points = skill_points + $4
         WHERE user_id = $5`,
        [level, exp, max_hp, skillPointsGained, userId]
    );

    await pool.query(
        `INSERT INTO tul_exp_log (user_id, activity_id, source, exp_amount) VALUES ($1, $2, $3, $4)`,
        [userId, activityId, source, expToAdd]
    ).catch(() => { });

    return { leveledUp, newLevel: level, skillPointsGained };
}


// --- PUNTOS Y RACHAS ---
// (La logica principal de puntos y rachas ya esta consolidada mas arriba, sobre la linea 1751)

// Aqui sumamos puntos de juego a un alumno (p.ej. al acertar una pregunta de vocabulario), aplicando
// multiplicadores por racha de asistencia y por posibles "buffs" activos, curamos algo de vida y damos experiencia
app.post('/api/users/:userId/points/add', async (req, res) => {
    const { basePoints } = req.body;
    const bp = parseInt(basePoints) || 0;

    try {
        const attRes = await pool.query('SELECT status FROM tul_attendance WHERE student_id = $1 ORDER BY date DESC LIMIT 30', [req.params.userId]);
        let streak = 0;
        for (let row of attRes.rows) {
            if (row.status === 'present') streak++;
            else break;
        }

        const multiplier = Math.min(5, 1 + Math.floor(streak / 5) * 0.5);

        // --- MULTIPLICADOR POR "BUFF" ACTIVO ---
        // Si el alumno tiene algun potenciador activo (comprado en el mercado, por ejemplo) tomamos el mayor multiplicador vigente
        const buffRes = await pool.query('SELECT MAX(multiplier) as buff FROM tul_active_buffs WHERE user_id = $1 AND expires_at > NOW()', [req.params.userId]);
        const buffMultiplier = buffRes.rows[0].buff ? parseFloat(buffRes.rows[0].buff) : 1.0;

        const pointsToAdd = Math.floor(bp * multiplier * buffMultiplier);

        await pool.query(
            'INSERT INTO tul_puntos (user_id, points) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET points = tul_puntos.points + $2',
            [req.params.userId, pointsToAdd]
        );

        // Curamos al jugador 5 puntos de vida por cada respuesta correcta (bp = puntos base ganados)
        const hpToHeal = bp * 5;
        await pool.query('UPDATE tul_rpg SET current_hp = LEAST(max_hp, current_hp + $1) WHERE user_id = $2', [hpToHeal, req.params.userId]);

        // Tambien sumamos experiencia (fijada a 1 XP por pregunta, segun lo solicitado)
        const progress = await addXPAndCheckLevel(req.params.userId, 1, 'vocabulary');

        const newTotalRes = await pool.query('SELECT points FROM tul_puntos WHERE user_id = $1', [req.params.userId]);
        const newTotal = parseFloat(newTotalRes.rows[0].points);

        res.status(200).json({ success: true, added: pointsToAdd, total: newTotal, streak, multiplier, leveledUp: progress?.leveledUp, newLevel: progress?.newLevel });
    } catch (err) {
        console.error('API Error during POST points/add:', err);
        res.status(500).json({ error: err.message });
    }
});

// --- FASE 12: SINCRONIZACION BIDIRECCIONAL CON HUBSPOT ---
// Aqui mantenemos sincronizados los contactos de HubSpot (CRM) con los usuarios de la app en ambas direcciones:
// 1) traemos contactos de HubSpot que no existan todavia como usuario y los creamos, y
// 2) empujamos a HubSpot los usuarios de la app que no tengan contacto alli. Se ejecuta por cron cada noche
// y tambien puede lanzarse a mano desde el panel de administracion (force-sync)
const runHubSpotBiDirectionalSync = async () => {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) {
        console.log('Skipping HubSpot Sync: HUBSPOT_ACCESS_TOKEN is not set.');
        return;
    }

    console.log('Starting Bi-directional HubSpot Sync...');
    try {
        // Paso 1: Traer SOLO desde HubSpot hacia la app, recorriendo todas las paginas de resultados
        let hubspotContacts = [];
        let after = undefined;
        let hasMore = true;

        while (hasMore) {
            let url = 'https://api.hubapi.com/crm/v3/objects/contacts?properties=email,firstname,lastname,phone&limit=100';
            if (after) {
                url += `&after=${after}`;
            }

            const hubspotRes = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!hubspotRes.ok) throw new Error(`HubSpot Fetch Error: ${hubspotRes.statusText}`);
            const hubspotData = await hubspotRes.json();

            if (hubspotData.results && hubspotData.results.length > 0) {
                hubspotContacts = hubspotContacts.concat(hubspotData.results);
            }

            if (hubspotData.paging && hubspotData.paging.next && hubspotData.paging.next.after) {
                after = hubspotData.paging.next.after;
            } else {
                hasMore = false;
            }
        }

        console.log(`HubSpot Sync: Successfully pulled ${hubspotContacts.length} contacts from CRM.`);

        // Comparamos contra nuestra base de datos
        // 1. Traemos todos los emails existentes en una sola consulta para evitar lanzar 2000+ SELECTs sueltos
        const existingUsersRes = await pool.query('SELECT email FROM users WHERE email IS NOT NULL');
        const existingEmails = new Set(existingUsersRes.rows.map(r => r.email.toLowerCase()));

        for (const contact of hubspotContacts) {
            const props = contact.properties;
            if (!props.email) continue;

            const email = props.email.toLowerCase();
            if (!existingEmails.has(email)) {
                try {
                    // Generamos un nombre de usuario a partir del nombre y apellido (sin acentos, en minusculas)
                    const cleanAccents = (str) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
                    const namePart = cleanAccents(props.firstname || '').substring(0, 2);
                    const surnamePart = cleanAccents(props.lastname || '').substring(0, 2) || 'es';
                    let baseUsername = `${namePart}${surnamePart}0000`;

                    const checkUsername = await pool.query('SELECT 1 FROM users WHERE username = $1', [baseUsername]);
                    if (checkUsername.rows.length > 0) baseUsername = `${baseUsername}${Math.floor(10000 + Math.random() * 90000)}`;

                    // Generamos una contrase\u00f1a base totalmente aleatoria y segura (el usuario podra cambiarla despues)
                    const randomPassword = require('crypto').randomBytes(12).toString('hex');
                    const hashedPassword = await bcrypt.hash(randomPassword, 10);

                    await pool.query(`
                        INSERT INTO users(name, surname, email, username, password, phone, belt, role) 
                        VALUES($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [props.firstname || 'HubSpot', props.lastname || null, email, baseUsername, hashedPassword, props.phone || null, 'Blanco (10º Gup)', 'student']);

                    console.log(`HubSpot Sync: Created missing Learning Dungeon user -> ${email}`);
                } catch (insertError) {
                    console.error(`HubSpot Sync: Failed to create user ${email} in Learning Dungeon`, insertError.message);
                }
            }
        }

        // Paso 2: Empujar a HubSpot los usuarios de la app que falten alli
        const dbUsers = await pool.query('SELECT name, surname, email, phone FROM users');
        const hubspotEmails = new Set(hubspotContacts.map(c => c.properties.email?.toLowerCase()).filter(Boolean));

        for (const user of dbUsers.rows) {
            if (!user.email || hubspotEmails.has(user.email.toLowerCase())) continue;

            // Falta en HubSpot: lo creamos alli de forma segura (sin interrumpir el resto si falla uno)
            try {
                await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        properties: {
                            email: user.email.toLowerCase(),
                            firstname: user.name,
                            lastname: user.surname || '',
                            phone: user.phone || ''
                        }
                    })
                });
                console.log(`HubSpot Sync: Pushed missing user to HubSpot -> ${user.email}`);
            } catch (err) {
                // Ignoramos en silencio el fallo de un registro suelto para no interrumpir el resto de la sincronizacion
            }
        }

        console.log('Bi-directional HubSpot Sync Completed.');
    } catch (error) {
        console.error('HubSpot Bi-directional Sync Failed:', error);
    }
};

// Programamos la sincronizacion para que se ejecute todos los dias a las 00:00 (medianoche)
cron.schedule('0 0 * * *', () => {
    runHubSpotBiDirectionalSync();
});

// Limpiamos los "buffs" caducados cada hora para que dejen de aplicar su multiplicador
cron.schedule('0 * * * *', async () => {
    try {
        await pool.query('DELETE FROM tul_active_buffs WHERE expires_at < NOW()');
    } catch (e) { console.error('Buff cleanup error:', e); }
});

// Endpoint de administracion para forzar la sincronizacion con HubSpot manualmente
app.post('/api/admin/force-sync', authenticateToken, requireSuperadmin, async (req, res) => {
    // La lanzamos "en segundo plano" (sin esperar) para no bloquear la respuesta si la sincronizacion tarda
    runHubSpotBiDirectionalSync();
    res.status(200).json({ success: true, message: 'Sync process triggered in the background' });
});

// --- CINTURONES Y ASCENSOS ---
// Aqui devolvemos el catalogo de cinturones (orden y nombre de cada grado) que se usa para mostrar la
// progresion del alumno y calcular ascensos
app.get('/api/belts', async (req, res) => {
    try {
        const result = await pool.query('SELECT belt_level, name FROM tul_belts ORDER BY belt_level ASC');

        if (result.rows.length === 0) {
            // Auto-reparacion: si la tabla de cinturones esta vacia, la rellenamos con los valores por defecto al vuelo
            try {
                await pool.query('ALTER TABLE tul_belts ADD CONSTRAINT belts_belt_level_key UNIQUE(belt_level)').catch(() => { });
            } catch (e) { }

            await pool.query(`
                INSERT INTO tul_belts (belt_level, name) VALUES 
                (0, 'Blanco (10º Gup)'),
                (1, 'Punta Amarilla (9º Gup)'),
                (2, 'Amarillo (8º Gup)'),
                (3, 'Punta Verde (7º Gup)'),
                (4, 'Verde (6º Gup)'),
                (5, 'Punta Azul (5º Gup)'),
                (6, 'Azul (4º Gup)'),
                (7, 'Punta Roja (3º Gup)'),
                (8, 'Rojo (2º Gup)'),
                (9, 'Punta Negra (1º Gup)'),
                (10, 'I Dan (Negro)'),
                (11, 'II Dan (Negro)'),
                (12, 'III Dan (Negro)'),
                (13, 'IV Dan (Negro)'),
                (14, 'V Dan (Negro)'),
                (15, 'VI Dan (Negro)'),
                (16, 'VII Dan (Negro)'),
                (17, 'VIII Dan (Negro)'),
                (18, 'IX Dan (Negro)')
                ON CONFLICT DO NOTHING
            `);
            const retryRes = await pool.query('SELECT belt_level, name FROM tul_belts ORDER BY belt_level ASC');
            return res.status(200).json({ success: true, belts: retryRes.rows });
        }

        res.status(200).json({ success: true, belts: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Nota: PUT /api/users/:userId/belt esta definido mas arriba (esa ruta combinada gestiona tanto
// las actualizaciones que hace el propio alumno como los ascensos asignados por instructor/dueño via assigned_by_user_id)

// --- SISTEMA DE TICKETS DE SOPORTE ---
const nodemailer = require('nodemailer');
// Las credenciales SMTP se configuran en el .env (por ejemplo EMAIL_USER, EMAIL_PASS)
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Usamos SSL
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Aqui un usuario crea un nuevo ticket de soporte: lo guardamos en la base de datos y, si hay credenciales
// SMTP configuradas, enviamos un correo de aviso a la bandeja de la empresa de forma asincrona (sin bloquear la respuesta)
app.post('/api/support', async (req, res) => {
    const { userId, subject, description } = req.body;
    console.log(`[SUPPORT] RECEIVE: User=${userId}, Subj=${subject}`);
    if (!userId || !subject || !description) return res.status(400).json({ error: 'User ID, subject and description required.' });

    try {
        const client = await pool.connect();
        try {
            // Usamos el userId autenticado (puede ser null si el envio de soporte se hizo sin iniciar sesion)
            const dbUserId = userId || null;

            // Registramos el ticket en la base de datos (siempre etiquetado por defecto como array ['Learning Dungeon'])
            const result = await client.query(
                'INSERT INTO tickets_registrosoporte (user_id, subject, description, app_label) VALUES ($1, $2, $3, $4) RETURNING id',
                [dbUserId, subject, description, ['Learning Dungeon']]
            );
            const ticketId = result.rows[0].id;
            console.log(`[SUPPORT] Ticket #${ticketId} registered in DB.`);

            // Intentamos enviar un correo a la bandeja de la empresa/administracion (de forma asincrona para no colgar al cliente)
            if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                transporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: process.env.EMAIL_USER, // Se envia a si misma (la bandeja de la empresa)
                    subject: `[Learning Dungeon Support] Ticket #${ticketId}: ${subject}`,
                    text: `New support ticket from User ID: ${userId}\n\nSubject: ${subject}\n\nDescription:\n${description}`
                }).then(() => {
                    console.log(`[SUPPORT] Email for Ticket #${ticketId} SENT successfully.`);
                    pool.query('UPDATE tickets_registrosoporte SET email_sent = true WHERE id = $1', [ticketId]).catch(() => { });
                }).catch(mailErr => {
                    console.error('[SMTP ERROR] Failed to send support email:', mailErr.message);
                    console.error('[SMTP DETAIL]', JSON.stringify(mailErr));
                });
            }

            res.status(200).json({ success: true, ticketId, emailSent: false });
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// Aqui devolvemos la lista de superadministradores (para mostrarla, por ejemplo, en pantallas de gestion/soporte)
app.get('/api/admin/superadmins', authenticateToken, requireSuperadmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT user_id as id, name, surname, username, profile_picture 
            FROM users 
            WHERE role = 'superadmin' OR dev_role = 'superadmin'
            ORDER BY name ASC
        `);
        res.status(200).json({ success: true, superadmins: result.rows });
    } catch (err) {
        console.error('[ADMIN] Fetch Superadmins Error:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// Aqui devolvemos el listado completo de tickets de soporte para el panel de administracion,
// incluyendo datos del usuario que lo creo y de la persona asignada para resolverlo
app.get('/api/support', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.*, 
                   COALESCE(u.name, 'Admin') as name, 
                   COALESCE(u.surname, '') as surname, 
                   COALESCE(u.email, 'admin@aimeducation.es') as email,
                   assignee.username as assignee_username,
                   assignee.profile_picture as assignee_picture
            FROM tickets_registrosoporte s
            LEFT JOIN users u ON s.user_id = u.user_id
            LEFT JOIN users assignee ON s.assigned_to = assignee.user_id
            WHERE s.app_label @> ARRAY['Learning Dungeon']::TEXT[]
            ORDER BY s.created_at DESC
        `);
        console.log(`[SUPPORT] Fetched ${result.rows.length} tickets.`);
        res.status(200).json({ success: true, tickets: result.rows });
    } catch (err) {
        console.error('[SUPPORT] Fetch Error:', err);
        res.status(500).json({ error: 'Internal Server Error.' });
    }
});

// Aqui actualizamos un ticket de soporte (estado, respuesta del equipo, prioridad, fecha limite, persona asignada y etiquetas de app)
app.put('/api/support/:id', async (req, res) => {
    const { status, devResponse, priority, dueDate, assignedTo, appLabel } = req.body;
    console.log(`[SUPPORT] Updating Ticket #${req.params.id}`, { status, priority, appLabel });
    try {
        // Nos aseguramos de que appLabel sea siempre un array (por seguridad, ante datos inesperados)
        const finalAppLabels = Array.isArray(appLabel) ? appLabel : (appLabel ? [appLabel] : ['Learning Dungeon']);

        await pool.query(
            `UPDATE tickets_registrosoporte 
             SET status = $1, dev_response = $2, priority = $3, 
                 due_date = $4, assigned_to = $5, app_label = $6::TEXT[] 
             WHERE id = $7`,
            [
                status || 'open',
                devResponse || '',
                priority || 'low',
                dueDate || null,
                assignedTo || null,
                finalAppLabels,
                req.params.id
            ]
        );
        res.status(200).json({ success: true, message: 'Ticket actualizado correctamente.' });
    } catch (err) {
        console.error('[SUPPORT] Update Error:', err);
        res.status(500).json({ error: 'Fallo al actualizar el ticket: ' + err.message });
    }
});

// --- SINCRONIZACION GLOBAL DE CONTENIDO ---
// Aqui copiamos vocabulario, jefes y articulos de mercado desde un club "origen" (por defecto Aim Education)
// hacia el club global compartido (GLOBAL_ID), evitando duplicados por nombre/termino — utilidad de administracion
// para poblar el contenido global a partir del contenido ya creado en un club de referencia
app.post('/api/admin/global-sync', authenticateToken, requireSuperadmin, async (req, res) => {
    const { sourceClubName } = req.body;
    const GLOBAL_ID = '00000000-0000-4000-a000-000000000000';
    try {
        console.log(`[SYNC] Starting sync. Source Name Provided: "${sourceClubName}"`);
        // Busqueda flexible: usamos comodines % por si el nombre no coincide exactamente
        const sourceSearch = sourceClubName ? `%${sourceClubName}%` : '%Aim Education%';
        const clubRes = await pool.query('SELECT club_id, name FROM tul_clubs WHERE name ILIKE $1 ORDER BY created_at ASC LIMIT 1', [sourceSearch]);

        if (clubRes.rows.length === 0) {
            console.error(`[SYNC] Source club matching "${sourceSearch}" not found.`);
            return res.status(404).json({ error: `No se encontró el club origen "${sourceClubName || 'Aim Education'}"` });
        }

        const sourceId = clubRes.rows[0].club_id;
        console.log(`[SYNC] Found source: ${clubRes.rows[0].name} (ID: ${sourceId})`);

        // Contamos cuantas entradas de vocabulario tiene el club global antes de sincronizar (para referencia/depuracion)
        const beforeVocab = await pool.query('SELECT count(*) FROM tul_vocabulary WHERE club_id = $1', [GLOBAL_ID]);

        // Copiamos el vocabulario evitando duplicados (comparando por termino)
        const vocabRes = await pool.query(`
            INSERT INTO tul_vocabulary (club_id, term, meaning)
            SELECT $1, v.term, v.meaning 
            FROM tul_vocabulary v 
            WHERE v.club_id = $2
            AND NOT EXISTS (
                SELECT 1 FROM tul_vocabulary v2 
                WHERE v2.club_id = $1 AND v2.term = v.term
            )
            RETURNING vocabulary_id
        `, [GLOBAL_ID, sourceId]);

        // Copiamos los jefes evitando duplicados (comparando por nombre)
        const bossRes = await pool.query(`
            INSERT INTO tul_bosses (club_id, name, total_hp, image_url, reward_points)
            SELECT $1, b.name, b.total_hp, b.image_url, b.reward_points 
            FROM tul_bosses b 
            WHERE b.club_id = $2
            AND NOT EXISTS (
                SELECT 1 FROM tul_bosses b2 
                WHERE b2.club_id = $1 AND b2.name = b.name
            )
            RETURNING boss_id
        `, [GLOBAL_ID, sourceId]);

        // Copiamos los articulos del mercado evitando duplicados (comparando por nombre)
        const marketRes = await pool.query(`
            INSERT INTO tul_market_items (club_id, name, description, cost_points, type, image_url, stock)
            SELECT $1, m.name, m.description, m.cost_points, m.type, m.image_url, m.stock 
            FROM tul_market_items m 
            WHERE m.club_id = $2
            AND NOT EXISTS (
                SELECT 1 FROM tul_market_items m2 
                WHERE m2.club_id = $1 AND m2.name = m.name
            )
            RETURNING item_id
        `, [GLOBAL_ID, sourceId]);

        console.log(`[SYNC] Copied items: ${vocabRes.rows.length} words, ${bossRes.rows.length} bosses, ${marketRes.rows.length} products.`);

        res.status(200).json({
            success: true,
            message: 'Sincronización completada',
            stats: {
                vocabulary: vocabRes.rows.length,
                bosses: bossRes.rows.length,
                market: marketRes.rows.length
            }
        });
    } catch (err) {
        console.error('[SYNC] FATAL ERROR:', err);
        res.status(500).json({ error: `Fallo en sincronización: ${err.message}` });
    }
});

// --- COMODIN PARA LA SPA (DEBE IR SIEMPRE AL FINAL) ---
// Servimos los archivos estaticos generados por la exportacion web de Expo (carpeta 'dist')
app.use(express.static(path.join(__dirname, 'dist')));

// Para cualquier otra ruta no reconocida, servimos el index.html para que el enrutado lo gestione el cliente (SPA)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

initDB().then(() => {
    server.listen(PORT, () => {
        console.log(`Universal App server is running on port ${PORT} `);
        // Lanzamos la generacion automatica de asistencia en segundo plano una vez el servidor esta listo
        generateAutoAttendance();
        setInterval(generateAutoAttendance, 1000 * 60 * 60 * 4);
    });
});

async function generateAutoAttendance() {
    console.log('[Auto-Attendance] Running generation check...');
    const client = await pool.connect();
    try {
        const daysES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
        const todayName = daysES[new Date().getDay()];
        const todayNameNoAccent = todayName.replace('é', 'e').replace('á', 'a');

        const groupsRes = await client.query('SELECT group_id, name, time FROM tul_groups WHERE time IS NOT NULL');

        for (const group of groupsRes.rows) {
            const timeLower = group.time.toLowerCase();
            if (timeLower.includes(todayName) || timeLower.includes(todayNameNoAccent) || timeLower.includes(todayName.replace('é', 'e'))) {
                const studentsRes = await client.query('SELECT student_id FROM tul_group_students WHERE group_id = $1', [group.group_id]);
                if (studentsRes.rows.length === 0) continue;

                await client.query('BEGIN');
                for (const student of studentsRes.rows) {
                    const checkDuplicate = await client.query('SELECT 1 FROM tul_attendance WHERE group_id = $1 AND student_id = $2 AND date = CURRENT_DATE', [group.group_id, student.student_id]);
                    if (checkDuplicate.rows.length === 0) {
                        await client.query(`
                            INSERT INTO tul_attendance (group_id, student_id, date, status, is_auto)
                            VALUES ($1, $2, CURRENT_DATE, 'pending', TRUE)
                        `, [group.group_id, student.student_id]);
                    }
                }
                await client.query('COMMIT');
            }
        }
        console.log('[Auto-Attendance] Generation completed.');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('[Auto-Attendance] Error:', e);
    } finally {
        client.release();
    }
}
