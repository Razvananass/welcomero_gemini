import { useApp } from '../context/AppContext';
import { isLang, LANGUAGES } from '../i18n';

/**
 * One native dropdown listing every language by its own name. Native selects work with screen
 * readers, the phone's own picker and the keyboard, and stay inside a 320px wide screen.
 */
export function LanguageSelect({ id, label, placeholder }: { id: string; label: string; placeholder?: string }) {
  const { language, setLanguage, languageChosen } = useApp();
  return (
    <select
      id={id}
      aria-label={label}
      value={placeholder && !languageChosen ? '' : language}
      onChange={(event) => {
        if (isLang(event.target.value)) setLanguage(event.target.value);
      }}
      className="block min-h-11 w-full max-w-xs rounded-lg border border-slate-400 bg-white px-3 py-2 text-base font-semibold text-brand-900"
    >
      {placeholder && !languageChosen ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code} lang={lang.code} dir={lang.dir}>
          {lang.nativeName}
        </option>
      ))}
    </select>
  );
}
