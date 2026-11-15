import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { docCounts } from '../lib/docs';
import { Icon } from './Icon';
import { useI18n } from '../context/useI18n';
import type { ChecklistTask, Procedure, TaskNote, TaskStatus } from '../types';
import { Arrow, btnPrimary, btnSecondary, cardClass, inputClass, StatusBadge } from './ui';

const STATUSES: TaskStatus[] = ['not-started', 'in-progress', 'completed'];

interface TaskCardProps {
  task: ChecklistTask;
  status: TaskStatus;
  onStatusChange: (status: TaskStatus) => void;
  pendingDependencies: Procedure[];
}

export function TaskCard({ task, status, onStatusChange, pendingDependencies }: TaskCardProps) {
  const { t, loc } = useI18n();
  const location = useLocation();
  const { procedure, priority } = task;
  const selectId = `status-${procedure.id}`;
  const done = status === 'completed';
  const { docs } = useApp();
  const counts = docCounts(procedure, docs);

  const priorityReason = priority?.reason ? loc(priority.reason) : priority?.reasonKey ? t(`note.${priority.reasonKey}`) : '';
  // Only "high" and "low" priorities are shown; "normal" is the default and needs no badge.
  const priorityLevel = priority?.level === 'high' || priority?.level === 'low' ? priority.level : null;
  // "verifyApplies" is shown as a badge; the other notes are plain sentences.
  const sentenceNotes = task.notes.filter((n): n is Exclude<TaskNote, 'verifyApplies'> => n !== 'verifyApplies');

  return (
    <article className={`${cardClass} ${done ? 'bg-slate-50' : ''}`} aria-labelledby={`title-${procedure.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 id={`title-${procedure.id}`} className={`text-xl font-bold text-brand-900 ${done ? 'opacity-80' : ''}`}>
          {loc(procedure.title)}
        </h3>
        <StatusBadge status={status} />
      </div>

      {priorityLevel || task.relevance === 'verify' ? (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-base font-medium">
          {priorityLevel ? (
            <span className={priorityLevel === 'high' ? 'text-red-800' : 'text-muted'}>
              {priorityLevel === 'high' ? '▲ ' : '▽ '}
              {t(`priority.${priorityLevel}`)}
            </span>
          ) : null}
          {task.relevance === 'verify' ? (
            <span className="text-amber-900">
              <span aria-hidden="true">? </span>
              {t('relevance.verify')}
            </span>
          ) : null}
        </p>
      ) : null}

      <p className="mt-3">{loc(procedure.summary)}</p>

      {priorityLevel && priorityReason ? <p className="mt-2 text-muted">{t('priority.why', { reason: priorityReason })}</p> : null}

      {sentenceNotes.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {sentenceNotes.map((note) => (
            <li key={note} className="border-s-4 border-slate-300 ps-3 text-muted">
              {t(`note.${note}`)}
            </li>
          ))}
        </ul>
      ) : null}

      {counts.total > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-muted">
          <Icon name="file" className="size-4" />
          {t('docs.progress', { ready: counts.ready, total: counts.total })}
        </p>
      ) : null}

      {!done && pendingDependencies.length > 0 ? (
        <p className="mt-3 text-muted">{t('check.doFirst', { items: pendingDependencies.map((p) => loc(p.title)).join(', ') })}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link to={`/guides/${procedure.id}`} state={{ from: location.pathname }} className={btnPrimary}>
          {t('check.open')} <Arrow />
        </Link>
        <Link to={`/kit/${procedure.id}`} state={{ guideOrigin: location.pathname }} className={btnSecondary}>
          <Icon name="printer" className="size-4" />
          {t('kit.open')}
        </Link>
        <button type="button" className={btnSecondary} onClick={() => onStatusChange(done ? 'not-started' : 'completed')}>
          {done ? t('check.reopen') : t('check.markDone')}
        </button>
        <div className="ms-auto min-w-40">
          <label htmlFor={selectId} className="sr-only">
            {t('check.status')}
          </label>
          <select
            id={selectId}
            value={status}
            onChange={(event) => onStatusChange(event.target.value as TaskStatus)}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </article>
  );
}
