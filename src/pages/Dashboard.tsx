import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import { buildPlan, formatDate, todayIso } from '../lib/plan';
import { docCounts } from '../lib/docs';
import { effectiveStatus, nextUp, pendingDependencies, timeSensitive } from '../lib/checklist';
import { Arrow, btnSecondary, cardClass, LevelBadge, Notice, PageHeader, ProgressRing, StatusBadge } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { TaskCard } from '../components/TaskCard';
import { HumanHelpCard } from '../components/HumanHelpCard';
import type { MessageKey } from '../i18n';

const QUICK_LINKS: Array<{ to: string; key: MessageKey; icon: IconName }> = [
  { to: '/plan', key: 'dash.quick.plan', icon: 'calendar' },
  { to: '/guides', key: 'dash.quick.guides', icon: 'book' },
  { to: '/assistant', key: 'dash.quick.assistant', icon: 'sparkles' },
  { to: '/helper', key: 'dash.quick.helper', icon: 'chat' },
  { to: '/institutions', key: 'dash.quick.institutions', icon: 'building' },
];

export function Dashboard() {
  const { tasks, progress, summary, setTaskStatus, dates, docs, language, user } = useApp();
  const { t, loc } = useI18n();

  const upcoming = nextUp(tasks, progress, 3);
  const hero = upcoming[0];
  const rest = upcoming.slice(1);
  const dated = timeSensitive(tasks, progress);
  const allDone = tasks.length > 0 && summary.remaining === 0;
  const plan = buildPlan(tasks, progress, dates, todayIso());
  const heroPlan = hero ? plan.find((item) => item.task.procedure.id === hero.procedure.id) : undefined;
  const heroDocs = hero ? docCounts(hero.procedure, docs) : null;

  return (
    <div className="space-y-8">
      <PageHeader title={t('dash.welcome')} subtitle={t('dash.welcome.sub')} />

      <section aria-labelledby="progress-title" className={`${cardClass} flex flex-wrap items-center gap-6 sm:gap-8`}>
        <ProgressRing percent={summary.percent} label={t('dash.progress')} />
        <div className="min-w-56 flex-1">
          <h2 id="progress-title" className="text-lg font-bold text-brand-900">
            {t('dash.progress')}
          </h2>
          <p className="text-sm font-semibold text-muted">{t('dash.percent', { percent: summary.percent })}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-emerald-50 p-3">
              <dd className="text-3xl font-extrabold text-emerald-900" data-testid="count-completed">
                {summary.completed}
              </dd>
              <dt className="text-sm font-semibold text-emerald-900">{t('dash.completed')}</dt>
            </div>
            <div className="rounded-xl bg-brand-50 p-3">
              <dd className="text-3xl font-extrabold text-brand-900" data-testid="count-remaining">
                {summary.remaining}
              </dd>
              <dt className="text-sm font-semibold text-brand-900">{t('dash.remaining')}</dt>
            </div>
          </dl>
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

          <article
            aria-labelledby={`title-${hero.procedure.id}`}
            className="keep-light overflow-hidden rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 p-6 text-white shadow-lg sm:p-8"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={effectiveStatus(hero, progress)} />
              {hero.priority?.level === 'high' ? (
                <span className="rounded-full bg-sun-400 px-2.5 py-0.5 text-xs font-bold text-brand-900">{t('priority.high')}</span>
              ) : null}
              {hero.relevance === 'verify' ? (
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">{t('relevance.verify')}</span>
              ) : null}
            </div>
            <h3 id={`title-${hero.procedure.id}`} className="mt-3 text-2xl font-extrabold sm:text-3xl">
              {loc(hero.procedure.title)}
            </h3>
            <p className="mt-2 max-w-2xl text-white/90">{loc(hero.procedure.summary)}</p>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/90">
              {heroPlan ? (
                <li className="flex items-center gap-1.5">
                  <Icon name="calendar" className="size-4" />
                  {t('dash.suggestedBy', { date: formatDate(heroPlan.date, language) })}
                </li>
              ) : (
                <li>
                  <Link to="/plan" className="font-semibold underline underline-offset-2">
                    {t('dash.addDates')}
                  </Link>
                </li>
              )}
              {heroDocs && heroDocs.total > 0 ? (
                <li className="flex items-center gap-1.5">
                  <Icon name="file" className="size-4" />
                  {t('docs.progress', { ready: heroDocs.ready, total: heroDocs.total })}
                </li>
              ) : null}
            </ul>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to={`/guides/${hero.procedure.id}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-base font-semibold text-brand-900 hover:bg-brand-50"
              >
                {t('check.open')} <Arrow />
              </Link>
              <Link
                to={`/kit/${hero.procedure.id}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/70 px-5 py-2.5 text-base font-semibold text-white hover:bg-white/10"
              >
                <Icon name="printer" className="size-4" />
                {t('kit.open')}
              </Link>
            </div>
          </article>

          {rest.length > 0 ? (
            <>
              <h3 className="pt-2 text-base font-bold text-brand-900">{t('dash.next.also')}</h3>
              <div className="stagger grid gap-4">
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
        <section aria-labelledby="time-title" className={`${cardClass} border-amber-300 bg-amber-50`}>
          <h2 id="time-title" className="flex items-center gap-2 text-lg font-bold text-amber-950">
            <Icon name="alert" className="size-5" />
            {t('dash.upcoming')}
          </h2>
          <p className="mt-1 text-sm text-amber-950">{t('dash.upcoming.note')}</p>
          <ul className="mt-3 space-y-3">
            {dated.map((task) => (
              <li key={task.procedure.id} className="rounded-xl bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/guides/${task.procedure.id}`} className="font-semibold text-brand-800 underline">
                    {loc(task.procedure.title)}
                  </Link>
                  <StatusBadge status={effectiveStatus(task, progress)} />
                  {task.procedure.deadline ? <LevelBadge level={task.procedure.deadline.level} /> : null}
                </div>
                <p className="mt-1 text-sm">{loc(task.procedure.deadline?.text)}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <HumanHelpCard />

      <section aria-labelledby="quick-title">
        <h2 id="quick-title" className="text-xl font-bold text-brand-900">
          {t('dash.quick')}
        </h2>
        <ul className="stagger mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className={`${cardClass} card-lift flex items-center gap-3 font-semibold text-brand-900 hover:border-brand-500`}>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                  <Icon name={link.icon} />
                </span>
                <span>{t(link.key)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm text-muted">{user ? t('set.data.bodyCloud') : t('dash.storage')}</p>
    </div>
  );
}
