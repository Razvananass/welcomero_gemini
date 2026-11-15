#!/usr/bin/env node
/**
 * Check every allowlisted source used by WelcomeRO and update the durable status file.
 * This records reachability and content fingerprints only. It never changes procedure advice.
 * Run with --accept after a person has reviewed every reported source change.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const REGISTRY_FILE = new URL('../src/data/sources.json', import.meta.url);
const STATUS_FILE = new URL('../src/data/source-status.json', import.meta.url);
const ACCEPT_CHANGES = process.argv.includes('--accept');
const TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const CONCURRENCY = 5;

const ALLOWED_HOST_SUFFIXES = [
  'mai.gov.ro', 'anaf.ro', 'cnas.ro', 'primariatm.ro', 'europa.eu',
  'upt.ro', 'uvt.ro', 'umft.eu', 'uav.ro', 'umfcluj.ro', 'grupullogs.ro',
  'workinromania.gov.ro', 'inspectiamuncii.ro', 'help.unhcr.org', 'asylumineurope.org',
];

function allowed(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === 'https:' && ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function cleanHtml(html) {
  return html
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

function highlights(text) {
  const found = new Set();
  for (const value of (text.match(/(?:\+40|0)\s?(?:256|7\d{2})[\s.\-]?\d{3}[\s.\-]?\d{3}/g) ?? []).slice(0, 2)) found.add(value.trim());
  for (const value of (text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []).slice(0, 2)) found.add(value.trim());
  for (const value of (text.match(/\b\d{1,2}[./-]\d{1,2}[./-]20\d{2}\b/g) ?? []).slice(0, 2)) found.add(value.trim());
  return [...found];
}

async function readLimited(response) {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < MAX_RESPONSE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = MAX_RESPONSE_BYTES - size;
    chunks.push(value.length > remaining ? value.slice(0, remaining) : value);
    size += Math.min(value.length, remaining);
    if (value.length > remaining) await reader.cancel();
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return joined;
}

function emptyState(id, source) {
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

async function checkOne(id, source, previous, now) {
  const base = previous?.url === source.url ? { ...emptyState(id, source), ...previous, id, title: source.title, kind: source.kind } : emptyState(id, source);
  if (!allowed(source.url)) return { ...base, status: 'unreachable', lastCheckedAt: now };

  try {
    const response = await fetch(source.url, {
      redirect: 'follow',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5',
        'user-agent': 'WelcomeRO-source-monitor/2.0 (+https://github.com/Razvananass/welcomero_gemini)',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok || !allowed(response.url || source.url)) {
      return { ...base, status: 'unreachable', httpStatus: response.status, lastCheckedAt: now };
    }

    const bytes = await readLimited(response);
    const contentType = response.headers.get('content-type') ?? '';
    const text = contentType.includes('html') ? cleanHtml(new TextDecoder().decode(bytes)) : '';
    const payload = text || bytes;
    const observedHash = createHash('sha256').update(payload).digest('hex').slice(0, 24);
    const hasBaseline = Boolean(base.contentHash);
    const changed = hasBaseline && base.contentHash !== observedHash;
    const acceptedHash = ACCEPT_CHANGES || !hasBaseline ? observedHash : base.contentHash;

    return {
      ...base,
      status: changed && !ACCEPT_CHANGES ? 'updated' : 'reachable',
      httpStatus: response.status,
      lastCheckedAt: now,
      lastChangedAt: changed ? base.lastChangedAt ?? now : base.lastChangedAt,
      lastModifiedHeader: response.headers.get('last-modified') ?? response.headers.get('etag') ?? null,
      contentHash: acceptedHash,
      observedHash,
      highlights: text ? highlights(text) : [],
    };
  } catch {
    return { ...base, status: 'unreachable', httpStatus: null, lastCheckedAt: now };
  }
}

const registry = JSON.parse(await readFile(REGISTRY_FILE, 'utf8'));
let previous = { lastSweepAt: null, sources: {} };
try {
  previous = JSON.parse(await readFile(STATUS_FILE, 'utf8'));
} catch {
  // The first successful run creates the baseline.
}

const entries = Object.entries(registry);
const nextSources = {};
const now = new Date().toISOString();
let cursor = 0;

async function worker() {
  while (cursor < entries.length) {
    const index = cursor++;
    const [id, source] = entries[index];
    nextSources[id] = await checkOne(id, source, previous.sources?.[id], now);
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, () => worker()));
const orderedSources = Object.fromEntries(entries.map(([id]) => [id, nextSources[id]]));
const nextSnapshot = { lastSweepAt: now, sources: orderedSources };
const meaningful = (snapshot) => Object.fromEntries(Object.entries(snapshot.sources ?? {}).map(([id, source]) => [id, {
  url: source.url,
  status: source.status,
  httpStatus: source.httpStatus,
  lastChangedAt: source.lastChangedAt,
  lastModifiedHeader: source.lastModifiedHeader,
  contentHash: source.contentHash,
  observedHash: source.observedHash,
  highlights: source.highlights,
}]));
const changedMeaningfully = JSON.stringify(meaningful(previous)) !== JSON.stringify(meaningful(nextSnapshot));
if (changedMeaningfully || ACCEPT_CHANGES) {
  await writeFile(STATUS_FILE, `${JSON.stringify(nextSnapshot, null, 2)}\n`, 'utf8');
}

const counts = Object.values(orderedSources).reduce((result, source) => {
  result[source.status] = (result[source.status] ?? 0) + 1;
  return result;
}, {});
console.log(`Checked ${entries.length} sources: ${Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(', ')}`);
if (counts.updated) console.log('Content changes require human review before the stored baseline is accepted.');
