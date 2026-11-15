// App-wide state: language, profile, progress, docs, dates, and optional Google/Firestore sync.
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { procedures } from '../data';
import { DEFAULT_LANG, directionOf, isLang } from '../i18n';
import { buildChecklist, sanitizeProgress, summarize, type ProgressSummary } from '../lib/checklist';
import { sanitizeDocs, toggleDoc as toggleDocIn, type DocsMap } from '../lib/docs';
import { auth, googleProvider } from '../lib/firebase';
import { sanitizeDates, type PlanDates } from '../lib/plan';
import { isProfile } from '../lib/profile';
import { clearAllData, localData, STORAGE_KEYS } from '../lib/storage';
import { applyTextSize, isTextSize, type TextSize } from '../lib/textSize';
import {
  applyTheme,
  isThemePreference,
  resolveTheme,
  systemPrefersDark,
  watchSystemTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme';
import {
  createUserWorkspace,
  deleteUserWorkspace,
  loadUserWorkspace,
  updateUserWorkspace,
  type WorkspaceState,
} from '../lib/userSync';
import type { ChecklistTask, Lang, Profile, ProgressMap, TaskStatus } from '../types';

export interface AuthUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export type AuthErrorKind = 'popup-blocked' | 'unauthorized-domain' | 'generic';

interface AppContextValue {
  language: Lang;
  setLanguage: (lang: Lang) => void;
  /** False until the visitor has picked a language (used to show the language picker first). */
  languageChosen: boolean;
  profile: Profile | null;
  completeOnboarding: (profile: Profile) => void;
  progress: ProgressMap;
  setTaskStatus: (procedureId: string, status: TaskStatus) => void;
  /** Documents the user has ticked as ready, per procedure. */
  docs: DocsMap;
  toggleDoc: (procedureId: string, docName: string) => void;
  dates: PlanDates;
  setDates: (dates: PlanDates) => void;
  tasks: ChecklistTask[];
  summary: ProgressSummary;
  resetAll: () => void;
  user: AuthUser | null;
  authReady: boolean;
  authLoading: boolean;
  authError: AuthErrorKind | null;
  syncStatus: SyncStatus;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  /** What the user picked: follow the device, or always light / always night mode. */
  themePreference: ThemePreference;
  /** The theme actually shown right now. */
  theme: ResolvedTheme;
  setThemePreference: (preference: ThemePreference) => void;
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function loadLanguage(): Lang {
  const stored = localData.read<unknown>(STORAGE_KEYS.language, DEFAULT_LANG);
  return isLang(stored) ? stored : DEFAULT_LANG;
}

function loadProfile(): Profile | null {
  const stored = localData.read<unknown>(STORAGE_KEYS.profile, null);
  return isProfile(stored) ? stored : null;
}

function loadThemePreference(): ThemePreference {
  const stored = localData.read<unknown>(STORAGE_KEYS.theme, 'system');
  return isThemePreference(stored) ? stored : 'system';
}

function loadTextSize(): TextSize {
  const stored = localData.read<unknown>(STORAGE_KEYS.textSize, 'normal');
  return isTextSize(stored) ? stored : 'normal';
}

function writeWorkspaceToLocal(state: WorkspaceState): void {
  localData.write(STORAGE_KEYS.language, state.language);
  if (state.profile) {
    localData.write(STORAGE_KEYS.profile, state.profile);
  } else {
    localData.remove(STORAGE_KEYS.profile);
  }
  localData.write(STORAGE_KEYS.progress, state.progress);
  localData.write(STORAGE_KEYS.docs, state.docs);
  localData.write(STORAGE_KEYS.dates, state.dates);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Lang>(loadLanguage);
  const [languageChosen, setLanguageChosen] = useState<boolean>(() => isLang(localData.read<unknown>(STORAGE_KEYS.language, null)));
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const [progress, setProgress] = useState<ProgressMap>(() => sanitizeProgress(localData.read<unknown>(STORAGE_KEYS.progress, {})));
  const [docs, setDocs] = useState<DocsMap>(() => sanitizeDocs(localData.read<unknown>(STORAGE_KEYS.docs, {})));
  const [dates, setDatesState] = useState<PlanDates>(() => sanitizeDates(localData.read<unknown>(STORAGE_KEYS.dates, {})));

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<AuthErrorKind | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(loadThemePreference);
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);
  const theme = resolveTheme(themePreference, prefersDark);
  const [textSize, setTextSizeState] = useState<TextSize>(loadTextSize);

  const stateRef = useRef<WorkspaceState>({ language, profile, progress, docs, dates });
  const activeUidRef = useRef<string | null>(null);
  const hasRemoteDocRef = useRef(false);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Keep the page's language and reading direction (left-to-right / right-to-left) in sync.
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = directionOf(language);
  }, [language]);

  // Follow the device's light/dark setting live, and apply the resulting theme to the page.
  useEffect(() => watchSystemTheme(setPrefersDark), []);
  useEffect(() => applyTheme(theme), [theme]);

  useEffect(() => applyTextSize(textSize), [textSize]);
  const setTextSize = useCallback((size: TextSize) => {
    setTextSizeState(size);
    localData.write(STORAGE_KEYS.textSize, size);
  }, []);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    setThemePreferenceState(preference);
    localData.write(STORAGE_KEYS.theme, preference);
  }, []);

  const enqueueWrite = useCallback((uid: string, snapshot: WorkspaceState) => {
    setSyncStatus('syncing');
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (activeUidRef.current !== uid) return;
        if (!hasRemoteDocRef.current) {
          await createUserWorkspace(uid, snapshot);
          hasRemoteDocRef.current = true;
        } else {
          await updateUserWorkspace(uid, snapshot);
        }
        if (activeUidRef.current === uid) {
          setSyncStatus('synced');
        }
      })
      .catch(() => {
        if (activeUidRef.current === uid) {
          setSyncStatus('error');
        }
      });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        activeUidRef.current = null;
        hasRemoteDocRef.current = false;
        setUser(null);
        setSyncStatus('idle');
        setAuthReady(true);
        return;
      }

      const uid = firebaseUser.uid;
      activeUidRef.current = uid;
      setUser({
        uid,
        displayName: firebaseUser.displayName,
        email: firebaseUser.email,
        photoURL: firebaseUser.photoURL,
      });
      setAuthReady(true);
      setAuthError(null);
      setSyncStatus('syncing');

      try {
        const loaded = await loadUserWorkspace(uid);
        if (activeUidRef.current !== uid) return;
        hasRemoteDocRef.current = loaded.exists;

        const localSnapshot = stateRef.current;
        if (loaded.exists && (loaded.hasProfile || !localSnapshot.profile)) {
          stateRef.current = loaded.state;
          writeWorkspaceToLocal(loaded.state);
          setLanguageState(loaded.state.language);
          setLanguageChosen(true);
          setProfile(loaded.state.profile);
          setProgress(loaded.state.progress);
          setDocs(loaded.state.docs);
          setDatesState(loaded.state.dates);
          setSyncStatus('synced');
        } else {
          enqueueWrite(uid, localSnapshot);
        }
      } catch {
        if (activeUidRef.current === uid) {
          setSyncStatus('error');
        }
      }
    });

    return () => unsubscribe();
  }, [enqueueWrite]);

  const setLanguage = useCallback(
    (lang: Lang) => {
      const nextState: WorkspaceState = { ...stateRef.current, language: lang };
      stateRef.current = nextState;
      setLanguageState(lang);
      setLanguageChosen(true);
      localData.write(STORAGE_KEYS.language, lang);
      if (activeUidRef.current) enqueueWrite(activeUidRef.current, nextState);
    },
    [enqueueWrite],
  );

  const completeOnboarding = useCallback(
    (next: Profile) => {
      const nextState: WorkspaceState = { ...stateRef.current, profile: next };
      stateRef.current = nextState;
      setProfile(next);
      localData.write(STORAGE_KEYS.profile, next);
      if (activeUidRef.current) enqueueWrite(activeUidRef.current, nextState);
    },
    [enqueueWrite],
  );

  const setTaskStatus = useCallback(
    (procedureId: string, status: TaskStatus) => {
      const nextProgress = { ...stateRef.current.progress, [procedureId]: status };
      const nextState: WorkspaceState = { ...stateRef.current, progress: nextProgress };
      stateRef.current = nextState;
      setProgress(nextProgress);
      localData.write(STORAGE_KEYS.progress, nextProgress);
      if (activeUidRef.current) enqueueWrite(activeUidRef.current, nextState);
    },
    [enqueueWrite],
  );

  const toggleDoc = useCallback(
    (procedureId: string, docName: string) => {
      const nextDocs = toggleDocIn(stateRef.current.docs, procedureId, docName);
      const nextState: WorkspaceState = { ...stateRef.current, docs: nextDocs };
      stateRef.current = nextState;
      setDocs(nextDocs);
      localData.write(STORAGE_KEYS.docs, nextDocs);
      if (activeUidRef.current) enqueueWrite(activeUidRef.current, nextState);
    },
    [enqueueWrite],
  );

  const setDates = useCallback(
    (next: PlanDates) => {
      const nextState: WorkspaceState = { ...stateRef.current, dates: next };
      stateRef.current = nextState;
      setDatesState(next);
      localData.write(STORAGE_KEYS.dates, next);
      if (activeUidRef.current) enqueueWrite(activeUidRef.current, nextState);
    },
    [enqueueWrite],
  );

  const resetAll = useCallback(() => {
    clearAllData();
    const emptyState: WorkspaceState = {
      language: DEFAULT_LANG,
      profile: null,
      progress: {},
      docs: {},
      dates: { arrival: '', expiry: '' },
    };
    stateRef.current = emptyState;
    setProfile(null);
    setProgress({});
    setDocs({});
    setDatesState({ arrival: '', expiry: '' });
    setLanguageState(DEFAULT_LANG);
    setLanguageChosen(false);
    setThemePreferenceState('system');
    setTextSizeState('normal');

    const uid = activeUidRef.current;
    if (uid) {
      setSyncStatus('syncing');
      writeQueueRef.current = writeQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (activeUidRef.current !== uid) return;
          if (hasRemoteDocRef.current) {
            await deleteUserWorkspace(uid);
            hasRemoteDocRef.current = false;
          }
          if (activeUidRef.current === uid) {
            setSyncStatus('idle');
          }
        })
        .catch(() => {
          if (activeUidRef.current === uid) {
            setSyncStatus('error');
          }
        });
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('[auth] Google sign-in failed:', code || error);
      if (code === 'auth/unauthorized-domain') {
        setAuthError('unauthorized-domain');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('popup-blocked');
      } else {
        setAuthError('generic');
      }
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signOut(auth);
    } catch {
      setAuthError('generic');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const tasks = useMemo(() => (profile ? buildChecklist(procedures, profile) : []), [profile]);
  const summary = useMemo(() => summarize(tasks, progress), [tasks, progress]);

  const value = useMemo<AppContextValue>(
    () => ({
      language,
      setLanguage,
      languageChosen,
      profile,
      completeOnboarding,
      progress,
      setTaskStatus,
      docs,
      toggleDoc,
      dates,
      setDates,
      tasks,
      summary,
      resetAll,
      user,
      authReady,
      authLoading,
      authError,
      syncStatus,
      signInWithGoogle,
      signOutUser,
      themePreference,
      theme,
      setThemePreference,
      textSize,
      setTextSize,
    }),
    [
      language,
      setLanguage,
      languageChosen,
      profile,
      completeOnboarding,
      progress,
      setTaskStatus,
      docs,
      toggleDoc,
      dates,
      setDates,
      tasks,
      summary,
      resetAll,
      user,
      authReady,
      authLoading,
      authError,
      syncStatus,
      signInWithGoogle,
      signOutUser,
      themePreference,
      theme,
      setThemePreference,
      textSize,
      setTextSize,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
