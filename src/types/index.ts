export interface Tul {
  id: string;
  name: string;
  rankRequirement: number; // 0 to N, higher is higher belt
  beltName: string; // Display name e.g. "Cinturón Verde"
  beltMeaning?: Record<string, string>;
  meaning: Record<string, string>;
  description: Record<string, string>;
  moves: number;
  diagramDetails: Record<string, string>; // Text description of the diagram until we have images
  diagramType?: 'plus' | 'I' | 'scholar' | 'inverted_T' | 'other';
  videoId: string; // YouTube ID
}

export type UserRole = 'student' | 'instructor' | 'admin' | 'club_owner';
export type SubscriptionPlan = 'free' | 'club_lite' | 'club_pro' | 'club_elite';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceRecord {
  id: string; // Unique ID for the record
  groupId: string; // What class this was for
  studentId: string;
  date: string; // ISO Date (YYYY-MM-DD)
  status: AttendanceStatus;
}

export interface Evaluation {
  id: string;
  studentId: string;
  instructorId: string;
  tulId: string;
  date: string; // ISO Date
  movements: {
    moveIndex: number;
    score: number; // 1-5 or 1-10
    comment?: string;
  }[];
  summaryComment?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  username?: string;
  rank: number; // Current rank of the user
  beltName: string;
  role: UserRole;
  plan: SubscriptionPlan;
  organizationId?: string; // Link to a School/Club
  organizationName?: string; // Display name of the club
  organizationLogo?: string; // URL/URI to the club's logo
  profilePicture?: string; // Local URI or network URL to the profile picture
  mediaConsent?: boolean; // Consent for photos/videos
  hasPurchasedAdRemoval?: boolean; // Ad-free one-off purchase
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

export interface Organization {
  id: string;
  name: string;
  ownerId: string; // Refers to the club_owner user
  plan: SubscriptionPlan;
}

export interface Activity {
  id: string;
  organizationId: string;
  name: string;
  icon: string; // Ionicons name
  activityType?: 'taekwondo_itf' | 'general' | string;
}

export interface GroupSession {
  days: number[];       // 0-6 (Mon–Sun)
  startTime: string;    // "HH:mm"
  endTime: string;      // "HH:mm"
  aulaId?: string | null;
  aulaName?: string | null;
  instructorId?: string | null;
  instructorName?: string | null;
}

export interface Group {
  id: string;
  activityId: string;
  activityName?: string;  // Populated by getAllClubGroups
  activityIcon?: string;  // Ionicons name, populated by getAllClubGroups
  activityType?: 'taekwondo_itf' | 'general' | string; // Populated by /api/users/:userId/groups
  progressionLevelOrder?: number | null;  // Populated by /api/users/:userId/groups — the user's current level for this group's activity
  progressionLevelName?: string | null;
  name: string;
  time: string;         // Denormalized display string (legacy + computed)
  studentCount: number;
  maxStudents?: number | null;
  minAge?: number | null;
  maxAge?: number | null;
  sessions?: GroupSession[];
}

// activity_types that have a fixed PROGRESSION_SCALES catalog (or, for Taekwondo, BELT_CONFIGS) —
// i.e. the set of branches the generalized promotion modal (StudentManagement/InstructorManagement) supports
export const PROGRESSION_ACTIVITY_TYPES = ['taekwondo_itf', 'ingles', 'ballet'];

// One assignable progression option in the generalized promotion modal — an activity the
// user (student or instructor) is associated with that has a per-activity rank/level system
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
