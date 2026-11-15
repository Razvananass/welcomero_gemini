import { useApp } from '../context/AppContext';
import { LANGUAGES } from '../i18n';

/**
 * Shown at the very top of the landing page. A new visitor sees it first, large, with the
 * question written in every supported language (so it can be understood before choosing).
 * After a choice it shrinks to a compact row.
 */
export function LanguagePicker() {
  const { language, setLanguage, languageChosen } = useApp();
  return (
    <section
      aria-label="Language / Limba / Langue / اللغة / Мова / भाषा"
      className={`rounded-2xl border border-brand-200 bg-brand-50 ${languageChosen ? 'p-3' : 'p-6 sm:p-8'}`}
    >
      {languageChosen ? null : (
        <div className="mb-5 text-center">
          <h2 className="text-2xl font-extrabold text-brand-900 sm:text-3xl">
            <span lang="en">Choose your language</span>
          </h2>
          <p className="mt-2 text-muted" dir="auto">
            <span lang="ro">Alege limba</span> · <span lang="fr">Choisissez votre langue</span> ·{' '}
            <span lang="ar">اختر لغتك</span> · <span lang="uk">Оберіть мову</span> · <span lang="ne">आफ्नो भाषा छान्नुहोस्</span>
          </p>
        </div>
      )}
      <div className={`flex flex-wrap justify-center gap-3 ${languageChosen ? '' : 'sm:gap-4'}`} role="group" aria-label="Language">
        {LANGUAGES.map((lang) => {
          const active = languageChosen && lang.code === language;
          return (
            <button
              key={lang.code}
              type="button"
              lang={lang.code}
              dir={lang.dir}
              aria-pressed={active}
              onClick={() => setLanguage(lang.code)}
              className={`rounded-xl border-2 font-semibold transition-colors ${
                languageChosen ? 'min-h-10 px-4 text-sm' : 'min-h-14 min-w-36 px-6 text-lg'
              } ${
                active
                  ? 'border-brand-700 bg-brand-700 text-white'
                  : 'border-brand-200 bg-white text-brand-900 hover:border-brand-500'
              }`}
            >
              {active ? '✓ ' : ''}
              {lang.nativeName}
            </button>
          );
        })}
      </div>
    </section>
  );
}
