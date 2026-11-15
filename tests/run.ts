// Tests for the parts of WelcomeRO that do not need a browser: checklist logic, onboarding rules,
// data integrity, translations and the AI endpoint (with a fake network).
// Run with:  npm test
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { procedures, institutions, phrases, sources, getProcedure } from '../src/data';
import { buildChecklist, effectiveStatus, summarize, nextUp, pendingDependencies, sanitizeProgress, hasLimitedCoverage } from '../src/lib/checklist';
import {
  ACCOMMODATIONS, CITIZENSHIPS, COMPLETED_KEYS, PROTECTION_STATUSES, SITUATIONS, WORKER_STATUSES,
  draftToProfile, isDraft, isProfile, normaliseCompleted, profileNeedsDetails, profileToDraft, toggleCompleted, validateStep,
} from '../src/lib/profile';
import { parseFormReply, parsePhraseReply } from '../src/lib/ai';
import { addDays, buildIcs, buildPlan, daysBetween, formatDate, isIsoDate, sanitizeDates, validateDates } from '../src/lib/plan';
import { docCounts, sanitizeDocs, toggleDoc } from '../src/lib/docs';
import { buildHelpMessage, HELP_ORG_ID, helpMailto } from '../src/lib/helpRequest';
import { dataUrlBytes, fitWithin, MAX_RESULT_BYTES, MAX_SIDE } from '../src/lib/image';
import { collectEnglishOnly, formatBatch, makeBatches, MAX_BATCH_CHARS, missingIndexes, parseBatchReply } from '../src/lib/translate';
import { isTextSize, TEXT_SIZE_PERCENT } from '../src/lib/textSize';
import { ALL_CARDS, buildQuiz, DECKS, normalizeForCompare, rateAttempt, sanitizeKnown, similarity, toggleKnown, totalProgress } from '../src/lib/practice';
import { getInstitution } from '../src/data';
import { kitQuestions } from '../src/data';
import { speakableText } from '../src/lib/speech';
import { routeTitleKey, safeGuideOrigin, SAMPLE_STUDENT_PROFILE, stepProgress } from '../src/lib/journey';
import { dictionaries, directionOf, isLang, LANGUAGES, localize, translate, type MessageKey } from '../src/i18n';
import type { Accommodation, Citizenship, CompletedKey, Profile, ProgressMap, Situation } from '../src/types';

/** Languages with fully translated data JSON. Newer languages have UI dictionaries and fall back to English for data. */
const DATA_LANGS = LANGUAGES.filter((l) => ['en', 'ro', 'fr', 'ar', 'uk', 'ne'].includes(l.code));

const profile = (p: Partial<Profile> = {}): Profile => ({
  situation: 'student',
  citizenship: 'non-eu',
  accommodation: 'registered',
  completed: ['none'],
  ...p,
});
const ids = (p: Profile) => buildChecklist(procedures, p).map((t) => t.procedure.id);

// ---------------------------------------------------------------------------------------------
describe('judge-facing sample journey and navigation', () => {
  it('uses a valid non-EU international student sample with a useful checklist', () => {
    assert.equal(isProfile(SAMPLE_STUDENT_PROFILE), true);
    assert.deepEqual(SAMPLE_STUDENT_PROFILE, {
      situation: 'student',
      citizenship: 'non-eu',
      accommodation: 'not-registered',
      completed: ['none'],
    });
    const sampleTasks = buildChecklist(procedures, SAMPLE_STUDENT_PROFILE);
    assert.ok(sampleTasks.length > 0);
    assert.ok(sampleTasks.some((task) => task.procedure.id === 'residence-permit-student'));
    assert.ok(!sampleTasks.some((task) => task.procedure.id === 'eu-registration-certificate'));
  });

  it('accepts only known guide origins and falls back safely', () => {
    for (const origin of ['/dashboard', '/checklist', '/guides', '/plan']) assert.equal(safeGuideOrigin(origin), origin);
    for (const unsafe of [undefined, null, '/settings', '/guides/fake', 'https://example.com', 'javascript:alert(1)']) {
      assert.equal(safeGuideOrigin(unsafe), '/guides');
    }
  });

  it('maps app routes to specific titles and unknown routes to not found', () => {
    assert.equal(routeTitleKey('/dashboard'), 'dash.welcome');
    assert.equal(routeTitleKey('/guides/residence-permit-student'), 'guides.title');
    assert.equal(routeTitleKey('/kit/residence-permit-student'), 'kit.title');
    assert.equal(routeTitleKey('/dashboard/'), 'dash.welcome');
    assert.equal(routeTitleKey('/guides/residence-permit-student/extra'), 'nf.title');
    assert.equal(routeTitleKey('/missing'), 'nf.title');
  });

  it('shows the final onboarding step as 100 percent', () => {
    assert.deepEqual([1, 2, 3, 4].map((step) => stepProgress(step, 4)), [25, 50, 75, 100]);
  });
});

// ---------------------------------------------------------------------------------------------
describe('checklist: the three required profiles', () => {
  it('Profile A: non-EU student, accommodation secured, address NOT registered', () => {
    const tasks = buildChecklist(procedures, profile({ accommodation: 'not-registered' }));
    const list = tasks.map((t) => t.procedure.id);
    assert.deepEqual(list, ['university-enrolment', 'address-registration', 'health-insurance', 'residence-permit-student', 'cnp', 'bank-account', 'tax-id', 'learn-romanian']);
    const address = tasks.find((t) => t.procedure.id === 'address-registration')!;
    assert.equal(address.priority?.level, 'high');
    assert.equal(address.priority?.reasonKey, 'addressNotRegistered');
    assert.equal(address.preCompleted, false);
    assert.ok(!list.includes('eu-registration-certificate'), 'non-EU must not get the EU registration task');
  });

  it('Profile B: EU student, accommodation secured, address registered', () => {
    const tasks = buildChecklist(procedures, profile({ citizenship: 'eu', accommodation: 'registered' }));
    const list = tasks.map((t) => t.procedure.id);
    assert.deepEqual(list, ['university-enrolment', 'address-registration', 'health-insurance', 'eu-registration-certificate', 'cnp', 'bank-account', 'tax-id', 'learn-romanian']);
    assert.ok(!list.includes('residence-permit-student'), 'EU must not automatically get a non-EU residence permit task');
    const address = tasks.find((t) => t.procedure.id === 'address-registration')!;
    assert.equal(address.preCompleted, true);
    assert.equal(effectiveStatus(address, {}), 'completed');
  });

  it('Profile C: non-EU student, no accommodation yet', () => {
    const tasks = buildChecklist(procedures, profile({ accommodation: 'none' }));
    const byId = Object.fromEntries(tasks.map((t) => [t.procedure.id, t]));
    assert.ok(byId['address-registration'].notes.includes('findAccommodationFirst'));
    assert.ok(byId['residence-permit-student'].notes.includes('needsAccommodation'));
    assert.equal(byId['address-registration'].preCompleted, false);
  });

  it('A, B and C produce different checklists', () => {
    const a = ids(profile({ accommodation: 'not-registered' })).join();
    const b = ids(profile({ citizenship: 'eu' })).join();
    assert.notEqual(a, b);
  });
});

describe('checklist: rules for every combination of answers', () => {
  const completedOptions: CompletedKey[][] = [['none'], ['unsure'], ['residence'], ['address', 'health'], ['residence', 'address', 'health', 'cnp', 'university']];
  const combos: Profile[] = [];
  for (const situation of SITUATIONS) for (const citizenship of CITIZENSHIPS) for (const accommodation of ACCOMMODATIONS) for (const completed of completedOptions)
    combos.push({ situation, citizenship, accommodation, completed });

  it(`works for all ${combos.length} combinations without errors`, () => {
    for (const p of combos) {
      const tasks = buildChecklist(procedures, p);
      const progress: ProgressMap = {};
      const s = summarize(tasks, progress);
      assert.equal(s.total, tasks.length);
      assert.equal(s.completed + s.remaining, s.total);
      assert.ok(s.percent >= 0 && s.percent <= 100);
      assert.equal(new Set(tasks.map((t) => t.procedure.id)).size, tasks.length, 'no duplicate tasks');
    }
  });

  it('EU citizens never get the non-EU permit; non-EU never get the EU certificate', () => {
    for (const p of combos) {
      const list = ids(p);
      if (p.citizenship === 'eu') assert.ok(!list.includes('residence-permit-student') && !list.includes('residence-permit-work'));
      if (p.citizenship === 'non-eu') assert.ok(!list.includes('eu-registration-certificate'));
    }
  });

  it('only students get the university task; non-students get a coverage notice; "verify" tasks carry the note', () => {
    for (const p of combos) {
      const tasks = buildChecklist(procedures, p);
      assert.equal(tasks.some((t) => t.procedure.id === 'university-enrolment'), p.situation === 'student');
      if (p.situation !== 'student') assert.ok(hasLimitedCoverage(p));
      for (const t of tasks) assert.equal(t.relevance === 'verify', t.notes.includes('verifyApplies'), `${p.situation}: ${t.procedure.id}`);
    }
  });

  it('people in the "other" situation are asked to check whether the shared guides apply', () => {
    const tasks = buildChecklist(procedures, profile({ situation: 'other', accommodation: 'registered' }));
    for (const id of ['health-insurance', 'cnp', 'tax-id']) {
      assert.equal(tasks.find((t) => t.procedure.id === id)?.relevance, 'verify', id);
    }
  });

  it('workers, students and refugees see the everyday guides as core: address, health, CNP, bank account, learning Romanian', () => {
    for (const situation of ['student', 'worker', 'refugee'] as const) {
      const tasks = buildChecklist(procedures, profile({ situation, accommodation: 'none' }));
      for (const id of ['address-registration', 'health-insurance', 'cnp', 'bank-account', 'learn-romanian']) {
        assert.equal(tasks.find((t) => t.procedure.id === id)?.relevance, 'core', `${situation}: ${id}`);
      }
    }
  });

  it('non-EU workers get the work permit guide; refugees get asylum and temporary protection', () => {
    for (const p of combos) {
      const list = ids(p);
      assert.equal(list.includes('residence-permit-work'), p.situation === 'worker' && p.citizenship === 'non-eu', `work permit: ${JSON.stringify(p)}`);
      assert.equal(list.includes('international-protection'), p.situation === 'refugee' && p.citizenship === 'non-eu');
      assert.equal(list.includes('temporary-protection-ukraine'), p.situation === 'refugee' && p.citizenship === 'non-eu');
      assert.ok(!(list.includes('residence-permit-work') && list.includes('residence-permit-student')), 'never two residence permits');
    }
    const worker = buildChecklist(procedures, profile({ situation: 'worker' }));
    assert.equal(worker.find((t) => t.procedure.id === 'residence-permit-work')?.relevance, 'core');
    assert.equal(worker.find((t) => t.procedure.id === 'residence-permit-work')?.priority?.level, 'high');
    const refugee = buildChecklist(procedures, profile({ situation: 'refugee' }));
    assert.equal(refugee[0].procedure.id, 'international-protection', 'asylum comes first');
    assert.equal(refugee.find((t) => t.procedure.id === 'temporary-protection-ukraine')?.relevance, 'verify', 'temporary protection only applies to people from Ukraine');
  });

  it('the tax number is always a "check if this applies" guide', () => {
    for (const p of combos) {
      for (const t of buildChecklist(procedures, p).filter((x) => x.procedure.id === 'tax-id')) assert.equal(t.relevance, 'verify');
    }
  });

  it('"unsure" accommodation turns the address task into a verify task', () => {
    const t = buildChecklist(procedures, profile({ accommodation: 'unsure' })).find((x) => x.procedure.id === 'address-registration')!;
    assert.equal(t.relevance, 'verify');
    assert.ok(t.notes.includes('accommodationUnsure'));
  });

  it('onboarding "completed" answers pre-mark the matching tasks', () => {
    const tasks = buildChecklist(procedures, profile({ accommodation: 'none', completed: ['residence', 'health', 'university', 'cnp'] }));
    const done = tasks.filter((t) => t.preCompleted).map((t) => t.procedure.id).sort();
    assert.deepEqual(done, ['cnp', 'health-insurance', 'residence-permit-student', 'university-enrolment']);
  });
});

