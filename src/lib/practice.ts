// Logic for the Romanian practice page: decks, saved progress, quiz questions and the "say it" check.
// No React in here, so it is easy to test.
import practiceJson from '../data/practice.json';
import { kitQuestions, phrases } from '../data';
import type { Localized } from '../types';

export interface Card {
  id: string;
  ro: string;
  pron: string | null;
  meaning: Localized;
}

export interface Deck {
  id: string;
  title: Localized;
  cards: Card[];
}

/** Long or fill-in-the-blank phrases are not good flashcards. */
const EXCLUDED_PHRASE_IDS = new Set(['email-documents']);

/** The decks shown on the practice page. The "office" deck reuses the phrases and questions from the Helper and the kit. */
export function buildDecks(): Deck[] {
  const decks = (practiceJson as unknown as Deck[]).map((deck) => ({ ...deck, cards: [...deck.cards] }));
  const office = decks.find((deck) => deck.id === 'office');
  if (office) {
    const reused = [...phrases.filter((p) => !EXCLUDED_PHRASE_IDS.has(p.id)), ...kitQuestions];
    for (const phrase of reused) {
      if (office.cards.some((card) => card.id === phrase.id)) continue;
      office.cards.push({ id: phrase.id, ro: phrase.ro, pron: phrase.pron, meaning: phrase.meaning });
    }
  }
  return decks;
}

export const DECKS: Deck[] = buildDecks();
export const ALL_CARDS: Card[] = DECKS.flatMap((deck) => deck.cards);

// ---- Progress (ids of cards the learner marked as known) ----------------------------------------

export function sanitizeKnown(raw: unknown): string[] {
  const ids = new Set(ALL_CARDS.map((card) => card.id));
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && ids.has(id)))];
}

export function toggleKnown(known: string[], id: string, value?: boolean): string[] {
  const has = known.includes(id);
  const want = value ?? !has;
  if (want === has) return known;
  return want ? [...known, id] : known.filter((x) => x !== id);
}

export function deckProgress(deck: Deck, known: string[]): { known: number; total: number } {
  return { known: deck.cards.filter((card) => known.includes(card.id)).length, total: deck.cards.length };
}

export function totalProgress(known: string[]): { known: number; total: number; percent: number } {
  const count = ALL_CARDS.filter((card) => known.includes(card.id)).length;
  const total = ALL_CARDS.length;
  return { known: count, total, percent: total === 0 ? 0 : Math.round((count / total) * 100) };
}

// ---- Quiz ---------------------------------------------------------------------------------------

export interface Question {
  card: Card;
  options: Card[];
  correctIndex: number;
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** One multiple-choice question: the Romanian card, and its meaning among wrong meanings from other cards. */
export function buildQuestion(card: Card, pool: readonly Card[], random: () => number = Math.random, optionCount = 4): Question {
  const wrong = shuffle(
    pool.filter((other) => other.id !== card.id && other.meaning.en !== card.meaning.en),
    random,
  ).slice(0, Math.max(0, optionCount - 1));
  const options = shuffle([card, ...wrong], random);
  return { card, options, correctIndex: options.findIndex((option) => option.id === card.id) };
}

/** A set of questions for a quiz: up to `count` cards from the deck, unknown ones first. */
export function buildQuiz(deck: Deck, known: string[], count = 5, random: () => number = Math.random): Question[] {
  const unknown = shuffle(deck.cards.filter((card) => !known.includes(card.id)), random);
  const learned = shuffle(deck.cards.filter((card) => known.includes(card.id)), random);
  return [...unknown, ...learned].slice(0, count).map((card) => buildQuestion(card, ALL_CARDS, random));
}

// ---- "Say it" check -----------------------------------------------------------------------------

/** Lower case, no accents, no punctuation, no [bracketed] placeholders: what a speech recogniser would write. */
export function normalizeForCompare(text: string): string {
  return text
    .replace(/\[[^\]]*\]/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

/** 0 (nothing alike) to 1 (same), ignoring accents, case and punctuation. */
export function similarity(target: string, heard: string): number {
  const a = normalizeForCompare(target);
  const b = normalizeForCompare(heard);
  if (a === '' && b === '') return 1;
  if (a === '' || b === '') return 0;
  return 1 - editDistance(a, b) / Math.max(a.length, b.length);
}

export type Rating = 'great' | 'close' | 'again';

export function rateAttempt(target: string, heard: string): Rating {
  const score = similarity(target, heard);
  return score >= 0.85 ? 'great' : score >= 0.6 ? 'close' : 'again';
}
