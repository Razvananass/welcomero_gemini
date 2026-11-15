// Shared types. Keeping them in one file makes the data shape easy to find.

export type Lang = 'en' | 'ro' | 'ar' | 'fr' | 'uk' | 'ne';

/** Text that can exist in several languages. English is always required. */
export type Localized = { en: string } & Partial<Record<Exclude<Lang, 'en'>, string>>;

// ---- User profile (collected in onboarding) --------------------------------

export type Situation = 'student' | 'worker' | 'refugee' | 'other';
export type WorkerStatus = 'employed' | 'looking-for-work' | 'self-employed' | 'unsure';
export type ProtectionStatus = 'considering-asylum' | 'asylum-pending' | 'protection-granted' | 'temporary-protection' | 'unsure';
export type Citizenship = 'eu' | 'non-eu';
export type Accommodation = 'registered' | 'not-registered' | 'none' | 'unsure';
export type CompletedKey = 'residence' | 'address' | 'health' | 'cnp' | 'university' | 'none' | 'unsure';

export interface Profile {
  situation: Situation;
  workerStatus?: WorkerStatus;
  protectionStatus?: ProtectionStatus;
  citizenship: Citizenship;
  accommodation: Accommodation;
  completed: CompletedKey[];
}

/** Answers while onboarding is still in progress. */
export interface ProfileDraft {
  situation?: Situation;
  workerStatus?: WorkerStatus;
  protectionStatus?: ProtectionStatus;
  citizenship?: Citizenship;
  accommodation?: Accommodation;
  completed: CompletedKey[];
}

// ---- Administrative data ---------------------------------------------------

/**
 * How much we trust a piece of information:
 * - verified: supported by a cited government, EU, UN, university, or recognized specialist source
 * - recommended: a practical tip, not a legal requirement
 * - confirm: the named detail depends on the person's case or the office's current process
 */
export type Reliability = 'verified' | 'recommended' | 'confirm';

export interface Source {
  title: string;
  url: string;
  kind: 'government' | 'university' | 'eu' | 'ngo';
  retrieved: string; // ISO date
  note?: string;
}

export interface Item {
  text: Localized;
  level: Reliability;
  sourceIds?: string[];
}

export interface DocumentItem {
  name: Localized;
  whereToGet: Localized;
  level: Reliability;
  sourceIds?: string[];
}

export type Priority = 'high' | 'normal' | 'low';
export type Relevance = 'core' | 'verify';

export interface AudienceRule {
  situations: Situation[];
  citizenships: Citizenship[];
  workerStatuses?: WorkerStatus[];
  protectionStatuses?: ProtectionStatus[];
  relevance: Relevance;
}

export interface Procedure {
  id: string;
  order: number;
  completedKey?: CompletedKey;
  institutionId: string;
  title: Localized;
  summary: Localized;
  why: Localized;
  whoNeeds: Localized;
  whoDoesNot: Localized;
  submitWhere: Localized;
  documents: DocumentItem[];
  steps: Item[];
  warnings: Item[];
  processingTime: Item | null;
  deadline: Item | null;
  priority?: { level: Priority; reason: Localized };
  dependsOn?: string[];
  audience: AudienceRule[];
  sourceIds: string[];
  lastVerified: string; // ISO date
}

export interface Institution {
  id: string;
  name: Localized;
  description: Localized;
  services: Localized[];
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string;
  hours: Localized | null;
  verifiedNote: Localized;
  sourceIds: string[];
  placeholder?: boolean;
}

export interface Phrase {
  id: string;
  label: Localized;
  ro: string;
  pron: string | null;
  meaning: Localized;
}

// ---- Checklist -------------------------------------------------------------

export type TaskStatus = 'not-started' | 'in-progress' | 'completed';
export type TaskNote =
  | 'verifyApplies'
  | 'findAccommodationFirst'
  | 'accommodationUnsure'
  | 'needsAccommodation'
  | 'preCompleted';

export type PriorityReasonKey = 'addressNotRegistered';

export interface ChecklistTask {
  procedure: Procedure;
  relevance: Relevance;
  priority: { level: Priority; reason?: Localized; reasonKey?: PriorityReasonKey } | null;
  notes: TaskNote[];
  preCompleted: boolean;
}

export type ProgressMap = Record<string, TaskStatus>;
