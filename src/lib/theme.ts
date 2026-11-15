// Light / night mode. The choice is a device preference: it is kept in this browser only (not synced).
// index.html applies the saved choice before React starts, so the page never flashes white at night.

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_PREFERENCES: ThemePreference[] = ['system', 'light', 'dark'];

/** Browser bar colour (mobile) for each theme. Keep in sync with index.html and index.css. */
const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#0b5a86',
  dark: '#0f1821',
};

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as string[]).includes(value);
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/** Switch the whole page: the `dark` class swaps the colour palette in index.css. */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
}

/** Calls `onChange` when the device switches between light and dark. Returns an unsubscribe function. */
export function watchSystemTheme(onChange: (prefersDark: boolean) => void): () => void {
  try {
    const query = window.matchMedia(DARK_QUERY);
    const listener = (event: MediaQueryListEvent) => onChange(event.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  } catch {
    return () => undefined;
  }
}
