// Reads the durable source-link status produced by scripts/check-sources.mjs.
// The scheduled checker runs outside the Vercel request lifecycle so its baseline
// survives cold starts and every visitor sees the same auditable result.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SourceRecord {
  title: string;
  url: string;
  kind: 'government' | 'university' | 'eu' | 'ngo';
  retrieved: string;
  note?: string;
}

export type SourceMonitorStatus = 'reachable' | 'updated' | 'unreachable' | 'pending';

export interface MonitoredSourceState {
  id: string;
  title: string;
  url: string;
  kind: SourceRecord['kind'];
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

const STATUS_FILE = join(process.cwd(), 'src', 'data', 'source-status.json');
const MAX_HTML_CHARS = 180_000;

export function loadSourceRegistry(): Record<string, SourceRecord> {
  const path = join(process.cwd(), 'src', 'data', 'sources.json');
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, SourceRecord>;
}

const ALLOWED_HOST_SUFFIXES = [
  'mai.gov.ro',
  'anaf.ro',
  'cnas.ro',
  'primariatm.ro',
  'europa.eu',
  'upt.ro',
  'uvt.ro',
  'umft.eu',
  'uav.ro',
  'umfcluj.ro',
  'grupullogs.ro',
  'workinromania.gov.ro',
  'inspectiamuncii.ro',
  'help.unhcr.org',
  'asylumineurope.org',
];

export function isOfficialAllowedUrl(rawUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function extractTextFromHtml(html: string): string {
  return html
    .slice(0, MAX_HTML_CHARS)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractHighlights(text: string): string[] {
  const found = new Set<string>();
  const phones = text.match(/(?:\+40|0)\s?(?:256|7\d{2})[\s.\-]?\d{3}[\s.\-]?\d{3}/g) ?? [];
  for (const phone of phones.slice(0, 2)) found.add(phone.trim());
  const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  for (const email of emails.slice(0, 2)) found.add(email.trim());
  const dates = text.match(/\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b/g) ?? [];
  for (const date of dates.slice(0, 2)) found.add(date.trim());
  return [...found];
}

function initialState(id: string, source: SourceRecord): MonitoredSourceState {
  return {
    id,
    title: source.title,
    url: source.url,
    kind: source.kind,
    status: 'pending',
    httpStatus: null,
    lastCheckedAt: null,
    lastChangedAt: null,
    lastModifiedHeader: null,
    contentHash: null,
    observedHash: null,
    highlights: [],
  };
}

/** Load the committed, reviewable monitor snapshot and reconcile it with the source registry. */
export function loadMonitorSnapshot(): MonitorSnapshot {
  const registry = loadSourceRegistry();
  let stored: Partial<MonitorSnapshot> = {};
  if (existsSync(STATUS_FILE)) {
    try {
      stored = JSON.parse(readFileSync(STATUS_FILE, 'utf8')) as Partial<MonitorSnapshot>;
    } catch {
      stored = {};
    }
  }

  const sources: Record<string, MonitoredSourceState> = {};
  for (const [id, source] of Object.entries(registry)) {
    const previous = stored.sources?.[id];
    sources[id] = previous && previous.url === source.url
      ? { ...initialState(id, source), ...previous, id, title: source.title, url: source.url, kind: source.kind }
      : initialState(id, source);
  }

  return {
    lastSweepAt: typeof stored.lastSweepAt === 'string' ? stored.lastSweepAt : null,
    sources,
  };
}
