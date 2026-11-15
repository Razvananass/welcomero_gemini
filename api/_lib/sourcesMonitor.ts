// Official-source monitor: periodically checks ONLY allowlisted official HTTPS websites from src/data/sources.json,
// detects page updates via SHA-256 hashing + HTTP metadata, and summarizes verified changes with Gemini.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProviders } from './provider.js';

export interface SourceRecord {
  title: string;
  url: string;
  kind: 'government' | 'university' | 'eu' | 'ngo';
  retrieved: string;
  note?: string;
}

export type SourceMonitorStatus = 'verified_unchanged' | 'updated' | 'unreachable' | 'pending';

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
  snippet: string | null;
  highlights: string[];
  changeSummary: string | null;
}

export interface MonitorSnapshot {
  lastSweepAt: string | null;
  sources: Record<string, MonitoredSourceState>;
}

const SNAPSHOT_FILE = '/tmp/welcomero-source-snapshots.json';
const FETCH_TIMEOUT_MS = 6_500;
const MIN_SWEEP_COOLDOWN_MS = 30_000;
const MAX_HTML_CHARS = 180_000;

let memorySnapshot: MonitorSnapshot | null = null;
let inFlightSweep: Promise<MonitorSnapshot> | null = null;

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
  // Worker and refugee guides: the government hiring platform, the UN Refugee Agency's Romania help site,
  // and ECRE's Asylum Information Database. Exact hosts only, not whole domains.
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
  const withoutScripts = html
    .slice(0, MAX_HTML_CHARS)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');

  const text = withoutScripts
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

export function extractHighlights(text: string): string[] {
  const found = new Set<string>();
  const phones = text.match(/(?:\+40|0)\s?(?:256|7\d{2})[\s.\-]?\d{3}[\s.\-]?\d{3}/g) ?? [];
  for (const p of phones.slice(0, 2)) found.add(p.trim());

  const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  for (const e of emails.slice(0, 2)) found.add(e.trim());

  const dates = text.match(/\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b/g) ?? [];
  for (const d of dates.slice(0, 2)) found.add(d.trim());

  return [...found];
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 24);
}

function buildInitialSnapshot(registry: Record<string, SourceRecord>): MonitorSnapshot {
  const sources: Record<string, MonitoredSourceState> = {};
  for (const [id, src] of Object.entries(registry)) {
    sources[id] = {
      id,
      title: src.title,
      url: src.url,
      kind: src.kind,
      status: 'pending',
      httpStatus: null,
      lastCheckedAt: null,
      lastChangedAt: null,
      lastModifiedHeader: null,
      contentHash: null,
      snippet: null,
      highlights: [],
      changeSummary: null,
    };
  }
  return { lastSweepAt: null, sources };
}

export function loadMonitorSnapshot(): MonitorSnapshot {
  const registry = loadSourceRegistry();
  if (!memorySnapshot && existsSync(SNAPSHOT_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')) as MonitorSnapshot;
      if (parsed && typeof parsed === 'object' && parsed.sources) {
        memorySnapshot = parsed;
      }
    } catch {
      // Ignore corrupt tmp snapshot
    }
  }

  const base = buildInitialSnapshot(registry);
  if (!memorySnapshot) {
    memorySnapshot = base;
    return memorySnapshot;
  }

  // Reconcile against current registry so newly added/removed sources stay in sync.
  for (const [id, state] of Object.entries(base.sources)) {
    const prev = memorySnapshot.sources[id];
    if (prev && prev.url === state.url) {
      base.sources[id] = { ...prev, title: state.title, kind: state.kind };
    }
  }
  base.lastSweepAt = memorySnapshot.lastSweepAt;
  memorySnapshot = base;
  return memorySnapshot;
}

