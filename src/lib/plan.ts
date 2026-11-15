// Pure date helpers for the "plan" page and the calendar export. No React in here, so it is easy to test.
import type { ChecklistTask, ProgressMap, TaskStatus } from '../types';
import { effectiveStatus } from './checklist';

export interface PlanDates {
  /** Arrival date, ISO yyyy-mm-dd. */
  arrival: string;
  /** Visa or residence permit expiry, ISO yyyy-mm-dd, or '' if unknown. */
  expiry: string;
}

/**
 * Suggested order of tasks, in days after arrival. This is welcomeRo's own suggestion for a sensible order,
 * NOT a legal deadline. The only date taken from a source is the permit lead time below (and it is marked "confirm").
 */
export const SUGGESTED_OFFSET_DAYS: Record<string, number> = {
  'university-enrolment': 7,
  'address-registration': 10,
  'health-insurance': 14,
  'residence-permit-student': 21,
  'eu-registration-certificate': 21,
  cnp: 28,
  'tax-id': 35,
  // Workers and refugees: welcomeRo's suggested order, not legal deadlines.
  'international-protection': 1,
  'temporary-protection-ukraine': 7,
  'residence-permit-work': 21,
};
export const DEFAULT_OFFSET_DAYS = 30;

/**
 * Permits that must be requested at least 30 days before the current visa/permit expires
 * (IGI's residence permit page; for students also reported by university guides). Ask IGI to confirm.
 */
export const PERMIT_PROCEDURE_IDS = ['residence-permit-student', 'residence-permit-work'];
/** @deprecated kept for older imports; use PERMIT_PROCEDURE_IDS. */
export const PERMIT_PROCEDURE_ID = PERMIT_PROCEDURE_IDS[0];
export const PERMIT_LEAD_DAYS = 30;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  if (year < 2000 || year > 2100) return false;
  const d = new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === year && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function toUtc(iso: string): number {
  const m = ISO.exec(iso)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * 86_400_000);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((toUtc(toIso) - toUtc(fromIso)) / 86_400_000);
}

/** Today's date in the user's own time zone, as yyyy-mm-dd. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export type DateProblem = 'required' | 'invalid' | 'beforeArrival';
export interface DateErrors {
  arrival?: Extract<DateProblem, 'required' | 'invalid'>;
  expiry?: Extract<DateProblem, 'invalid' | 'beforeArrival'>;
}

export function validateDates(dates: PlanDates): DateErrors {
  const errors: DateErrors = {};
  if (dates.arrival === '') errors.arrival = 'required';
  else if (!isIsoDate(dates.arrival)) errors.arrival = 'invalid';
  if (dates.expiry !== '') {
    if (!isIsoDate(dates.expiry)) errors.expiry = 'invalid';
    else if (!errors.arrival && daysBetween(dates.arrival, dates.expiry) < 0) errors.expiry = 'beforeArrival';
  }
  return errors;
}

export function hasErrors(errors: DateErrors): boolean {
  return Boolean(errors.arrival || errors.expiry);
}

/** Read saved dates from storage defensively (it may have been edited by hand). */
export function sanitizeDates(raw: unknown): PlanDates {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { arrival: isIsoDate(r.arrival) ? r.arrival : '', expiry: isIsoDate(r.expiry) ? r.expiry : '' };
}

export interface PlanItem {
  task: ChecklistTask;
  status: TaskStatus;
  /** Target date shown to the user. */
  date: string;
  /** "suggested" = welcomeRo's own order; "expiry" = pulled earlier by the permit expiry date. */
  basis: 'suggested' | 'expiry';
  /** Latest date to apply under IGI's 30-day rule (permits only; needs an expiry date). */
  latestBy?: string;
  /** True when the target date is in the past and the task is not done. */
  pastDue: boolean;
  /** Days from today to the target date (negative = past). */
  daysLeft: number;
}

export function buildPlan(tasks: ChecklistTask[], progress: ProgressMap, dates: PlanDates, today: string): PlanItem[] {
  if (hasErrors(validateDates(dates)) || dates.arrival === '') return [];
  const items = tasks.map((task): PlanItem => {
    const id = task.procedure.id;
    const suggested = addDays(dates.arrival, SUGGESTED_OFFSET_DAYS[id] ?? DEFAULT_OFFSET_DAYS);
    let date = suggested;
    let basis: PlanItem['basis'] = 'suggested';
    let latestBy: string | undefined;
    if (PERMIT_PROCEDURE_IDS.includes(id) && dates.expiry !== '') {
      latestBy = addDays(dates.expiry, -PERMIT_LEAD_DAYS);
      if (daysBetween(latestBy, suggested) > 0) {
        date = latestBy;
        basis = 'expiry';
      }
    }
    const status = effectiveStatus(task, progress);
    const daysLeft = daysBetween(today, date);
    return { task, status, date, basis, latestBy, pastDue: status !== 'completed' && daysLeft < 0, daysLeft };
  });
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.task.procedure.order - b.task.procedure.order);
}

// ---- Calendar export (.ics) -------------------------------------------------

export interface IcsEvent {
  uid: string;
  /** All-day event date, ISO yyyy-mm-dd. */
  date: string;
  summary: string;
  description: string;
}

function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 characters must be folded (RFC 5545). */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = Array.from(line);
  while (rest.length > 60) {
    parts.push(rest.slice(0, 60).join(''));
    rest = rest.slice(60);
  }
  parts.push(rest.join(''));
  return parts.join('\r\n ');
}

function compactDate(iso: string): string {
  return iso.replace(/-/g, '');
}

/** Relative to the start of the all-day event (00:00 that day): 3 days before, and 09:00 on the day. */
export const REMINDER_TRIGGERS = ['-P3D', 'PT9H'] as const;

export function buildIcs(events: IcsEvent[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//welcomeRo//Plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      'TRANSP:TRANSPARENT',
    );
    // Phone reminders: 3 days before (at midnight, the start of the all-day event) and at 09:00 on the day.
    for (const trigger of REMINDER_TRIGGERS) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${escapeText(event.summary)}`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Show an ISO date in the user's language, e.g. "14 November 2026". Falls back to the ISO text. */
export function formatDate(iso: string, locale: string): string {
  if (!isIsoDate(iso)) return iso;
  try {
    const m = ISO.exec(iso)!;
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))),
    );
  } catch {
    return iso;
  }
}
