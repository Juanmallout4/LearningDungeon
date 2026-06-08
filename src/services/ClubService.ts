import { Activity, Group, GroupSession, VocabularyTerm } from '../types';
import { apiFetch } from '../utils/apiFetch';

// Servicio de gestión de clubes: agrupa operaciones CRUD sobre actividades, grupos, instructores, alumnos,
// vocabulario, mercado, puntos/gamificación, cofres de botín y aulas. Patrón común en cada método:
// llamar a apiFetch (añade el token), parsear el JSON y lanzar Error con data.error si la respuesta no es ok;
// el campo devuelto (data.activities, data.group, etc.) sigue la convención de nombres del recurso afectado.
export const ClubService = {
    // --- Actividades --- (CRUD sobre /api/clubs/:clubId/activities)
    getActivities: async (clubId: string): Promise<Activity[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/activities`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.activities;
    },
    addActivity: async (clubId: string, name: string, icon: string, activityType?: string): Promise<Activity> => {
        const response = await apiFetch(`/api/clubs/${clubId}/activities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon, activityType })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.activity;
    },
    updateActivity: async (clubId: string, activityId: string, name: string, icon: string, activityType?: string): Promise<Activity> => {
        const response = await apiFetch(`/api/clubs/${clubId}/activities/${activityId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon, activityType })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.activity;
    },
    deleteActivity: async (clubId: string, activityId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/activities/${activityId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },

    // --- Grupos --- (CRUD sobre /api/clubs/:clubId/groups; cada grupo cuelga de una actividad y tiene sesiones/horarios)
    getGroups: async (clubId: string): Promise<Group[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/groups`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.groups;
    },
    // GET /api/users/:userId/groups: grupos en los que está matriculado un alumno concreto
    getStudentGroups: async (userId: string): Promise<Group[]> => {
        const response = await apiFetch(`/api/users/${userId}/groups`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.groups;
    },
    addGroup: async (
        clubId: string, activityId: string, name: string, time: string,
        maxStudents?: number | null, sessions?: GroupSession[], minAge?: number | null, maxAge?: number | null
    ): Promise<Group> => {
        const response = await apiFetch(`/api/clubs/${clubId}/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activityId, name, time, maxStudents, sessions, minAge, maxAge })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.group;
    },
    updateGroup: async (
        clubId: string, groupId: string, name: string, time: string,
        maxStudents?: number | null, sessions?: GroupSession[], minAge?: number | null, maxAge?: number | null
    ): Promise<Group> => {
        const response = await apiFetch(`/api/clubs/${clubId}/groups/${groupId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, time, maxStudents, sessions, minAge, maxAge })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.group;
    },
    deleteGroup: async (clubId: string, groupId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/groups/${groupId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },

    // --- Instructores --- (gestión de profesores del club y qué actividades imparte cada uno)
    getInstructors: async (clubId: string): Promise<{ id: string; email: string; name: string }[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/instructors`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.instructors;
    },
    // POST /api/clubs/:clubId/instructors: invita/vincula a un usuario existente (por email) como instructor del club;
    // a diferencia de otros métodos, no lanza en error sino que devuelve { success: false, error } para manejarlo en UI
    addInstructor: async (clubId: string, email: string): Promise<{ success: boolean; user?: any; error?: string }> => {
        const response = await apiFetch(`/api/clubs/${clubId}/instructors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, user: data.user };
    },
    // PUT .../instructors/:instructorId/activities: reemplaza la lista completa de actividades asignadas al instructor (activity_ids)
    updateInstructorActivities: async (clubId: string, instructorId: string, activityIds: string[]): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/instructors/${instructorId}/activities`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activityIds }),
        });
        if (!response.ok) { const d = await response.json(); throw new Error(d.error); }
    },

    deleteInstructor: async (clubId: string, instructorId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/instructors/${instructorId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },

    // --- Alumnos --- (matriculación, alta/baja en el club y en grupos concretos)
    // GET /api/groups/:groupId/students: alumnos matriculados en un grupo
    getGroupStudents: async (groupId: string): Promise<any[]> => {
        const response = await apiFetch(`/api/groups/${groupId}/students`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.students;
    },
    // GET /api/clubs/:clubId/students: todos los alumnos pertenecientes al club (independientemente del grupo)
    getClubStudents: async (clubId: string): Promise<any[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/students`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.students;
    },
    // GET /api/clubs/:clubId/all_groups: todos los grupos del club (incluye los que el usuario actual no gestiona),
    // usado para listar opciones al matricular alumnos
    getAllClubGroups: async (clubId: string): Promise<Group[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/all_groups`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.groups;
    },
    // POST /api/clubs/:clubId/students/create: crea una cuenta de alumno nueva desde cero (sin que el alumno se registre);
    // el servidor genera una contraseña temporal que se devuelve en tempPassword para comunicársela
    createStudent: async (
        clubId: string,
        data: { name: string; surname: string; email: string; phone?: string; birthday?: string }
    ): Promise<{ success: boolean; student?: any; tempPassword?: string; error?: string }> => {
        const response = await apiFetch(`/api/clubs/${clubId}/students/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const json = await response.json();
        if (!response.ok) return { success: false, error: json.error };
        return { success: true, student: json.student, tempPassword: json.tempPassword };
    },
    // POST /api/clubs/:clubId/students: vincula a un usuario ya existente (por email) como alumno del club
    addStudentToClub: async (clubId: string, email: string): Promise<any> => {
        const response = await apiFetch(`/api/clubs/${clubId}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (!response.ok) return { success: false, error: data.error };
        return { success: true, user: data.student };
    },
    // DELETE: da de baja al alumno de todo el club (no solo de un grupo)
    removeStudentFromClub: async (clubId: string, studentId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/students/${studentId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    // POST: matricula al alumno en un grupo concreto (mantiene su pertenencia al club si ya la tenía)
    enrollStudentInGroup: async (groupId: string, studentId: string): Promise<void> => {
        const response = await apiFetch(`/api/groups/${groupId}/students/enroll`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    // DELETE: desmatricula al alumno solo de ese grupo (sigue perteneciendo al club)
    unenrollStudentFromGroup: async (groupId: string, studentId: string): Promise<void> => {
        const response = await apiFetch(`/api/groups/${groupId}/students/${studentId}/enroll`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    // GET /api/belts: catálogo global de cinturones disponibles (independiente del club)
    getBelts: async (): Promise<any[]> => {
        const response = await apiFetch('/api/belts');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.belts;
    },
    // Asciende el rango Dan de Taekwondo personal de un usuario (cualificación del propio instructor,
    // no la progresión de un alumno); incluye quién hizo la asignación (assigned_by_user_id) para auditoría
    updateUserBelt: async (userId: string, newBeltLevel: number, newBeltName: string, assignedByUserId: string): Promise<void> => {
        const response = await apiFetch(`/api/users/${userId}/belt`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                beltLevel: newBeltLevel,
                beltName: newBeltName,
                assigned_by_user_id: assignedByUserId
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update belt');
    },
    // PUT /api/users/:userId/progression: actualiza el nivel del usuario dentro de una actividad concreta
    // (escalas de progresión propias de cada actividad, no el sistema de cinturones)
    updateUserProgression: async (userId: string, activityId: string, levelOrder: number, levelName: string, assignedByUserId: string): Promise<void> => {
        const response = await apiFetch(`/api/users/${userId}/progression`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                activityId,
                levelOrder,
                levelName,
                assigned_by_user_id: assignedByUserId
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update progression');
    },
    // Devuelve todos los registros de progresión por actividad de un usuario. A diferencia de getStudentGroups
    // (que infiere la progresión a través de la matrícula en grupos), este funciona para cualquier usuario —
    // necesario para instructores, que se vinculan a actividades vía activity_ids y no por matrícula.
    getUserProgressions: async (userId: string): Promise<{ activityId: string; activityType: string; levelOrder: number; levelName: string; activityName: string }[]> => {
        const response = await apiFetch(`/api/users/${userId}/progression`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to load progression');
        return data.progressions;
    },

    // --- Vocabulario --- (términos de Taekwondo/idiomas para juegos y rúbricas, filtrables por club)
    // GET /api/clubs/:clubId/vocabulary: construye la query string solo con los filtros indicados
    // (nivel máximo de cinturón, tipo de actividad, tipo de contenido y tema) y devuelve data.vocabulary
    getVocabulary: async (clubId: string, maxBeltLevel?: number, activityType?: string, contentType?: string, topic?: string): Promise<VocabularyTerm[]> => {
        let url = `/api/clubs/${clubId}/vocabulary`;
        const params = new URLSearchParams();
        if (maxBeltLevel !== undefined) params.set('maxBeltLevel', String(maxBeltLevel));
        if (activityType) params.set('activityType', activityType);
        if (contentType) params.set('contentType', contentType);
        if (topic) params.set('topic', topic);
        if ([...params].length > 0) url += `?${params.toString()}`;
        const response = await apiFetch(url);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.vocabulary;
    },
    // ¿Qué tipos de actividad practica este usuario? Combina tres fuentes: grupos en los que está matriculado,
    // sus progresiones personales por actividad, y su rango de cinturón heredado (si tiene rank > 0 se asume
    // que practica 'taekwondo_itf'). Replica la lógica de fusión del dashboard de práctica de HomeScreen,
    // sin la expansión "ver todo" propia del dueño del club. Se reutiliza para filtrar contenido
    // (p.ej. recompensas del mercado) a "cosas que este alumno practica".
    getPracticedActivityTypes: async (user: { id: string; rank?: number }): Promise<Set<string>> => {
        const types = new Set<string>();
        try {
            const [groups, progressions] = await Promise.all([
                ClubService.getStudentGroups(user.id),
                ClubService.getUserProgressions(user.id),
            ]);
            groups.forEach(g => { if (g.activityType) types.add(g.activityType); });
            progressions.forEach(p => { if (p.activityType) types.add(p.activityType); });
            if ((user.rank || 0) > 0) types.add('taekwondo_itf');
        } catch (error) {
            console.error('Failed to compute practiced activity types', error);
        }
        return types;
    },
    addVocabularyTerm: async (clubId: string, term: string, meaning: string): Promise<VocabularyTerm> => {
        const response = await apiFetch(`/api/clubs/${clubId}/vocabulary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ term, meaning })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.vocabulary;
    },
    deleteVocabularyTerm: async (clubId: string, vocabularyId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/vocabulary/${vocabularyId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },

    // --- Mercado --- (objetos canjeables por puntos: catálogo del club y compra por parte del alumno)
    getMarketItems: async (clubId: string): Promise<import('../types').MarketItem[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/market`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.items;
    },
    addMarketItem: async (clubId: string, itemData: any): Promise<import('../types').MarketItem> => {
        const response = await apiFetch(`/api/clubs/${clubId}/market`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemData)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.item;
    },
    updateMarketItem: async (clubId: string, itemId: string, itemData: any): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/market/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(itemData)
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    deleteMarketItem: async (clubId: string, itemId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/market/${itemId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    // POST .../market/restore-system-items: repone en el catálogo del club los objetos del sistema por defecto
    // (por si el club los borró o quiere restaurarlos a su estado original)
    restoreSystemItems: async (clubId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/market/restore-system-items`, { method: 'POST' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    // POST /api/market/buy: el servidor valida que el usuario tenga puntos suficientes, descuenta costPoints
    // y devuelve los puntos restantes (remainingPoints) tras la compra
    buyMarketItem: async (userId: string, itemId: string, costPoints: number): Promise<{ remainingPoints: number }> => {
        const response = await apiFetch(`/api/market/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, itemId, costPoints })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
    },

    // --- Puntos y gamificación ---
    // GET /api/users/:userId/points: puntos acumulados y racha (streak) actual del usuario
    getUserPoints: async (userId: string): Promise<{ points: number, streak: number }> => {
        const response = await apiFetch(`/api/users/${userId}/points`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return { points: data.points, streak: data.streak };
    },
    // POST .../points/add: añade puntos base por completar una actividad de juego; el servidor aplica
    // el multiplicador de racha y devuelve cuánto se sumó realmente (added), el total, la racha y el multiplicador aplicado
    addGamePoints: async (userId: string, basePoints: number = 1): Promise<{ added: number, total: number, streak: number, multiplier: number }> => {
        const response = await apiFetch(`/api/users/${userId}/points/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ basePoints })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
    },

    // --- Cofres de botín --- (recompensas aleatorias: cada cofre tiene un "pool" de objetos con peso de probabilidad)
    getChests: async (clubId: string): Promise<any[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/chests`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.chests;
    },
    addChest: async (clubId: string, name: string, description: string, imageUrl: string): Promise<any> => {
        const response = await apiFetch(`/api/clubs/${clubId}/chests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, imageUrl })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.chest;
    },
    updateChest: async (clubId: string, chestId: string, name: string, description: string, imageUrl: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/chests/${chestId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description, imageUrl })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    deleteChest: async (clubId: string, chestId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/chests/${chestId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    // GET /api/chests/:chestId/pool: lista de objetos posibles de ese cofre junto a su peso relativo de aparición
    getChestPool: async (chestId: string): Promise<any[]> => {
        const response = await apiFetch(`/api/chests/${chestId}/pool`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.pool;
    },
    // POST: añade un objeto al pool del cofre con su peso (a mayor peso, mayor probabilidad de salir al abrirlo)
    addPoolItem: async (chestId: string, itemId: string, weight: number): Promise<void> => {
        const response = await apiFetch(`/api/chests/${chestId}/pool`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemId, weight })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
    removePoolItem: async (chestId: string, itemId: string): Promise<void> => {
        const response = await apiFetch(`/api/chests/${chestId}/pool/${itemId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },

    // --- Aulas --- (espacios físicos del club: nombre, aforo, descripción y color identificativo para horarios)
    getAulas: async (clubId: string): Promise<{ id: string; name: string; capacity?: number | null; description?: string | null; color?: string }[]> => {
        const response = await apiFetch(`/api/clubs/${clubId}/aulas`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.aulas;
    },
    addAula: async (clubId: string, name: string, capacity?: number | null, description?: string | null, color?: string): Promise<any> => {
        const response = await apiFetch(`/api/clubs/${clubId}/aulas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, capacity, description, color })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.aula;
    },
    updateAula: async (clubId: string, aulaId: string, name: string, capacity?: number | null, description?: string | null, color?: string): Promise<any> => {
        const response = await apiFetch(`/api/clubs/${clubId}/aulas/${aulaId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, capacity, description, color })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data.aula;
    },
    deleteAula: async (clubId: string, aulaId: string): Promise<void> => {
        const response = await apiFetch(`/api/clubs/${clubId}/aulas/${aulaId}`, { method: 'DELETE' });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error);
        }
    },
};
