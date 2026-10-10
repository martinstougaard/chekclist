import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as api from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import {
  ENVS,
  ENV_LABEL,
  buildTree,
  finish,
  indexProgress,
  rawSectionStats,
  rawTaskStats,
  siteStats,
  stepKey,
  taskState,
  taskSteps,
} from '../lib/progress';
import { daysUntil, formatDate } from '../lib/format';
import ProgressBar from '../components/ProgressBar';
import Modal from '../components/Modal';
import SiteForm from '../components/SiteForm';
import Comments, { Linkified } from '../components/Comments';

const TABS = ['test', 'prod', 'kommentarer'];

/** To knapper: ✓ (færdig) og – (ikke relevant). Klik på den aktive nulstiller. */
function StatusControl({ state, derived, onDone, onNa, label }) {
  return (
    <span className={`status-ctl state-${state}`} role="group" aria-label={`Status for ${label}`}>
      <button
        type="button"
        className={`status-btn status-done${state === 'done' ? ' on' : ''}`}
        onClick={onDone}
        aria-pressed={state === 'done'}
        title={state === 'done' ? 'Færdig – klik for at åbne igen' : derived ? 'Afkryd alle underopgaver' : 'Markér som færdig'}
      >
        ✓
      </button>
      <button
        type="button"
        className={`status-btn status-na${state === 'na' ? ' on' : ''}`}
        onClick={onNa}
        aria-pressed={state === 'na'}
        title={state === 'na' ? 'Ikke relevant – klik for at åbne igen' : derived ? 'Marker alle underopgaver som ikke relevante' : 'Markér som ikke relevant'}
      >
        –
      </button>
    </span>
  );
}

/** Én række i tjeklisten (opgave eller underopgave). */
function Row({ title, description, state, derived, counter, commentCount, onDone, onNa, renderComments, sub }) {
  const [panel, setPanel] = useState(null); // 'info' | 'comments' | null
  const toggle = (name) => setPanel((p) => (p === name ? null : name));
  return (
    <div className={`row state-${state}${sub ? ' row-sub' : ''}`}>
      <div className="row-main">
        <StatusControl state={state} derived={derived} onDone={onDone} onNa={onNa} label={title} />
        <span className="row-title">{title}</span>
        {counter && <span className="row-counter">{counter}</span>}
        {description && (
          <button type="button" className={`icon-btn${panel === 'info' ? ' on' : ''}`} onClick={() => toggle('info')} title="Vis vejledning" aria-expanded={panel === 'info'}>
            ⓘ
          </button>
        )}
        <button type="button" className={`icon-btn${panel === 'comments' ? ' on' : ''}`} onClick={() => toggle('comments')} title="Kommentarer" aria-expanded={panel === 'comments'}>
          💬{commentCount > 0 && <span className="icon-count">{commentCount}</span>}
        </button>
      </div>
      {panel === 'info' && <div className="row-panel description"><Linkified text={description} /></div>}
      {panel === 'comments' && <div className="row-panel">{renderComments()}</div>}
    </div>
  );
}

