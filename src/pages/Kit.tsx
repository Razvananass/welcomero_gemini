import { Link, useLocation, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import { getInstitution, getProcedure, kitQuestions, phrases } from '../data';
import { docCounts, isDocReady } from '../lib/docs';
import { safeGuideOrigin } from '../lib/journey';
import { formatDate, todayIso } from '../lib/plan';
import { btnPrimary, btnSecondary, CopyButton, linkClass, SpeakButtons } from '../components/ui';
import { Icon } from '../components/Icon';
import { LogoMark, Wordmark } from '../components/Logo';
import type { Localized } from '../types';

/** One Romanian sentence with how to say it and what it means in the reader's language. */
function RoLine({ ro, pron, meaning }: { ro: string; pron: string | null; meaning: string }) {
  return (
    <div className="print-card rounded-lg border border-slate-300 bg-white p-4">
      <p lang="ro" dir="ltr" className="text-xl font-bold leading-snug text-ink">
        {ro}
      </p>
      {pron ? (
        <p dir="ltr" className="mt-1 text-sm italic text-muted">
          {pron}
        </p>
      ) : null}
      <p className="mt-1 text-sm text-ink">{meaning}</p>
      <div className="no-print mt-3 flex flex-wrap gap-2">
        <SpeakButtons text={ro} />
        <CopyButton text={ro} />
      </div>
    </div>
  );
}

function KitSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="print-card space-y-3">
      <h2 className="border-b-2 border-brand-700 pb-1 text-lg font-bold text-brand-900">{title}</h2>
      {children}
    </section>
  );
}

export function Kit() {
  const { id } = useParams<{ id: string }>();
  const { docs, toggleDoc, language } = useApp();
  const { t, loc } = useI18n();
  const location = useLocation();
  const guideOrigin = safeGuideOrigin((location.state as { guideOrigin?: unknown } | null)?.guideOrigin);
  const procedure = id ? getProcedure(id) : undefined;

  if (!procedure) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-brand-900">{t('kit.notFound')}</h1>
        <Link to="/guides" className={btnSecondary}>
          {t('guide.backAll')}
        </Link>
      </div>
    );
  }

  const institution = getInstitution(procedure.institutionId);
  const counts = docCounts(procedure, docs);
  const meaningOf = (value: Localized | undefined) => loc(value);
  const clarification = phrases.find((p) => p.id === 'clarification');
  const thanks = phrases.find((p) => p.id === 'thanks');
  const procedureRo = procedure.title.ro ?? procedure.title.en;
  const today = formatDate(todayIso(), language);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to={`/guides/${procedure.id}`} state={{ from: guideOrigin }} className={`${linkClass} inline-flex items-center gap-1`}>
          <Icon name="arrow" className="size-4 rotate-180 rtl:rotate-0" /> {t('kit.backToGuide')}
        </Link>
        <button type="button" className={btnPrimary} onClick={() => window.print()}>
          <Icon name="printer" className="size-4" />
          {t('kit.print')}
        </button>
      </div>

      <header className="flex items-center gap-3 border-b-4 border-sun-400 pb-4">
        <LogoMark className="size-12 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-muted">
            <Wordmark className="text-brand-900" /> · {t('kit.title')}
          </p>
          <h1 className="text-2xl font-bold leading-tight text-brand-900 sm:text-3xl">{loc(procedure.title)}</h1>
          {language !== 'ro' ? (
            <p lang="ro" dir="ltr" className="text-sm text-muted">
              {procedureRo}
            </p>
          ) : null}
        </div>
      </header>
      <p className="no-print text-muted">{t('kit.subtitle')}</p>

      <KitSection title={t('kit.sayTitle')}>
        {clarification ? <RoLine ro={clarification.ro} pron={clarification.pron} meaning={meaningOf(clarification.meaning)} /> : null}
        <RoLine
          ro={`Aș dori să aflu ce este necesar pentru: ${procedureRo}.`}
          pron={null}
          meaning={t('kit.sayProcedureMeaning', { title: loc(procedure.title) })}
        />
        {thanks ? <RoLine ro={thanks.ro} pron={thanks.pron} meaning={meaningOf(thanks.meaning)} /> : null}
      </KitSection>

      <KitSection title={t('kit.whereTitle')}>
        {institution && (institution.address || institution.phone || institution.hours) ? (
          <div className="rounded-lg border border-slate-300 bg-white p-4 text-sm">
            <p className="font-bold text-ink">{loc(institution.name)}</p>
            {institution.address ? <p className="mt-1">{institution.address}</p> : null}
            {institution.phone ? (
              <p dir="ltr" className="mt-1">
                {institution.phone}
              </p>
            ) : null}
            {institution.hours ? <p className="mt-1">{loc(institution.hours)}</p> : null}
            <p className="mt-2 text-xs text-muted">{loc(institution.verifiedNote)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('kit.whereNone')}</p>
        )}
      </KitSection>

      <KitSection title={t('kit.bringTitle')}>
        <p className="text-sm text-muted">
          {t('docs.progress', { ready: counts.ready, total: counts.total })}. {t('kit.bringNote')}
        </p>
        <ul className="space-y-2">
          {procedure.documents.map((doc, index) => (
            <li key={doc.name.en} className="print-card flex items-start gap-3 rounded-lg border border-slate-300 bg-white p-3">
              <input
                type="checkbox"
                id={`kit-doc-${index}`}
                checked={isDocReady(docs, procedure.id, doc.name.en)}
                onChange={() => toggleDoc(procedure.id, doc.name.en)}
                className="mt-1 size-5 shrink-0 accent-brand-700"
              />
              <label htmlFor={`kit-doc-${index}`} className="cursor-pointer text-sm font-medium">
                {loc(doc.name)}
              </label>
            </li>
          ))}
        </ul>
      </KitSection>

      <KitSection title={t('kit.askTitle')}>
        <div className="space-y-3">
          {kitQuestions.map((q) => (
            <RoLine key={q.id} ro={q.ro} pron={q.pron} meaning={meaningOf(q.meaning)} />
          ))}
        </div>
      </KitSection>

      <KitSection title={t('kit.notesTitle')}>
        <div aria-hidden="true" className="space-y-6 pt-4">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="border-b border-slate-400" />
          ))}
        </div>
      </KitSection>

      <footer className="print-card border-t border-slate-300 pt-3 text-xs text-muted">
        <p>{t('kit.disclaimer')}</p>
        <p className="mt-1">
          {t('kit.printedOn', { date: today })} · {t('guide.lastChecked', { date: procedure.lastVerified })}
        </p>
      </footer>
    </div>
  );
}