describe('checklist: worker and protection status scoping', () => {
  const scopedIds = [
    'international-protection',
    'temporary-protection-ukraine',
    'asylum-seeker-rights',
    'temporary-protection-rights',
    'employment-contract',
    'residence-permit-work',
    'integration-programme',
  ];
  const selected = (p: Profile) => buildChecklist(procedures, p).filter((task) => scopedIds.includes(task.procedure.id));

  it('preserves the unscoped checklist for legacy profiles while requiring one migration answer', () => {
    assert.equal(profileNeedsDetails(profile({ situation: 'worker' })), true);
    assert.equal(profileNeedsDetails(profile({ situation: 'refugee' })), true);
    assert.deepEqual(selected(profile({ situation: 'worker' })).map((task) => task.procedure.id), ['employment-contract', 'residence-permit-work']);
    assert.deepEqual(selected(profile({ situation: 'refugee' })).map((task) => task.procedure.id), [
      'international-protection',
      'temporary-protection-ukraine',
      'asylum-seeker-rights',
      'temporary-protection-rights',
      'integration-programme',
    ]);
  });

  it('shows worker procedures only to employed workers', () => {
    const employed = profile({ situation: 'worker', workerStatus: 'employed' });
    assert.equal(hasLimitedCoverage(employed), false);
    assert.deepEqual(selected(employed).map((task) => task.procedure.id), [
      'employment-contract',
      'residence-permit-work',
    ]);
    for (const workerStatus of ['looking-for-work', 'self-employed'] as const) {
      const workerProfile = profile({ situation: 'worker', workerStatus });
      assert.deepEqual(selected(workerProfile).map((task) => task.procedure.id), []);
      assert.equal(hasLimitedCoverage(workerProfile), true);
    }
  });

  it('uses one calm verify fallback when a worker is unsure', () => {
    const tasks = selected(profile({ situation: 'worker', workerStatus: 'unsure' }));
    assert.equal(hasLimitedCoverage(profile({ situation: 'worker', workerStatus: 'unsure' })), true);
    assert.deepEqual(tasks.map((task) => task.procedure.id), ['employment-contract']);
    assert.equal(tasks[0].relevance, 'verify');
    assert.ok(tasks[0].notes.includes('verifyApplies'));
  });

  it('shows only the guide for the selected protection stage', () => {
    const cases = [
      ['considering-asylum', ['international-protection']],
      ['asylum-pending', ['asylum-seeker-rights']],
      ['protection-granted', ['integration-programme']],
      ['temporary-protection', ['temporary-protection-ukraine', 'temporary-protection-rights']],
    ] as const;
    for (const [protectionStatus, expected] of cases) {
      const protectionProfile = profile({ situation: 'refugee', protectionStatus });
      assert.equal(hasLimitedCoverage(protectionProfile), false);
      assert.deepEqual(selected(protectionProfile).map((task) => task.procedure.id), expected);
    }
  });

  it('does not fall through to legacy rules for a known unmatched status', () => {
    const tasks = selected(profile({ situation: 'refugee', protectionStatus: 'unsure' }));
    assert.deepEqual(tasks.map((task) => task.procedure.id), ['international-protection']);
    assert.equal(tasks[0].relevance, 'verify');
    assert.ok(tasks[0].notes.includes('verifyApplies'));
  });

  it('prefers scoped rules even when an unscoped rule comes first and keeps generic guides', () => {
    const employment = getProcedure('employment-contract')!;
    const reversed = { ...employment, audience: [...employment.audience].reverse() };
    const tasks = buildChecklist([reversed], profile({ situation: 'worker', workerStatus: 'unsure' }));
    assert.equal(tasks[0].relevance, 'verify');
    assert.ok(ids(profile({ situation: 'worker', workerStatus: 'self-employed' })).includes('health-insurance'));
  });
});

describe('progress tracking', () => {
  const tasks = buildChecklist(procedures, profile({ accommodation: 'not-registered' }));

  it('starts at 0% and updates as tasks are completed', () => {
    assert.equal(summarize(tasks, {}).percent, 0);
    const progress: ProgressMap = { 'university-enrolment': 'completed', 'health-insurance': 'completed', 'cnp': 'in-progress' };
    const s = summarize(tasks, progress);
    assert.equal(s.completed, 2);
    assert.equal(s.inProgress, 1);
    assert.equal(s.remaining, tasks.length - 2);
    assert.equal(s.percent, Math.round((2 / tasks.length) * 100));
  });

  it('a pre-completed task can be reopened and completed again', () => {
    const b = buildChecklist(procedures, profile({ citizenship: 'eu', accommodation: 'registered' }));
    const address = b.find((t) => t.procedure.id === 'address-registration')!;
    assert.equal(effectiveStatus(address, {}), 'completed');
    assert.equal(effectiveStatus(address, { 'address-registration': 'not-started' }), 'not-started');
    assert.equal(effectiveStatus(address, { 'address-registration': 'completed' }), 'completed');
  });

  it('"next up" lists unfinished high-priority tasks first and skips completed ones', () => {
    const next = nextUp(tasks, { 'university-enrolment': 'completed' }, 3).map((t) => t.procedure.id);
    assert.ok(!next.includes('university-enrolment'));
    assert.equal(next[0], 'address-registration'); // high priority (not registered) comes before normal ones
  });

  it('knows which prerequisites are still open', () => {
    const permit = tasks.find((t) => t.procedure.id === 'residence-permit-student')!;
    assert.deepEqual(pendingDependencies(permit, tasks, {}).map((p) => p.id), ['university-enrolment', 'address-registration']);
    assert.deepEqual(pendingDependencies(permit, tasks, { 'university-enrolment': 'completed', 'address-registration': 'completed' }), []);
  });

  it('ignores damaged progress data from storage', () => {
    assert.deepEqual(sanitizeProgress({ a: 'completed', b: 'banana', c: 5 }), { a: 'completed' });
    assert.deepEqual(sanitizeProgress(null), {});
    assert.deepEqual(sanitizeProgress('x'), {});
  });
});

describe('onboarding rules', () => {
  it('"None of these" and "I\'m not sure" clear other selections', () => {
    assert.deepEqual(toggleCompleted(['health', 'cnp'], 'none'), ['none']);
    assert.deepEqual(toggleCompleted(['health'], 'unsure'), ['unsure']);
    assert.deepEqual(toggleCompleted(['none'], 'health'), ['health']);
    assert.deepEqual(toggleCompleted(['unsure'], 'cnp'), ['cnp']);
    assert.deepEqual(toggleCompleted(['none'], 'none'), []);
    assert.deepEqual(toggleCompleted(['health'], 'health'), []);
    assert.deepEqual(toggleCompleted(['health'], 'cnp'), ['health', 'cnp']);
  });

  it('normalises impossible stored combinations', () => {
    assert.deepEqual(normaliseCompleted(['health', 'none']), ['none']);
    assert.deepEqual(normaliseCompleted(['health', 'health']), ['health']);
  });

  it('rejects empty or incomplete steps', () => {
    assert.equal(validateStep(1, { completed: [] }), null);
    assert.equal(validateStep(2, { completed: [] }), 'onb.error.required');
    assert.equal(validateStep(2, { situation: 'student', completed: [] }), 'onb.error.required');
    assert.equal(validateStep(2, { situation: 'student', citizenship: 'eu', completed: [] }), null);
    assert.equal(validateStep(2, { situation: 'worker', citizenship: 'eu', completed: [] }), 'onb.error.required');
    assert.equal(validateStep(2, { situation: 'worker', workerStatus: 'employed', citizenship: 'eu', completed: [] }), null);
    assert.equal(validateStep(2, { situation: 'refugee', citizenship: 'non-eu', completed: [] }), 'onb.error.required');
    assert.equal(validateStep(2, { situation: 'refugee', protectionStatus: 'asylum-pending', citizenship: 'non-eu', completed: [] }), null);
    assert.equal(validateStep(3, { completed: [] }), 'onb.error.required');
    assert.equal(validateStep(4, { completed: [] }), 'onb.error.completed');
    assert.equal(validateStep(4, { completed: ['none'] }), null);
  });

  it('only builds a profile from a complete draft', () => {
    assert.equal(draftToProfile({ completed: [] }), null);
    assert.equal(draftToProfile({ situation: 'student', citizenship: 'eu', accommodation: 'none', completed: [] }), null);
    const p = draftToProfile({ situation: 'student', citizenship: 'eu', accommodation: 'none', completed: ['none'] });
    assert.ok(p && isProfile(p));
    assert.equal(draftToProfile({ situation: 'worker', citizenship: 'eu', accommodation: 'none', completed: ['none'] }), null);
    assert.equal(draftToProfile({ situation: 'refugee', citizenship: 'non-eu', accommodation: 'none', completed: ['none'] }), null);
    assert.deepEqual(
      draftToProfile({
        situation: 'worker',
        workerStatus: 'employed',
        protectionStatus: 'asylum-pending',
        citizenship: 'eu',
        accommodation: 'none',
        completed: ['none'],
      }),
      { situation: 'worker', workerStatus: 'employed', citizenship: 'eu', accommodation: 'none', completed: ['none'] },
    );
    assert.deepEqual(
      profileToDraft(profile({ situation: 'refugee', protectionStatus: 'asylum-pending' })),
      profile({ situation: 'refugee', protectionStatus: 'asylum-pending' }),
    );
  });

  it('rejects corrupted data from localStorage', () => {
    assert.equal(isProfile(null), false);
    assert.equal(isProfile({ situation: 'astronaut', citizenship: 'eu', accommodation: 'none', completed: [] }), false);
    assert.equal(isProfile({ situation: 'student', citizenship: 'eu', accommodation: 'none', completed: ['x'] }), false);
    assert.equal(isProfile(profile()), true, 'legacy profiles without status fields remain valid');
    assert.equal(isProfile(profile({ situation: 'worker', workerStatus: 'employed' })), true);
    assert.equal(isProfile({ ...profile({ situation: 'worker' }), workerStatus: 'contractor' }), false);
    assert.equal(isProfile({ ...profile(), workerStatus: 'employed' }), false, 'status must match the broad situation');
    assert.equal(isProfile(profile({ situation: 'refugee', protectionStatus: 'temporary-protection' })), true);
    assert.equal(isProfile({ ...profile({ situation: 'refugee' }), protectionStatus: 'unknown' }), false);
    assert.equal(isDraft({ completed: 'nope' }), false);
    assert.equal(isDraft({ completed: [], workerStatus: 'looking-for-work', protectionStatus: 'asylum-pending' }), true);
    assert.equal(isDraft({ completed: [], workerStatus: 'contractor' }), false);
    assert.equal(isDraft({ completed: [] }), true);
  });

  it('collects no sensitive fields (no passport / CNP / name inputs exist in the profile shape)', () => {
    const keys = Object.keys(profile());
    assert.deepEqual(keys.sort(), ['accommodation', 'citizenship', 'completed', 'situation']);
  });
});

