// Builds a short message in Romanian that a newcomer can send to a support organisation (LOGS),
// so a volunteer understands the situation without a long back-and-forth. Pure function, easy to test.
import { LANGUAGES, translate } from '../i18n';
import type { ChecklistTask, Lang, Profile, ProgressMap } from '../types';
import { effectiveStatus } from './checklist';

export const HELP_ORG_ID = 'logs-timisoara';

export function buildHelpMessage(profile: Profile, tasks: ChecklistTask[], progress: ProgressMap, userLang: Lang): string {
  const ro = (key: Parameters<typeof translate>[1]) => translate('ro', key);
  const title = (task: ChecklistTask) => task.procedure.title.ro ?? task.procedure.title.en;

  const done = tasks.filter((task) => effectiveStatus(task, progress) === 'completed').map(title);
  const inProgress = tasks.filter((task) => effectiveStatus(task, progress) === 'in-progress').map(title);
  const todo = tasks.filter((task) => effectiveStatus(task, progress) === 'not-started').map(title);
  const list = (items: string[]) => (items.length > 0 ? items.join('; ') : '-');

  const lines = [
    'Bună ziua,',
    '',
    'Sunt nou-venit(ă) în Timișoara și am nevoie de ajutor cu actele.',
    `Situația mea: ${ro(`onb.situation.${profile.situation}`)}; ${ro(`onb.citizenship.${profile.citizenship}`)}.`,
    `Cazare: ${ro(`onb.accommodation.${profile.accommodation}`)}.`,
    `Am făcut deja: ${list(done)}.`,
    `În curs: ${list(inProgress)}.`,
    `Mai am de făcut: ${list(todo)}.`,
    'Am nevoie de ajutor cu: ',
  ];
  if (userLang !== 'ro') {
    const name = LANGUAGES.find((l) => l.code === userLang)?.nativeName ?? userLang;
    lines.push(`Prefer să comunic în: ${name}.`);
  }
  lines.push('', 'Vă mulțumesc!');
  return lines.join('\n');
}

/** mailto: link with subject and body filled in (encoded so line breaks and diacritics survive). */
export function helpMailto(email: string, body: string): string {
  const subject = 'Cerere de ajutor - nou-venit în Timișoara';
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
