import type { MessageKey } from '../i18n';
import type { Profile } from '../types';

/** A low-risk, fictional profile used for the no-sign-in product walkthrough. */
export const SAMPLE_STUDENT_PROFILE: Profile = {
  situation: 'student',
  citizenship: 'non-eu',
  accommodation: 'not-registered',
  completed: ['none'],
};

export const GUIDE_ORIGINS = ['/dashboard', '/checklist', '/guides', '/plan'] as const;
export type GuideOrigin = (typeof GUIDE_ORIGINS)[number];

/** Only accept known app pages as a GuideDetail return target. */
export function safeGuideOrigin(value: unknown): GuideOrigin {
  return typeof value === 'string' && (GUIDE_ORIGINS as readonly string[]).includes(value)
    ? (value as GuideOrigin)
    : '/guides';
}

const ROUTE_TITLE_KEYS: Record<string, MessageKey> = {
  '/': 'app.tagline',
  '/onboarding': 'onb.title',
  '/dashboard': 'dash.welcome',
  '/checklist': 'check.title',
  '/guides': 'guides.title',
  '/plan': 'plan.title',
  '/institutions': 'inst.title',
  '/assistant': 'ai.title',
  '/helper': 'help.title',
  '/counter': 'counter.title',
  '/practice': 'practice.title',
  '/settings': 'set.title',
};

export function routeTitleKey(pathname: string): MessageKey {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (/^\/guides\/[^/]+$/.test(normalized)) return 'guides.title';
  if (/^\/kit\/[^/]+$/.test(normalized)) return 'kit.title';
  return ROUTE_TITLE_KEYS[normalized] ?? 'nf.title';
}

export function stepProgress(step: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(Math.max(step, 0), total) / total) * 100);
}
