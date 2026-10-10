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
const PROGRESS_COLUMNS = 'site_id,environment,task_id,subtask_id,status';

/** Alle afkrydsninger (til forsiden) eller for ét site. */
export const loadProgress = async (siteId = null) =>
  fetchAll(() => {
    let q = supabase.from('site_progress').select(PROGRESS_COLUMNS).order('id');
    if (siteId) q = q.eq('site_id', siteId);
    return q;
  });

/**
 * Sæt status for en række trin.
 * steps: [{ kind: 't' | 's', id }], status: 'done' | 'na' | null (null = åbent igen)
 */
export async function setStatus(siteId, env, steps, status, userId) {
  const taskIds = steps.filter((s) => s.kind === 't').map((s) => s.id);
  const subIds = steps.filter((s) => s.kind === 's').map((s) => s.id);

  if (!status) {
    if (taskIds.length) {
      check(
        await supabase
          .from('site_progress').delete()
          .eq('site_id', siteId).eq('environment', env).in('task_id', taskIds)
      );
    }
    if (subIds.length) {
      check(
        await supabase
          .from('site_progress').delete()
          .eq('site_id', siteId).eq('environment', env).in('subtask_id', subIds)
      );
    }
    return;
  }

  const stamp = new Date().toISOString();
  const base = { site_id: siteId, environment: env, status, updated_by: userId, updated_at: stamp };
  if (taskIds.length) {
    check(
      await supabase
        .from('site_progress')
        .upsert(taskIds.map((id) => ({ ...base, task_id: id })), {
          onConflict: 'site_id,environment,task_id',
        })
    );
  }
  if (subIds.length) {
    check(
      await supabase
        .from('site_progress')
        .upsert(subIds.map((id) => ({ ...base, subtask_id: id })), {
          onConflict: 'site_id,environment,subtask_id',
        })
    );
  }
}

// ---------- Kommentarer ----------
export const loadComments = async (siteId) =>
  fetchAll(() =>
    supabase.from('comments').select('*').eq('site_id', siteId).order('created_at').order('id')
  );

export const addComment = async (values) =>
  check(await supabase.from('comments').insert(values).select().single());

export const deleteComment = async (id) =>
  check(await supabase.from('comments').delete().eq('id', id));

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
