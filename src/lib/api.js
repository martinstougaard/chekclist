// Alle kald til databasen samlet ét sted.
import { supabase } from './supabase';

function check({ data, error }) {
  if (error) throw error;
  return data;
}

/** Supabase returnerer højst 1000 rækker pr. kald – hent alle sider. */
async function fetchAll(makeQuery) {
  const pageSize = 1000;
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const page = check(await makeQuery().range(from, from + pageSize - 1));
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}

// ---------- Profiler ----------
export const loadProfiles = async () =>
  check(await supabase.from('profiles').select('*').order('name'));

export const updateProfile = async (id, patch) =>
  check(await supabase.from('profiles').update(patch).eq('id', id));

// ---------- Opgavelisten ----------
export async function loadStructure() {
  const [sections, tasks, subtasks] = await Promise.all([
    supabase.from('sections').select('*').order('position'),
    supabase.from('tasks').select('*').order('position'),
    supabase.from('subtasks').select('*').order('position'),
  ]);
  return { sections: check(sections), tasks: check(tasks), subtasks: check(subtasks) };
}

/** table: 'sections' | 'tasks' | 'subtasks' */
export const insertRow = async (table, values) =>
  check(await supabase.from(table).insert(values).select().single());

export const updateRow = async (table, id, patch) =>
  check(await supabase.from(table).update(patch).eq('id', id));

export const deleteRow = async (table, id) =>
  check(await supabase.from(table).delete().eq('id', id));

// ---------- Sites ----------
export const loadSites = async () =>
  check(await supabase.from('sites').select('*').order('created_at', { ascending: false }));

export const loadSite = async (id) =>
  check(await supabase.from('sites').select('*').eq('id', id).maybeSingle());

export const createSite = async (values) =>
  check(await supabase.from('sites').insert(values).select().single());

export const updateSite = async (id, patch) =>
  check(await supabase.from('sites').update(patch).eq('id', id));

export const deleteSite = async (id) =>
  check(await supabase.from('sites').delete().eq('id', id));

// ---------- Afkrydsninger ----------
const PROGRESS_COLUMNS = 'site_id,environment,task_id,subtask_id,site_task_id,status';

/** Alle afkrydsninger (til forsiden) eller for ét site. */
export const loadProgress = async (siteId = null) =>
  fetchAll(() => {
    let q = supabase.from('site_progress').select(PROGRESS_COLUMNS).order('id');
    if (siteId) q = q.eq('site_id', siteId);
    return q;
  });

/** Hvilken kolonne i site_progress et trin peger på: opgave, underopgave eller ekstra opgave. */
const STEP_COLUMN = { t: 'task_id', s: 'subtask_id', x: 'site_task_id' };

/**
 * Sæt status for en række trin.
 * steps: [{ kind: 't' | 's' | 'x', id }], status: 'done' | 'na' | null (null = åbent igen)
 */
export async function setStatus(siteId, env, steps, status, userId) {
  const stamp = new Date().toISOString();
  for (const kind of Object.keys(STEP_COLUMN)) {
    const ids = steps.filter((s) => s.kind === kind).map((s) => s.id);
    if (ids.length === 0) continue;
    const column = STEP_COLUMN[kind];
    if (!status) {
      check(
        await supabase
          .from('site_progress').delete()
          .eq('site_id', siteId).eq('environment', env).in(column, ids)
      );
    } else {
      const rows = ids.map((id) => ({
        site_id: siteId, environment: env, status, updated_by: userId, updated_at: stamp, [column]: id,
      }));
      check(
        await supabase
          .from('site_progress')
          .upsert(rows, { onConflict: `site_id,environment,${column}` })
      );
    }
  }
}

// ---------- Ekstra opgaver pr. site ----------
export const loadSiteTasks = async (siteId) =>
  fetchAll(() =>
    supabase.from('site_tasks').select('*').eq('site_id', siteId).order('position').order('id')
  );

