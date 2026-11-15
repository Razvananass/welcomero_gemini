import { useI18n } from '../context/useI18n';
import type { FormGuide } from '../lib/ai';
import { Notice } from './ui';

/** Field-by-field help for a Romanian form, as returned by the AI. */
export function FormGuideView({ guide }: { guide: FormGuide }) {
  const { t } = useI18n();
  return (
    <div className="mt-5 space-y-4" aria-live="polite">
      <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-800">{t('ai.form.result')}</p>
        {guide.form ? (
          <p lang="ro" className="mt-1 text-lg font-bold text-brand-900">
            {guide.form}
          </p>
        ) : null}
        {guide.about ? <p className="mt-1 text-ink">{guide.about}</p> : null}
      </div>

      {guide.fields.length > 0 ? (
        <ol className="space-y-3">
          {guide.fields.map((field, index) => (
            <li key={`${index}-${field.label}`} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-700 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p lang="ro" className="font-bold text-brand-900">
                    {field.label}
                  </p>
                  {field.meaning ? <p className="text-sm text-muted">{field.meaning}</p> : null}
                  {field.write ? (
                    <p className="text-sm">
                      <span className="font-semibold text-brand-900">{t('ai.form.write')} </span>
                      {field.write}
                    </p>
                  ) : null}
                  {field.example ? (
                    <p className="text-sm">
                      <span className="font-semibold text-brand-900">{t('ai.form.example')} </span>
                      <code lang="ro" dir="ltr" className="rounded bg-slate-100 px-1.5 py-0.5 text-ink">
                        {field.example}
                      </code>
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {guide.skip.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="font-semibold text-brand-900">{t('ai.form.skip')}</p>
          <ul className="mt-1 list-disc ps-5" lang="ro">
            {guide.skip.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {guide.tips.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="font-semibold text-brand-900">{t('ai.form.tips')}</p>
          <ul className="mt-1 list-disc space-y-1 ps-5">
            {guide.tips.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Notice tone="warning">{t('ai.form.check')}</Notice>
    </div>
  );
}
