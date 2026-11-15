// A small, safe wrapper around localStorage.
// Why a wrapper? localStorage can be unavailable (private mode, blocked cookies) or contain damaged data.
// Instead of crashing, we fall back to memory for this visit.
//
// Reminder: localStorage belongs to ONE browser on ONE device. It does not sync between devices.
// Later, a database could replace the functions in this file without touching the rest of the app.

const PREFIX = 'welcomero.';
const VERSION = 1;

export const STORAGE_KEYS = {
  language: 'language',
  profile: 'profile',
  progress: 'progress',
  draft: 'onboardingDraft',
  chat: 'chat',
  docs: 'docs',
  dates: 'dates',
  theme: 'theme',
} as const;

const memoryFallback = new Map<string, string>();

type StoreKind = 'local' | 'session';

function getStore(kind: StoreKind): Storage | null {
  try {
    const store = kind === 'local' ? window.localStorage : window.sessionStorage;
    const probe = `${PREFIX}__probe`;
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

function read<T>(kind: StoreKind, key: string, fallback: T): T {
  const fullKey = PREFIX + key;
  try {
    const store = getStore(kind);
    const raw = store ? store.getItem(fullKey) : (memoryFallback.get(`${kind}:${fullKey}`) ?? null);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as { v?: number; data?: T };
    if (parsed && parsed.v === VERSION && 'data' in parsed) return parsed.data as T;
    return fallback;
  } catch {
    return fallback;
  }
}

function write(kind: StoreKind, key: string, value: unknown): boolean {
  const fullKey = PREFIX + key;
  const raw = JSON.stringify({ v: VERSION, data: value });
  try {
    const store = getStore(kind);
    if (store) {
      store.setItem(fullKey, raw);
      return true;
    }
  } catch {
    // fall through to memory
  }
  memoryFallback.set(`${kind}:${fullKey}`, raw);
  return false;
}

function remove(kind: StoreKind, key: string): void {
  const fullKey = PREFIX + key;
  memoryFallback.delete(`${kind}:${fullKey}`);
  try {
    getStore(kind)?.removeItem(fullKey);
  } catch {
    // nothing to do
  }
}

/** Long-lived data (profile, progress, language). */
export const localData = {
  read: <T>(key: string, fallback: T) => read('local', key, fallback),
  write: (key: string, value: unknown) => write('local', key, value),
  remove: (key: string) => remove('local', key),
};

/** Data that should disappear when the tab is closed (the chat history). */
export const sessionData = {
  read: <T>(key: string, fallback: T) => read('session', key, fallback),
  write: (key: string, value: unknown) => write('session', key, value),
  remove: (key: string) => remove('session', key),
};

/** Remove everything welcomeRo stored in this browser. */
export function clearAllData(): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    localData.remove(key);
    sessionData.remove(key);
  }
}
