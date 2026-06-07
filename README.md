# Learning Dungeon — Arquitectura del Sistema

## Documento técnico de referencia | Trabajo de Fin de Grado

---

## Índice

1. [Introducción y motivación](#1-introducción-y-motivación)
2. [Visión general del sistema](#2-visión-general-del-sistema)
3. [Stack tecnológico justificado](#3-stack-tecnológico-justificado)
4. [Arquitectura frontend](#4-arquitectura-frontend)
5. [Arquitectura backend](#5-arquitectura-backend)
6. [Modelo de datos](#6-modelo-de-datos)
7. [Sistema de autenticación y autorización](#7-sistema-de-autenticación-y-autorización)
8. [Comunicación en tiempo real (Socket.io)](#8-comunicación-en-tiempo-real-socketio)
9. [Sistema de gamificación](#9-sistema-de-gamificación)
10. [Sistema de reportes analíticos](#10-sistema-de-reportes-analíticos)
11. [Sistema multi-tenant](#11-sistema-multi-tenant)
12. [Internacionalización](#12-internacionalización)
13. [Sistema de temas (theming)](#13-sistema-de-temas-theming)
14. [Integraciones externas](#14-integraciones-externas)
15. [Despliegue e infraestructura](#15-despliegue-e-infraestructura)
16. [Patrones de diseño aplicados](#16-patrones-de-diseño-aplicados)
17. [Decisiones arquitectónicas y trade-offs](#17-decisiones-arquitectónicas-y-trade-offs)

---

## 1. Introducción y motivación

**Learning Dungeon** es una plataforma de aprendizaje gamificado nacida para la enseñanza del Taekwondo ITF y generalizada posteriormente a un modelo **multi-actividad** (Taekwondo ITF, Inglés, Ballet, y cualquier actividad genérica que un club quiera dar de alta), de forma que un mismo club — e incluso un mismo alumno o instructor — puede combinar varias disciplinas con sus propios sistemas de progresión y rúbricas de evaluación sin interferir entre sí. El sistema nace de la necesidad de digitalizar y modernizar la gestión de academias, combinando en una misma aplicación:

- **Herramientas pedagógicas** para instructores: evaluaciones técnicas, control de asistencia y seguimiento de progreso por alumno.
- **Recursos de referencia** para estudiantes: biblioteca de Tuls (formas), vocabulario técnico y vídeos explicativos.
- **Mecánicas de juego (RPG)** que aumentan la retención y motivación: clanes, batallas cooperativas contra jefes, sistema de inventario, puntos y niveles.

La hipótesis de partida es que la gamificación aplicada al entrenamiento físico y técnico incrementa la constancia del alumno y facilita la asimilación de conceptos teóricos. El sistema está diseñado para ser adoptado por cualquier club o academia bajo un modelo de suscripción SaaS (Software as a Service), lo que impone requisitos de aislamiento de datos entre organizaciones (multi-tenancy), escalabilidad y gestión de roles.

---

## 2. Visión general del sistema

El sistema se divide en dos grandes bloques que se comunican a través de HTTP y WebSockets:

```
┌─────────────────────────────────────────────────────────┐
│                     CLIENTE                             │
│                                                         │
│   React Native (Expo)  ──────────────────────────────  │
│   iOS / Android / Web                                   │
│                                                         │
│   - Navegación (React Navigation)                       │
│   - Estado global (Context API)                         │
│   - Almacenamiento local (AsyncStorage)                 │
│   - Socket.io-client (tiempo real)                      │
└────────────────────────┬────────────────────────────────┘
                         │  HTTP REST + WebSocket
                         │  (puerto 8080)
┌────────────────────────▼────────────────────────────────┐
│                    SERVIDOR                             │
│                                                         │
│   Node.js + Express 5                                   │
│                                                         │
│   - API REST (~60 endpoints)                            │
│   - Socket.io Server (eventos en tiempo real)           │
│   - node-cron (tareas programadas)                      │
│   - bcrypt (seguridad de contraseñas)                   │
│   - nodemailer (notificaciones por email)               │
└────────────────────────┬────────────────────────────────┘
                         │  pg (driver PostgreSQL)
┌────────────────────────▼────────────────────────────────┐
│                BASE DE DATOS                            │
│                                                         │
│   PostgreSQL (Heroku Postgres)                          │
│   25 tablas relacionales                                │
│   Pool de conexiones                                    │
└─────────────────────────────────────────────────────────┘
```

El frontend y el backend coexisten en el mismo repositorio. Cuando la aplicación se despliega en Heroku, el servidor Express sirve tanto la API como la build web de Expo exportada estáticamente, lo que simplifica el despliegue al tratarse de un único proceso.

---

## 3. Stack tecnológico justificado

### 3.1 React Native + Expo

React Native permite desarrollar aplicaciones nativas para iOS, Android y Web desde una única base de código TypeScript. Expo añade una capa de abstracción sobre el SDK de React Native que simplifica:

- El acceso a APIs nativas (notificaciones, sistema de archivos, cámara).
- El proceso de build multiplataforma sin necesidad de Xcode o Android Studio para desarrollo.
- La exportación a web estática (`npx expo export -p web`) para el despliegue en Heroku.

La elección de React Native frente a alternativas como Flutter (Dart) o desarrollo nativo separado se justifica por la reutilización de lógica de negocio y componentes entre plataformas, reduciendo el tiempo de desarrollo.

**Versiones:**
- Expo SDK 54
- React Native 0.81.5
- React 19.1.0
- TypeScript (tipado estático en todo el frontend)

### 3.2 Node.js + Express 5

El backend está implementado con Express 5, que introduce manejo de promesas nativo en los middlewares (eliminando la necesidad de `try/catch` explícito en muchos casos). Se eligió Node.js por:

- Compatibilidad con el ecosistema JavaScript/TypeScript del frontend, reduciendo el cambio de contexto cognitivo.
- Alto rendimiento en operaciones I/O-intensivas (consultas a base de datos, WebSockets) gracias al modelo de event loop no bloqueante.
- Ecosistema npm maduro para integraciones (Socket.io, bcrypt, nodemailer, pg).

### 3.3 PostgreSQL

PostgreSQL se eligió como sistema de gestión de base de datos relacional por:

- Soporte nativo de tipos JSON/JSONB, usado para almacenar `combat_stats` de ítems y `loot_table` de jefes sin necesidad de tablas adicionales.
- Transacciones ACID, críticas en operaciones financieras como la compra de ítems (deducción de puntos + inserción en inventario deben ser atómicas).
- Soporte de `FOR UPDATE` en selects para evitar condiciones de carrera en batallas multijugador.
- Integración directa con Heroku Postgres como servicio gestionado.

El acceso se realiza mediante el driver `pg` con un pool de conexiones, evitando la sobrecarga de abrir una nueva conexión TCP por cada petición HTTP.

### 3.4 Socket.io

Socket.io gestiona la comunicación bidireccional en tiempo real. Se utiliza sobre WebSocket con fallback automático a HTTP long-polling para entornos restrictivos. Los casos de uso son:

- Chat de clan en tiempo real.
- Sincronización del estado de la batalla (HP del jefe, resultados de respuestas).
- Sistema de lobbies multijugador.
- Modo Arbitraje (eventos en directo con pantalla TV y jugadores móviles).

---

## 4. Arquitectura frontend

### 4.1 Estructura de carpetas

```
src/
├── components/      # Componentes reutilizables sin lógica de negocio
├── screens/         # Pantallas completas (una por ruta)
│   ├── instructor/  # Pantallas exclusivas de instructores
│   └── club/        # Pantallas exclusivas del propietario de club
├── services/        # Capa de acceso a la API (patrón Service Layer)
├── navigation/      # Configuración de rutas y navegación
├── theme/           # Sistema de temas (colores, tipografía)
├── context/         # Proveedores de estado global (Context API)
├── i18n/            # Configuración de internacionalización
│   └── locales/     # Archivos de traducción (en, es, fr, de, it, pt)
├── data/            # Datos estáticos (tuls, cinturones)
└── types/           # Definiciones de tipos TypeScript
```

Esta estructura sigue el principio de **separación de responsabilidades**: los componentes solo renderizan, los servicios gestionan la comunicación con el servidor, y los contextos gestionan el estado global.

### 4.2 Navegación (React Navigation)

Se utiliza un **Stack Navigator** como contenedor principal. La elección de stack sobre tab navigator responde al flujo jerárquico natural de la aplicación: el usuario parte de la pantalla principal y navega en profundidad hacia detalles, configuración o módulos específicos.

```
Root Stack
├── Login / Register (rutas públicas)
└── Home (ruta privada, punto de entrada post-login)
    ├── TulDetail
    ├── Settings / Profile / Subscription
    ├── GameHub → VocabularyGame / ClanHub / Market
    ├── ClanBossBattle
    ├── Inventory
    └── [Instructor] ActivityList → GroupList → StudentList → Evaluation / Attendance / Reports
    └── [Club Owner] InstructorMgmt / StudentMgmt / VocabularyMgmt / MarketMgmt / BossMgmt / ChestMgmt
```

Para la **versión web**, se implementa un `WebSidebar` que reemplaza la navegación por stack con un menú lateral persistente, ya que en pantallas grandes el modelo de "ir atrás" de una app móvil resulta poco intuitivo.

En la **pantalla principal (Home)**, cuando el ancho de la ventana supera los 768 px y hay un Tul seleccionado, el layout cambia automáticamente a dos columnas: la tarjeta de vídeo ocupa la columna izquierda (flex 1) y un panel lateral de 280 px en la derecha agrupa los controles de práctica y el selector de rango. El tamaño del reproductor de vídeo se calcula con `onLayout` para respetar la proporción 16:9 dentro de los límites reales de la tarjeta, evitando desbordamiento de contenido sin modificar el tamaño del vídeo.

El sistema de **deep linking** permite acceder directamente a rutas específicas mediante URLs del esquema `Learning Dungeon://`, habilitando notificaciones push que llevan al usuario a la pantalla correcta.

### 4.3 Capa de servicios

Cada dominio de la aplicación tiene su propio servicio singleton:

| Servicio | Responsabilidad |
|----------|----------------|
| `AuthService` | Login, registro, gestión de perfil |
| `ClubService` | Grupos, estudiantes, vocabulario, puntos, actividades |
| `SubscriptionService` | Consulta de planes y estado de suscripción |
| `TrackingService` | Evaluaciones, asistencia y reportes analíticos del club (overview, roster changes, gamificación) |
| `NotificationService` | Gestión de notificaciones push (Expo Notifications) |
| `ExportService` | Exportación de reportes a PDF y CSV |
| `HubSpotService` | Sincronización con CRM externo |

Esta capa desacopla la UI de la lógica de red. Si en el futuro se cambia la URL base del servidor o se añade autenticación por token JWT, el cambio es puntual en los servicios, sin tocar las pantallas.

### 4.4 Estado global (Context API)

Se optó por Context API de React en lugar de librerías externas como Redux o Zustand, dado que el estado global de la aplicación es limitado y no requiere funcionalidades avanzadas como middleware de efectos secundarios:

- **ThemeContext:** Estado del tema (claro/oscuro) con persistencia en AsyncStorage.
- **AdContext:** Control de anuncios y su visibilidad.

El estado específico de cada pantalla se gestiona con `useState` y `useEffect` locales, evitando over-engineering.

### 4.5 Persistencia local

`AsyncStorage` actúa como capa de persistencia en el cliente:

- Sesión del usuario (`@Learning Dungeon_user`): el objeto `UserProfile` completo serializado en JSON, eliminando la necesidad de hacer login en cada apertura de la app.
- Preferencia de tema (`app-theme`).

---

## 5. Arquitectura backend

### 5.1 Estructura del servidor

Todo el backend reside en un único archivo `server.js` de ~4400 líneas. Esta decisión, aunque cuestionable en proyectos de mayor escala, tiene ventajas pragmáticas en el contexto de este proyecto:

- Despliegue simplificado en Heroku (un único punto de entrada).
- Visibilidad total del sistema en un solo lugar.
- Sin overhead de módulos, imports o configuración adicional.

El servidor se estructura en secciones claramente delimitadas:

```
server.js
├── Configuración inicial (Express, cors, socket.io, pg pool)
├── Inicialización de base de datos (CREATE TABLE IF NOT EXISTS)
├── Lógica Socket.io (eventos en tiempo real)
├── Endpoints de autenticación
├── Endpoints de usuarios y perfiles
├── Endpoints de clubs y suscripciones
├── Endpoints de actividades y grupos
├── Endpoints de estudiantes e instructores
├── Endpoints de evaluaciones y asistencia (+ rango de fechas, filtro por actividad/instructor)
├── Endpoints de reportes analíticos (/report/overview, /report/roster-changes, /report/gamification)
├── Endpoints de vocabulario
├── Endpoints de puntos y gamificación
├── Endpoints de mercado e inventario
├── Endpoints de clanes y batallas
├── Endpoints de jefes y cofres de botín
├── Endpoints de soporte
└── Tareas programadas (node-cron)
```

### 5.2 Inicialización de la base de datos

El servidor ejecuta `CREATE TABLE IF NOT EXISTS` para todas las tablas al arrancar. Este patrón de "migrations inline" garantiza que el esquema esté siempre actualizado sin necesidad de una herramienta de migraciones externa. La contrapartida es que no permite rollbacks automáticos ni versionado del esquema, lo que en un entorno de producción maduro se resolvería con herramientas como Flyway o Liquibase.

### 5.3 Pool de conexiones PostgreSQL

```javascript
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
```

El pool gestiona un conjunto de conexiones persistentes a la base de datos, reutilizándolas entre peticiones. Esto es crítico en Heroku, donde el plan gratuito de Postgres limita el número de conexiones simultáneas. Sin pooling, cada petición HTTP abriría y cerraría una conexión TCP, degradando el rendimiento y pudiendo superar el límite de conexiones.

### 5.4 Transacciones

Las operaciones que modifican múltiples tablas se envuelven en transacciones explícitas:

```sql
BEGIN
  -- Verificar puntos suficientes
  -- Descontar puntos del usuario
  -- Insertar ítem en inventario
COMMIT / ROLLBACK
```

Esto garantiza consistencia: si el servidor cae entre la deducción de puntos y la inserción en inventario, la transacción se revierte automáticamente, evitando que el usuario pierda puntos sin recibir el ítem.

### 5.5 Tareas programadas (node-cron)

`node-cron` ejecuta tareas en segundo plano con expresiones cron:

- **Rotación semanal de jefes:** cada lunes se selecciona un nuevo jefe activo para cada clan según su rareza ponderada.
- **Limpieza de buffs expirados:** eliminación periódica de buffs de combate caducados.

---

## 6. Modelo de datos

### 6.1 Diagrama entidad-relación (simplificado)

```
tul_clubs ──────────────────────────────────────────────────────┐
    │                                                            │
    ├── tul_activities                                           │
    │       └── tul_groups                                       │
    │               ├── tul_group_students ──── users            │
    │               └── tul_attendance    ──── users            │
    │                                                            │
    ├── tul_vocabulary                                           │
    ├── tul_market_items ──── tul_loot_pool                      │
    ├── tul_loot_chests  ──── tul_loot_pool                      │
    └── tul_bosses ──── tul_clan_boss_progress ──── tul_clans    │
                                                                 │
users ───────────────────────────────────────────────────────────┘
    ├── tul_user_belts
    ├── tul_user_progression ──── tul_activities      (rango por actividad: cinturón ITF, título de Inglés, grado de Ballet…)
    ├── tul_rpg
    ├── tul_puntos
    ├── tul_inventory ──── tul_market_items
    ├── tul_active_buffs
    ├── tul_evaluations ──────────── tul_evaluation_movements ──── tul_tuls          (evaluación TUL, exclusiva de Taekwondo ITF)
    ├── tul_category_evaluations ── tul_category_evaluation_scores                   (evaluación por rúbrica de categorías: Inglés, Ballet…)
    ├── tul_clan_members ──── tul_clans
    └── tul_clan_chat    ──── tul_clans

tul_tuls ──── tul_belts
```

### 6.2 Descripción de tablas principales

| Tabla | Propósito | Campos destacados |
|-------|-----------|------------------|
| `users` | Cuentas de usuario | `role`, `club_id`, `subscription_plan`, `profile_picture` (base64) |
| `tul_clubs` | Organizaciones/dojos | `name`, `subscription_plan`, `max_students` |
| `tul_tuls` | Formas de Taekwondo | `name`, `belt_id`, `moves_count`, `diagram_type`, `video_url` |
| `tul_belts` | Catálogo de cinturones | `level` (0-18), `name`, `color` |
| `tul_rpg` | Stats RPG del usuario | `class`, `level`, `hp`, `max_hp`, `mana`, `strength`, `potency` |
| `tul_puntos` | Puntos y rachas | `points`, `streak`, `last_played_date` |
| `tul_market_items` | Ítems de la tienda | `combat_stats` (JSONB), `rarity`, `item_type`, `slot` |
| `tul_inventory` | Ítems del usuario | `is_equipped`, `acquired_at` |
| `tul_bosses` | Enemigos/jefes | `total_hp`, `loot_table` (JSONB), `rarity_weight`, `category` |
| `tul_clan_boss_progress` | Estado en tiempo real del jefe | `current_hp`, `boss_level` |
| `tul_evaluations` | Evaluaciones técnicas (solo Taekwondo ITF) | `tul_id`, `instructor_id`, `student_id`, `summary_comment` |
| `tul_evaluation_movements` | Nota por movimiento de la TUL | `movement_index`, `score` (1-3), `comment` |
| `tul_user_progression` | Rango/nivel actual del usuario por actividad | `user_id`, `activity_id`, `activity_type`, `level_order`, `level_name` |
| `tul_category_evaluations` | Evaluaciones por rúbrica de categorías (Inglés, Ballet…) | `student_id`, `instructor_id`, `activity_id`, `activity_type`, `summary_comment` |
| `tul_category_evaluation_scores` | Nota por categoría de la rúbrica | `category_key`, `score` (1-5), `comment` |
| `tul_enrollment_history` | Auditoría de altas/bajas en grupos | `student_id`, `student_name`, `group_name`, `activity_name`, `action` (`enrolled`/`unenrolled`), `created_at` |

### 6.3 Uso de JSONB

PostgreSQL permite almacenar objetos JSON como tipo `JSONB` (binario indexable). Se usa en dos casos:

**`combat_stats` en `tul_market_items`:**
```json
{
  "slot": "weapon",
  "damageMultiplier": 1.5,
  "hpBoost": 0,
  "healBoost": 0,
  "specialAbility": "Golpe crítico",
  "isTwoHanded": false
}
```

**`loot_table` en `tul_bosses`:**
```json
[
  { "item_id": 12, "weight": 70, "quantity": 1 },
  { "item_id": 15, "weight": 25, "quantity": 1 },
  { "item_id": 8,  "weight": 5,  "quantity": 3 }
]
```

**`sessions` en `tul_groups`:**
```json
[
  { "days": [1, 3, 5], "startTime": "17:00", "endTime": "18:00", "aulaId": "uuid", "instructorId": "uuid", "instructorName": "Juan García" }
]
```

Permite asignar un instructor diferente a cada franja horaria de un mismo grupo, sin necesidad de una tabla de relación adicional. El campo `instructorId` se usa para filtrar los reportes por instructor.

Esto evita crear tablas de relación adicionales para estructuras que varían por ítem/grupo y que se leen completas en cada uso, sin necesidad de queries JOIN adicionales.

### 6.4 Progresión y evaluación por tipo de actividad

Cada `tul_activities` tiene un campo `activity_type` (`taekwondo_itf`, `ingles`, `ballet`, `general`, …) que actúa como discriminador y determina, en tiempo de ejecución, qué sistema de rango y qué rúbrica de evaluación se aplican a sus alumnos e instructores. Esto permite que un mismo club —o incluso una misma persona— combine varias disciplinas sin que sus reglas choquen entre sí:

- **Progresión (`tul_user_progression`):** sustituye al antiguo modelo de "solo cinturón de Taekwondo" por una tabla genérica `(user_id, activity_id, activity_type, level_order, level_name)`. Catálogos fijos definidos en cliente (`PROGRESSION_SCALES`, mismo patrón que `BELT_CONFIGS`) traducen `level_order` a un nombre/insignia visual (`ProgressionBadge`) específico de cada actividad: cinturones ITF, títulos de Inglés (CEFR/Cambridge) o grados de Ballet. Para Taekwondo, además, se mantiene un *dual-write* sobre `users.belt`/`belt_level` por compatibilidad con el resto del sistema (rangos de juego, filtros de cinturón, etc.).
- **Evaluación (`tul_evaluations` vs. `tul_category_evaluations`):** Taekwondo ITF conserva intacto su flujo histórico de evaluación TUL movimiento a movimiento (`tul_evaluation_movements`, nota 1-3). Para el resto de actividades con rúbrica definida (Inglés: *Listening/Speaking/Vocabulary/Grammar/Writing*; Ballet: *Postura, Técnica, Musicalidad, Expresión, Memoria Coreográfica*) se usa una tabla paralela `tul_category_evaluations` + `tul_category_evaluation_scores` (nota 1-5 por categoría), deliberadamente independiente de las tablas de TUL para no arriesgar el flujo de Taekwondo. Las rúbricas se definen en el catálogo de cliente `EVALUATION_RUBRICS`.
- **Lectura unificada:** los endpoints `GET /api/users/:userId/evaluations` y `GET /api/clubs/:clubId/evaluations` consultan ambas tablas en paralelo y fusionan el resultado en una sola lista ordenada por fecha, etiquetando cada fila con `evaluationType: 'tul' | 'category'`. Esto evita duplicar lógica en `ProfileScreen`/`ReportsScreen`, que solo necesitan ramificar el renderizado según ese discriminador.
- **`EvaluationScreen`** (instructor) detecta el `activity_type` del grupo y renderiza la interfaz de calificación correspondiente: el editor de movimientos de TUL para Taekwondo, o la lista de categorías de la rúbrica (con botones de puntuación 1-5) para el resto.
- **Acceso multi-actividad:** un alumno o instructor puede estar inscrito/asignado a varias actividades (p. ej. Taekwondo + Inglés) simultáneamente — la inscripción de alumnos vive en `tul_group_students` por grupo/actividad, y la de instructores en `users.activity_ids`. Cada pantalla (lista de actividades, evaluación, promoción de rango) se navega con la actividad concreta como parámetro de ruta, de modo que cada disciplina se gestiona de forma independiente sin interferir con las demás.

---

## 7. Sistema de autenticación y autorización

### 7.1 Autenticación

El sistema usa autenticación basada en **sesión en cliente**. El flujo completo es:

```
1. POST /api/login  (email + password en texto plano por HTTPS)
         │
         ▼
2. Servidor: bcrypt.compare(password, hash_almacenado)
         │
         ▼
3. Si correcto: devuelve objeto UserProfile completo
         │
         ▼
4. Cliente: AsyncStorage.setItem('@Learning Dungeon_user', JSON.stringify(user))
         │
         ▼
5. Navegación a HomeScreen con datos del usuario en memoria
```

Las contraseñas se hashean con **bcrypt** usando un factor de coste de 10 rondas de sal, lo que hace computacionalmente inviable un ataque de fuerza bruta masivo sobre la base de datos en caso de brecha.

> **Nota arquitectónica:** La ausencia de JWT (JSON Web Tokens) implica que no existe un mecanismo de expiración de sesión del lado del servidor. En una iteración futura, la implementación de JWT con refresh tokens añadiría seguridad ante robo de sesión y permitiría invalidar sesiones remotamente.

### 7.2 Autorización por roles

El sistema define cuatro roles con permisos acumulativos:

```
student < instructor < club_owner < admin
```

| Rol | Capacidades |
|-----|------------|
| `student` | Acceso a Tuls, juegos, clan, mercado, inventario |
| `instructor` | + Gestión de grupos, asistencia, evaluaciones, reportes |
| `club_owner` | + Gestión de instructores, vocabulario, mercado, gamificación, jefes |
| `admin` | + Panel de soporte, acceso a todos los clubs |

En el frontend, la visibilidad de pantallas y opciones de menú se controla con condicionales sobre `user.role`. En el backend, los endpoints críticos comprueban el rol antes de ejecutar la operación.

El **HOC `withAuth()`** envuelve las pantallas protegidas, redirigiendo al login si no hay usuario en AsyncStorage.

### 7.3 Autorización por suscripción

Los propietarios de clubs tienen además un plan de suscripción que limita la capacidad del club y determina qué funcionalidades están disponibles:

**Límites operativos:**

| Plan | Actividades | Grupos/Actividad | Instructores | Estudiantes |
|------|-------------|-----------------|--------------|-------------|
| `free` | 1 | 1 | 0 | 10 |
| `club_lite` | 1 | 3 | 1 | 50 |
| `club_pro` | 3 | 5 | 3 | 100 |
| `club_elite` | 5 | 10 | 5 | 250 |

**Funcionalidades de reportes por plan:**

| Funcionalidad | Lite | Pro | Elite |
|---------------|------|-----|-------|
| Lista de alumnos con nota media | ✓ | ✓ | ✓ |
| Tasa de asistencia por alumno | — | ✓ | ✓ |
| Gráfica donut de asistencia global | — | ✓ | ✓ |
| Desglose por actividad (barras) | — | ✓ | ✓ |
| Filtro por actividad o instructor | — | ✓ | ✓ |
| Navegación mensual | ✓ | ✓ | ✓ |
| Navegación bisemanal | — | — | ✓ |
| KPIs: alumnos inscritos, media/clase, % plazas | — | — | ✓ |
| Altas y bajas del periodo + nuevas fichas | — | — | ✓ |
| Tasas de retención, abandono y duración media | — | — | ✓ |
| Sección de gamificación (niveles, clases RPG, ítems) | — | — | ✓ |
| Exportación CSV | ✓ | ✓ | ✓ |
| Exportación PDF | — | ✓ | ✓ |

El backend verifica los límites operativos antes de permitir la creación de nuevas entidades. Las funcionalidades de reportes se controlan exclusivamente en el frontend mediante el campo `plan` del objeto `UserProfile`.

---

## 8. Comunicación en tiempo real (Socket.io)

### 8.1 Arquitectura de eventos

Socket.io establece una conexión WebSocket persistente entre cliente y servidor. Los eventos se organizan en tres dominios:

```
CLAN
├── join_clan          → Suscribirse a eventos del clan
├── send_message       → Enviar mensaje al chat
├── create_lobby       → Crear sala de juego
├── join_lobby         → Unirse a sala (máx. 4 jugadores)
├── leave_lobby        → Salir de sala
└── start_game_sync    → Iniciar partida para todos en el lobby

BATALLA (Arbitraje/Demo)
├── arb_tv_join        → Pantalla espectador (modo TV)
├── arb_player_join    → Unirse como jugador
├── arb_submit_answer  → Enviar respuesta (50 dmg si correcta)
├── arb_revive         → Revivir jugador
└── arb_boss_defeated  → Notificación de victoria con ranking

DEMO
├── demo_tv_join       → Pantalla espectador demo
├── demo_player_join   → Jugador en modo demo
├── demo_attack        → Ataque al jefe
├── demo_boss_attack   → Ataque del jefe
└── demo_change_boss   → Cambiar jefe activo
```

### 8.2 Gestión del estado de batalla

El estado de la batalla se mantiene **en memoria en el servidor** (objetos JavaScript), no en base de datos, para maximizar la velocidad de respuesta. Esto implica que si el servidor se reinicia durante una batalla, el estado se pierde. Para el contexto actual (batallas de corta duración) esto es aceptable.

El HP del jugador, por su parte, se gestiona **en el cliente** y solo se sincroniza con el servidor en puntos clave (ataque, muerte), reduciendo el tráfico de red y la latencia percibida.

### 8.3 Filtro de contenido en chat

El chat de clan incluye un filtro de palabras inapropiadas en español implementado en el servidor. Antes de emitir un mensaje a todos los miembros del clan, el servidor reemplaza las palabras de una lista negra por asteriscos. El filtrado en servidor (y no en cliente) garantiza que no pueda ser bypasseado manipulando la app.

---

## 9. Sistema de gamificación

### 9.1 Puntos y rachas

Cuando un usuario responde correctamente en el juego de vocabulario, el servidor calcula los puntos ganados con un multiplicador de racha:

```
puntos_ganados = puntos_base × multiplicador_racha
```

La racha se incrementa con cada sesión de juego completada en días consecutivos. Si el usuario no juega un día, la racha se reinicia a 1. Este mecanismo, conocido como **streak mechanic**, está demostrado en la literatura de gamificación como un potente impulsor de hábitos de uso diario (similar al sistema de Duolingo).

### 9.2 Clases RPG

Cada usuario elige una clase que determina sus stats base de combate:

| Clase | Fortaleza | Descripción |
|-------|-----------|-------------|
| Guerrero | Fuerza/HP | Tanque resistente con alto daño físico |
| Mago | Potencia/Maná | Alto daño mágico, bajo HP |
| Monje | Equilibrio | Stats balanceados, habilidades de apoyo |
| Clérigo | Curación | Baja ofensiva, alta capacidad de heal |
| Druida | Naturaleza | Buffs y debuffs, versátil |

Los stats se almacenan en `tul_rpg` y se consultan en cada ataque al jefe para calcular el daño base.

### 9.3 Sistema de ítems y inventario

Los ítems tienen un sistema de ranuras de equipamiento:

```
weapon (arma principal)  ←→  offhand (arma secundaria / escudo)
helmet (casco)
armor  (pecho)
boots  (botas)
accessory (accesorio)
```

Al equipar un arma a dos manos (`isTwoHanded: true`), el servidor desocupa automáticamente tanto la ranura `weapon` como `offhand`. Los stats de todos los ítems equipados se suman para obtener el perfil de combate del jugador.

### 9.4 Sistema de botín ponderado

Al derrotar un jefe, el sistema selecciona el botín usando un algoritmo de **selección ponderada aleatoria**:

```javascript
// Ejemplo de loot_table
[
  { item_id: 1, weight: 60 },  // 60% de probabilidad
  { item_id: 2, weight: 30 },  // 30% de probabilidad
  { item_id: 3, weight: 10 },  // 10% de probabilidad
]

// Algoritmo: número aleatorio entre 0 y suma_pesos
// Se recorre la tabla acumulando pesos hasta superar el número
```

Los cofres (`tul_loot_chests`) siguen el mismo mecanismo y pueden configurarse por el propietario del club para adaptar las recompensas a su contexto pedagógico (por ejemplo, recompensar con "pergaminos de entrenamiento" al superar un jefe).

### 9.5 Progresión de jefes

Cada clan tiene un nivel de jefe (`boss_level`) que se incrementa con cada victoria. Las recompensas se escalan exponencialmente:

```
reward = reward_base × 2^(boss_level - 1)
```

Esto crea una curva de dificultad-recompensa que mantiene el reto relevante a medida que el clan progresa, evitando el fenómeno de "contenido agotado" común en sistemas de gamificación planos.

---

## 10. Sistema de reportes analíticos

### 10.1 Arquitectura por plan

La pantalla de reportes (`ReportsScreen`) adapta su contenido dinámicamente según el plan del club. El componente consulta el campo `plan` del `UserProfile` y renderiza secciones condicionalmente, sin necesidad de llamadas adicionales para determinar permisos.

### 10.2 Selector de periodo

Los planes Pro y Elite incluyen navegación temporal. El plan Elite añade un **modo bisemanal** (ventanas de 14 días) además del mensual:

```
periodMode = 'monthly'   → periodStart = primer día del mes seleccionado
periodMode = 'biweekly'  → periodStart = fecha base; periodEnd = periodStart + 13 días
```

El periodo seleccionado se traduce en parámetros `from`/`to` (formato `YYYY-MM-DD`) que se envían a los endpoints de evaluaciones y asistencia. Estos endpoints aceptan tanto el parámetro `month` (legacy) como `from`/`to`, manteniendo compatibilidad retroactiva.

### 10.3 Filtro de segmentación (Pro y Elite)

La barra de segmentación permite filtrar todos los datos del reporte en tres modos:

| Modo | Comportamiento |
|------|----------------|
| **General** | Datos de todo el club (vista por defecto) |
| **Actividad** | Selector horizontal de actividades; filtra evaluaciones y asistencia a los alumnos de esa actividad |
| **Instructor** | Selector horizontal de instructores; filtra evaluaciones por `instructor_id` y asistencia por grupos cuyas sesiones tienen ese instructor en el JSONB `sessions` |

Al cambiar de modo o de selección, los endpoints se invocan de nuevo con los parámetros `activityId` o `instructorId` opcionales. Esto permite al propietario del club detectar qué actividades o instructores tienen peores métricas de asistencia o nota.

### 10.4 Endpoints de reportes

| Endpoint | Parámetros opcionales | Datos devueltos |
|----------|-----------------------|----------------|
| `GET /api/clubs/:id/evaluations` | `from`, `to`, `month`, `activityId`, `instructorId` | Evaluaciones del periodo (TUL + por categorías, fusionadas); cada fila incluye `evaluationType`, `score` y `maxScore` |
| `GET /api/clubs/:id/attendance` | `from`, `to`, `month`, `activityId`, `instructorId` | Asistencia agregada por alumno; JOIN a `tul_groups` cuando se filtra |
| `GET /api/clubs/:id/report/overview` | — | Alumnos inscritos (distintos), capacidad real por actividad (suma de `max_students`; grupos sin límite contribuyen con `enrolled + 5`), % ocupación global |
| `GET /api/clubs/:id/report/roster-changes` | `from`, `to` | Alumnos dados de alta/baja del periodo (de `tul_enrollment_history`) + nuevas cuentas (de `users.created_at`); todos con `studentId` para navegación al perfil |
| `GET /api/clubs/:id/report/gamification` | — | Stats RPG: nivel, exp, clase RPG, distribución por niveles y clases; incluye alumnos de clanes del club aunque su `users.club_id` sea distinto |

**Cálculo de capacidad por actividad:**
```sql
CASE
  WHEN g.max_students IS NOT NULL AND g.max_students > 0 THEN g.max_students
  ELSE COUNT(gs.student_id) + 5   -- grupos sin límite: inscritos + 5 plazas de margen
END
```

**Inclusión de miembros de clan en gamificación:**
```sql
WHERE u.role = 'student'
AND (
    u.club_id = $1
    OR u.user_id IN (
        SELECT cm.user_id FROM tul_clan_members cm
        JOIN tul_clans c ON c.clan_id = cm.clan_id
        WHERE c.club_id = $1
    )
)
```

### 10.5 Nota media normalizada entre escalas de evaluación

Como cada tipo de actividad puede tener su propia escala de puntuación (TUL: 1-3 por movimiento; rúbricas de categorías de Inglés/Ballet: 1-5 por categoría), el backend acompaña cada evaluación fusionada con su `maxScore` (`3` o `5` según `evaluationType`). El cliente normaliza cada nota a una proporción `score / maxScore` antes de promediar y la presenta como **porcentaje** (`Nota Media: 78%`) tanto en `ReportsScreen` y `ProfileScreen` como en las exportaciones PDF/CSV (`ExportService`). Esto evita mezclar escalas heterogéneas en un único promedio numérico y mantiene el indicador comparable independientemente de qué actividades incluya el segmento del informe.

### 10.6 KPIs de retención (Elite)

Los tres indicadores de retención se calculan íntegramente en el cliente a partir de datos ya disponibles, sin endpoint adicional:

```
socios_inicio  = socios_final − nuevos_del_periodo + bajas_del_periodo
tasa_retención = (socios_final − nuevos) / socios_inicio × 100
tasa_abandono  = bajas / socios_inicio × 100
duración_media = 1 / (tasa_abandono / 100)   [en periodos]
```

Donde `nuevos` y `bajas` son conteos de **alumnos distintos** (por `studentId`) con al menos un evento en `tul_enrollment_history` durante el periodo, evitando doblar cuentas a alumnos que cambian de grupo dentro del mismo periodo.

### 10.7 Auditoría de movimientos (`tul_enrollment_history`)

Cada alta o baja en un grupo escribe un registro en `tul_enrollment_history` con los nombres desnormalizados (durables ante borrado de cuenta o grupo) y el `student_id` para navegación al perfil. La pantalla de reportes distingue dos subsecciones:

- **Nuevas fichas:** cuentas de alumno creadas durante el periodo (`users.created_at`).
- **Altas / Bajas:** reservas o cancelaciones de clase (`tul_enrollment_history.action`).

### 10.8 Gráficas

Las visualizaciones se implementan sin librerías de gráficos externas para minimizar el tamaño del bundle:

- **Donut de asistencia:** SVG puro (`react-native-svg`) con `stroke-dasharray` calculado a partir del porcentaje. El color del trazo cambia a rojo si la asistencia es inferior al 70%.
- **Barras horizontales (`HBar`):** ancho proporcional al total de alumnos inscritos en el club (`maxValue = totalEnrolledStudents`), de forma que cada barra representa la cuota de participación de esa actividad sobre el total. Actividades sin capacidad configurada muestran solo el número de alumnos; el color de la barra de "Sin clase" en el desglose RPG usa el token `textSecondary` para diferenciarlo visualmente.

---

## 11. Sistema multi-tenant


### 11.1 Aislamiento por club

Cada entidad relevante de la aplicación tiene una clave foránea `club_id`. Los endpoints verifican que el usuario pertenezca al club antes de devolver o modificar datos:

```
tul_activities   → club_id
tul_groups       → activity_id → club_id
tul_vocabulary   → club_id
tul_market_items → club_id
tul_bosses       → club_id
tul_clans        → club_id
```

Esto garantiza que los datos de un club nunca sean visibles para otro, aunque compartan el mismo servidor y base de datos. Se trata de un modelo de **multi-tenancy por discriminador de columna**, el más simple y adecuado para el volumen de datos esperado.

### 11.2 Club global

Los usuarios sin club asignado pertenecen al "club global" (id predefinido). Esto permite que cualquier persona pueda registrarse y usar las funcionalidades básicas (randomizador de Tuls, juego de vocabulario genérico) sin necesidad de que un instructor les invite, reduciendo la fricción de onboarding.

### 11.3 Modelo de suscripción SaaS

El sistema está diseñado para ser adoptado por múltiples academias independientes. Cada propietario de club gestiona su propio catálogo de:

- Vocabulario técnico personalizado (terminología específica de su estilo o academia)
- Ítems de mercado con temática propia
- Jefes y cofres adaptados a su metodología
- Grupos de alumnos y actividades

Este nivel de personalización por tenant diferencia el producto de soluciones genéricas de gestión deportiva.

---

## 12. Internacionalización

### 12.1 Configuración de i18next

La internacionalización está implementada con **i18next** y su integración con React (`react-i18next`). La configuración detecta automáticamente el idioma del dispositivo mediante `expo-localization` y carga el archivo de traducciones correspondiente:

```
src/i18n/locales/
├── en.json  (inglés — fallback)
├── es.json  (español)
├── fr.json  (francés)
├── de.json  (alemán)
├── it.json  (italiano)
└── pt.json  (portugués)
```

Si el idioma del dispositivo no está soportado, se usa inglés como fallback. El usuario puede sobrescribir manualmente el idioma desde la pantalla de ajustes.

### 12.2 Uso en componentes

```typescript
const { t } = useTranslation();
// ...
<Text>{t('home.randomize_button')}</Text>
```

Las claves de traducción están organizadas jerárquicamente por pantalla, facilitando la localización de strings sin necesidad de buscar en el código fuente.

### 12.3 Contenido dinámico multilingüe

Los nombres y descripciones de los Tuls tienen traducciones para cada idioma soportado. En `tulsData.json`, cada Tul contiene un objeto `meaning` con las traducciones:

```json
{
  "name": "Chon-Ji",
  "meaning": {
    "en": "Heaven and Earth",
    "es": "Cielo y Tierra",
    "fr": "Ciel et Terre"
  }
}
```

---

## 13. Sistema de temas (theming)

### 13.1 ThemeContext

El sistema de temas está implementado como un **Context Provider** que envuelve toda la aplicación. Ofrece dos esquemas de color (claro y oscuro) y persiste la preferencia en AsyncStorage.

```typescript
// Uso en cualquier componente
const { theme } = useTheme();
// theme.colors.background, theme.colors.text, theme.colors.primary...
```

### 13.2 Paleta de colores

Cada tema define un conjunto completo de tokens de color semánticos:

```typescript
{
  primary, secondary,           // Colores de marca
  background, surface,          // Capas de fondo
  text, textSecondary,          // Tipografía
  border,                       // Separadores
  error, success, warning,      // Estados
  // + colores específicos por rango de cinturón (blanco → 9º Dan)
}
```

El uso de tokens semánticos en lugar de valores hexadecimales hardcodeados garantiza que cualquier pantalla nueva que consuma `theme.colors` sea automáticamente compatible con ambos modos sin trabajo adicional.

### 13.3 Integración web

En la versión web, el tema también inyecta variables CSS para controlar elementos del DOM no gestionados por React Native (scrollbars, selección de texto), asegurando una experiencia visual coherente.

---

## 14. Integraciones externas

### 14.1 HubSpot CRM

Al registrarse un nuevo usuario, el servidor sincroniza sus datos con HubSpot mediante la API de contactos. Esto permite al equipo de ventas y marketing:

- Segmentar usuarios por plan de suscripción.
- Automatizar emails de onboarding.
- Hacer seguimiento de conversiones de free a plan de pago.

La integración es asíncrona y no bloqueante: si falla, el registro del usuario continúa correctamente.

### 14.2 Nodemailer (notificaciones por email)

El sistema de tickets de soporte envía notificaciones por email al equipo cuando se abre un nuevo ticket o se actualiza su estado. Se usa `nodemailer` con un transporte SMTP configurado via variables de entorno (`EMAIL_USER`, `EMAIL_PASS`).

### 14.3 YouTube (vídeos de Tuls)

Los vídeos explicativos de cada Tul están alojados en YouTube y se reproducen mediante `react-native-youtube-iframe`, que encapsula el reproductor de YouTube en un WebView nativo. Esto evita los costes de almacenamiento y streaming de vídeo propio, delegando la CDN y la reproducción adaptativa en la infraestructura de Google.

### 14.4 Expo Notifications

Las notificaciones push se gestionan con `expo-notifications`, que proporciona una API unificada para iOS (APNs) y Android (FCM). Se usan para alertar a los alumnos de nuevas evaluaciones, próximas clases o eventos de clan.

---

## 15. Despliegue e infraestructura

### 15.1 Heroku

La aplicación se despliega en Heroku como un único dyno que sirve tanto el backend como el frontend web:

```
Procfile implícito:
  web: node server.js

heroku-postbuild (package.json):
  npx expo export -p web
  → Genera build estática en /dist
  → Express sirve /dist como archivos estáticos
```

Este modelo de "monolito desplegable" reduce la complejidad operacional: un único proceso, un único log, una única URL.

### 15.2 Variables de entorno

Las credenciales y configuraciones sensibles se gestionan como variables de entorno en Heroku, nunca en el código fuente:

```
DATABASE_URL   → Cadena de conexión PostgreSQL (Heroku Postgres add-on)
EMAIL_USER     → Cuenta SMTP para notificaciones
EMAIL_PASS     → Contraseña SMTP
PORT           → Puerto HTTP (asignado por Heroku, default 8080)
```

### 15.3 Flujo de CI/CD

```
Desarrollador
    │
    ▼
git push heroku main
    │
    ▼
Heroku Build
    ├── npm install
    ├── npx expo export -p web (heroku-postbuild)
    └── node server.js (start)
```

---

## 16. Patrones de diseño aplicados

### 16.1 Service Layer (Capa de Servicio)

Los servicios del frontend (`AuthService`, `ClubService`, etc.) encapsulan toda la lógica de comunicación HTTP. Las pantallas solo llaman métodos del servicio, desconociendo los detalles de la URL, los headers o el formato del body. Esto facilita el testing (se puede mockear el servicio) y el mantenimiento.

### 16.2 Higher-Order Component (HOC)

`withAuth(WrappedComponent)` es un HOC que inyecta la verificación de autenticación. Cualquier pantalla que necesite protección simplemente se exporta envuelta:

```typescript
export default withAuth(ProfileScreen);
```

### 16.3 Context + Provider (Estado global reactivo)

`ThemeContext` y `AdContext` siguen el patrón Provider de React. Los componentes consumen el contexto directamente sin prop drilling, manteniendo la jerarquía de componentes limpia.

### 16.4 Repository Pattern (implícito)

El servidor actúa como repositorio de datos: las pantallas no conocen SQL ni la estructura de la base de datos. Toda la lógica de acceso a datos está en `server.js`, detrás de endpoints REST bien definidos.

### 16.5 Observer (Socket.io)

El sistema de eventos de Socket.io implementa el patrón Observer: el cliente se suscribe a un canal (clan, lobby, batalla) y recibe notificaciones cuando el servidor emite eventos en ese canal. Los clientes no sondean activamente el estado, sino que reaccionan a cambios.

---

## 17. Decisiones arquitectónicas y trade-offs

### 17.1 Monolito vs. Microservicios

**Decisión:** Monolito (un único `server.js`).

**Justificación:** Para el volumen actual de usuarios y la velocidad de desarrollo requerida, un monolito bien estructurado es significativamente más simple de desarrollar, depurar y desplegar que una arquitectura de microservicios. La complejidad operacional de microservicios (service discovery, comunicación inter-servicio, trazabilidad distribuida) no se justifica hasta que los cuellos de botella de rendimiento o los equipos de desarrollo independientes lo requieran.

### 17.2 Base de datos única vs. una por tenant

**Decisión:** Base de datos única con `club_id` como discriminador.

**Justificación:** El modelo de base de datos por tenant ofrece aislamiento máximo pero implica gestionar potencialmente cientos de instancias de base de datos. Con el volumen esperado de clubs, el modelo de discriminador de columna es suficiente y significativamente más simple, a costa de requerir cuidado en cada query para incluir el filtro por `club_id`.

### 17.3 Sesión en cliente vs. JWT vs. Sesiones de servidor

**Decisión:** Objeto de usuario completo en AsyncStorage (sesión en cliente).

**Justificación:** La implementación más simple para una MVP. La contrapartida es que no hay expiración de sesión automática ni revocación remota de acceso. En una iteración de producción, se implementarían JWT con tiempo de expiración corto y refresh tokens almacenados de forma segura.

### 17.4 Estado de batalla en memoria vs. base de datos

**Decisión:** Estado en memoria del servidor para las batallas.

**Justificación:** El acceso a base de datos introduce una latencia de 10-50ms por operación. En una batalla donde el jefe puede atacar cada segundo y múltiples jugadores envían respuestas simultáneamente, esta latencia acumulada degradaría la experiencia. El estado en memoria es instantáneo, a costa de no persistir si el servidor se reinicia.

### 17.5 React Native vs. Flutter vs. nativo

**Decisión:** React Native + Expo.

**Justificación:** La familiaridad del equipo con JavaScript/TypeScript, la posibilidad de compartir código con el backend (Node.js) y la exportación web incluida en Expo inclinaron la balanza. Flutter ofrece mejor rendimiento en animaciones complejas, pero el caso de uso de esta aplicación no lo requiere.