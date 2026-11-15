import { useApp } from '../context/AppContext';
import { LanguageSelect } from './LanguageSelect';

/**
 * Shown at the very top of the landing page. A new visitor sees the question written in several
 * languages (so it can be understood before choosing) and one dropdown with every language.
 * After a choice it shrinks to a compact row.
 */
export function LanguagePicker() {
  const { languageChosen } = useApp();
  return (
    <section
      aria-label="Language / Limba / Langue / اللغة / Мова / भाषा"
      className={`rounded-lg border border-slate-200 bg-white ${languageChosen ? 'p-3' : 'p-6 sm:p-8'}`}
    >
      {languageChosen ? null : (
        <div className="mb-5 text-center">
          <h2 className="text-2xl font-bold text-brand-900 sm:text-3xl">
            <label htmlFor="landing-language" lang="en">
              Choose your language
            </label>
          </h2>
          <p className="mt-2 text-muted" dir="auto">
            <span lang="ro">Alege limba</span> · <span lang="fr">Choisissez votre langue</span> ·{' '}
            <span lang="ar">اختر لغتك</span> · <span lang="uk">Оберіть мову</span> · <span lang="ne">आफ्नो भाषा छान्नुहोस्</span> ·{' '}
            <span lang="ru">Выберите язык</span> · <span lang="es">Elige tu idioma</span> · <span lang="tr">Dilinizi seçin</span> ·{' '}
            <span lang="hi">अपनी भाषा चुनें</span> · <span lang="bn">আপনার ভাষা বেছে নিন</span> · <span lang="fa">زبان خود را انتخاب کنید</span> ·{' '}
            <span lang="ur">اپنی زبان منتخب کریں</span> · <span lang="vi">Chọn ngôn ngữ</span> · <span lang="zh">选择语言</span> ·{' '}
            <span lang="de">Sprache wählen</span>
          </p>
        </div>
      )}
      <div className="flex justify-center">
        <LanguageSelect
          id="landing-language"
          label="Language / Limba / Langue / اللغة / Мова / भाषा"
          placeholder="Language / Limba / Langue"
        />
      </div>
    </section>
  );
}
