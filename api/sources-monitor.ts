// Read-only endpoint for the durable source status produced by the scheduled checker.
import { loadMonitorSnapshot } from './_lib/sourcesMonitor.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
    },
  });
}

export function GET(): Response {
  return json(loadMonitorSnapshot());
}

export function POST(): Response {
  return json({ error: 'read_only_monitor' }, 405);
}
