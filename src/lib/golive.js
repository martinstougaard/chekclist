// Logik for go-live: rækkefølge, tidsstempler og målinger. Ren logik uden database (testet).

const byPosition = (a, b) => a.position - b.position || String(a.id).localeCompare(String(b.id));

export const sequentialSteps = (steps) => steps.filter((s) => !s.parallel).sort(byPosition);
export const parallelSteps = (steps) => steps.filter((s) => s.parallel).sort(byPosition);

/** Det kort, der er i gang i rækkefølgen (første ikke-afsluttede), eller null. */
export function activeStep(steps) {
  return sequentialSteps(steps).find((s) => !s.finished_at) || null;
}

/**
 * Status for et kort:
 *  'done'    – afsluttet
 *  'active'  – i gang (sekventielt: det aktive kort. Sideløbende: startet, ikke afsluttet)
 *  'ready'   – sideløbende kort, der endnu ikke er startet
 *  'waiting' – sekventielt kort, der venter på det forrige
 */
export function stepStatus(step, steps) {
  if (step.finished_at) return 'done';
  if (step.parallel) return step.started_at ? 'active' : 'ready';
  return activeStep(steps)?.id === step.id ? 'active' : 'waiting';
}

export const allFinished = (steps) => steps.length > 0 && steps.every((s) => s.finished_at);

/** Rækkerne, der oprettes, når et go-live startes. Første sekventielle kort starter med det samme. */
export function startPlan(actions, now, userId) {
  const sorted = [...actions].sort(byPosition);
  const first = sorted.find((a) => !a.parallel);
  return sorted.map((a, i) => ({
    action_id: a.id,
    title: a.title,
    description: a.description || '',
    position: i + 1,
    parallel: !!a.parallel,
    started_at: first && a.id === first.id ? now : null,
    started_by: first && a.id === first.id ? userId : null,
    finished_at: null,
    finished_by: null,
  }));
}

/**
 * Afslut et kort. Afslutter man et sekventielt kort, starter det næste kort på samme tidspunkt.
 * Returnerer { updates: [{ id, patch }], runFinishedAt: string | null }.
 */
export function finishPlan(steps, stepId, now, userId) {
  const step = steps.find((s) => s.id === stepId);
  if (!step || step.finished_at) return { updates: [], runFinishedAt: null };
  if (!step.parallel && activeStep(steps)?.id !== stepId) return { updates: [], runFinishedAt: null };
  if (step.parallel && !step.started_at) return { updates: [], runFinishedAt: null };

  const updates = [{ id: step.id, patch: { finished_at: now, finished_by: userId } }];
  if (!step.parallel) {
    const seq = sequentialSteps(steps);
    const next = seq[seq.findIndex((s) => s.id === step.id) + 1];
    if (next) updates.push({ id: next.id, patch: { started_at: now, started_by: userId } });
  }
  const after = steps.map((s) => (s.id === step.id ? { ...s, finished_at: now } : s));
  return { updates, runFinishedAt: allFinished(after) ? now : null };
}

/** Start et sideløbende kort. */
export function startParallelPlan(steps, stepId, now, userId) {
  const step = steps.find((s) => s.id === stepId);
  if (!step || !step.parallel || step.started_at) return [];
  return [{ id: step.id, patch: { started_at: now, started_by: userId } }];
}

/**
 * Fortryd afslutning af et kort. Et sekventielt kort kan kun fortrydes, hvis det næste ikke er afsluttet;
 * det næste kort bliver så "ventende" igen.
 */
export function undoPlan(steps, stepId) {
  const step = steps.find((s) => s.id === stepId);
  if (!step || !step.finished_at) return null;
  const updates = [{ id: step.id, patch: { finished_at: null, finished_by: null } }];
  if (!step.parallel) {
    const seq = sequentialSteps(steps);
    const next = seq[seq.findIndex((s) => s.id === step.id) + 1];
    if (next) {
      if (next.finished_at) return null;
      updates.push({ id: next.id, patch: { started_at: null, started_by: null } });
    }
  }
  return updates;
}

// ---------- Tider ----------

export const stepDuration = (step) =>
  step.started_at && step.finished_at ? Math.max(0, new Date(step.finished_at) - new Date(step.started_at)) : null;

export const runDuration = (run) =>
  run?.finished_at ? Math.max(0, new Date(run.finished_at) - new Date(run.started_at)) : null;

/** 4 min 12 s · 1 t 05 min · 38 s */
export function formatDuration(ms) {
  if (ms == null || Number.isNaN(ms)) return '–';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} t ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${s} s`;
}

/** Tid til visning af en måler, der tikker: 00:04:12 */
export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Statistik på tværs af afsluttede go-lives.
 * runs: [{ site_id, started_at, finished_at }], steps: alle trin.
 * Returnerer { runs: [{...run, duration}] (ældste først), actions: [{ title, count, avg, min, max, last }] }.
 */
export function goLiveStats(runs, steps) {
  const done = runs
    .filter((r) => r.finished_at)
    .map((r) => ({ ...r, duration: runDuration(r) }))
    .sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at));

  const doneSites = new Set(done.map((r) => r.site_id));
  const byTitle = new Map();
  const ordered = steps
    .filter((s) => doneSites.has(s.site_id) && stepDuration(s) != null)
    .sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at));
  for (const s of ordered) {
    const entry = byTitle.get(s.title) || { title: s.title, position: s.position, parallel: s.parallel, values: [] };
    entry.values.push(stepDuration(s));
    byTitle.set(s.title, entry);
  }
  const actions = [...byTitle.values()]
    .map((e) => ({
      title: e.title,
      position: e.position,
      parallel: e.parallel,
      count: e.values.length,
      avg: e.values.reduce((a, b) => a + b, 0) / e.values.length,
      min: Math.min(...e.values),
      max: Math.max(...e.values),
      last: e.values[e.values.length - 1],
    }))
    .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  return { runs: done, actions };
}
