// API endpoint for WelcomeRO's official-source monitor.
//   GET  /api/sources-monitor -> returns current snapshot (initializes lazily if empty)
//   POST /api/sources-monitor -> runs a live sweep across allowlisted official sources (cooldown-protected)
import { loadMonitorSnapshot, refreshOfficialSources } from './_lib/sourcesMonitor.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export function GET(): Response {
  return json(loadMonitorSnapshot());
}

export async function POST(): Promise<Response> {
  const snapshot = await refreshOfficialSources({ force: false });
  return json(snapshot);
}
