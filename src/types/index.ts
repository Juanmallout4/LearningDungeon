// Aqui describimos un Tul (forma de Taekwondo): su nombre, el cinturon minimo requerido para aprenderlo,
// sus significados/descripcion traducibles, el numero de movimientos y los datos para dibujar su diagrama
export interface Tul {
  id: string;
  name: string;
  rankRequirement: number; // De 0 a N: cuanto mas alto, mayor el grado de cinturon requerido
  beltName: string; // Nombre para mostrar, p.ej. "Cinturón Verde"
  beltMeaning?: Record<string, string>;
  meaning: Record<string, string>;
  description: Record<string, string>;
  moves: number;
  diagramDetails: Record<string, string>; // Descripcion textual del diagrama mientras no tengamos imagenes reales
  diagramType?: 'plus' | 'I' | 'scholar' | 'inverted_T' | 'other';
  videoId: string; // ID del video de YouTube de demostracion
}

export type UserRole = 'student' | 'instructor' | 'admin' | 'club_owner';
export type SubscriptionPlan = 'free' | 'club_lite' | 'club_pro' | 'club_elite';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

// Aqui registramos un parte de asistencia individual: a que grupo/clase pertenece, que alumno fue,
// en que fecha y cual fue su estado (presente, ausente, tarde o justificado)
export interface AttendanceRecord {
  id: string; // ID unico del registro
  groupId: string; // A que clase/grupo corresponde esta asistencia
  studentId: string;
  date: string; // Fecha en formato ISO (YYYY-MM-DD)
  status: AttendanceStatus;
}

// Aqui describimos una evaluacion de Tul completa: quien evaluo a quien, sobre que Tul, en que fecha,
// la puntuacion y comentario de cada movimiento individual, y un comentario-resumen general
export interface Evaluation {
  id: string;
  studentId: string;
  instructorId: string;
  tulId: string;
  date: string; // Fecha en formato ISO
  movements: {
    moveIndex: number;
    score: number; // Escala de 1-5 o de 1-10 segun el contexto
    comment?: string;
  }[];
  summaryComment?: string;
}

// Aqui describimos el perfil de un usuario tal y como se usa en toda la app: datos basicos, su grado/rango,
// rol, plan de suscripcion, el club al que pertenece (si aplica) y sus preferencias (consentimiento de medios,
// compra de eliminacion de anuncios, clase RPG elegida)
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  username?: string;
  rank: number; // Grado/rango actual del usuario
  beltName: string;
  role: UserRole;
  plan: SubscriptionPlan;
  organizationId?: string; // Enlace al Centro/Club al que pertenece
  organizationName?: string; // Nombre para mostrar del club
  organizationLogo?: string; // URL/URI al logo del club
  profilePicture?: string; // URI local o URL de red de la foto de perfil
  mediaConsent?: boolean; // Consentimiento para el uso de fotos/videos
  hasPurchasedAdRemoval?: boolean; // Si compro la eliminacion de anuncios (compra unica)
  rpgClass?: RPGClass;
}

export type RPGClass = 'mago' | 'druida' | 'guerrero' | 'monje' | 'unassigned';

export const BELT_RANKS: { [key: number]: string } = {
  0: 'Blanco (10º Gup)',
  1: 'Punta Amarilla (9º Gup)',
  2: 'Amarillo (8º Gup)',
  3: 'Punta Verde (7º Gup)',
  4: 'Verde (6º Gup)',
  5: 'Punta Azul (5º Gup)',
  6: 'Azul (4º Gup)',
  7: 'Punta Roja (3º Gup)',
  8: 'Rojo (2º Gup)',
  9: 'Punta Negra (1º Gup)',
  10: 'I Dan (Negro)',
};

// Aqui describimos un club/centro: su nombre, quien es su dueño (un usuario con rol club_owner) y su plan de suscripcion
export interface Organization {
  id: string;
  name: string;
  ownerId: string; // Hace referencia al usuario con rol club_owner
  plan: SubscriptionPlan;
}

// Aqui describimos una actividad del club (p.ej. "Taekwondo ITF", "Ingles", "Ballet"): su nombre,
// el icono que la representa y su tipo (que determina que sistema de evaluacion/progresion usa)
export interface Activity {
  id: string;
  organizationId: string;
  name: string;
  icon: string; // Nombre del icono de Ionicons
  activityType?: 'taekwondo_itf' | 'general' | string;
}

// Aqui describimos una sesion semanal de un grupo: en que dias de la semana se imparte, su horario,
// y opcionalmente el aula y el instructor asignados a esa sesion concreta
export interface GroupSession {
  days: number[];       // Array de 0 a 6 (lunes a domingo)
  startTime: string;    // Hora de inicio en formato "HH:mm"
  endTime: string;      // Hora de fin en formato "HH:mm"
  aulaId?: string | null;
  aulaName?: string | null;
  instructorId?: string | null;
  instructorName?: string | null;
}

// Aqui describimos un grupo/clase: a que actividad pertenece, su nombre, horario, numero de alumnos,
// limites de edad/capacidad y sus sesiones semanales detalladas. Varios campos son "rellenados" por
// distintos endpoints segun el contexto en el que se solicite el grupo (ver comentarios en cada campo)
export interface Group {
  id: string;
  activityId: string;
  activityName?: string;  // Rellenado por getAllClubGroups
  activityIcon?: string;  // Nombre de icono de Ionicons, rellenado por getAllClubGroups
  activityType?: 'taekwondo_itf' | 'general' | string; // Rellenado por /api/users/:userId/groups
  progressionLevelOrder?: number | null;  // Rellenado por /api/users/:userId/groups — el nivel actual del usuario en la actividad de este grupo
  progressionLevelName?: string | null;
  name: string;
  time: string;         // Texto de horario ya formateado para mostrar (campo heredado + calculado)
  studentCount: number;
  maxStudents?: number | null;
  minAge?: number | null;
  maxAge?: number | null;
  sessions?: GroupSession[];
}

// Tipos de actividad que cuentan con un catalogo fijo de progresion (PROGRESSION_SCALES, o para Taekwondo
// los BELT_CONFIGS) — es decir, el conjunto de ramas que soporta el modal generico de ascensos
// (usado en StudentManagement/InstructorManagement)
export const PROGRESSION_ACTIVITY_TYPES = ['taekwondo_itf', 'ingles', 'ballet'];

// Una opcion de progresion asignable dentro del modal generico de ascensos — representa una actividad
// a la que esta asociado el usuario (alumno o instructor) y que tiene su propio sistema de grados/niveles
export interface ProgressionActivityOption {
    activityId: string;
    activityName: string;
    activityType: string;
    currentLevelOrder: number | null;
    currentLevelName: string | null;
}

export interface VocabularyTerm {
  id: string;
  term: string;
  meaning: string;
  beltLevel?: number;
  activityType?: string;
  contentType?: 'text' | 'image';
  imageUrl?: string;
  topic?: string;
}

export interface MarketItem {
  id: string;
  name: string;
  description: string;
  costPoints: number;
  type: string;
  imageUrl?: string;
  stock: number;
  itemType?: string;
  rarity?: string;
  is_in_base_store?: boolean;
  is_merchant_sellable?: boolean;
  is_merchant_buyable?: boolean;
  is_merchant_exclusive?: boolean;
  sell_price_min?: number;
  sell_price_max?: number;
  buy_price_min?: number;
  buy_price_max?: number;
  activityType?: string | null;
  combatStats?: {
    slot: string;
    hpBoost: number;
    damageMultiplier: number;
    healBoost: number;
    specialAbilityName?: string;
    specialAbilityDesc?: string;
  };
}
