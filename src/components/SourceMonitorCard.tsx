import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../context/useI18n';
import { LANGUAGES } from '../i18n';
import { fetchMonitorSnapshot, type MonitoredSourceState, type MonitorSnapshot, type SourceMonitorStatus } from '../lib/sourcesMonitor';
import { Icon } from './Icon';
import { cardClass, linkClass, Notice } from './ui';

const STATUS_BADGE: Record<SourceMonitorStatus, string> = {
  reachable: 'bg-emerald-100 text-emerald-900',
  updated: 'bg-amber-100 text-amber-900',
  unreachable: 'bg-slate-200 text-slate-800',
  pending: 'bg-slate-100 text-slate-700',
};

function formatTime(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  try {
    const locale = LANGUAGES.find((l) => l.code === lang)?.locale ?? 'en-GB';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function SourceMonitorCard() {
  const { t, lang } = useI18n();
  const [snapshot, setSnapshot] = useState<MonitorSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMonitorSnapshot().then((data) => {
      if (!cancelled && data) setSnapshot(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const list = useMemo<MonitoredSourceState[]>(() => (snapshot ? Object.values(snapshot.sources) : []), [snapshot]);
  const updatedList = useMemo(() => list.filter((source) => source.status === 'updated'), [list]);
  const formattedSweep = snapshot?.lastSweepAt ? formatTime(snapshot.lastSweepAt, lang) : null;

  if (!snapshot) return null;

  return (
    <section aria-labelledby="source-monitor-title" className={`${cardClass} space-y-4`}>
      <div>
        <h2 id="source-monitor-title" className="flex items-center gap-2 text-lg font-bold text-brand-900">
          <Icon name="shield" className="size-5 text-brand-700" />
          {t('monitor.title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('monitor.subtitle')}</p>
        <p className="mt-1 text-xs font-medium text-muted">
          {formattedSweep ? t('monitor.lastChecked', { date: formattedSweep }) : t('monitor.never')}
        </p>
      </div>

      {updatedList.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-950">{t('monitor.updatesTitle')}</h3>
          <ul className="space-y-2">
            {updatedList.map((item) => (
              <li key={item.id} className="text-sm text-amber-950">
                <a href={item.url} target="_blank" rel="noreferrer noopener" className={linkClass}>
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <Notice tone="info">{t('monitor.noUpdates')}</Notice>
      )}

      <details className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-brand-900">
          {t('monitor.viewSources', { count: list.length })}
        </summary>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {list.map((source) => (
            <li key={source.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <a href={source.url} target="_blank" rel="noreferrer noopener" className={`${linkClass} text-xs font-semibold`}>
                  {source.title}
                </a>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[source.status as SourceMonitorStatus]}`}>
                  {t(`monitor.status.${source.status}`)}
                </span>
              </div>
              {source.highlights.length > 0 ? (
                <p className="mt-1.5 text-xs text-muted" dir="ltr">
                  {source.highlights.join(' · ')}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