export default function SitePage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAdmin, nameOf } = useAuth();
  const toast = useToast();

  const tab = TABS.includes(params.get('fane')) ? params.get('fane') : 'test';
  const setTab = (t) => setParams({ fane: t }, { replace: true });

  const [site, setSite] = useState(undefined); // undefined = indlæser, null = findes ikke
  const [structure, setStructure] = useState(null);
  const [rows, setRows] = useState([]);
  const [comments, setComments] = useState([]);
  const [hideDone, setHideDone] = useState(false);
  const [editing, setEditing] = useState(false);

  const loadAll = useCallback(
    async (withStructure = true) => {
      try {
        const [s, p, c, st] = await Promise.all([
          api.loadSite(id),
          api.loadProgress(id),
          api.loadComments(id),
          withStructure ? api.loadStructure() : null,
        ]);
        setSite(s);
        setRows(p);
        setComments(c);
        if (st) setStructure(st);
      } catch (e) {
        toast.error(e);
        setSite((cur) => (cur === undefined ? null : cur));
      }
    },
    [id, toast]
  );

  useEffect(() => {
    setSite(undefined);
    loadAll(true);
  }, [loadAll]);

  // Live opdatering, når en kollega krydser af eller kommenterer
  const timer = useRef(null);
  useEffect(() => {
    const refresh = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => loadAll(false), 400);
    };
    const channel = supabase
      .channel(`site-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'site_progress' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sites' }, refresh)
      .subscribe();
    const onVisible = () => document.visibilityState === 'visible' && loadAll(true);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [id, loadAll]);

  const tree = useMemo(() => (structure ? buildTree(structure) : []), [structure]);
  const index = useMemo(() => indexProgress(rows), [rows]);
  const stats = useMemo(() => siteStats(tree, rows), [tree, rows]);

  const commentCounts = useMemo(() => {
    const map = new Map();
    for (const c of comments) {
      const key = c.subtask_id ? `s:${c.subtask_id}` : c.task_id ? `t:${c.task_id}` : null;
      if (key) map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [comments]);

  const commentsFor = (taskId, subtaskId) =>
    comments.filter((c) => (c.task_id || null) === (taskId || null) && (c.subtask_id || null) === (subtaskId || null));

  // ----- Handlinger -----

  /** steps: [{kind,id}], status: 'done' | 'na' | null */
  const setStatus = async (env, steps, status) => {
    if (steps.length === 0) return;
    const keyOf = (r) => (r.task_id ? stepKey(r.environment, 't', r.task_id) : stepKey(r.environment, 's', r.subtask_id));
    const keys = new Set(steps.map((s) => stepKey(env, s.kind, s.id)));
    const previous = rows;
    setRows((cur) => {
      const kept = cur.filter((r) => !keys.has(keyOf(r)));
      if (!status) return kept;
      return [
        ...kept,
        ...steps.map((s) => ({
          site_id: id,
          environment: env,
          task_id: s.kind === 't' ? s.id : null,
          subtask_id: s.kind === 's' ? s.id : null,
          status,
        })),
      ];
    });
    try {
      await api.setStatus(id, env, steps, status, user.id);
    } catch (e) {
      setRows(previous);
      toast.error(`Kunne ikke gemme: ${e.message}`);
    }
  };

  const addComment = async (body, { taskId = null, subtaskId = null, env = null }) => {
    try {
      const created = await api.addComment({
        site_id: id,
        environment: env,
        task_id: taskId,
        subtask_id: subtaskId,
        author_id: user.id,
        body,
      });
      setComments((cur) => [...cur, created]);
    } catch (e) {
      toast.error(`Kunne ikke gemme kommentaren: ${e.message}`);
      throw e;
    }
  };

  const removeComment = async (commentId) => {
    try {
      await api.deleteComment(commentId);
      setComments((cur) => cur.filter((c) => c.id !== commentId));
    } catch (e) {
      toast.error(e);
    }
  };

  const saveSite = async (values) => {
    try {
      await api.updateSite(id, values);
      setSite((cur) => ({ ...cur, ...values }));
      setEditing(false);
    } catch (e) {
      toast.error(e);
    }
  };

  const removeSite = async () => {
    if (!window.confirm(`Slet "${site.name}" med alle afkrydsninger og kommentarer? Det kan ikke fortrydes.`)) return;
    try {
      await api.deleteSite(id);
      navigate('/', { replace: true });
    } catch (e) {
      toast.error(e);
    }
  };

  // ----- Visning -----

  if (site === undefined) return <p className="muted">Indlæser site…</p>;
  if (site === null) {
    return (
      <div className="card empty">
        <p>Sitet findes ikke (eller er slettet).</p>
        <Link to="/" className="btn">Til forsiden</Link>
      </div>
    );
  }

  const complete = stats.total.total > 0 && stats.total.pct === 100;
  const days = daysUntil(site.deadline);
  const canDelete = isAdmin || site.created_by === user.id;

  const renderTask = (task, env) => {
    const raw = rawTaskStats(task, env, index);
    const state = taskState(raw);
    if (hideDone && (state === 'done' || state === 'na')) return null;

    const hasSubs = task.subtasks.length > 0;
    const statusOf = (step) => index.get(stepKey(env, step.kind, step.id));

    // Knapper på en overskrift med underopgaver virker på alle underopgaver
    const steps = taskSteps(task);
    const bulkDone = () => {
      if (state === 'done') setStatus(env, steps.filter((s) => statusOf(s) === 'done'), null);
      else if (state === 'na') setStatus(env, steps, 'done');
      else setStatus(env, steps.filter((s) => statusOf(s) !== 'na'), 'done');
    };
    const bulkNa = () => {
      if (state === 'na') setStatus(env, steps, null);
      else setStatus(env, steps, 'na');
    };
    const leafDone = () => setStatus(env, steps, statusOf(steps[0]) === 'done' ? null : 'done');
    const leafNa = () => setStatus(env, steps, statusOf(steps[0]) === 'na' ? null : 'na');

    return (
      <div className="task" key={task.id}>
        <Row
          title={task.title}
          description={task.description}
          state={state}
          derived={hasSubs}
          counter={hasSubs && raw.total - raw.na > 0 ? `${raw.done}/${raw.total - raw.na}` : null}
          commentCount={commentCounts.get(`t:${task.id}`) || 0}
          onDone={hasSubs ? bulkDone : leafDone}
          onNa={hasSubs ? bulkNa : leafNa}
          renderComments={() => (
            <Comments
              comments={commentsFor(task.id, null)}
              onAdd={(body) => addComment(body, { taskId: task.id, env })}
              onDelete={removeComment}
              placeholder={`Kommentar til "${task.title}"…`}
            />
          )}
        />
        {hasSubs && (
          <div className="subtasks">
            {task.subtasks.map((sub) => {
              const status = statusOf({ kind: 's', id: sub.id });
              if (hideDone && status) return null;
              const subState = status || 'open';
              return (
                <Row
                  key={sub.id}
                  sub
                  title={sub.title}
                  description={sub.description}
                  state={subState}
                  commentCount={commentCounts.get(`s:${sub.id}`) || 0}
                  onDone={() => setStatus(env, [{ kind: 's', id: sub.id }], status === 'done' ? null : 'done')}
                  onNa={() => setStatus(env, [{ kind: 's', id: sub.id }], status === 'na' ? null : 'na')}
                  renderComments={() => (
                    <Comments
                      comments={commentsFor(null, sub.id)}
                      onAdd={(body) => addComment(body, { subtaskId: sub.id, env })}
                      onDelete={removeComment}
                      placeholder={`Kommentar til "${sub.title}"…`}
                    />
                  )}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderChecklist = (env) => {
    if (tree.length === 0 || tree.every((s) => s.tasks.length === 0)) {
      return (
        <div className="card empty">
          <p>Der er endnu ingen opgaver på listen.</p>
          {isAdmin ? <Link to="/admin/opgaver" className="btn btn-primary">Opret opgaver</Link> : <p className="muted">En administrator kan oprette dem.</p>}
        </div>
      );
    }
    return tree.map((section) => {
      if (section.tasks.length === 0) return null;
      const s = finish(rawSectionStats(section, env, index));
      const body = section.tasks.map((t) => renderTask(t, env)).filter(Boolean);
      if (hideDone && body.length === 0) return null;
      return (
        <section className={`card checklist-section env-${env}`} key={section.id}>
          <header className="section-head">
            <h3>{section.title}</h3>
            <span className={`env-chip env-chip-${env}`}>{ENV_LABEL[env].toUpperCase()}</span>
            <span className="section-count">{s.base > 0 ? `${s.done}/${s.base}` : 'Alt irrelevant'}</span>
            <span className="section-mini" aria-hidden="true">
              <span style={{ width: `${s.pct}%` }} />
            </span>
          </header>
          {body}
        </section>
      );
    });
  };

  return (
    <div>
      <p className="breadcrumb"><Link to="/">← Alle sites</Link></p>

      <div className="card site-head-card">
        <div className="site-head-top">
          <div>
            <h1>{site.name}</h1>
            <dl className="meta">
              <div><dt>Ansvarlig</dt><dd>{nameOf(site.responsible_id) || 'Ingen'}</dd></div>
              <div><dt>Oprettet</dt><dd>{formatDate(site.created_at)}</dd></div>
              <div>
                <dt>Deadline</dt>
                <dd>
                  {site.deadline ? formatDate(site.deadline) : 'Ingen'}{' '}
                  {site.deadline && !complete && days < 0 && <span className="badge badge-danger">Overskredet</span>}
                  {site.deadline && !complete && days >= 0 && days <= 7 && <span className="badge badge-warn">{days === 0 ? 'I dag' : `${days} dg.`}</span>}
                </dd>
              </div>
            </dl>
          </div>
          <button className="btn" onClick={() => setEditing(true)}>Rediger site</button>
        </div>
        <div className="site-bars">
          <ProgressBar label="Samlet" stat={stats.total} tone="total" />
          <ProgressBar label="Test" stat={stats.test} tone="test" />
          <ProgressBar label="Produktion" stat={stats.prod} tone="prod" />
        </div>
      </div>

      <div className="tabs" role="tablist">
        {ENVS.map((env) => (
          <button key={env} role="tab" aria-selected={tab === env} className={`tab tab-${env}${tab === env ? ' active' : ''}`} onClick={() => setTab(env)}>
            {ENV_LABEL[env]} <span className="tab-pct">{stats[env].pct}%</span>
          </button>
        ))}
        <button role="tab" aria-selected={tab === 'kommentarer'} className={`tab${tab === 'kommentarer' ? ' active' : ''}`} onClick={() => setTab('kommentarer')}>
          Kommentarer til sitet
          {commentsFor(null, null).length > 0 && <span className="tab-pct">{commentsFor(null, null).length}</span>}
        </button>
      </div>

      {tab !== 'kommentarer' && (
        <>
          <div className={`env-banner env-banner-${tab}`} role="status">
            <strong>{ENV_LABEL[tab].toUpperCase()}</strong>
            <span>Du krydser af i {ENV_LABEL[tab].toLowerCase()} for {site.name}</span>
          </div>
          <div className="toolbar">
            <label className="inline check">
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
              Skjul færdige og irrelevante
            </label>
            <span className="legend muted small">✓ færdig · – ikke relevant · klik igen for at fortryde</span>
          </div>
          {renderChecklist(tab)}
        </>
      )}

      {tab === 'kommentarer' && (
        <div className="card pad">
          <Comments
            comments={commentsFor(null, null)}
            onAdd={(body) => addComment(body, {})}
            onDelete={removeComment}
            placeholder="Skriv en kommentar til hele sitet…"
          />
        </div>
      )}

      {editing && (
        <Modal title="Rediger site" onClose={() => setEditing(false)}>
          <SiteForm
            initial={site}
            submitLabel="Gem"
            onSubmit={saveSite}
            onCancel={() => setEditing(false)}
            extra={canDelete && <button type="button" className="btn btn-danger" onClick={removeSite}>Slet site</button>}
          />
        </Modal>
      )}
    </div>
  );
}
