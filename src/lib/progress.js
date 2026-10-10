// Ren logik til opbygning af opgavetræet og beregning af fremskridt.
// Ingen afhængigheder, så den kan testes direkte med `npm test`.
//
// Regler:
//  - Et "trin" er en underopgave – eller selve opgaven, hvis den ikke har underopgaver.
//  - Et trin har status 'done', 'na' (ikke relevant) eller er åbent (ingen række).
//  - Fremskridt = done / (trin − na). Irrelevante trin tæller ikke med.
//  - En opgave med underopgaver er færdig, når alle underopgaver er done eller na.
//  - Ekstra opgaver, der kun gælder ét site, lægges som en sidste sektion (withSiteTasks).
//    De kan gælde 'both', 'test' eller 'prod'; i det andet miljø tæller de ikke med.

export const ENVS = ['test', 'prod'];
export const ENV_LABEL = { test: 'Test', prod: 'Produktion' };

const byPosition = (a, b) => a.position - b.position || (a.id < b.id ? -1 : 1);

function groupBy(list, key) {
  const map = new Map();
  for (const item of list) {
    if (!map.has(item[key])) map.set(item[key], []);
    map.get(item[key]).push(item);
  }
  return map;
}

/** sections → tasks → subtasks, sorteret efter position. */
export function buildTree({ sections, tasks, subtasks }) {
  const subsByTask = groupBy(subtasks, 'task_id');
  const tasksBySection = groupBy(tasks, 'section_id');
  return [...sections].sort(byPosition).map((section) => ({
    ...section,
    tasks: [...(tasksBySection.get(section.id) || [])].sort(byPosition).map((task) => ({
      ...task,
      subtasks: [...(subsByTask.get(task.id) || [])].sort(byPosition),
    })),
  }));
}

/** kind: 't' (opgave), 's' (underopgave) eller 'x' (ekstra opgave på ét site) */
export const stepKey = (env, kind, id) => `${env}:${kind}:${id}`;

/** Gør en liste af site_progress-rækker (for ét site) slåbar: nøgle → 'done' | 'na'. */
export function indexProgress(rows) {
  const map = new Map();
  for (const r of rows) {
    if (r.task_id) map.set(stepKey(r.environment, 't', r.task_id), r.status);
    else if (r.subtask_id) map.set(stepKey(r.environment, 's', r.subtask_id), r.status);
    else if (r.site_task_id) map.set(stepKey(r.environment, 'x', r.site_task_id), r.status);
  }
  return map;
}

/** De trin en opgave består af. */
export function taskSteps(task) {
  return task.subtasks.length
    ? task.subtasks.map((s) => ({ kind: 's', id: s.id }))
    : [{ kind: task.kind || 't', id: task.id }];
}

/** Gælder opgaven i dette miljø? Kun ekstra opgaver kan være begrænset til test eller produktion. */
export const appliesTo = (task, env) =>
  !task.environments || task.environments === 'both' || task.environments === env;

export const SITE_SECTION_ID = 'site-extra';

/**
 * Tilføjer sitets egne ekstra opgaver som en sidste sektion i træet.
 * siteTasks: rækker fra site_tasks for netop dette site.
 */
export function withSiteTasks(tree, siteTasks) {
  if (!siteTasks || siteTasks.length === 0) return tree;
  const extra = {
    id: SITE_SECTION_ID,
    title: 'Ekstra opgaver til dette site',
    extra: true,
    position: Number.MAX_SAFE_INTEGER,
    tasks: [...siteTasks].sort(byPosition).map((t) => ({ ...t, kind: 'x', subtasks: [] })),
  };
  return [...tree, extra];
}

/** Rå tællere for én opgave i ét miljø. */
export function rawTaskStats(task, env, index) {
  const stats = { done: 0, na: 0, total: 0 };
  if (!appliesTo(task, env)) return stats;
  for (const step of taskSteps(task)) {
    stats.total += 1;
    const status = index.get(stepKey(env, step.kind, step.id));
    if (status === 'done') stats.done += 1;
    else if (status === 'na') stats.na += 1;
  }
  return stats;
}

/** 'done' | 'na' | 'partial' | 'open' ud fra rå tællere. */
export function taskState({ done, na, total }) {
  if (total === 0) return 'open';
  if (na === total) return 'na';
  if (done + na === total) return 'done';
  if (done + na > 0) return 'partial';
  return 'open';
}

export function addStats(a, b) {
  return { done: a.done + b.done, na: a.na + b.na, total: a.total + b.total };
}

const ZERO = { done: 0, na: 0, total: 0 };

export function rawSectionStats(section, env, index) {
  return section.tasks.reduce((sum, t) => addStats(sum, rawTaskStats(t, env, index)), ZERO);
}

export function rawEnvStats(tree, env, index) {
  return tree.reduce((sum, s) => addStats(sum, rawSectionStats(s, env, index)), ZERO);
}

/** Tilføjer base (trin der tæller med) og pct (0–100). 100 % kun når alt er færdigt. */
export function finish({ done, na, total }) {
  const base = total - na;
  let pct = 0;
  if (total > 0) {
    if (done === base) pct = 100;
    else pct = Math.min(99, Math.floor((done / base) * 100));
  }
  return { done, na, total, base, pct };
}

/** Samlet fremskridt for et site: { test, prod, total }. */
export function siteStats(tree, rows) {
  const index = indexProgress(rows);
  const test = rawEnvStats(tree, 'test', index);
  const prod = rawEnvStats(tree, 'prod', index);
  return { test: finish(test), prod: finish(prod), total: finish(addStats(test, prod)) };
}
