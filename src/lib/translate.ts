// Shows the English-only details of a guide (documents, steps, warnings) in the user's language, using the AI.
// Pure helpers here (collecting, batching, parsing); the network call is in ai.ts.
import type { Procedure } from '../types';

/** The server accepts at most 2000 characters per message; keep a safe margin. */
export const MAX_BATCH_CHARS = 1500;

export interface Wanted {
  /** English text to translate. */
  text: string;
}

/** Every English-only text on a guide page that has no translation in `lang`, each once, in page order. */
export function collectEnglishOnly(procedure: Procedure, lang: string): string[] {
  if (lang === 'en') return [];
  const found: string[] = [];
  const add = (value: { en: string } & Record<string, string | undefined> | null | undefined) => {
    if (!value || typeof value.en !== 'string' || value.en.trim() === '') return;
    if (value[lang]) return;
    if (!found.includes(value.en)) found.push(value.en);
  };
  for (const doc of procedure.documents) {
    add(doc.name);
    add(doc.whereToGet);
  }
  for (const step of procedure.steps) add(step.text);
  if (procedure.processingTime) add(procedure.processingTime.text);
  if (procedure.deadline) add(procedure.deadline.text);
  for (const warning of procedure.warnings) add(warning.text);
  return found;
}

const oneLine = (text: string) => text.replace(/\s*\n+\s*/g, ' ').trim();

/** Split texts into batches whose numbered form stays under `maxChars`. Each entry keeps its position in the input. */
export function makeBatches(texts: string[], maxChars = MAX_BATCH_CHARS): Array<Array<{ index: number; text: string }>> {
  const batches: Array<Array<{ index: number; text: string }>> = [];
  let current: Array<{ index: number; text: string }> = [];
  let size = 0;
  texts.forEach((raw, index) => {
    const text = oneLine(raw).slice(0, maxChars - 20);
    const cost = String(index + 1).length + 3 + text.length;
    if (current.length > 0 && size + cost > maxChars) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push({ index, text });
    size += cost;
  });
  if (current.length > 0) batches.push(current);
  return batches;
}

/** The message sent to the server: one numbered line per text ("N| text"). Numbers are 1-based and global. */
export function formatBatch(batch: Array<{ index: number; text: string }>): string {
  return batch.map((entry) => `${entry.index + 1}| ${entry.text}`).join('\n');
}

/** Read "N| translation" lines. Returns a map from 0-based index to text; lines that do not parse are ignored. */
export function parseBatchReply(reply: string): Map<number, string> {
  const result = new Map<number, string>();
  for (const line of reply.split(/\r?\n/)) {
    const match = /^\s*(\d{1,4})\s*[|｜]\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const text = match[2].trim();
    if (text) result.set(Number(match[1]) - 1, text);
  }
  return result;
}

/** Texts that still lack a translation after a batch came back. */
export function missingIndexes(batch: Array<{ index: number }>, translated: Map<number, string>): number[] {
  return batch.map((entry) => entry.index).filter((index) => !translated.has(index));
}
