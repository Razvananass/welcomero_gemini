// Builds the "knowledge" text that is given to the AI: the same JSON data the website shows.
// This keeps the assistant grounded in WelcomeRO's dataset instead of in guesses.
//
// The JSON is read from disk (not imported) so it works the same way on Vercel.
// vercel.json lists src/data/** under "includeFiles" so these files are bundled with the function.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface L {
  en: string;
  [lang: string]: string | undefined;
}
interface Item {
  text: L;
  level: string;
  sourceIds?: string[];
}
interface Doc {
  name: L;
  whereToGet: L;
  level: string;
  sourceIds?: string[];
}
interface Proc {
  id: string;
  title: L;
  summary: L;
  why: L;
  whoNeeds: L;
  whoDoesNot: L;
  submitWhere: L;
  documents: Doc[];
  steps: Item[];
  warnings: Item[];
  processingTime: Item | null;
  deadline: Item | null;
  sourceIds: string[];
  lastVerified: string;
}
interface Inst {
  id: string;
  name: L;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string;
  hours: L | null;
  verifiedNote: L;
  sourceIds: string[];
}
interface Src {
  title: string;
  url: string;
  kind: string;
  retrieved: string;
  note?: string;
}

function loadJson<T>(file: string): T {
  const path = join(process.cwd(), 'src', 'data', file);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

let cached: string | null = null;

export function buildKnowledge(): string {
  if (cached) return cached;
  const procedures = loadJson<Proc[]>('procedures.json');
  const institutions = loadJson<Inst[]>('institutions.json');
  const sources = loadJson<Record<string, Src>>('sources.json');

  const parts: string[] = [];
  const sourceRefs = (ids?: string[]): string => {
    const refs = (ids ?? []).map((id) => {
      const source = sources[id];
      if (!source) return null;
      const caveat = source.note ? `; source note: ${source.note}` : '';
      return `${id}: ${source.title} [${source.kind}; recorded ${source.retrieved}] ${source.url}${caveat}`;
    }).filter((value): value is string => Boolean(value));
    return refs.length > 0 ? refs.join(' | ') : 'no claim-specific source recorded';
  };

  parts.push('=== PROCEDURES (each fact has a label: verified / recommended / confirm, followed by its claim-specific sources) ===');
  for (const p of procedures) {
    const lines: string[] = [];
    lines.push(`## ${p.title.en} (id: ${p.id}, last checked ${p.lastVerified})`);
    lines.push(`Summary: ${p.summary.en}`);
    lines.push(`Why: ${p.why.en}`);
    lines.push(`Who needs it: ${p.whoNeeds.en}`);
    lines.push(`Who does not: ${p.whoDoesNot.en}`);
    lines.push(`Where to submit: ${p.submitWhere.en}`);
    lines.push('Documents:');
    for (const d of p.documents) lines.push(`- [${d.level}] ${d.name.en} | where: ${d.whereToGet.en} | evidence: ${sourceRefs(d.sourceIds)}`);
    lines.push('Steps:');
    p.steps.forEach((s, i) => lines.push(`${i + 1}. [${s.level}] ${s.text.en} | evidence: ${sourceRefs(s.sourceIds)}`));
    lines.push('Warnings:');
    for (const w of p.warnings) lines.push(`- [${w.level}] ${w.text.en} | evidence: ${sourceRefs(w.sourceIds)}`);
    lines.push(p.processingTime ? `Processing time: [${p.processingTime.level}] ${p.processingTime.text.en} | evidence: ${sourceRefs(p.processingTime.sourceIds)}` : 'Processing time: not recorded');
    lines.push(p.deadline ? `Deadline: [${p.deadline.level}] ${p.deadline.text.en} | evidence: ${sourceRefs(p.deadline.sourceIds)}` : 'Deadline: not recorded');
    lines.push(`Procedure sources: ${sourceRefs(p.sourceIds)}`);
    parts.push(lines.join('\n'));
  }

  parts.push('=== INSTITUTIONS (only these details are verified; null means NOT verified) ===');
  for (const i of institutions) {
    parts.push(
      [
        `## ${i.name.en} (id: ${i.id})`,
        `Address: ${i.address ?? 'not verified'}`,
        `Phone: ${i.phone ?? 'not verified'}`,
        `Email: ${i.email ?? 'not verified'}`,
        `Website: ${i.website}`,
        `Opening hours: ${i.hours ? i.hours.en : 'not recorded'}`,
        `Note: ${i.verifiedNote.en}`,
        `Sources: ${sourceRefs(i.sourceIds)}`,
      ].join('\n'),
    );
  }

  parts.push(
    [
      '=== WELCOMERO APP PAGES (use these exact paths when sending the user to a page in the app) ===',
      '- /dashboard : Home overview and next steps',
      '- /checklist : Personalized step-by-step checklist based on citizenship and status',
      '- /guides : All procedure guides (specific guide: /guides/<procedure-id>, e.g. /guides/residence-permit-student)',
      '- /plan : Personal timeline planner with dates and calendar (.ics) export',
      '- /kit/<procedure-id> : Printable appointment kit and Romanian phrases for a specific procedure',
      '- /institutions : Directory and interactive Timișoara minimap of offices (IGI, UPT, City Hall, ANAF, CNAS)',
      '- /helper : Spoken Romanian phrases and custom Romanian message generator',
      '- /practice : Practise Romanian for paperwork: flashcards with audio, a quiz, and a say-it-back check',
      '- /counter : At the counter: speak or type in your language and show/hear the Romanian for the clerk, and see the clerk\'s Romanian in your language',
      '- /settings : Update profile (student/worker, EU/non-EU, accommodation) and language',
    ].join('\n'),
  );

  cached = parts.join('\n\n');
  return cached;
}

export function procedureTitle(id: string): string | null {
  const procedures = loadJson<Proc[]>('procedures.json');
  return procedures.find((p) => p.id === id)?.title.en ?? null;
}

export interface KnowledgeCitation {
  id: string;
  title: string;
  url: string;
  kind: string;
  recordedAt: string;
}

/** Return only citations that exactly match a URL in the curated source registry. */
export function citationsInReply(reply: string): KnowledgeCitation[] {
  const sources = loadJson<Record<string, Src>>('sources.json');
  return Object.entries(sources)
    .filter(([, source]) => reply.includes(source.url))
    .map(([id, source]) => ({
      id,
      title: source.title,
      url: source.url,
      kind: source.kind,
      recordedAt: source.retrieved,
    }));
}
