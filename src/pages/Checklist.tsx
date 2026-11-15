import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import { effectiveStatus, hasLimitedCoverage, pendingDependencies } from '../lib/checklist';
import { TaskCard } from '../components/TaskCard';
import { Notice, PageHeader, ProgressBar } from '../components/ui';
import type { MessageKey } from '../i18n';
import type { TaskStatus } from '../types';

type Filter = 'all' | 'todo' | 'progress' | 'done';

const FILTERS: Filter[] = ['all', 'todo', 'progress', 'done'];

function matches(filter: Filter, status: TaskStatus): boolean {
  if (filter === 'all') return true;
  if (filter === 'todo') return status === 'not-started';
  if (filter === 'progress') return status === 'in-progress';
  return status === 'completed';
}

export function Checklist() {
  const { tasks, progress, summary, profile, setTaskStatus } = useApp();
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');

  const visible = tasks.filter((task) => matches(filter, effectiveStatus(task, progress)));

  return (
    <div className="space-y-6">
      <PageHeader title={t('check.title')} subtitle={t('check.subtitle')} />

      <div>
        <p className="mb-2 text-base font-semibold text-brand-900">
          {t('check.progressOf', { done: summary.completed, total: summary.total })} · {t('dash.percent', { percent: summary.percent })}
        </p>
        <ProgressBar percent={summary.percent} label={t('dash.progress')} />
      </div>

      {profile && hasLimitedCoverage(profile) ? <Notice tone="warning">{t('check.coverage')}</Notice> : null}

      <div role="group" aria-label={t('check.status')} className="flex flex-wrap gap-2">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-10 rounded-lg border px-4 text-base font-medium ${
              filter === value ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-400 bg-white text-brand-900 hover:bg-brand-50'
            }`}
          >
            {t(`check.filter.${value}` as MessageKey)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-bold text-brand-900">{t('check.empty.title')}</p>
          <p className="text-muted">{t('check.empty')}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {visible.map((task) => (
            <TaskCard
              key={task.procedure.id}
              task={task}
              status={effectiveStatus(task, progress)}
              onStatusChange={(status) => setTaskStatus(task.procedure.id, status)}
              pendingDependencies={pendingDependencies(task, tasks, progress)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
