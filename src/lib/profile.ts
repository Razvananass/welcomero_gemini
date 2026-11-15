// Pure helpers for the onboarding questionnaire. No React in here, so it is easy to test.
import type {
  Accommodation,
  Citizenship,
  CompletedKey,
  Profile,
  ProfileDraft,
  ProtectionStatus,
  Situation,
  WorkerStatus,
} from '../types';

export const SITUATIONS: Situation[] = ['student', 'worker', 'refugee', 'other'];
export const WORKER_STATUSES: WorkerStatus[] = ['employed', 'looking-for-work', 'self-employed', 'unsure'];
export const PROTECTION_STATUSES: ProtectionStatus[] = ['considering-asylum', 'asylum-pending', 'protection-granted', 'temporary-protection', 'unsure'];
export const CITIZENSHIPS: Citizenship[] = ['eu', 'non-eu'];
export const ACCOMMODATIONS: Accommodation[] = ['registered', 'not-registered', 'none', 'unsure'];
export const COMPLETED_KEYS: CompletedKey[] = ['residence', 'address', 'health', 'cnp', 'university', 'none', 'unsure'];

/** "None of these" and "I'm not sure" cannot be combined with anything else. */
const EXCLUSIVE: CompletedKey[] = ['none', 'unsure'];

export const ONBOARDING_STEPS = 4;

export function profileNeedsDetails(profile: { situation?: Situation; workerStatus?: WorkerStatus; protectionStatus?: ProtectionStatus }): boolean {
  return (profile.situation === 'worker' && !profile.workerStatus)
    || (profile.situation === 'refugee' && !profile.protectionStatus);
}

export function emptyDraft(): ProfileDraft {
  return { completed: [] };
}

/** Turn a draft into a profile, or return null if something required is missing. */
export function draftToProfile(draft: ProfileDraft): Profile | null {
  if (!draft.situation || !draft.citizenship || !draft.accommodation || draft.completed.length === 0) return null;
  if (draft.situation === 'worker' && !draft.workerStatus) return null;
  if (draft.situation === 'refugee' && !draft.protectionStatus) return null;
  return {
    situation: draft.situation,
    ...(draft.situation === 'worker' ? { workerStatus: draft.workerStatus } : {}),
    ...(draft.situation === 'refugee' ? { protectionStatus: draft.protectionStatus } : {}),
    citizenship: draft.citizenship,
    accommodation: draft.accommodation,
    completed: normaliseCompleted(draft.completed),
  };
}

export function profileToDraft(profile: Profile): ProfileDraft {
  return { ...profile, completed: [...profile.completed] };
}

/** Tick or untick one option in question 5, keeping the exclusive options exclusive. */
export function toggleCompleted(current: CompletedKey[], key: CompletedKey): CompletedKey[] {
  const isSelected = current.includes(key);
  if (EXCLUSIVE.includes(key)) return isSelected ? [] : [key];
  const withoutExclusive = current.filter((k) => !EXCLUSIVE.includes(k));
  return isSelected ? withoutExclusive.filter((k) => k !== key) : [...withoutExclusive, key];
}

/** Repair a list from storage so it can never be in an impossible state. */
export function normaliseCompleted(list: CompletedKey[]): CompletedKey[] {
  const valid = Array.from(new Set(list.filter((k) => COMPLETED_KEYS.includes(k))));
  const exclusive = valid.find((k) => EXCLUSIVE.includes(k));
  if (exclusive) return [exclusive];
  return valid;
}

export type OnboardingError = 'onb.error.required' | 'onb.error.completed';

/** Returns an error message key if the step is not complete, otherwise null. Step numbers start at 1. */
export function validateStep(step: number, draft: ProfileDraft): OnboardingError | null {
  switch (step) {
    case 1:
      return null; // a language is always selected
    case 2:
      if (!draft.situation || !draft.citizenship) return 'onb.error.required';
      if (draft.situation === 'worker' && !draft.workerStatus) return 'onb.error.required';
      if (draft.situation === 'refugee' && !draft.protectionStatus) return 'onb.error.required';
      return null;
    case 3:
      return draft.accommodation ? null : 'onb.error.required';
    case 4:
      return draft.completed.length > 0 ? null : 'onb.error.completed';
    default:
      return null;
  }
}

/** Check data that came out of localStorage. Anything unexpected is ignored rather than trusted. */
export function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    SITUATIONS.includes(v.situation as Situation) &&
    (v.workerStatus === undefined || (v.situation === 'worker' && WORKER_STATUSES.includes(v.workerStatus as WorkerStatus))) &&
    (v.protectionStatus === undefined || (v.situation === 'refugee' && PROTECTION_STATUSES.includes(v.protectionStatus as ProtectionStatus))) &&
    CITIZENSHIPS.includes(v.citizenship as Citizenship) &&
    ACCOMMODATIONS.includes(v.accommodation as Accommodation) &&
    Array.isArray(v.completed) &&
    v.completed.every((k) => COMPLETED_KEYS.includes(k as CompletedKey))
  );
}

export function isDraft(value: unknown): value is ProfileDraft & { step?: number } {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const optional = (list: string[], x: unknown) => x === undefined || list.includes(x as string);
  return (
    optional(SITUATIONS, v.situation) &&
    optional(WORKER_STATUSES, v.workerStatus) &&
    optional(PROTECTION_STATUSES, v.protectionStatus) &&
    optional(CITIZENSHIPS, v.citizenship) &&
    optional(ACCOMMODATIONS, v.accommodation) &&
    Array.isArray(v.completed) &&
    v.completed.every((k) => COMPLETED_KEYS.includes(k as CompletedKey))
  );
}
