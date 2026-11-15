// Checklist logic: turns (profile + procedure data) into a personalised list of tasks.
// No React in here. The UI only displays what this file returns.
//
// How it decides:
//  1. Each procedure in procedures.json lists "audience" rules (who it is for, and whether it is "core" or "verify").
//  2. We keep the procedures whose rules match the user's situation + citizenship.
//  3. A few extra rules use the accommodation answer (written out below so they are easy to change).
//  4. "Completed" answers from onboarding pre-mark tasks as done. The user can still reopen them.
import type {
  ChecklistTask,
  Priority,
  Procedure,
  Profile,
  ProgressMap,
  TaskNote,
  TaskStatus,
} from '../types';

export const ADDRESS_PROCEDURE_ID = 'address-registration';

/**
 * Prefer a status-scoped rule when a new profile has a worker/protection status.
 * An unscoped rule remains the compatibility path for old profiles. If a procedure
 * has scoped rules but none matches a known status, it does not apply.
 */
export function findAudienceRule(procedure: Procedure, profile: Profile) {
  const baseRules = procedure.audience.filter(
    (rule) => rule.situations.includes(profile.situation) && rule.citizenships.includes(profile.citizenship),
  );

  if (profile.situation === 'worker' && profile.workerStatus) {
    const scoped = baseRules.filter((rule) => rule.workerStatuses !== undefined);
    if (scoped.length > 0) return scoped.find((rule) => rule.workerStatuses?.includes(profile.workerStatus!));
  }
  if (profile.situation === 'refugee' && profile.protectionStatus) {
    const scoped = baseRules.filter((rule) => rule.protectionStatuses !== undefined);
    if (scoped.length > 0) return scoped.find((rule) => rule.protectionStatuses?.includes(profile.protectionStatus!));
  }

  return baseRules.find((rule) => rule.workerStatuses === undefined && rule.protectionStatuses === undefined);
}

/** Which tasks apply to this user? Sorted in a sensible order (dependencies first). */
export function buildChecklist(procedures: Procedure[], profile: Profile): ChecklistTask[] {
  const tasks: ChecklistTask[] = [];

  for (const procedure of procedures) {
    const rule = findAudienceRule(procedure, profile);
    if (!rule) continue; // does not apply to this person

    const notes: TaskNote[] = [];
    let priority: ChecklistTask['priority'] = procedure.priority
      ? { level: procedure.priority.level, reason: procedure.priority.reason }
      : null;
    let relevance = rule.relevance;
    let preCompleted = procedure.completedKey ? profile.completed.includes(procedure.completedKey) : false;

    // --- accommodation rules ---
    if (procedure.id === ADDRESS_PROCEDURE_ID) {
      switch (profile.accommodation) {
        case 'registered':
          preCompleted = true;
          break;
        case 'not-registered':
          priority = { level: 'high' as Priority, reasonKey: 'addressNotRegistered' };
          break;
        case 'none':
          notes.push('findAccommodationFirst');
          break;
        case 'unsure':
          notes.push('accommodationUnsure');
          relevance = 'verify';
          break;
      }
    }
    if (procedure.dependsOn?.includes(ADDRESS_PROCEDURE_ID) && profile.accommodation === 'none') {
      notes.push('needsAccommodation');
    }

    if (relevance === 'verify') notes.push('verifyApplies');
    if (preCompleted) notes.push('preCompleted');

    tasks.push({ procedure, relevance, priority, notes, preCompleted });
  }

  return tasks.sort((a, b) => a.procedure.order - b.procedure.order);
}

/** The status shown to the user: their own choice if they made one, otherwise the onboarding answer. */
export function effectiveStatus(task: ChecklistTask, progress: ProgressMap): TaskStatus {
  return progress[task.procedure.id] ?? (task.preCompleted ? 'completed' : 'not-started');
}

export interface ProgressSummary {
  total: number;
  completed: number;
  inProgress: number;
  remaining: number;
  percent: number;
}

export function summarize(tasks: ChecklistTask[], progress: ProgressMap): ProgressSummary {
  const total = tasks.length;
  let completed = 0;
  let inProgress = 0;
  for (const task of tasks) {
    const status = effectiveStatus(task, progress);
    if (status === 'completed') completed += 1;
    else if (status === 'in-progress') inProgress += 1;
  }
  return {
    total,
    completed,
    inProgress,
    remaining: total - completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

/** Tasks that should be done first but are not finished, for the "Next up" box. High priority first. */
export function nextUp(tasks: ChecklistTask[], progress: ProgressMap, limit = 3): ChecklistTask[] {
  const rank = (t: ChecklistTask) => (t.priority?.level === 'high' ? 0 : t.priority?.level === 'low' ? 2 : 1);
  return tasks
    .filter((t) => effectiveStatus(t, progress) !== 'completed')
    .sort((a, b) => rank(a) - rank(b) || a.procedure.order - b.procedure.order)
    .slice(0, limit);
}

/** Unfinished tasks that have a deadline in the data. */
export function timeSensitive(tasks: ChecklistTask[], progress: ProgressMap): ChecklistTask[] {
  return tasks.filter((t) => t.procedure.deadline && effectiveStatus(t, progress) !== 'completed');
}

/** Procedures this task depends on that are on the user's list but not finished yet. */
export function pendingDependencies(task: ChecklistTask, tasks: ChecklistTask[], progress: ProgressMap): Procedure[] {
  const wanted = task.procedure.dependsOn ?? [];
  return tasks
    .filter((t) => wanted.includes(t.procedure.id) && effectiveStatus(t, progress) !== 'completed')
    .map((t) => t.procedure);
}

/** True when the profile is too broad for a status-specific checklist. */
export function hasLimitedCoverage(profile: Profile): boolean {
  if (profile.situation === 'other') return true;
  if (profile.situation === 'worker') return profile.workerStatus !== 'employed';
  if (profile.situation === 'refugee') return !profile.protectionStatus || profile.protectionStatus === 'unsure';
  return false;
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return value === 'not-started' || value === 'in-progress' || value === 'completed';
}

/** Remove invalid entries from stored progress. */
export function sanitizeProgress(value: unknown): ProgressMap {
  if (!value || typeof value !== 'object') return {};
  const result: ProgressMap = {};
  for (const [id, status] of Object.entries(value as Record<string, unknown>)) {
    if (isTaskStatus(status)) result[id] = status;
  }
  return result;
}
