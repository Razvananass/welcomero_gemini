// Browser client for the durable administrative-source status endpoint.

export type SourceMonitorStatus = 'reachable' | 'updated' | 'unreachable' | 'pending';

export interface MonitoredSourceState {
  id: string;
  title: string;
  url: string;
  kind: 'government' | 'university' | 'eu' | 'ngo';
  status: SourceMonitorStatus;
  httpStatus: number | null;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  lastModifiedHeader: string | null;
  contentHash: string | null;
  observedHash: string | null;
  highlights: string[];
}

export interface MonitorSnapshot {
  lastSweepAt: string | null;
  sources: Record<string, MonitoredSourceState>;
}

export async function fetchMonitorSnapshot(): Promise<MonitorSnapshot | null> {
  try {
    const response = await fetch('/api/sources-monitor', {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
    });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.includes('application/json')) return null;
    return (await response.json()) as MonitorSnapshot;
  } catch {
    return null;
  }
}
