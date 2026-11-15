import {
  deleteDoc,
  deleteField,
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FieldValue,
} from 'firebase/firestore';
import { DEFAULT_LANG, isLang } from '../i18n';
import type { Lang, Profile, ProgressMap } from '../types';
import { sanitizeProgress } from './checklist';
import { sanitizeDocs, type DocsMap } from './docs';
import { db, handleFirestoreError, OperationType } from './firebase';
import { sanitizeDates, type PlanDates } from './plan';
import { isProfile } from './profile';

export interface WorkspaceState {
  language: Lang;
  profile: Profile | null;
  progress: ProgressMap;
  docs: DocsMap;
  dates: PlanDates;
}

export interface LoadedWorkspace {
  exists: boolean;
  hasProfile: boolean;
  state: WorkspaceState;
}

const MAX_MAP_KEYS = 50;
const MAX_DATE_LENGTH = 20;

function limitRecord<T>(record: Record<string, T>, maxKeys = MAX_MAP_KEYS): Record<string, T> {
  const entries = Object.entries(record).slice(0, maxKeys);
  return Object.fromEntries(entries);
}

function sanitizeBoundDates(dates: PlanDates): PlanDates {
  return {
    arrival: typeof dates.arrival === 'string' ? dates.arrival.slice(0, MAX_DATE_LENGTH) : '',
    expiry: typeof dates.expiry === 'string' ? dates.expiry.slice(0, MAX_DATE_LENGTH) : '',
  };
}

function buildUpdateFields(state: WorkspaceState): Record<string, unknown | FieldValue> {
  const base: Record<string, unknown | FieldValue> = {
    language: state.language,
    hasProfile: Boolean(state.profile),
    progress: limitRecord(state.progress),
    docs: limitRecord(state.docs),
    dates: sanitizeBoundDates(state.dates),
    updatedAt: serverTimestamp(),
  };

  if (state.profile) {
    base.profile = {
      situation: state.profile.situation,
      ...(state.profile.workerStatus ? { workerStatus: state.profile.workerStatus } : {}),
      ...(state.profile.protectionStatus ? { protectionStatus: state.profile.protectionStatus } : {}),
      citizenship: state.profile.citizenship,
      accommodation: state.profile.accommodation,
      completed: state.profile.completed.slice(0, 10),
    };
  } else {
    base.profile = deleteField();
  }

  return base;
}

function buildCreateFields(uid: string, state: WorkspaceState): Record<string, unknown> {
  const base: Record<string, unknown> = {
    ownerId: uid,
    language: state.language,
    hasProfile: Boolean(state.profile),
    progress: limitRecord(state.progress),
    docs: limitRecord(state.docs),
    dates: sanitizeBoundDates(state.dates),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (state.profile) {
    base.profile = {
      situation: state.profile.situation,
      ...(state.profile.workerStatus ? { workerStatus: state.profile.workerStatus } : {}),
      ...(state.profile.protectionStatus ? { protectionStatus: state.profile.protectionStatus } : {}),
      citizenship: state.profile.citizenship,
      accommodation: state.profile.accommodation,
      completed: state.profile.completed.slice(0, 10),
    };
  }

  return base;
}

export async function loadUserWorkspace(uid: string): Promise<LoadedWorkspace> {
  const path = `users/${uid}`;
  try {
    const snap = await getDocFromServer(doc(db, 'users', uid));
    if (!snap.exists()) {
      return {
        exists: false,
        hasProfile: false,
        state: {
          language: DEFAULT_LANG,
          profile: null,
          progress: {},
          docs: {},
          dates: { arrival: '', expiry: '' },
        },
      };
    }

    const raw = snap.data() as Record<string, unknown>;
    const language = isLang(raw.language) ? raw.language : DEFAULT_LANG;
    const profile = isProfile(raw.profile) ? raw.profile : null;
    const progress = sanitizeProgress(raw.progress);
    const docs = sanitizeDocs(raw.docs);
    const dates = sanitizeDates(raw.dates);

    return {
      exists: true,
      hasProfile: Boolean(profile),
      state: { language, profile, progress, docs, dates },
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createUserWorkspace(uid: string, state: WorkspaceState): Promise<void> {
  const path = `users/${uid}`;
  try {
    await setDoc(doc(db, 'users', uid), buildCreateFields(uid, state));
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserWorkspace(uid: string, state: WorkspaceState): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), buildUpdateFields(state));
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;
    if (code === 'not-found') {
      await createUserWorkspace(uid, state);
      return;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserWorkspace(uid: string): Promise<void> {
  const path = `users/${uid}`;
  try {
    await deleteDoc(doc(db, 'users', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
