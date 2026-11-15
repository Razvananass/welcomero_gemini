import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import type { ThemePreference } from '../lib/theme';
import { Icon } from './Icon';

/** One-click switch between light and night mode (used in the header). */
export function ThemeToggle({ className = '', showLabel = false }: { className?: string; showLabel?: boolean }) {
  const { theme, setThemePreference } = useApp();
  const { t } = useI18n();
  const isDark = theme === 'dark';
  const label = isDark ? t('theme.toLight') : t('theme.toDark');
  return (
    <button
      type="button"
      onClick={() => setThemePreference(isDark ? 'light' : 'dark')}
      aria-label={showLabel ? undefined : label}
      title={showLabel ? undefined : label}
      className={`min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-brand-900 hover:bg-brand-50 ${className}`}
    >
      <Icon name={isDark ? 'sun' : 'moon'} className="size-5" />
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}

/** The full choice (device / light / night), used on the Settings page. */
export function ThemeChoice() {
  const { themePreference, setThemePreference } = useApp();
  const { t } = useI18n();
  const options: Array<{ value: ThemePreference; label: string }> = [
    { value: 'system', label: t('theme.system') },
    { value: 'light', label: t('theme.light') },
    { value: 'dark', label: t('theme.dark') },
  ];
  return (
    <div role="group" aria-label={t('theme.title')} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = themePreference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => setThemePreference(option.value)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${
              selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-400 bg-white text-brand-900 hover:bg-brand-50'
            }`}
          >
            {selected ? <Icon name="check" className="size-4" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
