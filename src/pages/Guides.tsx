import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import { procedures } from '../data';
import { effectiveStatus } from '../lib/checklist';
import { PageHeader, StatusBadge } from '../components/ui';
import { SourceMonitorCard } from '../components/SourceMonitorCard';
import type { Procedure } from '../types';

export function Guides() {
  const { tasks, progress } = useApp();
  const { t, loc } = useI18n();

  const relevantIds = new Set(tasks.map((task) => task.procedure.id));
  const relevant = procedures.filter((p) => relevantIds.has(p.id)).sort((a, b) => a.order - b.order);
  const other = procedures.filter((p) => !relevantIds.has(p.id)).sort((a, b) => a.order - b.order);

  function renderList(list: Procedure[], showStatus: boolean) {
    return (
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
        {list.map((procedure) => {
          const task = tasks.find((item) => item.procedure.id === procedure.id);
          return (
            <li key={procedure.id}>
              <Link to={`/guides/${procedure.id}`} className="block px-5 py-4 hover:bg-slate-50">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-lg font-bold text-brand-900">{loc(procedure.title)}</h3>
                  {showStatus && task ? <StatusBadge status={effectiveStatus(task, progress)} /> : null}
                </div>
                <p className="mt-1 text-muted">{loc(procedure.summary)}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader title={t('guides.title')} subtitle={t('guides.subtitle')} />
      {relevant.length > 0 ? (
        <section aria-labelledby="relevant-title" className="space-y-3">
          <h2 id="relevant-title" className="text-xl font-bold text-brand-900">
            {t('guides.relevant')}
          </h2>
          {renderList(relevant, true)}
        </section>
      ) : null}
      {other.length > 0 ? (
        <section aria-labelledby="other-title" className="space-y-3">
          <h2 id="other-title" className="text-xl font-bold text-brand-900">
            {t('guides.other')}
          </h2>
          {renderList(other, false)}
        </section>
      ) : null}
      <SourceMonitorCard />
    </div>
  );
}
