import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import { getInstitution, getProcedure, getSources } from '../data';
import { effectiveStatus } from '../lib/checklist';
import { AiError, translateLines } from '../lib/ai';
import { collectEnglishOnly, formatBatch, makeBatches, parseBatchReply } from '../lib/translate';
import { sessionData, STORAGE_KEYS } from '../lib/storage';
import { docCounts, isDocReady } from '../lib/docs';
import { Icon } from '../components/Icon';
import { Arrow, btnPrimary, btnSecondary, cardClass, inputClass, LevelBadge, LevelLegend, Notice, ProgressBar, StatusBadge, linkClass } from '../components/ui';
import type { Item, Localized, Procedure, TaskStatus } from '../types';

const STATUSES: TaskStatus[] = ['not-started', 'in-progress', 'completed'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-6">
      <h2 className="text-xl font-bold text-brand-900">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function allItems(p: Procedure): Item[] {
  return [
    ...p.steps,
    ...p.warnings,
    ...(p.processingTime ? [p.processingTime] : []),
    ...(p.deadline ? [p.deadline] : []),
  ];
}

export function GuideDetail() {
  const { id } = useParams<{ id: string }>();
  const { tasks, progress, setTaskStatus, lang, docs, toggleDoc } = useGuideContext();
  const { t, loc, isFallback } = useI18n();
  const procedure = id ? getProcedure(id) : undefined;

  // Reading the English-only details in the user's language (translated by the AI on request, kept for this visit).
  const [translations, setTranslations] = useState<Record<string, string>>(() => readCachedTranslations(lang));
  const [showTranslated, setShowTranslated] = useState(() => Object.keys(readCachedTranslations(lang)).length > 0);
  const [translating, setTranslating] = useState(false);
  const [translateFailed, setTranslateFailed] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    const cached = readCachedTranslations(lang);
    setTranslations(cached);
    setShowTranslated(Object.keys(cached).length > 0);
    setTranslateFailed(false);
  }, [lang]);

  if (!procedure) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-brand-900">{t('guide.notFound')}</h1>
        <Link to="/guides" className={btnSecondary}>
          {t('guide.backAll')}
        </Link>
      </div>
    );
  }

  const task = tasks.find((item) => item.procedure.id === procedure.id);
  const status = task ? effectiveStatus(task, progress) : (progress[procedure.id] ?? 'not-started');
  const institution = getInstitution(procedure.institutionId);
  const sources = getSources(procedure.sourceIds);
  const counts = docCounts(procedure, docs);

  // Which parts of this page are not available in the user's language?
  const englishOnly =
    lang !== 'en' &&
    (allItems(procedure).some((item) => isFallback(item.text)) ||
      procedure.documents.some((d) => isFallback(d.name) || isFallback(d.whereToGet)));

  const pending = collectEnglishOnly(procedure, lang);
  const missing = pending.filter((text) => !translations[text]);
  const translatedActive = showTranslated && Object.keys(translations).length > 0;
  /** Text for the page: the user's language if it exists, else the AI translation if shown, else English. */
  const tx = (value: Localized | undefined): string => {
    if (!value) return '';
    if (translatedActive && isFallback(value) && translations[value.en]) return translations[value.en];
    return loc(value);
  };

  async function translateDetails() {
    if (inFlight.current || missing.length === 0) {
      setShowTranslated(true);
      return;
    }
    inFlight.current = true;
    setTranslating(true);
    setTranslateFailed(false);
    try {
      const merged: Record<string, string> = { ...translations };
      for (const batch of makeBatches(missing)) {
        const reply = await translateLines({ lines: formatBatch(batch), language: lang });
        const parsed = parseBatchReply(reply);
        for (const entry of batch) {
          // The reply numbers are global positions in `missing`.
          const text = parsed.get(entry.index);
          if (text) merged[missing[entry.index]] = text;
        }
      }
      const got = missing.filter((text) => merged[text]).length;
      if (got === 0) throw new AiError('failed');
      setTranslations(merged);
      writeCachedTranslations(lang, merged);
      setShowTranslated(true);
      if (got < missing.length) setTranslateFailed(true);
    } catch {
      setTranslateFailed(true);
    } finally {
      inFlight.current = false;
      setTranslating(false);
    }
  }

  const sourceLabel = (ids: string[] | undefined) => {
    const found = getSources(ids);
    if (found.length === 0) return null;
    return (
      <span className="ms-2 text-xs text-muted">
        {found.map((s, i) => (
          <span key={s.url}>
            {i > 0 ? ', ' : ''}
            <a href={s.url} target="_blank" rel="noreferrer noopener" className={linkClass}>
              {s.title.length > 48 ? `${s.title.slice(0, 46)}…` : s.title}
            </a>
          </span>
        ))}
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/checklist" className={`${linkClass} inline-flex items-center gap-1`}>
        <Icon name="arrow" className="size-4 rotate-180 rtl:rotate-0" /> {t('guide.back')}
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">{loc(procedure.title)}</h1>
        <p className="mt-1 text-sm text-muted">{t('guide.lastChecked', { date: procedure.lastVerified })}</p>
      </header>

      <div>
        <Link to={`/kit/${procedure.id}`} className={btnSecondary}>
          <Icon name="printer" className="size-4" />
          {t('kit.open')}
        </Link>
      </div>

      {!task ? <Notice tone="warning">{t('guide.notRelevant')}</Notice> : null}
      {lang !== 'en' ? <Notice tone="info">{t('guide.translationNotice')}</Notice> : null}
      {englishOnly && !translatedActive ? <Notice tone="info">{t('guide.englishNotice')}</Notice> : null}
      {lang !== 'en' && pending.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3" aria-live="polite">
          {translatedActive ? (
            <>
              <p className="text-sm text-muted">{t('guide.translated')}</p>
              <button type="button" className={btnSecondary} onClick={() => setShowTranslated(false)}>
                {t('guide.showEnglish')}
              </button>
            </>
          ) : (
            <button type="button" className={btnPrimary} onClick={() => void translateDetails()} disabled={translating}>
              <Icon name="globe" className="size-4" />
              {translating ? t('guide.translating') : t('guide.translate')}
            </button>
          )}
          {translateFailed ? (
            <p role="alert" className="text-sm font-semibold text-red-800">
              {t('guide.translateError')}
            </p>
          ) : null}
        </div>
      ) : null}
      {allItems(procedure).some((item) => item.level === 'confirm') || procedure.documents.some((d) => d.level === 'confirm') ? (
        <Notice tone="info">{t('guide.confirmNote')}</Notice>
      ) : null}

      <LevelLegend />

      <section className={`${cardClass} flex flex-wrap items-end justify-between gap-4`}>
        <div>
          <h2 className="text-base font-bold text-brand-900">{t('guide.status')}</h2>
          <div className="mt-2">
            <StatusBadge status={status} />
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44">
            <label htmlFor="guide-status" className="mb-1 block text-sm font-semibold text-muted">
              {t('check.status')}
            </label>
            <select
              id="guide-status"
              value={status}
              onChange={(event) => setTaskStatus(procedure.id, event.target.value as TaskStatus)}
              className={inputClass}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={btnPrimary}
            onClick={() => setTaskStatus(procedure.id, status === 'completed' ? 'not-started' : 'completed')}
          >
            {status === 'completed' ? t('check.reopen') : t('check.markDone')}
          </button>
        </div>
      </section>

      <Section title={t('guide.s1')}>
        <p>{loc(procedure.summary)}</p>
      </Section>

      <Section title={t('guide.s2')}>
        <p>{loc(procedure.why)}</p>
      </Section>

      <Section title={t('guide.s3')}>
        <p>{loc(procedure.whoNeeds)}</p>
        <h3 className="font-semibold text-brand-900">{t('guide.s3.not')}</h3>
        <p>{loc(procedure.whoDoesNot)}</p>
      </Section>

      <Section title={t('guide.s4')}>
        <div>
          <p className="font-semibold text-brand-900" data-testid="docs-progress">
            {t('docs.progress', { ready: counts.ready, total: counts.total })}
          </p>
          <div className="mt-2">
            <ProgressBar percent={counts.total ? Math.round((counts.ready / counts.total) * 100) : 0} label={t('guide.s4')} />
          </div>
          <p className="mt-2 text-sm text-muted">{t('docs.hint')}</p>
        </div>
        {counts.total > 0 && counts.ready === counts.total ? <Notice role="status">{t('docs.allReady')}</Notice> : null}
        <ul className="space-y-3">
          {procedure.documents.map((doc, index) => {
            const ready = isDocReady(docs, procedure.id, doc.name.en);
            return (
              <li
                key={doc.name.en}
                className={`rounded-lg border p-3 transition-colors ${ready ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id={`doc-${index}`}
                    checked={ready}
                    onChange={() => toggleDoc(procedure.id, doc.name.en)}
                    className="mt-1 size-5 shrink-0 accent-brand-700"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <label htmlFor={`doc-${index}`} className="cursor-pointer font-semibold">
                        {tx(doc.name)}
                      </label>
                      <LevelBadge level={doc.level} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      <span className="font-semibold">{t('guide.getAt')}:</span> {tx(doc.whereToGet)}
                      {sourceLabel(doc.sourceIds)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={t('guide.s6')}>
        <p>{loc(procedure.submitWhere)}</p>
        {institution ? (
          <p className="text-sm">
            <span className="font-semibold">{t('guide.institution')}:</span>{' '}
            <Link to={`/institutions?focus=${encodeURIComponent(institution.id)}`} className={linkClass}>
              {loc(institution.name)}
            </Link>
            {institution.address ? ` — ${institution.address}` : ''}
          </p>
        ) : null}
      </Section>

      <Section title={t('guide.s7')}>
        <ol className="space-y-3">
          {procedure.steps.map((step, index) => (
            <li key={step.text.en} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-700 text-sm font-bold text-white">
                {index + 1}
              </span>
              <div>
                <p>{tx(step.text)}</p>
                <div className="mt-1 flex flex-wrap items-center">
                  <LevelBadge level={step.level} />
                  {sourceLabel(step.sourceIds)}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t('guide.s8')}>
        {procedure.processingTime ? (
          <div>
            <p>{tx(procedure.processingTime.text)}</p>
            <div className="mt-1 flex flex-wrap items-center">
              <LevelBadge level={procedure.processingTime.level} />
              {sourceLabel(procedure.processingTime.sourceIds)}
            </div>
          </div>
        ) : (
          <p className="text-muted">{t('guide.unverified')}</p>
        )}
        {procedure.deadline ? (
          <div className="border-s-4 border-amber-500 ps-4">
            <p className="font-semibold text-brand-900">{t('guide.s8.deadline')}</p>
            <p>{tx(procedure.deadline.text)}</p>
            <div className="mt-1 flex flex-wrap items-center">
              <LevelBadge level={procedure.deadline.level} />
              {sourceLabel(procedure.deadline.sourceIds)}
            </div>
          </div>
        ) : null}
      </Section>

      <Section title={t('guide.s9')}>
        <ul className="space-y-3">
          {procedure.warnings.map((warning) => (
            <li key={warning.text.en} className="border-s-4 border-slate-300 ps-4">
              <p>{tx(warning.text)}</p>
              <div className="mt-1 flex flex-wrap items-center">
                <LevelBadge level={warning.level} />
                {sourceLabel(warning.sourceIds)}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('guide.s10')}>
        <ul className="space-y-2">
          {sources.map((source) => (
            <li key={source.url} className="text-sm">
              <a href={source.url} target="_blank" rel="noreferrer noopener" className={linkClass}>
                {source.title}
              </a>
              <span className="ms-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                {t(`guide.sourceKind.${source.kind}`)}
              </span>
              <span className="ms-2 text-xs text-muted">{t('guide.retrieved', { date: source.retrieved })}</span>
              {source.note ? <p className="mt-0.5 text-xs text-muted">{source.note}</p> : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t('guide.sourceNote')}</p>
      </Section>

      <div className="flex flex-wrap gap-3">
        <Link to={`/assistant?procedure=${procedure.id}`} className={btnPrimary}>
          {t('guide.askAi')} <Arrow />
        </Link>
        <Link to="/helper" className={btnSecondary}>
          {t('guide.helper')}
        </Link>
        <Link to="/checklist" className={btnSecondary}>
          {t('guide.back')}
        </Link>
      </div>
    </div>
  );
}

function useGuideContext() {
  const app = useApp();
  return {
    tasks: app.tasks,
    progress: app.progress,
    setTaskStatus: app.setTaskStatus,
    lang: app.language,
    docs: app.docs,
    toggleDoc: app.toggleDoc,
  };
}

/** Translations made during this visit (browser tab), per language: English text to translated text. */
function readCachedTranslations(lang: string): Record<string, string> {
  const all = sessionData.read<Record<string, Record<string, string>>>(STORAGE_KEYS.translations, {});
  const mine = all && typeof all === 'object' ? all[lang] : undefined;
  return mine && typeof mine === 'object' ? mine : {};
}

function writeCachedTranslations(lang: string, value: Record<string, string>): void {
  const all = sessionData.read<Record<string, Record<string, string>>>(STORAGE_KEYS.translations, {});
  sessionData.write(STORAGE_KEYS.translations, { ...(all && typeof all === 'object' ? all : {}), [lang]: value });
}