function saveMonitorSnapshot(snapshot: MonitorSnapshot): void {
  memorySnapshot = snapshot;
  try {
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch {
    // Non-writable filesystem fallback: keep in-memory only
  }
}

async function summarizeOfficialChange(args: {
  sourceTitle: string;
  url: string;
  previousSnippet: string;
  currentSnippet: string;
}): Promise<string | null> {
  const providers = getProviders();
  if (providers.length === 0) return null;

  const system =
    'You monitor official Romanian government and university webpages for welcomeRo. Compare the BEFORE and AFTER excerpts strictly and factually in 1-2 short plain sentences (max 45 words). Mention only concrete changes (phone, address, opening hours, deadlines, fees, or new notices). If only navigation/date tickers changed, say "Minor page refresh; core administrative details appear unchanged."';

  const prompt = `Source: ${args.sourceTitle} (${args.url})
BEFORE:
${args.previousSnippet.slice(0, 900)}

AFTER:
${args.currentSnippet.slice(0, 900)}`;

  for (const provider of providers) {
    try {
      return await provider.complete({
        system,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 120,
      });
    } catch {
      // Try next configured provider or return null
    }
  }
  return null;
}

async function checkOneSource(
  id: string,
  src: SourceRecord,
  prev: MonitoredSourceState | undefined,
  nowIso: string,
): Promise<MonitoredSourceState> {
  const baseState: MonitoredSourceState = prev ?? {
    id,
    title: src.title,
    url: src.url,
    kind: src.kind,
    status: 'pending',
    httpStatus: null,
    lastCheckedAt: null,
    lastChangedAt: null,
    lastModifiedHeader: null,
    contentHash: null,
    snippet: null,
    highlights: [],
    changeSummary: null,
  };

  if (!isOfficialAllowedUrl(src.url)) {
    return { ...baseState, status: 'unreachable', lastCheckedAt: nowIso };
  }

  const isPdf = /\.pdf($|\?)/i.test(src.url);

  try {
    const res = await fetch(src.url, {
      method: isPdf ? 'HEAD' : 'GET',
      redirect: 'follow',
      headers: {
        'user-agent': 'welcomeRo-source-monitor/1.0 (+https://welcomero.app)',
        accept: isPdf ? 'application/pdf,*/*' : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    // Guard against redirects leaving official allowlisted domains.
    if (res.url && !isOfficialAllowedUrl(res.url)) {
      return { ...baseState, status: 'unreachable', httpStatus: res.status, lastCheckedAt: nowIso };
    }

    const lastModifiedHeader = res.headers.get('last-modified') ?? res.headers.get('etag') ?? null;

    if (!res.ok) {
      return {
        ...baseState,
        status: 'unreachable',
        httpStatus: res.status,
        lastCheckedAt: nowIso,
      };
    }

    if (isPdf) {
      const changed = Boolean(baseState.lastModifiedHeader && lastModifiedHeader && baseState.lastModifiedHeader !== lastModifiedHeader);
      return {
        ...baseState,
        status: changed ? 'updated' : 'verified_unchanged',
        httpStatus: res.status,
        lastCheckedAt: nowIso,
        lastChangedAt: changed ? nowIso : baseState.lastChangedAt,
        lastModifiedHeader,
        changeSummary: changed
          ? `Official PDF header updated (${lastModifiedHeader}). Open the official document to confirm changes.`
          : baseState.changeSummary,
      };
    }

    const rawHtml = await res.text();
    const cleanText = extractTextFromHtml(rawHtml);
    const snippet = cleanText.slice(0, 1_400);
    const contentHash = sha256(cleanText);
    const highlights = extractHighlights(cleanText);

    const hasPriorHash = Boolean(baseState.contentHash);
    const hashChanged = hasPriorHash && baseState.contentHash !== contentHash;

    let changeSummary = baseState.changeSummary;
    if (hashChanged && baseState.snippet) {
      const summary = await summarizeOfficialChange({
        sourceTitle: src.title,
        url: src.url,
        previousSnippet: baseState.snippet,
        currentSnippet: snippet,
      });
      changeSummary = summary ?? 'Official webpage content changed since the previous check. Verify details on the official site.';
    }

    return {
      ...baseState,
      status: hashChanged ? 'updated' : 'verified_unchanged',
      httpStatus: res.status,
      lastCheckedAt: nowIso,
      lastChangedAt: hashChanged ? nowIso : baseState.lastChangedAt,
      lastModifiedHeader: lastModifiedHeader ?? baseState.lastModifiedHeader,
      contentHash,
      snippet,
      highlights,
      changeSummary,
    };
  } catch {
    return {
      ...baseState,
      status: 'unreachable',
      lastCheckedAt: nowIso,
    };
  }
}

export async function refreshOfficialSources(opts?: { force?: boolean }): Promise<MonitorSnapshot> {
  const current = loadMonitorSnapshot();

  if (!opts?.force && current.lastSweepAt) {
    const elapsed = Date.now() - Date.parse(current.lastSweepAt);
    if (!Number.isNaN(elapsed) && elapsed < MIN_SWEEP_COOLDOWN_MS) {
      return current;
    }
  }

  if (inFlightSweep) return inFlightSweep;

  inFlightSweep = (async () => {
    const registry = loadSourceRegistry();
    const nowIso = new Date().toISOString();
    const entries = Object.entries(registry);

    const results = await Promise.all(
      entries.map(([id, src]) => checkOneSource(id, src, current.sources[id], nowIso)),
    );

    const nextSources: Record<string, MonitoredSourceState> = {};
    for (const item of results) {
      nextSources[item.id] = item;
    }

    const updated: MonitorSnapshot = {
      lastSweepAt: nowIso,
      sources: nextSources,
    };
    saveMonitorSnapshot(updated);
    return updated;
  })().finally(() => {
    inFlightSweep = null;
  });

  return inFlightSweep;
}

/** Builds a concise block of live official-source check findings to enrich Gemini's context. */
export function getLiveUpdatesPromptBlock(): string {
  const snapshot = loadMonitorSnapshot();
  const updated = Object.values(snapshot.sources).filter((s) => s.status === 'updated' && s.changeSummary);
  if (updated.length === 0) return '';

  const lines = updated.map(
    (u) => `- ${u.title} (${u.url}, checked ${u.lastCheckedAt ?? 'recently'}): ${u.changeSummary}`,
  );
  return `\n=== LIVE OFFICIAL SOURCE UPDATES (auto-detected from allowlisted official pages) ===\n${lines.join('\n')}`;
}
