import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import {
  buildIcs,
  buildPlan,
  daysBetween,
  formatDate,
  hasErrors,
  todayIso,
  validateDates,
  type PlanDates,
} from '../lib/plan';
import { btnPrimary, btnSecondary, cardClass, inputClass, LevelBadge, Notice, PageHeader, StatusBadge } from '../components/ui';
import { Icon } from '../components/Icon';
import type { MessageKey } from '../i18n';

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Plan() {
  const { tasks, progress, dates, setDates, language } = useApp();
  const { t, loc } = useI18n();
  const location = useLocation();
  const [draft, setDraft] = useState<PlanDates>(dates);
  const [touched, setTouched] = useState({ arrival: false, expiry: false });

  useEffect(() => {
    setDraft(dates);
  }, [dates.arrival, dates.expiry]);

  const errors = validateDates(draft);
  const today = todayIso();
  const plan = useMemo(() => buildPlan(tasks, progress, dates, today), [tasks, progress, dates, today]);
  const open = plan.filter((item) => item.status !== 'completed');

  function update(next: PlanDates, field: 'arrival' | 'expiry') {
    setDraft(next);
    setTouched((current) => ({ ...current, [field]: true }));
    const problems = validateDates(next);
    // Save only valid input (or a cleared arrival date), so a half-typed date never breaks the plan.
    if (!hasErrors(problems) || next.arrival === '') setDates(next.arrival === '' ? { arrival: '', expiry: '' } : next);
  }

  const errorText = (problem: string | undefined): MessageKey | null =>
    problem === 'required'
      ? 'plan.error.required'
      : problem === 'invalid'
        ? 'plan.error.invalid'
        : problem === 'beforeArrival'
          ? 'plan.error.before'
          : null;
  const arrivalError = touched.arrival ? errorText(errors.arrival) : null;
  const expiryError = errorText(errors.expiry);

  function when(daysLeft: number): string {
    if (daysLeft === 0) return t('plan.when.today');
    if (daysLeft === 1) return t('plan.when.tomorrow');
    if (daysLeft === -1) return t('plan.when.yesterday');
    return daysLeft > 0 ? t('plan.when.future', { days: daysLeft }) : t('plan.when.past', { days: Math.abs(daysLeft) });
  }

  function exportCalendar() {
    const events = open.map((item) => {
      const extra = item.latestBy ? ` ${t('plan.latestBy', { date: item.latestBy })}` : '';
      return {
        uid: `${item.task.procedure.id}-${item.date}@welcomero`,
        date: item.date,
        summary: t('plan.event.summary', { title: loc(item.task.procedure.title) }),
        description: `${t('plan.event.desc')}${extra}`,
      };
    });
    downloadFile('welcomero-plan.ics', buildIcs(events), 'text/calendar;charset=utf-8');
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('plan.title')} subtitle={t('plan.subtitle')} />

      <section className={`${cardClass} grid gap-5 sm:grid-cols-2`} aria-label={t('plan.title')}>
        <div>
          <label htmlFor="plan-arrival" className="mb-1 block text-sm font-semibold text-brand-900">
            {t('plan.arrival')}
          </label>
          <input
            id="plan-arrival"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={draft.arrival}
            aria-invalid={Boolean(arrivalError)}
            aria-describedby={arrivalError ? 'plan-arrival-error' : undefined}
            onChange={(event) => update({ ...draft, arrival: event.target.value }, 'arrival')}
            onBlur={() => setTouched((c) => ({ ...c, arrival: true }))}
            className={inputClass}
          />
          {arrivalError ? (
            <p id="plan-arrival-error" role="alert" className="mt-1 text-sm font-semibold text-red-800">
              {t(arrivalError)}
            </p>
          ) : null}
        </div>
        <div>
          <label htmlFor="plan-expiry" className="mb-1 block text-sm font-semibold text-brand-900">
            {t('plan.expiry')}
          </label>
          <input
            id="plan-expiry"
            type="date"
            min="2000-01-01"
            max="2100-12-31"
            value={draft.expiry}
            aria-invalid={Boolean(expiryError)}
            aria-describedby={expiryError ? 'plan-expiry-error' : 'plan-expiry-help'}
            onChange={(event) => update({ ...draft, expiry: event.target.value }, 'expiry')}
            className={inputClass}
          />
          {expiryError ? (
            <p id="plan-expiry-error" role="alert" className="mt-1 text-sm font-semibold text-red-800">
              {t(expiryError)}
            </p>
          ) : (
            <p id="plan-expiry-help" className="mt-1 text-xs text-muted">
              {t('plan.expiry.help')}
            </p>
          )}
        </div>
      </section>

      <Notice tone="info">{t('plan.disclaimer')}</Notice>

      {plan.length === 0 ? (
        <div className={`${cardClass} text-center`}>
          <p className="text-muted">{t('plan.empty')}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={btnPrimary} onClick={exportCalendar} disabled={open.length === 0}>
              <Icon name="download" className="size-4" />
              {t('plan.export')}
            </button>
            <p className="text-sm text-muted">{t('plan.export.note')}</p>
          </div>

          <ol className=" space-y-4" data-testid="plan-list">
            {plan.map((item) => {
              const done = item.status === 'completed';
              const urgent = item.latestBy && !done && daysBetween(today, item.latestBy) < 0;
              return (
                <li
                  key={item.task.procedure.id}
                  data-date={item.date}
                  className={`${cardClass} flex flex-col gap-4 sm:flex-row ${done ? 'bg-slate-50 opacity-80' : ''} ${item.pastDue ? 'border-amber-400' : ''}`}
                >
                  <div className="shrink-0 rounded-lg bg-brand-50 px-4 py-3 text-center sm:w-44">
                    <p className="text-sm font-semibold text-brand-800">{t('plan.target')}</p>
                    <time dateTime={item.date} className="mt-0.5 block text-base font-bold text-brand-900">
                      {formatDate(item.date, language)}
                    </time>
                    {!done ? <p className="text-sm text-muted">{when(item.daysLeft)}</p> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-brand-900">
                        <Link to={`/guides/${item.task.procedure.id}`} state={{ from: location.pathname }} className="hover:underline">
                          {loc(item.task.procedure.title)}
                        </Link>
                      </h2>
                      <StatusBadge status={item.status} />
                      {item.pastDue ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                          {t('plan.pastDue')}
                        </span>
                      ) : null}
                    </div>
                    {item.basis === 'expiry' ? <p className="mt-1 text-sm text-muted">{t('plan.basis.expiry')}</p> : null}
                    {item.latestBy ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <span>{t('plan.latestBy', { date: formatDate(item.latestBy, language) })}</span>
                        <LevelBadge level="confirm" />
                      </div>
                    ) : null}
                    {urgent ? (
                      <div className="mt-2">
                        <Notice tone="error" role="alert">
                          {t('plan.expiryUrgent')}
                        </Notice>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link to={`/guides/${item.task.procedure.id}`} state={{ from: location.pathname }} className={btnSecondary}>
                        {t('check.open')}
                      </Link>
                      <Link to={`/kit/${item.task.procedure.id}`} className={btnSecondary}>
                        <Icon name="printer" className="size-4" />
                        {t('kit.open')}
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