/** Alle sites' ekstra opgaver (til forsiden). */
export const loadAllSiteTasks = async () =>
  fetchAll(() => supabase.from('site_tasks').select('*').order('id'));

export const createSiteTask = async (values) =>
  check(await supabase.from('site_tasks').insert(values).select().single());

export const updateSiteTask = async (id, patch) =>
  check(await supabase.from('site_tasks').update(patch).eq('id', id));

export const deleteSiteTask = async (id) =>
  check(await supabase.from('site_tasks').delete().eq('id', id));

// ---------- Kommentarer ----------
export const loadComments = async (siteId) =>
  fetchAll(() =>
    supabase.from('comments').select('*').eq('site_id', siteId).order('created_at').order('id')
  );

export const addComment = async (values) =>
  check(await supabase.from('comments').insert(values).select().single());

export const deleteComment = async (id) =>
  check(await supabase.from('comments').delete().eq('id', id));

// ---------- Go-live ----------
// Handlingerne (golive_actions) redigeres med insertRow/updateRow/deleteRow.
export const loadGoLiveActions = async () =>
  check(await supabase.from('golive_actions').select('*').order('position').order('id'));

export const loadGoLiveRun = async (siteId) =>
  check(await supabase.from('golive_runs').select('*').eq('site_id', siteId).maybeSingle());

export const loadGoLiveSteps = async (siteId) =>
  check(await supabase.from('golive_steps').select('*').eq('site_id', siteId).order('position').order('id'));

export const loadGoLiveComments = async (siteId) =>
  check(await supabase.from('golive_comments').select('*').eq('site_id', siteId).order('created_at').order('id'));

/** Opretter go-live-forløbet og kopierer handlingerne ind som trin. rows kommer fra startPlan(). */
export async function startGoLive(siteId, userId, startedAt, rows) {
  check(await supabase.from('golive_runs').insert({ site_id: siteId, started_by: userId, started_at: startedAt }));
  check(await supabase.from('golive_steps').insert(rows.map((r) => ({ ...r, site_id: siteId }))));
}

/** updates: [{ id, patch }] */
export async function updateGoLiveSteps(updates) {
  for (const u of updates) {
    check(await supabase.from('golive_steps').update(u.patch).eq('id', u.id));
  }
}

export const setGoLiveFinished = async (siteId, finishedAt) =>
  check(await supabase.from('golive_runs').update({ finished_at: finishedAt }).eq('site_id', siteId));

/** Nulstiller go-live for sitet (kommentarerne bevares). */
export async function resetGoLive(siteId) {
  check(await supabase.from('golive_steps').delete().eq('site_id', siteId));
  check(await supabase.from('golive_runs').delete().eq('site_id', siteId));
}

export const addGoLiveComment = async (values) =>
  check(await supabase.from('golive_comments').insert(values).select().single());

export const deleteGoLiveComment = async (id) =>
  check(await supabase.from('golive_comments').delete().eq('id', id));

/** Alt til statistiksiden. */
export async function loadGoLiveOverview() {
  const [runs, steps, sites] = await Promise.all([
    fetchAll(() => supabase.from('golive_runs').select('*').order('id')),
    fetchAll(() => supabase.from('golive_steps').select('*').order('id')),
    supabase.from('sites').select('id,name'),
  ]);
  return { runs, steps, sites: check(sites) };
}

// ---------- Brugeradministration (Netlify-funktion) ----------
export async function callAdmin(payload) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  let res;
  try {
    res = await fetch('/.netlify/functions/admin-users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Kunne ikke nå serveren. Brugeradministration virker kun på det udgivne site (eller med `netlify dev`).');
  }
  if (res.status === 404) {
    throw new Error('Brugeradministration er ikke tilgængelig her. Den virker kun på det udgivne Netlify-site (eller lokalt med `netlify dev`).');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Fejl (${res.status})`);
  return body;
}
