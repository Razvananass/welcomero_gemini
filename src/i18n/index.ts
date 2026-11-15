import type { Lang, Localized } from '../types';
import { en, type MessageKey } from './en';
import { ro } from './ro';
import { fr } from './fr';
import { ar } from './ar';
import { uk } from './uk';
import { ne } from './ne';
import { ru } from './ru';
import { es } from './es';
import { tr } from './tr';
import { hi } from './hi';
import { bn } from './bn';
import { fa } from './fa';
import { ur } from './ur';
import { vi } from './vi';
import { zh } from './zh';
import { de } from './de';

export type { MessageKey };

export interface LanguageInfo {
  code: Lang;
  /** Name written in the language itself, so people can recognise it. */
  nativeName: string;
  dir: 'ltr' | 'rtl';
  /** BCP-47 tag for date formatting. */
  locale: string;
}

/**
 * Supported languages, in display order: English, Romanian, then the rest alphabetically by English name.
 * To add a language: create src/i18n/<code>.ts, add the code to Lang, then add one row here.
 */
export const LANGUAGES: LanguageInfo[] = [
  { code: 'en', nativeName: 'English', dir: 'ltr', locale: 'en-GB' }, // English
  { code: 'ro', nativeName: 'Română', dir: 'ltr', locale: 'ro-RO' }, // Romanian
  { code: 'ar', nativeName: 'العربية', dir: 'rtl', locale: 'ar' }, // Arabic
  { code: 'bn', nativeName: 'বাংলা', dir: 'ltr', locale: 'bn-BD' }, // Bengali
  { code: 'zh', nativeName: '中文', dir: 'ltr', locale: 'zh-CN' }, // Chinese
  { code: 'fr', nativeName: 'Français', dir: 'ltr', locale: 'fr-FR' }, // French
  { code: 'de', nativeName: 'Deutsch', dir: 'ltr', locale: 'de-DE' }, // German
  { code: 'hi', nativeName: 'हिन्दी', dir: 'ltr', locale: 'hi-IN' }, // Hindi
  { code: 'ne', nativeName: 'नेपाली', dir: 'ltr', locale: 'ne-NP' }, // Nepali
  { code: 'fa', nativeName: 'فارسی', dir: 'rtl', locale: 'fa-IR' }, // Persian
  { code: 'ru', nativeName: 'Русский', dir: 'ltr', locale: 'ru-RU' }, // Russian
  { code: 'es', nativeName: 'Español', dir: 'ltr', locale: 'es-ES' }, // Spanish
  { code: 'tr', nativeName: 'Türkçe', dir: 'ltr', locale: 'tr-TR' }, // Turkish
  { code: 'uk', nativeName: 'Українська', dir: 'ltr', locale: 'uk-UA' }, // Ukrainian
  { code: 'ur', nativeName: 'اردو', dir: 'rtl', locale: 'ur-PK' }, // Urdu
  { code: 'vi', nativeName: 'Tiếng Việt', dir: 'ltr', locale: 'vi-VN' }, // Vietnamese
];

export const DEFAULT_LANG: Lang = 'en';

export const dictionaries: Record<Lang, Record<MessageKey, string>> = {
  en, ro, fr, ar, uk, ne, ru, es, tr, hi, bn, fa, ur, vi, zh, de,
};

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
