import type { Lang, Localized } from '../types';
import { en, type MessageKey } from './en';
import { ro } from './ro';
import { fr } from './fr';
import { ar } from './ar';
import { uk } from './uk';
import { ne } from './ne';

export type { MessageKey };

export interface LanguageInfo {
  code: Lang;
  /** Name written in the language itself, so people can recognise it. */
  nativeName: string;
  dir: 'ltr' | 'rtl';
}

export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', nativeName: 'English', dir: 'ltr' },
  { code: 'ro', nativeName: 'Română', dir: 'ltr' },
  { code: 'fr', nativeName: 'Français', dir: 'ltr' },
  { code: 'ar', nativeName: 'العربية', dir: 'rtl' },
  { code: 'uk', nativeName: 'Українська', dir: 'ltr' },
  { code: 'ne', nativeName: 'नेपाली', dir: 'ltr' },
];

export const DEFAULT_LANG: Lang = 'en';

export const dictionaries: Record<Lang, Record<MessageKey, string>> = { en, ro, fr, ar, uk, ne };

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && LANGUAGES.some((l) => l.code === value);
}

export function directionOf(lang: Lang): 'ltr' | 'rtl' {
  return LANGUAGES.find((l) => l.code === lang)?.dir ?? 'ltr';
}

export type Params = Record<string, string | number>;

/** Look up an interface string and fill in {placeholders}. Falls back to English, then to the key. */
export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const template = dictionaries[lang]?.[key] ?? dictionaries.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Pick the right language from a piece of data. Reports whether it had to fall back to English. */
export function localize(value: Localized | undefined, lang: Lang): { text: string; fallback: boolean } {
  if (!value) return { text: '', fallback: false };
  const own = value[lang];
  if (own) return { text: own, fallback: false };
  return { text: value.en, fallback: lang !== 'en' };
}