// ---------------------------------------------------------------------------------------------
describe('administrative data integrity', () => {
  const levels = ['verified', 'recommended', 'confirm'];
  const hasEn = (l: { en?: string } | undefined) => Boolean(l && typeof l.en === 'string' && l.en.length > 0);

  it('has 5-20 procedures with unique ids', () => {
    assert.ok(procedures.length >= 5 && procedures.length <= 20);
    assert.equal(new Set(procedures.map((p) => p.id)).size, procedures.length);
  });

  it('every procedure is complete and refers only to things that exist', () => {
    for (const p of procedures) {
      for (const field of ['title', 'summary', 'why', 'whoNeeds', 'whoDoesNot', 'submitWhere'] as const) {
        assert.ok(hasEn(p[field]), `${p.id}.${field} needs English text`);
      }
      assert.ok(p.documents.length > 0 && p.steps.length > 0 && p.warnings.length > 0, `${p.id} lists documents, steps and warnings`);
      assert.ok(institutions.some((i) => i.id === p.institutionId), `${p.id} institution exists`);
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(p.lastVerified), `${p.id} has a last verified date`);
      assert.ok(p.audience.length > 0);
      for (const rule of p.audience) {
        if (rule.workerStatuses) {
          assert.ok(rule.workerStatuses.length > 0, `${p.id}: workerStatuses is not empty`);
          assert.ok(rule.workerStatuses.every((status) => WORKER_STATUSES.includes(status)), `${p.id}: valid worker status`);
          assert.ok(rule.situations.every((situation) => situation === 'worker'), `${p.id}: worker status only scopes worker rules`);
        }
        if (rule.protectionStatuses) {
          assert.ok(rule.protectionStatuses.length > 0, `${p.id}: protectionStatuses is not empty`);
          assert.ok(rule.protectionStatuses.every((status) => PROTECTION_STATUSES.includes(status)), `${p.id}: valid protection status`);
          assert.ok(rule.situations.every((situation) => situation === 'refugee'), `${p.id}: protection status only scopes refugee rules`);
        }
      }
      for (const dep of p.dependsOn ?? []) assert.ok(getProcedure(dep), `${p.id} dependency ${dep} exists`);
      if (p.completedKey) assert.ok(COMPLETED_KEYS.includes(p.completedKey));
      const items = [...p.steps, ...p.warnings, ...(p.processingTime ? [p.processingTime] : []), ...(p.deadline ? [p.deadline] : [])];
      for (const item of items) {
        assert.ok(hasEn(item.text) && levels.includes(item.level), `${p.id}: item has text and a valid level`);
        for (const id of item.sourceIds ?? []) assert.ok(sources[id], `${p.id}: unknown source ${id}`);
      }
      for (const d of p.documents) {
        assert.ok(hasEn(d.name) && hasEn(d.whereToGet) && levels.includes(d.level), `${p.id}: document is complete`);
        for (const id of d.sourceIds ?? []) assert.ok(sources[id], `${p.id}: unknown source ${id}`);
      }
      for (const id of p.sourceIds) assert.ok(sources[id], `${p.id}: unknown source ${id}`);
    }
  });

  it('"verified" facts always cite an official source', () => {
    for (const p of procedures) {
      const items = [...p.steps, ...p.warnings, ...(p.processingTime ? [p.processingTime] : []), ...(p.deadline ? [p.deadline] : []), ...p.documents];
      for (const item of items.filter((i) => i.level === 'verified')) {
        assert.ok((item.sourceIds ?? []).length > 0, `${p.id}: a "verified" item has no source`);
      }
    }
  });

  it('titles, summaries and "why" exist in all four languages', () => {
    for (const p of procedures) for (const lang of DATA_LANGS) for (const f of ['title', 'summary', 'why', 'whoNeeds', 'whoDoesNot', 'submitWhere'] as const) {
      assert.ok(p[f][lang.code], `${p.id}.${f} missing ${lang.code}`);
    }
  });

  it('every source has a valid https URL and a retrieval date', () => {
    for (const [id, s] of Object.entries(sources)) {
      assert.ok(s.url.startsWith('https://'), `${id} url`);
      assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(s.retrieved), `${id} date`);
      assert.doesNotThrow(() => new URL(s.url), `${id} is a parseable URL`);
    }
  });

  it('institutions never contain made-up details: unverified fields are null, not empty text', () => {
    for (const i of institutions) {
      for (const field of ['address', 'phone', 'email'] as const) assert.ok(i[field] === null || i[field]!.trim().length > 0, `${i.id}.${field}`);
      assert.ok(i.website.startsWith('https://'));
      for (const id of i.sourceIds) assert.ok(sources[id], `${i.id}: unknown source ${id}`);
      for (const lang of DATA_LANGS) {
        assert.ok(i.name[lang.code] && i.description[lang.code] && i.verifiedNote[lang.code], `${i.id} missing ${lang.code}`);
      }
    }
  });

  it('the Romanian phrases have text, meaning in all languages and consistent placeholders', () => {
    assert.ok(phrases.length >= 7);
    for (const ph of phrases) {
      assert.ok(ph.ro.length > 0);
      for (const lang of DATA_LANGS) assert.ok(ph.meaning[lang.code] || lang.code === 'ro', `${ph.id} meaning ${lang.code}`);
      for (const lang of DATA_LANGS) assert.ok(ph.label[lang.code], `${ph.id} label ${lang.code}`);
      const count = (s: string) => (s.match(/\[[^\]]+\]/g) ?? []).length;
      for (const lang of ['en', 'fr', 'ar', 'uk', 'ne'] as const) assert.equal(count(ph.meaning[lang]!), count(ph.ro), `${ph.id}: placeholders match in ${lang}`);
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe('translations', () => {
  const enKeys = Object.keys(dictionaries.en).sort();

  it('all languages define exactly the same keys', () => {
    for (const lang of LANGUAGES) assert.deepEqual(Object.keys(dictionaries[lang.code]).sort(), enKeys, lang.code);
  });

  it('no translation is empty and {placeholders} match English', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const lang of LANGUAGES) for (const key of enKeys as MessageKey[]) {
      const value = dictionaries[lang.code][key];
      assert.ok(value && value.trim().length > 0, `${lang.code}:${key} is empty`);
      assert.equal(placeholders(value), placeholders(dictionaries.en[key]), `${lang.code}:${key} placeholders differ`);
    }
  });

  it('all languages expose the real contact email', () => {
    for (const lang of LANGUAGES) assert.equal(dictionaries[lang.code]['footer.contactPlaceholder'], 'welcomero.contact@gmail.com');
  });

  it('Ukrainian is Cyrillic and Nepali is Devanagari', () => {
    assert.ok(/[\u0400-\u04FF]/.test(dictionaries.uk['landing.cta']));
    assert.ok(/[\u0900-\u097F]/.test(dictionaries.ne['landing.cta']));
    assert.equal(dictionaries.uk['app.name'], 'WelcomeRO');
  });

  it('new languages use their own scripts', () => {
    const script: Record<string, RegExp> = {
      ru: /[\u0400-\u04FF]/, hi: /[\u0900-\u097F]/, bn: /[\u0980-\u09FF]/, fa: /[\u0600-\u06FF]/,
      ur: /[\u0600-\u06FF]/, zh: /[\u4E00-\u9FFF]/, tr: /[ğşıİçöü]/i, es: /[¿¡ñáéíóú]/i, de: /[äöüß]/i, vi: /[ăâêôơưđạảấầẩẫậắằẳẵặẹẻẽếềểễệ]/i,
    };
    for (const [code, re] of Object.entries(script)) {
      const sample = dictionaries[code as keyof typeof dictionaries];
      assert.ok(re.test(Object.values(sample).join(' ')), `${code} uses its script`);
    }
    assert.ok(/[\u0600-\u06FF]/.test(dictionaries.fa['landing.cta']) && /[\u0600-\u06FF]/.test(dictionaries.ur['landing.cta']));
  });

  it('isLang and directionOf cover every language, with fa, ur and ar right-to-left', () => {
    for (const lang of LANGUAGES) assert.ok(isLang(lang.code), lang.code);
    for (const code of ['en', 'ro', 'fr', 'uk', 'ne', 'ru', 'es', 'tr', 'hi', 'bn', 'vi', 'zh', 'de']) assert.equal(directionOf(code as never), 'ltr', code);
    for (const code of ['ar', 'fa', 'ur']) assert.equal(directionOf(code as never), 'rtl', code);
    assert.ok(!isLang('xx') && !isLang(undefined) && !isLang(''));
    for (const code of ['en', 'ro', 'fr', 'ar', 'uk', 'ne']) assert.ok(isLang(code), `persisted ${code} stays valid`);
  });

  it('data without a translation falls back to English for new languages', () => {
    for (const code of ['ru', 'fa', 'zh'] as const) assert.deepEqual(localize({ en: 'Hello', ro: 'Salut' }, code), { text: 'Hello', fallback: true });
  });

  it('lists English, Romanian, then the rest alphabetically by English name, with unique codes', () => {
    const codes = LANGUAGES.map((l) => l.code);
    assert.deepEqual(codes.slice(0, 2), ['en', 'ro']);
    assert.equal(new Set(codes).size, codes.length);
    const names = LANGUAGES.slice(2).map((l) => new Intl.DisplayNames('en', { type: 'language' }).of(l.code)!);
    assert.deepEqual(names, [...names].sort());
  });

  it('Arabic text is actually Arabic and Romanian has diacritics', () => {
    assert.ok(/[؀-ۿ]/.test(dictionaries.ar['landing.cta']));
    assert.ok(/[ăâîșț]/i.test(dictionaries.ro['common.back'] + dictionaries.ro['nav.institutions']));
  });

  it('every interface key used in the source code exists', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && !full.includes(join('src', 'i18n'))) files.push(full);
      }
    };
    walk('src');
    const used = new Set<string>();
    const dynamicPrefixes = new Set<string>();
    for (const f of files) {
      const code = readFileSync(f, 'utf8');
      for (const m of code.matchAll(/\bt\(\s*'([\w.\-]+)'/g)) used.add(m[1]);
      for (const m of code.matchAll(/\bt\(\s*`([\w.\-]+)\$\{/g)) dynamicPrefixes.add(m[1]);
    }
    const missing = [...used].filter((k) => !(k in dictionaries.en));
    assert.deepEqual(missing, [], `keys used in code but missing from en.ts: ${missing.join(', ')}`);
    // dynamic keys: make sure every value we can build exists
    const values: Record<string, string[]> = {
      'onb.situation.': SITUATIONS, 'onb.workerStatus.': WORKER_STATUSES, 'onb.protectionStatus.': PROTECTION_STATUSES,
      'onb.citizenship.': CITIZENSHIPS, 'onb.accommodation.': ACCOMMODATIONS,
      'onb.completed.': COMPLETED_KEYS, 'status.': ['not-started', 'in-progress', 'completed'],
      'level.': ['verified', 'recommended', 'confirm'], 'note.': ['findAccommodationFirst', 'accommodationUnsure', 'needsAccommodation', 'preCompleted', 'addressNotRegistered'],
      'guide.sourceKind.': ['government', 'university', 'eu', 'ngo'], 'priority.': ['high', 'low'], 'ai.ex.': ['1', '2', '3', '4', '5'],
      'check.filter.': ['all', 'todo', 'progress', 'done'], 'guide.s': ['1', '2', '3', '4', '6', '7', '8', '9', '10'],
      'monitor.status.': ['reachable', 'updated', 'unreachable', 'pending'],
      'text.': ['normal', 'large', 'xlarge'],
    };
    for (const prefix of dynamicPrefixes) {
      assert.ok(values[prefix], `dynamic key prefix "${prefix}" is not covered by this test; add it`);
      for (const v of values[prefix]) assert.ok(`${prefix}${v}` in dictionaries.en, `missing key ${prefix}${v}`);
    }
  });

  it('translate() fills placeholders and localize() falls back to English', () => {
    assert.equal(translate('en', 'common.step', { current: 2, total: 4 }), 'Step 2 of 4');
    assert.equal(translate('fr', 'common.step', { current: 2, total: 4 }), 'Étape 2 sur 4');
    assert.deepEqual(localize({ en: 'Hello' }, 'ar'), { text: 'Hello', fallback: true });
    assert.deepEqual(localize({ en: 'Hello', ar: 'مرحبا' }, 'ar'), { text: 'مرحبا', fallback: false });
    assert.deepEqual(localize({ en: 'Hello' }, 'en'), { text: 'Hello', fallback: false });
  });
});

// ---------------------------------------------------------------------------------------------
describe('AI response parsing', () => {
  it('reads JSON even with extra text around it', () => {
    const r = parsePhraseReply('Here you go:\n{"romanian":"Bună ziua!","translation":"Hello","pronunciation":"BOO-nuh ZEE-wah"}\nBye');
    assert.deepEqual(r, { romanian: 'Bună ziua!', translation: 'Hello', pronunciation: 'BOO-nuh ZEE-wah' });
  });
  it('rejects replies without a Romanian message', () => {
    assert.equal(parsePhraseReply('no json here'), null);
    assert.equal(parsePhraseReply('{"romanian":""}'), null);
    assert.equal(parsePhraseReply('{broken'), null);
  });
});

describe('AI endpoint (api/chat.ts) with a fake network', () => {
  const realFetch = globalThis.fetch;
  const original = { key: process.env.ANTHROPIC_API_KEY, model: process.env.AI_MODEL };
  for (const name of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'AI_PROVIDER']) delete process.env[name];
  const restore = () => {
    globalThis.fetch = realFetch;
    if (original.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = original.key;
    if (original.model === undefined) delete process.env.AI_MODEL; else process.env.AI_MODEL = original.model;
  };
  const post = (body: unknown) => new Request('http://localhost/api/chat', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
  const goodBody = { mode: 'chat', language: 'ro', messages: [{ role: 'user', content: 'Ce este CNP?' }] };

  it('without a key: GET says not configured, POST returns 503 and never calls the network', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; throw new Error('should not be called'); }) as typeof fetch;
    try {
      const { GET, POST } = await import('../api/chat');
      assert.deepEqual(await GET().json(), { configured: false });
      const res = await POST(post(goodBody));
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { error: 'not_configured' });
      assert.equal(calls, 0);
    } finally { restore(); }
  });

  it('rejects malformed requests before calling the provider', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; return new Response('{}'); }) as typeof fetch;
    try {
      const { POST } = await import('../api/chat');
      const bad: unknown[] = [
        'not json',
        { ...goodBody, language: 'xx' },
        { ...goodBody, messages: [] },
        { ...goodBody, messages: [{ role: 'system', content: 'x' }] },
        { ...goodBody, messages: [{ role: 'assistant', content: 'x' }] },
        { ...goodBody, messages: [{ role: 'user', content: 'x'.repeat(2001) }] },
        { ...goodBody, messages: Array.from({ length: 21 }, () => ({ role: 'user', content: 'hi' })) },
      ];
      for (const b of bad) assert.equal((await POST(post(b))).status, 400, JSON.stringify(b).slice(0, 60));
      assert.equal(calls, 0);
    } finally { restore(); }
  });

  it('sends the dataset + rules to the provider, keeps the key in a header, and returns the reply', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    type Seen = { url: string; headers: Record<string, string>; body: { system: string; model: string; messages: unknown[] } };
    const box: { seen: Seen | null } = { seen: null };
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      box.seen = { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
      return new Response(JSON.stringify({ content: [{ type: 'text', text: 'CNP înseamnă cod numeric personal.' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const { POST } = await import('../api/chat');
      const res = await POST(post({
        ...goodBody,
        procedureId: 'cnp',
        userContext: { situation: 'worker', workerStatus: 'employed', protectionStatus: 'temporary-protection' },
      }));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { reply: 'CNP înseamnă cod numeric personal.' });
      assert.ok(box.seen);
      const s = box.seen as Seen;
      assert.equal(s.url, 'https://api.anthropic.com/v1/messages');
      assert.equal(s.headers['x-api-key'], 'test-key');
      assert.ok(s.body.system.includes('Reply in Romanian'));
      assert.ok(s.body.system.includes('Residence permit for studies'), 'dataset is included');
      assert.ok(s.body.system.includes('Str. Andrei Mocioni nr. 8-10'), 'verified institution data is included');
      assert.ok(s.body.system.includes('Personal numeric code (CNP)'), 'focus procedure is mentioned');
      assert.ok(s.body.system.includes('Worker status: employed'), 'worker status is included in assistant context');
      assert.ok(s.body.system.includes('Protection status: temporary-protection'), 'protection status is included in assistant context');
      assert.ok(!JSON.stringify(s.body).includes('test-key'), 'the key is never placed in the prompt');
    } finally { restore(); }
  });

  it('maps provider failures to safe error codes', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    try {
      const { POST } = await import('../api/chat');
      globalThis.fetch = (async () => new Response('{}', { status: 429 })) as typeof fetch;
      assert.equal((await POST(post(goodBody))).status, 429);
      globalThis.fetch = (async () => new Response('secret upstream details', { status: 500 })) as typeof fetch;
      const res = await POST(post(goodBody));
      assert.equal(res.status, 502);
      assert.ok(!(await res.text()).includes('secret'));
      globalThis.fetch = (async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; }) as typeof fetch;
      assert.equal((await POST(post(goodBody))).status, 504);
      globalThis.fetch = (async () => new Response(JSON.stringify({ content: [] }), { status: 200 })) as typeof fetch;
      assert.equal((await POST(post(goodBody))).status, 502);
    } finally { restore(); }
  });

  it('phrase mode asks for JSON and limits output', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let body: { system: string; max_tokens: number } | null = null;
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"romanian":"Bună ziua","translation":"Hello","pronunciation":""}' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const { POST } = await import('../api/chat');
      const res = await POST(post({ mode: 'phrase', language: 'fr', messages: [{ role: 'user', content: 'I want to ask about my appointment' }] }));
      assert.equal(res.status, 200);
      const b = body as unknown as { system: string; max_tokens: number };
      assert.ok(b.system.includes('Reply with JSON only'));
      assert.equal(b.max_tokens, 200);
    } finally { restore(); }
  });
});

// ---------------------------------------------------------------------------------------------
describe('plan: dates', () => {
  it('accepts only real calendar dates', () => {
    assert.ok(isIsoDate('2026-11-14'));
    assert.ok(isIsoDate('2028-02-29'), 'leap day');
    for (const bad of ['2027-02-29', '2026-13-01', '2026-00-10', '2026-11-31', '14-11-2026', '', '1999-12-31', '2101-01-01', 'abc', null, 20261114])
      assert.ok(!isIsoDate(bad), `should reject ${String(bad)}`);
  });

  it('adds days across month, year and leap-year boundaries without time-zone drift', () => {
    assert.equal(addDays('2026-11-14', 30), '2026-12-14');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-03-29', 1), '2026-03-30');
    assert.equal(addDays('2026-10-25', 1), '2026-10-26'); // Romanian clock change weekend
    assert.equal(daysBetween('2026-10-24', '2026-10-27'), 3);
    assert.equal(daysBetween('2026-11-14', '2026-11-10'), -4);
  });

  it('validates arrival and expiry', () => {
    assert.deepEqual(validateDates({ arrival: '', expiry: '' }), { arrival: 'required' });
    assert.deepEqual(validateDates({ arrival: '2026-13-01', expiry: '' }), { arrival: 'invalid' });
    assert.deepEqual(validateDates({ arrival: '2026-10-01', expiry: '' }), {});
    assert.deepEqual(validateDates({ arrival: '2026-10-01', expiry: '2026-09-30' }), { expiry: 'beforeArrival' });
    assert.deepEqual(validateDates({ arrival: '2026-10-01', expiry: 'nonsense' }), { expiry: 'invalid' });
    assert.deepEqual(validateDates({ arrival: '2026-10-01', expiry: '2026-10-01' }), {}, 'same day is allowed');
  });

  it('sanitises hand-edited storage', () => {
    assert.deepEqual(sanitizeDates(null), { arrival: '', expiry: '' });
    assert.deepEqual(sanitizeDates({ arrival: '2026-10-01', expiry: 5 }), { arrival: '2026-10-01', expiry: '' });
    assert.deepEqual(sanitizeDates('x'), { arrival: '', expiry: '' });
  });

  it('formats dates in each language without crashing', () => {
    for (const l of ['en', 'ro', 'fr', 'ar', 'uk', 'ne']) assert.ok(formatDate('2026-11-14', l).length > 5);
    assert.equal(formatDate('garbage', 'en'), 'garbage');
    assert.ok(formatDate('2026-11-14', 'en').includes('14'));
  });
});

describe('plan: schedule', () => {
  const tasksA = buildChecklist(procedures, profile({ accommodation: 'not-registered' }));
  const today = '2026-11-14';

  it('returns nothing without a valid arrival date', () => {
    assert.deepEqual(buildPlan(tasksA, {}, { arrival: '', expiry: '' }, today), []);
    assert.deepEqual(buildPlan(tasksA, {}, { arrival: '2026-02-30', expiry: '' }, today), []);
  });

  it('puts every task on a date after arrival, in date order', () => {
    const plan = buildPlan(tasksA, {}, { arrival: '2026-11-01', expiry: '' }, today);
    assert.equal(plan.length, tasksA.length);
    assert.ok(plan.every((i) => i.date >= '2026-11-01'));
    assert.deepEqual(plan.map((i) => i.date), [...plan.map((i) => i.date)].sort());
    assert.equal(plan[0].task.procedure.id, 'university-enrolment');
  });

  it('flags open tasks past their suggested date but never completed ones', () => {
    const progress: ProgressMap = { 'university-enrolment': 'completed' };
    const plan = buildPlan(tasksA, progress, { arrival: '2026-10-01', expiry: '' }, today);
    const uni = plan.find((i) => i.task.procedure.id === 'university-enrolment')!;
    const addr = plan.find((i) => i.task.procedure.id === 'address-registration')!;
    assert.equal(uni.pastDue, false);
    assert.equal(addr.pastDue, true);
    assert.ok(addr.daysLeft < 0);
  });

  it('pulls the residence-permit date earlier when the expiry date is close (30-day rule, unconfirmed)', () => {
    const expiry = '2026-12-10';
    const plan = buildPlan(tasksA, {}, { arrival: '2026-11-01', expiry }, today);
    const permit = plan.find((i) => i.task.procedure.id === 'residence-permit-student')!;
    assert.equal(permit.latestBy, '2026-11-10');
    assert.equal(permit.date, '2026-11-10');
    assert.equal(permit.basis, 'expiry');
    assert.equal(permit.pastDue, true);
  });

  it('keeps the usual date when the expiry is far away, but still shows the latest day', () => {
    const plan = buildPlan(tasksA, {}, { arrival: '2026-11-01', expiry: '2027-09-30' }, today);
    const permit = plan.find((i) => i.task.procedure.id === 'residence-permit-student')!;
    assert.equal(permit.basis, 'suggested');
    assert.equal(permit.date, '2026-11-22');
    assert.equal(permit.latestBy, '2027-08-31');
  });

  it('gives only the permit task a latest-day, and none without an expiry date', () => {
    const noExpiry = buildPlan(tasksA, {}, { arrival: '2026-11-01', expiry: '' }, today);
    assert.ok(noExpiry.every((i) => i.latestBy === undefined));
    const withExpiry = buildPlan(tasksA, {}, { arrival: '2026-11-01', expiry: '2027-09-30' }, today);
    assert.deepEqual(withExpiry.filter((i) => i.latestBy).map((i) => i.task.procedure.id), ['residence-permit-student']);
  });

  it('applies the same 30-day rule to the work permit for non-EU workers', () => {
    const worker = buildChecklist(procedures, profile({ situation: 'worker' }));
    const plan = buildPlan(worker, {}, { arrival: '2026-11-01', expiry: '2026-12-10' }, today);
    const permit = plan.find((i) => i.task.procedure.id === 'residence-permit-work')!;
    assert.equal(permit.latestBy, '2026-11-10');
    assert.equal(permit.basis, 'expiry');
  });

  it('plans asylum first for refugees', () => {
    const refugee = buildChecklist(procedures, profile({ situation: 'refugee' }));
    const plan = buildPlan(refugee, {}, { arrival: '2026-11-01', expiry: '' }, today);
    assert.equal(plan[0].task.procedure.id, 'international-protection');
    assert.equal(plan[0].date, '2026-11-02');
  });

  it('EU checklist plans the registration certificate and no permit', () => {
    const eu = buildChecklist(procedures, profile({ citizenship: 'eu' }));
    const plan = buildPlan(eu, {}, { arrival: '2026-11-01', expiry: '2027-09-30' }, today);
    assert.ok(plan.some((i) => i.task.procedure.id === 'eu-registration-certificate'));
    assert.ok(plan.every((i) => i.latestBy === undefined));
  });
});

describe('plan: calendar file (.ics)', () => {
  const now = new Date('2026-11-14T08:00:00Z');
  const ics = buildIcs(
    [
      { uid: 'a@welcomero', date: '2026-12-31', summary: 'WelcomeRO: Permit, with comma; and semicolon', description: 'Line one\nLine two with a very long sentence that must be folded because calendar files limit the length of every line to seventy-five characters.' },
    ],
    now,
  );

  it('is a well-formed calendar with CRLF line endings', () => {
    assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.ok(!/[^\r]\n/.test(ics), 'every newline must be CRLF');
    assert.equal((ics.match(/BEGIN:VEVENT/g) ?? []).length, 1);
    assert.equal((ics.match(/END:VEVENT/g) ?? []).length, 1);
  });

  it('writes all-day dates (end is the next day, across the year boundary)', () => {
    assert.ok(ics.includes('DTSTART;VALUE=DATE:20261231'));
    assert.ok(ics.includes('DTEND;VALUE=DATE:20270101'));
    assert.ok(ics.includes('DTSTAMP:20261114T080000Z'));
  });

  it('adds two phone reminders inside each event (3 days before and on the morning)', () => {
    assert.equal((ics.match(/BEGIN:VALARM/g) ?? []).length, 2);
    assert.equal((ics.match(/END:VALARM/g) ?? []).length, 2);
    assert.ok(ics.includes('TRIGGER:-P3D'));
    assert.ok(ics.includes('TRIGGER:PT9H'));
    assert.ok(ics.indexOf('END:VALARM') < ics.indexOf('END:VEVENT'), 'alarms are nested in the event');
  });

  it('escapes commas, semicolons and newlines, and folds long lines', () => {
    assert.ok(ics.includes('Permit\\, with comma\\; and semicolon'));
    assert.ok(ics.includes('Line one\\nLine two'));
    for (const line of ics.split('\r\n')) assert.ok(Array.from(line).length <= 75, `line too long: ${line.length}`);
  });

  it('an empty list still gives a valid, empty calendar', () => {
    const empty = buildIcs([], now);
    assert.ok(empty.includes('BEGIN:VCALENDAR') && !empty.includes('VEVENT'));
  });
});

describe('document checklist', () => {
  const permit = getProcedure('residence-permit-student')!;
  const name = permit.documents[0].name.en;

  it('ticks and unticks one document without touching others', () => {
    let map = toggleDoc({}, permit.id, name);
    assert.deepEqual(map[permit.id], [name]);
    assert.deepEqual(docCounts(permit, map), { ready: 1, total: permit.documents.length });
    map = toggleDoc(map, permit.id, name);
    assert.deepEqual(docCounts(permit, map), { ready: 0, total: permit.documents.length });
    const other = toggleDoc({}, 'cnp', 'x');
    assert.deepEqual(docCounts(permit, other), { ready: 0, total: permit.documents.length });
  });

  it('ignores stale ticks for documents that no longer exist', () => {
    assert.deepEqual(docCounts(permit, { [permit.id]: ['A document that was removed'] }).ready, 0);
  });

  it('survives corrupted storage', () => {
    assert.deepEqual(sanitizeDocs(null), {});
    assert.deepEqual(sanitizeDocs([1, 2]), {});
    assert.deepEqual(sanitizeDocs({ a: 'nope', b: ['x', 5, 'y'] }), { b: ['x', 'y'] });
  });

  it('does not mutate the previous state', () => {
    const before = { [permit.id]: [name] };
    toggleDoc(before, permit.id, name);
    assert.deepEqual(before, { [permit.id]: [name] });
  });
});

describe('appointment kit data and speech text', () => {
  it('every kit question has Romanian text, a pronunciation and meanings in en/fr/ar', () => {
    assert.ok(kitQuestions.length >= 4);
    for (const q of kitQuestions) {
      assert.ok(q.ro.endsWith('?') && q.pron, q.id);
      for (const l of ['en', 'fr', 'ar', 'uk', 'ne'] as const) assert.ok(q.meaning[l], `${q.id} ${l}`);
    }
    assert.equal(new Set(kitQuestions.map((q) => q.id)).size, kitQuestions.length);
  });

  it('every procedure has a Romanian title for the kit', () => {
    for (const p of procedures) assert.ok(p.title.ro, p.id);
  });

  it('speech skips [placeholders] instead of reading brackets aloud', () => {
    assert.equal(speakableText('Mă numesc [numele tău].'), 'Mă numesc , .');
    assert.ok(!speakableText('Buna [x] ziua [y]').includes('['));
  });
});

describe('AI providers: Gemini (with @google/genai) and Groq with a fake network', () => {
  const realFetch = globalThis.fetch;
  const names = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GROQ_API_KEY', 'AI_PROVIDER', 'AI_MODEL'] as const;
  const saved: Record<string, string | undefined> = {};
  const setup = (env: Partial<Record<(typeof names)[number], string>>) => {
    for (const n of names) { saved[n] = process.env[n]; delete process.env[n]; }
    Object.assign(process.env, env);
  };
  const restore = () => {
    globalThis.fetch = realFetch;
    for (const n of names) { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; }
  };
  const post = (body: unknown) => new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify(body) });
  const goodBody = { mode: 'chat', language: 'en', messages: [{ role: 'user', content: 'What is the CNP?' }, { role: 'assistant', content: 'Earlier answer' }, { role: 'user', content: 'And the tax number?' }] };
  type Seen = { url: string; headers: Record<string, string>; raw: string; body: Record<string, any> };
  const capture = (reply: unknown, status = 200) => {
    const box: { seen: Seen | null } = { seen: null };
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const mergedHeaders = new Headers(input instanceof Request ? input.headers : undefined);
      if (init?.headers) {
        new Headers(init.headers).forEach((v, k) => mergedHeaders.set(k, v));
      }
      const headers = Object.fromEntries(mergedHeaders.entries());
      const raw = typeof init?.body === 'string'
        ? init.body
        : input instanceof Request
          ? await input.clone().text()
          : '';
      box.seen = { url, headers, raw, body: raw ? JSON.parse(raw) : {} };
      return new Response(JSON.stringify(reply), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    return box;
  };

  it('Gemini: uses gemini-3.8-flash via @google/genai with key in header, MINIMAL thinking, output cap, and User-Agent', async () => {
    setup({ GEMINI_API_KEY: 'g-secret' });
    const box = capture({ candidates: [{ content: { parts: [{ text: 'The CNP is ' }, { text: 'a personal code.' }] } }] });
    try {
      const { GET, POST } = await import('../api/chat');
      assert.deepEqual(await GET().json(), { configured: true, provider: 'gemini', model: 'gemini-3.8-flash' });
      const res = await POST(post(goodBody));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { reply: 'The CNP is a personal code.' });
      const s = box.seen as Seen;
      assert.ok(s.url.includes('/models/gemini-3.8-flash:generateContent'), `unexpected url: ${s.url}`);
      assert.ok(!s.url.includes('g-secret'), 'key must not be in the URL');
      assert.equal(s.headers['x-goog-api-key'], 'g-secret');
      assert.ok(!s.raw.includes('g-secret'), 'key must not be in the body');
      assert.deepEqual(s.body.contents.map((c: any) => c.role), ['user', 'model', 'user']);
      const sysText = s.body.systemInstruction.parts[0].text;
      assert.ok(sysText.includes('Residence permit for studies'));
      assert.deepEqual(s.body.generationConfig.thinkingConfig, { thinkingLevel: 'MINIMAL' });
      assert.equal(s.body.generationConfig.maxOutputTokens, 500);
    } finally { restore(); }
  });

  it('Gemini: ignores "thought" parts, honours AI_MODEL, and handles multimodal image + userContext', async () => {
    setup({ GEMINI_API_KEY: 'g', AI_MODEL: 'gemini-custom-test' });
    const box = capture({ candidates: [{ content: { parts: [{ text: 'internal reasoning', thought: true }, { text: 'Final answer.' }] } }] });
    try {
      const { POST } = await import('../api/chat');
      const res = await POST(post({
        mode: 'document',
        language: 'en',
        userContext: { situation: 'student', citizenship: 'non-eu', completedCount: 2, totalCount: 7 },
        messages: [
          {
            role: 'user',
            content: 'Explain this Romanian notice.',
            attachment: { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' },
          },
        ],
      }));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { reply: 'Final answer.' });
      const s = box.seen as Seen;
      assert.ok(s.url.includes('/models/gemini-custom-test:generateContent'));
      assert.equal(s.body.generationConfig.thinkingConfig, undefined);
      assert.equal(s.body.contents[0].parts[0].inlineData.mimeType, 'image/png');
      const sysText = s.body.systemInstruction.parts[0].text;
      assert.ok(sysText.includes('student'));
      assert.ok(sysText.includes('non-eu'));
      assert.ok(sysText.includes('2/7'));
    } finally { restore(); }
  });

  it('Gemini: skips text-only Groq when an image is attached', async () => {
    setup({ GROQ_API_KEY: 'q-secret' });
    try {
      const { POST } = await import('../api/chat');
      const res = await POST(post({
        mode: 'document',
        language: 'en',
        messages: [
          {
            role: 'user',
            content: 'Explain this notice.',
            attachment: { mimeType: 'image/png', data: 'AQID' },
          },
        ],
      }));
      assert.equal(res.status, 503);
    } finally { restore(); }
  });

  it('Gemini: empty/blocked answers, rate limits and server errors map to safe codes', async () => {
    setup({ GEMINI_API_KEY: 'g' });
    try {
      const { POST } = await import('../api/chat');
      capture({ candidates: [], promptFeedback: { blockReason: 'SAFETY' } });
      assert.equal((await POST(post(goodBody))).status, 502);
      capture({}, 429);
      assert.equal((await POST(post(goodBody))).status, 429);
      globalThis.fetch = (async () => new Response('<html>oops</html>', { status: 200 })) as typeof fetch;
      assert.equal((await POST(post(goodBody))).status, 502, 'non-JSON body');
      capture({ error: { message: 'API key not valid. g' } }, 400);
      const res = await POST(post(goodBody));
      assert.equal(res.status, 502);
      assert.ok(!(await res.text()).includes('API key not valid'), 'upstream error text is not leaked');
    } finally { restore(); }
  });

  it('Gemini: failures are classified into safe reasons without leaking upstream text', async () => {
    setup({ GEMINI_API_KEY: 'g' });
    const origError = console.error;
    const logged: string[] = [];
    console.error = (...args: unknown[]) => { logged.push(args.join(' ')); };
    try {
      const { POST } = await import('../api/chat');
      const cases: Array<[string, unknown, number, number, string]> = [
        ['invalid key 403', { error: { message: 'secret-detail permission' } }, 403, 502, 'invalid_key'],
        ['invalid key 401', { error: { message: 'secret-detail' } }, 401, 502, 'invalid_key'],
        ['invalid key 400', { error: { message: 'API key not valid. secret-detail' } }, 400, 502, 'invalid_key'],
        ['model 404', { error: { message: 'secret-detail models/x is not found' } }, 404, 502, 'model_unavailable'],
        ['bad request 400', { error: { message: 'secret-detail' } }, 400, 502, 'bad_request'],
        ['quota 429', { error: { message: 'secret-detail' } }, 429, 429, 'quota_exceeded'],
        ['server 503', { error: { message: 'secret-detail' } }, 503, 502, 'upstream_5xx'],
        ['empty 200', { candidates: [] }, 200, 502, 'empty_response'],
      ];
      for (const [label, reply, status, expectedStatus, reason] of cases) {
        capture(reply, status);
        logged.length = 0;
        const res = await POST(post(goodBody));
        const text = await res.text();
        assert.equal(res.status, expectedStatus, label);
        assert.equal(JSON.parse(text).reason, reason, label);
        assert.ok(!text.includes('secret-detail') && !text.includes('API key not valid'), `${label}: no upstream text`);
        assert.ok(logged.some((l) => l.includes('gemini') && l.includes(`reason=${reason}`)), `${label}: log has provider and reason`);
        if (status !== 200) assert.ok(logged.some((l) => l.includes(`status=${status}`)), `${label}: log has status`);
      }
      globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
      let res = await POST(post(goodBody));
      assert.deepEqual(await res.json(), { error: 'upstream_error', reason: 'network' });
      globalThis.fetch = (async () => { throw Object.assign(new Error('slow'), { name: 'TimeoutError' }); }) as typeof fetch;
      res = await POST(post(goodBody));
      assert.equal(res.status, 504);
      assert.deepEqual(await res.json(), { error: 'upstream_timeout', reason: 'timeout' });
    } finally { console.error = origError; restore(); }
  });

  it('GET reports the effective model of the primary provider', async () => {
    setup({ GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gemini-test-model' } as never);
    try {
      const { GET } = await import('../api/chat');
      assert.deepEqual(await GET().json(), { configured: true, provider: 'gemini', model: 'gemini-test-model' });
    } finally { restore(); delete process.env.GEMINI_MODEL; }
  });

  it('Failures report the reason of the primary provider', async () => {
    setup({ GEMINI_API_KEY: 'g', GROQ_API_KEY: 'q' });
    const origError = console.error;
    console.error = () => {};
    try {
      const { POST } = await import('../api/chat');
      globalThis.fetch = (async (input: string | URL | Request) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        return new Response(JSON.stringify({ error: { message: 'x' } }), { status: url.includes('groq') ? 500 : 403 });
      }) as typeof fetch;
      const res = await POST(post(goodBody));
      assert.deepEqual(await res.json(), { error: 'upstream_error', reason: 'invalid_key' });
    } finally { console.error = origError; restore(); }
  });

  it('Groq: OpenAI-style request with a Bearer key and the system prompt first', async () => {
    setup({ GROQ_API_KEY: 'q-secret' });
    const box = capture({ choices: [{ message: { content: 'Use the guide.' } }] });
    try {
      const { POST } = await import('../api/chat');
      const res = await POST(post(goodBody));
      assert.deepEqual(await res.json(), { reply: 'Use the guide.' });
      const s = box.seen as Seen;
      assert.equal(s.url, 'https://api.groq.com/openai/v1/chat/completions');
      assert.equal(s.headers.authorization, 'Bearer q-secret');
      assert.ok(!s.raw.includes('q-secret'));
      assert.equal(s.body.model, 'openai/gpt-oss-20b');
      assert.equal(s.body.messages[0].role, 'system');
      assert.deepEqual(s.body.messages.slice(1).map((m: any) => m.role), ['user', 'assistant', 'user']);
      assert.equal(s.body.reasoning_effort, 'low');
      assert.ok(s.body.max_completion_tokens > 0);
    } finally { restore(); }
  });

  it('Groq: empty content and rate limit map to safe codes; other models skip reasoning_effort', async () => {
    setup({ GROQ_API_KEY: 'q', AI_MODEL: 'llama-3.3-70b-versatile' });
    try {
      const { POST } = await import('../api/chat');
      const box = capture({ choices: [{ message: { content: null } }] });
      assert.equal((await POST(post(goodBody))).status, 502);
      assert.equal((box.seen as Seen).body.reasoning_effort, undefined);
      capture({}, 429);
      assert.equal((await POST(post(goodBody))).status, 429);
    } finally { restore(); }
  });

  it('provider choice: free options win automatically, AI_PROVIDER overrides, no key means unavailable', async () => {
    try {
      const { getProvider } = await import('../api/_lib/provider');
      setup({});
      assert.equal(getProvider().isConfigured(), false);
      setup({ ANTHROPIC_API_KEY: 'a' });
      assert.equal(getProvider().name, 'anthropic');
      setup({ ANTHROPIC_API_KEY: 'a', GROQ_API_KEY: 'q' });
      assert.equal(getProvider().name, 'groq');
      setup({ ANTHROPIC_API_KEY: 'a', GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g' });
      assert.equal(getProvider().name, 'gemini');
      setup({ ANTHROPIC_API_KEY: 'a', GROQ_API_KEY: 'q', GEMINI_API_KEY: 'g', AI_PROVIDER: 'Groq' });
      assert.equal(getProvider().name, 'groq');
      setup({ GROQ_API_KEY: 'q', AI_PROVIDER: 'nonsense' });
      assert.equal(getProvider().name, 'groq', 'unknown AI_PROVIDER falls back to auto-detection');
      setup({ AI_PROVIDER: 'gemini' });
      assert.equal(getProvider().isConfigured(), false, 'chosen provider without a key is "not available"');
    } finally { restore(); }
  });
});

describe('best-effort API rate limiter', () => {
  it('allows the configured number of requests, then returns Retry-After', async () => {
    const { checkRateLimit, rateLimitedResponse } = await import('../api/_lib/rateLimit');
    const request = new Request('https://example.test/api/chat', { headers: { 'x-forwarded-for': '192.0.2.25' } });
    const scope = `test-${Date.now()}`;
    assert.equal(checkRateLimit(request, scope, 2, 60_000).allowed, true);
    assert.equal(checkRateLimit(request, scope, 2, 60_000).allowed, true);
    const blocked = checkRateLimit(request, scope, 2, 60_000);
    assert.equal(blocked.allowed, false);
    const response = rateLimitedResponse(blocked.retryAfterSeconds);
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('retry-after')) >= 1);
  });
});

describe('ElevenLabs TTS proxy (/api/tts)', () => {
  const realFetch = globalThis.fetch;
  const savedKey = process.env.ELEVENLABS_API_KEY;
  const restore = () => {
    globalThis.fetch = realFetch;
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
  };

  it('reports browser fallback when unconfigured and proxies audio/mpeg when configured', async () => {
    try {
      delete process.env.ELEVENLABS_API_KEY;
      const { GET, POST } = await import('../api/tts');
      assert.deepEqual(await GET().json(), {
        configured: false,
        provider: 'browser',
        voices: [
          { key: 'warm', label: 'Warm & Clear' },
          { key: 'calm', label: 'Calm & Steady' },
        ],
      });
      const unconfRes = await POST(new Request('http://localhost/api/tts', { method: 'POST', body: JSON.stringify({ text: 'Bună ziua' }) }));
      assert.equal(unconfRes.status, 503);

      process.env.ELEVENLABS_API_KEY = 'el-secret';
      assert.equal((await GET().json()).configured, true);

      let capturedHeaders: Record<string, string> = {};
      let capturedBody: Record<string, any> = {};
      globalThis.fetch = (async (_url: string, init: RequestInit) => {
        capturedHeaders = Object.fromEntries(new Headers(init.headers).entries());
        capturedBody = JSON.parse(init.body as string);
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        });
      }) as unknown as typeof fetch;

      const res = await POST(new Request('http://localhost/api/tts', {
        method: 'POST',
        body: JSON.stringify({ text: 'Mă numesc [numele meu].', speed: 'slow', voice: 'calm' }),
      }));
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'audio/mpeg');
      assert.equal(capturedHeaders['xi-api-key'], 'el-secret');
      assert.equal(capturedBody.language_code, 'ro');
      assert.equal(capturedBody.voice_settings.speed, 0.78);
      assert.ok(!String(capturedBody.text).includes('['), 'brackets are stripped before TTS');
    } finally {
      restore();
    }
  });
});

describe('Official and recognized source monitor allowlist & durable snapshot', () => {
  it('allows only trusted HTTPS source hosts and reconciles the committed snapshot', async () => {
    const { isOfficialAllowedUrl, extractTextFromHtml, extractHighlights, loadSourceRegistry, loadMonitorSnapshot } = await import('../api/_lib/sourcesMonitor');
    assert.equal(isOfficialAllowedUrl('https://igi.mai.gov.ro/en/'), true);
    assert.equal(isOfficialAllowedUrl('https://www.anaf.ro/anaf/internet/ANAF'), true);
    assert.equal(isOfficialAllowedUrl('http://igi.mai.gov.ro/en/'), false, 'plain HTTP must be rejected');
    assert.equal(isOfficialAllowedUrl('https://evil-mai.gov.ro.attacker.com/'), false, 'spoofed domain suffix must be rejected');
    assert.equal(isOfficialAllowedUrl('http://127.0.0.1:3000/api/chat'), false, 'localhost SSRF must be rejected');

    for (const [id, src] of Object.entries(loadSourceRegistry())) {
      assert.equal(isOfficialAllowedUrl(src.url), true, `source ${id} must pass trusted allowlist`);
    }
    const snapshot = loadMonitorSnapshot();
    assert.equal(Object.keys(snapshot.sources).length, Object.keys(loadSourceRegistry()).length);
    assert.ok(Object.values(snapshot.sources).every((source) => ['pending', 'reachable', 'updated', 'unreachable'].includes(source.status)));

    const clean = extractTextFromHtml('<html><head><script>alert(1)</script><style>.a{}</style></head><body><h1>Program IGI</h1><p>Tel: +40 256 402 450 &amp; email@mai.gov.ro</p></body></html>');
    assert.ok(!clean.includes('alert(1)'));
    assert.ok(clean.includes('Program IGI'));
    assert.ok(clean.includes('+40 256 402 450 & email@mai.gov.ro'));
    const highlights = extractHighlights(clean);
    assert.ok(highlights.some((h) => h.includes('256')));
    assert.ok(highlights.some((h) => h.includes('email@mai.gov.ro')));

    const { buildKnowledge, citationsInReply } = await import('../api/_lib/knowledge');
    const knowledge = buildKnowledge();
    assert.ok(knowledge.includes('claim-specific sources'));
    assert.ok(knowledge.includes('source note:'));
    assert.ok(knowledge.includes('| evidence:'));
    const citation = citationsInReply(`Check ${sources['igi-home'].url}`);
    assert.deepEqual(citation.map((item) => item.id), ['igi-home']);
  });
});

describe('human help: ready-made message for LOGS', () => {
  const p = profile({ situation: 'worker', workerStatus: 'employed', citizenship: 'non-eu', accommodation: 'not-registered', completed: ['none'] });
  const tasks = buildChecklist(procedures, p);
  const first = tasks[0];
  const progress = { [first.procedure.id]: 'completed' } as ProgressMap;

  it('the support organisation exists in the institutions data with an email', () => {
    const org = getInstitution(HELP_ORG_ID);
    assert.ok(org, 'logs-timisoara institution');
    assert.ok(org?.email?.includes('@'));
  });

  it('describes the situation in Romanian and splits done / to-do', () => {
    const msg = buildHelpMessage(p, tasks, progress, 'ar');
    assert.ok(msg.startsWith('Bună ziua,'));
    assert.ok(msg.includes(translate('ro', 'onb.situation.worker')));
    assert.ok(msg.includes(translate('ro', 'onb.workerStatus.employed')));
    assert.ok(msg.includes(translate('ro', 'onb.citizenship.non-eu')));
    const doneLine = msg.split('\n').find((l) => l.startsWith('Am făcut deja:'))!;
    assert.ok(doneLine.includes(first.procedure.title.ro ?? first.procedure.title.en));
    assert.ok(msg.includes('Prefer să comunic în: العربية.'));
  });

  it('does not ask for a language preference when the user already uses Romanian', () => {
    assert.ok(!buildHelpMessage(p, tasks, {}, 'ro').includes('Prefer să comunic'));
  });

  it('includes protection status context when available', () => {
    const protectedProfile = profile({ situation: 'refugee', protectionStatus: 'temporary-protection' });
    const msg = buildHelpMessage(protectedProfile, buildChecklist(procedures, protectedProfile), {}, 'uk');
    assert.ok(msg.includes(translate('ro', 'onb.protectionStatus.temporary-protection')));
  });

  it('encodes the email link so line breaks and diacritics survive', () => {
    const link = helpMailto('a@b.ro', 'Bună\nziua');
    assert.ok(link.startsWith('mailto:a@b.ro?subject='));
    assert.ok(link.includes('body=Bun%C4%83%0Aziua'));
  });
});

describe('form helper: field-by-field replies', () => {
  const sample = {
    form: 'Cerere pentru prelungirea dreptului de ședere',
    about: 'This is the application to extend your residence permit, submitted at IGI.',
    fields: [
      { label: 'Nume', meaning: 'Surname', write: 'Your family name in capital letters, as in your passport.', example: 'POPESCU' },
      { label: 'Data nașterii', meaning: 'Date of birth', write: 'DD.MM.YYYY', example: '01.01.2000' },
      { label: '', meaning: 'no label: dropped' },
      'not an object',
    ],
    skip: ['Rezervat autorității'],
    tips: ['Sign and date the last page.'],
  };

  it('reads the JSON even inside code fences, and drops unusable fields', () => {
    const guide = parseFormReply('```json\n' + JSON.stringify(sample) + '\n```');
    assert.ok(guide);
    assert.equal(guide?.form, sample.form);
    assert.deepEqual(guide?.fields.map((f) => f.label), ['Nume', 'Data nașterii']);
    assert.deepEqual(guide?.skip, ['Rezervat autorității']);
    assert.equal(guide?.tips.length, 1);
  });

  it('caps the number of fields and rejects replies that are not form guides', () => {
    const many = { ...sample, fields: Array.from({ length: 50 }, (_, i) => ({ label: `Câmp ${i}` })) };
    assert.equal(parseFormReply(JSON.stringify(many))?.fields.length, 30);
    assert.equal(parseFormReply('Sorry, I cannot read this image.'), null);
    assert.equal(parseFormReply('{"fields": "nope"}'), null);
    assert.equal(parseFormReply('{"fields": [], "about": ""}'), null);
    assert.equal(parseFormReply('{"fields": [], "about": "Take a sharper photo."}')?.about, 'Take a sharper photo.');
  });

  it('the endpoint accepts form mode, asks for JSON field by field, and allows a longer answer', async () => {
    const realFetch = globalThis.fetch;
    const savedKey = process.env.ANTHROPIC_API_KEY;
    for (const name of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'AI_PROVIDER']) delete process.env[name];
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let body: { system: string; max_tokens: number } | null = null;
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(sample) }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const { POST } = await import('../api/chat');
      const res = await POST(new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ mode: 'form', language: 'fr', messages: [{ role: 'user', content: 'Nume: ____ Prenume: ____' }] }) }));
      assert.equal(res.status, 200);
      const seen = body as unknown as { system: string; max_tokens: number };
      assert.ok(seen.system.includes('field by field'));
      assert.ok(seen.system.includes('"fields"'));
      assert.ok(seen.system.includes('in French'));
      assert.ok(seen.system.includes('NEVER copy personal data'));
      assert.equal(seen.max_tokens, 2000);
    } finally {
      globalThis.fetch = realFetch;
      if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;
    }
  });
});

describe('counter mode: interpreter endpoint', () => {
  const realFetch = globalThis.fetch;
  const savedKey = process.env.ANTHROPIC_API_KEY;
  const restore = () => {
    globalThis.fetch = realFetch;
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;
  };
  const request = (body: unknown) => new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify(body) });
  const fake = (reply: string) => {
    const box: { body: { system: string; max_tokens: number; messages: Array<{ content: unknown }> } | null } = { body: null };
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      box.body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: reply }] }), { status: 200 });
    }) as unknown as typeof fetch;
    return box;
  };

  it('to Romanian: translates from the user language, polite register, translation only', async () => {
    for (const name of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'AI_PROVIDER']) delete process.env[name];
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const box = fake('Bună ziua, aș dori să prelungesc permisul de ședere.');
    try {
      const { POST } = await import('../api/chat');
      const res = await POST(request({ mode: 'interpret', direction: 'to_ro', language: 'uk', messages: [{ role: 'user', content: 'Я хочу продовжити дозвіл на проживання' }] }));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { reply: 'Bună ziua, aș dori să prelungesc permisul de ședere.' });
      const seen = box.body!;
      assert.ok(seen.system.includes('from Ukrainian into Romanian'));
      assert.ok(seen.system.includes('dumneavoastră'));
      assert.ok(seen.system.includes('Output ONLY the translation'));
      assert.ok(!seen.system.includes('KNOWLEDGE:'), 'fast prompt: no knowledge base');
      assert.equal(seen.max_tokens, 600);
    } finally { restore(); }
  });

  it('to the user: translates from Romanian into the user language', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const box = fake('Aveți nevoie de adeverința de student.');
    try {
      const { POST } = await import('../api/chat');
      const res = await POST(request({ mode: 'interpret', direction: 'to_user', language: 'ne', messages: [{ role: 'user', content: 'Aveți nevoie de adeverința de student.' }] }));
      assert.equal(res.status, 200);
      assert.ok(box.body!.system.includes('from Romanian into Nepali'));
    } finally { restore(); }
  });

  it('rejects interpret requests without a direction or with more than one message, before calling the AI', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let calls = 0;
    globalThis.fetch = (async () => { calls += 1; return new Response('{}'); }) as typeof fetch;
    try {
      const { POST } = await import('../api/chat');
      const m = { role: 'user', content: 'x' };
      for (const body of [
        { mode: 'interpret', language: 'en', messages: [m] },
        { mode: 'interpret', direction: 'sideways', language: 'en', messages: [m] },
        { mode: 'interpret', direction: 'to_ro', language: 'en', messages: [m, { role: 'assistant', content: 'y' }, m] },
      ]) assert.equal((await POST(request(body))).status, 400, JSON.stringify(body).slice(0, 70));
      assert.equal(calls, 0);
    } finally { restore(); }
  });
});

describe('photo upload: shrinking', () => {
  it('scales the longest side down to the limit and keeps the proportions', () => {
    assert.deepEqual(fitWithin(4032, 3024, 2000), { width: 2000, height: 1500 });
    assert.deepEqual(fitWithin(3024, 4032, 2000), { width: 1500, height: 2000 }, 'portrait photos');
  });

  it('never enlarges small images and never returns zero pixels', () => {
    assert.deepEqual(fitWithin(800, 600, 2000), { width: 800, height: 600 });
    assert.deepEqual(fitWithin(5000, 1, 2000), { width: 2000, height: 1 });
    assert.deepEqual(fitWithin(0, 0, 2000), { width: 1, height: 1 });
  });

  it('measures the real size of a data URL', () => {
    assert.equal(dataUrlBytes('data:image/jpeg;base64,'), 0);
    assert.equal(dataUrlBytes('data:image/jpeg;base64,QUJD'), 3);
    assert.equal(dataUrlBytes('data:image/jpeg;base64,QUI='), 2);
    assert.equal(dataUrlBytes('data:image/jpeg;base64,QQ=='), 1);
    assert.equal(dataUrlBytes('no comma'), 0);
  });

  it('the largest result we send fits under the server limit (5.5M base64 characters)', () => {
    assert.ok(Math.ceil((MAX_RESULT_BYTES * 4) / 3) < 5_500_000);
    assert.ok(MAX_SIDE >= 1600);
  });
});

describe('Romanian practice', () => {
  it('has decks with cards that are complete in every language', () => {
    assert.ok(DECKS.length >= 4);
    assert.equal(new Set(ALL_CARDS.map((c) => c.id)).size, ALL_CARDS.length, 'card ids are unique across decks');
    for (const deck of DECKS) {
      assert.ok(deck.cards.length >= 5, `${deck.id} has enough cards for a quiz`);
      for (const lang of DATA_LANGS) assert.ok(deck.title[lang.code], `${deck.id} title ${lang.code}`);
      for (const card of deck.cards) {
        assert.ok(card.ro.trim().length > 0);
        for (const lang of DATA_LANGS) assert.ok(card.meaning[lang.code] || lang.code === 'ro', `${card.id} meaning ${lang.code}`);
      }
    }
  });

  it('reuses the helper phrases and office questions but not the long email', () => {
    const office = DECKS.find((d) => d.id === 'office')!;
    assert.ok(office.cards.some((c) => c.id === 'appointment') && office.cards.some((c) => c.id === 'fee'));
    assert.ok(!ALL_CARDS.some((c) => c.id === 'email-documents'));
  });

  it('ignores accents, case, punctuation and [placeholders] when comparing speech', () => {
    assert.equal(normalizeForCompare('Bună ziua, [numele meu]!'), 'buna ziua');
    assert.equal(similarity('Vă mulțumesc!', 'va multumesc'), 1);
    assert.equal(rateAttempt('Nu înțeleg.', 'nu inteleg'), 'great');
    assert.equal(rateAttempt('Puteți repeta, vă rog?', 'puteti repeta va rog'), 'great');
  });

  it('rates close and wrong attempts', () => {
    assert.equal(rateAttempt('Puteți repeta, vă rog?', 'puteti repeta'), 'close', 'only part of the phrase');
    assert.equal(rateAttempt('Aveți nevoie de o copie?', 'aveti nevoie de copie'), 'great');
    assert.equal(rateAttempt('Cât costă taxa?', 'hello how are you'), 'again');
    assert.equal(rateAttempt('Nu înțeleg.', ''), 'again');
  });

  it('keeps saved progress clean and toggles cards', () => {
    assert.deepEqual(sanitizeKnown(['hello', 'hello', 'not-a-card', 5, null]), ['hello']);
    assert.deepEqual(sanitizeKnown('nope'), []);
    assert.deepEqual(toggleKnown([], 'hello'), ['hello']);
    assert.deepEqual(toggleKnown(['hello'], 'hello'), []);
    assert.deepEqual(toggleKnown(['hello'], 'hello', true), ['hello'], 'setting true twice does not duplicate');
    assert.equal(totalProgress([]).percent, 0);
    assert.equal(totalProgress(ALL_CARDS.map((c) => c.id)).percent, 100);
  });

  it('builds quiz questions with one correct answer among distinct wrong ones', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const deck of DECKS) {
      for (const q of buildQuiz(deck, [], 5, random)) {
        assert.equal(q.options.length, 4);
        assert.equal(q.options[q.correctIndex].id, q.card.id);
        assert.equal(new Set(q.options.map((o) => o.meaning.en)).size, 4, 'options have different meanings');
      }
    }
  });

  it('puts cards the learner does not know yet first in a quiz', () => {
    const deck = DECKS[0];
    const known = deck.cards.slice(0, deck.cards.length - 2).map((c) => c.id);
    const quiz = buildQuiz(deck, known, 2, () => 0.5);
    assert.deepEqual(quiz.map((q) => q.card.id).sort(), deck.cards.slice(-2).map((c) => c.id).sort());
  });
});

describe('new guides for workers and refugees', () => {
  const guide = (id: string) => getProcedure(id)!;

  it('exist, are complete in all six languages for their headline fields, and cite real sources', () => {
    for (const id of ['employment-contract', 'bank-account', 'asylum-seeker-rights', 'integration-programme', 'temporary-protection-rights', 'learn-romanian']) {
      const p = guide(id);
      assert.ok(p, id);
      for (const lang of DATA_LANGS) for (const f of ['title', 'summary', 'why', 'whoNeeds', 'whoDoesNot', 'submitWhere'] as const) {
        assert.ok(p[f][lang.code], `${id}.${f} missing ${lang.code}`);
      }
      assert.ok(p.steps.length >= 4 && p.warnings.length >= 1 && p.documents.length >= 1, `${id} has content`);
    }
  });

  it('workers get the contract guide, refugees get the asylum-stage guides, nobody gets guides that are not theirs', () => {
    const worker = ids(profile({ situation: 'worker', citizenship: 'non-eu' }));
    assert.ok(worker.includes('employment-contract') && worker.includes('residence-permit-work'));
    assert.ok(!worker.includes('asylum-seeker-rights') && !worker.includes('integration-programme'));
    const refugee = ids(profile({ situation: 'refugee', citizenship: 'non-eu' }));
    for (const id of ['international-protection', 'asylum-seeker-rights', 'temporary-protection-rights', 'integration-programme']) assert.ok(refugee.includes(id), id);
    assert.ok(!refugee.includes('employment-contract'));
    const student = ids(profile());
    for (const id of ['employment-contract', 'asylum-seeker-rights', 'integration-programme', 'temporary-protection-rights']) assert.ok(!student.includes(id), id);
  });

  it('the integration programme comes after the asylum guide it depends on', () => {
    const refugee = buildChecklist(procedures, profile({ situation: 'refugee' }));
    const order = refugee.map((t) => t.procedure.id);
    assert.ok(order.indexOf('international-protection') < order.indexOf('integration-programme'));
    assert.deepEqual(guide('integration-programme').dependsOn, ['international-protection']);
  });

  it('the anti-trafficking helpline number is cited to the European e-Justice portal', () => {
    const warning = guide('employment-contract').warnings.find((w) => w.text.en.includes('0800 800 678'));
    assert.ok(warning && warning.level === 'verified' && warning.sourceIds?.includes('e-justice-ro-trafficking'));
    assert.ok(sources['e-justice-ro-trafficking'].note?.includes('0800 800 678'));
  });
});

describe('calm wording', () => {
  it('guide and institution texts do not say things were "not verified" or "unconfirmed"', () => {
    const bad = /not (been )?verified|was not verified|were not verified|unconfirmed|could not be verified/i;
    const found: string[] = [];
    for (const p of procedures) {
      const texts = [p.summary.en, p.why.en, p.whoNeeds.en, p.whoDoesNot.en, p.submitWhere.en, ...p.steps.map((x) => x.text.en), ...p.warnings.map((x) => x.text.en), ...p.documents.map((d) => `${d.name.en} ${d.whereToGet.en}`)];
      for (const text of texts) if (bad.test(text)) found.push(`${p.id}: ${text.slice(0, 60)}`);
    }
    for (const i of institutions) if (bad.test(i.verifiedNote.en)) found.push(`${i.id}: note`);
    assert.deepEqual(found, []);
  });

  it('every guide with "confirm at the office" items is covered by the one note shown at the top (the string exists in all languages)', () => {
    for (const lang of LANGUAGES) assert.ok(dictionaries[lang.code]['guide.confirmNote'].length > 20, lang.code);
    assert.ok(procedures.some((p) => p.steps.some((s) => s.level === 'confirm')));
  });

  it('the emergency and helpline numbers appear in every language, and the helpline is cited', () => {
    for (const lang of LANGUAGES) {
      assert.ok(dictionaries[lang.code]['safe.traffic'].includes('0800 800 678'), `${lang.code} helpline`);
      assert.ok(dictionaries[lang.code]['safe.112'].includes('112'), `${lang.code} 112`);
    }
    assert.ok(sources['e-justice-ro-trafficking'].note?.includes('0800 800 678'));
  });
});

describe('text size', () => {
  it('knows the three sizes and scales up only', () => {
    assert.ok(isTextSize('normal') && isTextSize('large') && isTextSize('xlarge'));
    assert.ok(!isTextSize('huge') && !isTextSize(3));
    assert.equal(TEXT_SIZE_PERCENT.normal, 100);
    assert.ok(TEXT_SIZE_PERCENT.large > 100 && TEXT_SIZE_PERCENT.xlarge > TEXT_SIZE_PERCENT.large);
  });
});

describe('guide details in your language (AI translation helpers)', () => {
  const permit = getProcedure('residence-permit-work')!;

  it('collects only English-only texts, once each, and nothing for English', () => {
    assert.deepEqual(collectEnglishOnly(permit, 'en'), []);
    const ne = collectEnglishOnly(permit, 'ne');
    assert.ok(ne.length >= 10);
    assert.equal(new Set(ne).size, ne.length);
    assert.ok(ne.includes(permit.steps[0].text.en));
    assert.ok(!ne.includes(permit.title.en), 'headline fields are already translated');
    const done = { ...permit, steps: [{ ...permit.steps[0], text: { ...permit.steps[0].text, ne: 'x' } }] };
    assert.ok(!collectEnglishOnly(done, 'ne').includes(permit.steps[0].text.en), 'already translated text is skipped');
  });

  it('splits into batches under the server limit and keeps global numbering', () => {
    const texts = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} `.repeat(6).trim());
    const batches = makeBatches(texts);
    assert.ok(batches.length > 1);
    for (const batch of batches) assert.ok(formatBatch(batch).length <= MAX_BATCH_CHARS + 10, 'batch fits');
    assert.deepEqual(batches.flat().map((e) => e.index), texts.map((_, i) => i));
    assert.ok(formatBatch(batches[1]).startsWith(`${batches[1][0].index + 1}| `));
  });

  it('flattens line breaks and truncates absurdly long texts', () => {
    const [[entry]] = makeBatches(['Line one\n\nline two']);
    assert.equal(entry.text, 'Line one line two');
    assert.ok(makeBatches(['x'.repeat(5000)])[0][0].text.length < MAX_BATCH_CHARS);
  });

  it('reads the numbered reply, tolerating spaces, blank lines and chatter, and reports what is missing', () => {
    const reply = 'Here you go:\n1| Prima propoziție\n\n 2 |  A doua propoziție \n4| A patra\nnot a numbered line';
    const parsed = parseBatchReply(reply);
    assert.equal(parsed.get(0), 'Prima propoziție');
    assert.equal(parsed.get(1), 'A doua propoziție');
    assert.equal(parsed.get(3), 'A patra');
    assert.equal(parsed.size, 3);
    assert.deepEqual(missingIndexes([{ index: 0 }, { index: 1 }, { index: 2 }, { index: 3 }], parsed), [2]);
  });

  it('the endpoint accepts translate mode and asks for numbered lines in the target language', async () => {
    const realFetch = globalThis.fetch;
    const savedKey = process.env.ANTHROPIC_API_KEY;
    for (const name of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'AI_PROVIDER']) delete process.env[name];
    process.env.ANTHROPIC_API_KEY = 'test-key';
    let body: { system: string; max_tokens: number } | null = null;
    globalThis.fetch = (async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '1| Prima\n2| A doua' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    try {
      const { POST } = await import('../api/chat');
      const res = await POST(new Request('http://localhost/api/chat', { method: 'POST', body: JSON.stringify({ mode: 'translate', language: 'ro', messages: [{ role: 'user', content: '1| First\n2| Second' }] }) }));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { reply: '1| Prima\n2| A doua' });
      const seen = body as unknown as { system: string; max_tokens: number };
      assert.ok(seen.system.includes('into Romanian'));
      assert.ok(seen.system.includes('N| translation'));
      assert.ok(!seen.system.includes('KNOWLEDGE:'));
      assert.equal(seen.max_tokens, 4000);
    } finally {
      globalThis.fetch = realFetch;
      if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = savedKey;
    }
  });
});
