import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import { buildPlan, formatDate, todayIso } from '../lib/plan';
import { docCounts } from '../lib/docs';
import { effectiveStatus, nextUp, pendingDependencies, timeSensitive } from '../lib/checklist';
import { Arrow, btnSecondary, cardClass, inputClass, LevelBadge, Notice, PageHeader, ProgressBar, StatusBadge } from '../components/ui';
import { Icon } from '../components/Icon';
import { TaskCard } from '../components/TaskCard';
import { HumanHelpCard } from '../components/HumanHelpCard';
import { SafetyCard } from '../components/SafetyCard';
import type { MessageKey } from '../i18n';
import type { TaskStatus } from '../types';

const STATUSES: TaskStatus[] = ['not-started', 'in-progress', 'completed'];

const QUICK_LINKS: Array<{ to: string; key: MessageKey }> = [
  { to: '/plan', key: 'dash.quick.plan' },
  { to: '/guides', key: 'dash.quick.guides' },
  { to: '/counter', key: 'dash.quick.counter' },
  { to: '/assistant', key: 'dash.quick.assistant' },
  { to: '/practice', key: 'dash.quick.practice' },
  { to: '/helper', key: 'dash.quick.helper' },
  { to: '/institutions', key: 'dash.quick.institutions' },
];

export function Dashboard() {
  const { tasks, progress, summary, setTaskStatus, dates, docs, language, user } = useApp();
  const { t, loc } = useI18n();
  const location = useLocation();
  const guideState = { from: location.pathname };

  const upcoming = nextUp(tasks, progress, 3);
  const hero = upcoming[0];
  const rest = upcoming.slice(1);
  const dated = timeSensitive(tasks, progress);
  const allDone = tasks.length > 0 && summary.remaining === 0;
  const plan = buildPlan(tasks, progress, dates, todayIso());
  const heroPlan = hero ? plan.find((item) => item.task.procedure.id === hero.procedure.id) : undefined;
  const heroDocs = hero ? docCounts(hero.procedure, docs) : null;

  return (
    <div className="space-y-10">
      <PageHeader title={t('dash.welcome')} subtitle={t('dash.welcome.sub')} />

      <section aria-labelledby="progress-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="progress-title" className="text-xl font-bold text-brand-900">
            {t('dash.progress')}
          </h2>
          <p className="text-base text-muted">
            {t('check.progressOf', { done: summary.completed, total: summary.total })} · {t('dash.percent', { percent: summary.percent })}
          </p>
        </div>
        <div className="mt-3">
          <ProgressBar percent={summary.percent} label={t('dash.progress')} />
        </div>
      </section>

      {tasks.length === 0 ? (
        <Notice tone="warning">
          {t('dash.empty')}{' '}
          <Link to="/guides" className="font-semibold underline">
            {t('nav.guides')}
          </Link>
        </Notice>
      ) : null}

      {allDone ? <Notice role="status">{t('dash.allDone')}</Notice> : null}

      {hero ? (
        <section aria-labelledby="next-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="next-title" className="text-xl font-bold text-brand-900">
              {t('dash.next.hero')}
            </h2>
            <Link to="/checklist" className={btnSecondary}>
              {t('dash.viewAll')} <Arrow />
            </Link>
          </div>

          <article aria-labelledby={`title-${hero.procedure.id}`} className="keep-light rounded-lg bg-brand-800 p-6 text-white sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={effectiveStatus(hero, progress)} />
              {hero.priority?.level === 'high' ? (
                <span className="rounded bg-sun-400 px-2 py-0.5 text-sm font-semibold text-brand-900">{t('priority.high')}</span>
              ) : null}
              {hero.relevance === 'verify' ? (
                <span className="rounded bg-white/20 px-2 py-0.5 text-sm font-medium">{t('relevance.verify')}</span>
              ) : null}
            </div>
            <h3 id={`title-${hero.procedure.id}`} className="mt-3 text-2xl font-bold sm:text-3xl">
              {loc(hero.procedure.title)}
            </h3>
            <p className="mt-2 max-w-2xl text-white/90">{loc(hero.procedure.summary)}</p>
            {heroPlan ? (
              <p className="mt-3 flex items-center gap-1.5 text-base text-white/90">
                <Icon name="calendar" className="size-4" />
                {t('dash.suggestedBy', { date: formatDate(heroPlan.date, language) })}
              </p>
            ) : null}

            <ol className="mt-6 grid gap-3 md:grid-cols-2" aria-label={t('dash.flow.label')}>
              <li className="rounded-lg bg-white/10 p-4">
                <p className="text-sm font-bold text-sun-300">1</p>
                <h4 className="mt-1 text-lg font-bold">{t('dash.flow.understand')}</h4>
                <p className="mt-1 text-sm text-white/85">{t('dash.flow.understand.body')}</p>
                <Link
                  to={`/guides/${hero.procedure.id}`}
                  state={guideState}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 font-semibold underline underline-offset-2"
                >
                  {t('check.open')} <Arrow />
                </Link>
              </li>
              <li className="rounded-lg bg-white/10 p-4">
                <p className="text-sm font-bold text-sun-300">2</p>
                <h4 className="mt-1 text-lg font-bold">{t('dash.flow.documents')}</h4>
                <p className="mt-1 text-sm text-white/85">
                  {heroDocs && heroDocs.total > 0
                    ? t('docs.progress', { ready: heroDocs.ready, total: heroDocs.total })
                    : t('dash.flow.documents.body')}
                </p>
                <Link
                  to={`/guides/${hero.procedure.id}#documents`}
                  state={guideState}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 font-semibold underline underline-offset-2"
                >
                  {t('dash.flow.documents.open')} <Arrow />
                </Link>
              </li>
              <li className="rounded-lg bg-white/10 p-4">
                <p className="text-sm font-bold text-sun-300">3</p>
                <h4 className="mt-1 text-lg font-bold">{t('dash.flow.kit')}</h4>
                <p className="mt-1 text-sm text-white/85">{t('dash.flow.kit.body')}</p>
                <Link
                  to={`/kit/${hero.procedure.id}`}
                  state={{ guideOrigin: location.pathname }}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 font-semibold underline underline-offset-2"
                >
                  <Icon name="printer" className="size-4" />
                  {t('kit.open')}
                </Link>
              </li>
              <li className="rounded-lg bg-white/10 p-4">
                <p className="text-sm font-bold text-sun-300">4</p>
                <h4 className="mt-1 text-lg font-bold">{t('dash.flow.complete')}</h4>
                <p className="mt-1 text-sm text-white/85">{t('dash.flow.complete.body')}</p>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-40 flex-1">
                    <label htmlFor={`hero-status-${hero.procedure.id}`} className="sr-only">
                      {t('check.status')}
                    </label>
                    <select
                      id={`hero-status-${hero.procedure.id}`}
                      value={effectiveStatus(hero, progress)}
                      onChange={(event) => setTaskStatus(hero.procedure.id, event.target.value as TaskStatus)}
                      className={inputClass}
                    >
                      {STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t(`status.${status}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setTaskStatus(hero.procedure.id, effectiveStatus(hero, progress) === 'completed' ? 'not-started' : 'completed')
                    }
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/70 px-4 py-2 font-semibold hover:bg-white/10"
                  >
                    {effectiveStatus(hero, progress) === 'completed' ? t('check.reopen') : t('check.markDone')}
                  </button>
                </div>
              </li>
            </ol>
            {!heroPlan ? (
              <p className="mt-4 text-sm text-white/90">
                <Link to="/plan" className="font-semibold underline underline-offset-2">
                  {t('dash.addDates')}
                </Link>
              </p>
            ) : null}
          </article>

          {rest.length > 0 ? (
            <>
              <h3 className="pt-2 text-lg font-bold text-brand-900">{t('dash.next.also')}</h3>
              <div className="grid gap-4">
                {rest.map((task) => (
                  <TaskCard
                    key={task.procedure.id}
                    task={task}
                    status={effectiveStatus(task, progress)}
                    onStatusChange={(status) => setTaskStatus(task.procedure.id, status)}
                    pendingDependencies={pendingDependencies(task, tasks, progress)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {dated.length > 0 ? (
        <section aria-labelledby="time-title" className={`${cardClass} border-s-4 border-s-amber-500`}>
          <h2 id="time-title" className="flex items-center gap-2 text-xl font-bold text-brand-900">
            <Icon name="alert" className="size-5" />
            {t('dash.upcoming')}
          </h2>
          <p className="mt-1 text-muted">{t('dash.upcoming.note')}</p>
          <ul className="mt-4 divide-y divide-slate-200">
            {dated.map((task) => (
              <li key={task.procedure.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/guides/${task.procedure.id}`} state={guideState} className="font-semibold text-brand-800 underline">
                    {loc(task.procedure.title)}
                  </Link>
                  <StatusBadge status={effectiveStatus(task, progress)} />
                  {task.procedure.deadline ? <LevelBadge level={task.procedure.deadline.level} /> : null}
                </div>
                <p className="mt-1">{loc(task.procedure.deadline?.text)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="quick-title" className="border-t border-slate-200 pt-7">
        <h2 id="quick-title" className="text-base font-bold text-brand-900">
          {t('dash.quick')}
        </h2>
        <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {QUICK_LINKS.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className="flex min-h-10 items-center justify-between gap-3 rounded px-2 py-2 text-sm font-medium text-brand-800 hover:bg-slate-50">
                <span>{t(link.key)}</span>
                <Arrow />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <HumanHelpCard />
        <SafetyCard />
      </div>

      <p className="text-base text-muted">{user ? t('set.data.bodyCloud') : t('dash.storage')}</p>
    </div>
  );
}
