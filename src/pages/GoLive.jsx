import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as api from '../lib/api';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { buildTree, siteStats, withSiteTasks } from '../lib/progress';
import {
  activeStep, allFinished, finishPlan, formatClock, formatDuration, parallelSteps, runDuration,
  sequentialSteps, startParallelPlan, startPlan, stepDuration, stepStatus, undoPlan,
} from '../lib/golive';
import { formatDateTime } from '../lib/format';
import Comments, { Linkified } from '../components/Comments';

const timeOnly = (iso) => new Date(iso).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Et ur, der tikker hvert sekund, så længe `on` er sandt. */
function useNow(on) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

function Card({ step, number, steps, now, nameOf, onStart, onFinish, onUndo, busy }) {
  const status = stepStatus(step, steps);
  const canUndo = !!step.finished_at && undoPlan(steps, step.id) !== null;
  const elapsed = step.started_at && !step.finished_at ? now - new Date(step.started_at).getTime() : null;
  const label = { done: 'Færdig', active: 'I gang', ready: 'Klar', waiting: 'Venter' }[status];
  return (
    <article className={`golive-card golive-${status}${step.parallel ? ' golive-parallel' : ''}`} aria-label={step.title}>
      <div className="golive-num" aria-hidden="true">{step.parallel ? '⇉' : status === 'done' ? '✓' : number}</div>
      <div className="golive-main">
        <div className="golive-title-row">
          <h3>{step.title}</h3>
          <span className={`golive-state golive-state-${status}`}>{label}</span>
          {step.parallel && <span className="tag">Sideløbende</span>}
        </div>
        {step.description && (
          <div className="golive-desc"><Linkified text={step.description} /></div>
        )}
        <dl className="golive-times">
          <div><dt>Start</dt><dd>{step.started_at ? timeOnly(step.started_at) : '–'}{step.started_by && step.started_at ? ` · ${nameOf(step.started_by)}` : ''}</dd></div>
          <div><dt>Færdig</dt><dd>{step.finished_at ? timeOnly(step.finished_at) : '–'}{step.finished_by && step.finished_at ? ` · ${nameOf(step.finished_by)}` : ''}</dd></div>
          <div><dt>Tid</dt><dd>{step.finished_at ? formatDuration(stepDuration(step)) : elapsed != null ? <span className="golive-clock">{formatClock(elapsed)}</span> : '–'}</dd></div>
        </dl>
      </div>
      <div className="golive-actions">
        {status === 'active' && (
          <button type="button" className="btn btn-primary golive-big" disabled={busy} onClick={() => onFinish(step)}>
            Færdig ✓
          </button>
        )}
        {status === 'ready' && (
          <button type="button" className="btn golive-big golive-start" disabled={busy} onClick={() => onStart(step)}>
            Start
          </button>
        )}
        {canUndo && (
          <button type="button" className="link-btn small" disabled={busy} onClick={() => onUndo(step)}>
            Fortryd
          </button>
        )}
      </div>
    </article>
  );
}

export default function GoLive() {
  const { id } = useParams();
  const { user, isAdmin, nameOf } = useAuth();
  const toast = useToast();
  const [site, setSite] = useState(undefined);
  const [actions, setActions] = useState([]);
  const [run, setRun] = useState(null);
  const [steps, setSteps] = useState([]);
  const [comments, setComments] = useState([]);
  const [checklist, setChecklist] = useState(null); // { total, test, prod } i procent
  const [busy, setBusy] = useState(false);

  const loadAll = useCallback(
    async (withStatic) => {
      try {
        const [s, r, st, c] = await Promise.all([
          api.loadSite(id),
          api.loadGoLiveRun(id),
          api.loadGoLiveSteps(id),
          api.loadGoLiveComments(id),
        ]);
        setSite(s);
        setRun(r);
        setSteps(st);
        setComments(c);
        if (withStatic) {
          const [acts, structure, rows, extras] = await Promise.all([
            api.loadGoLiveActions(),
            api.loadStructure(),
            api.loadProgress(id),
            api.loadSiteTasks(id),
          ]);
          setActions(acts);
          const stats = siteStats(withSiteTasks(buildTree(structure), extras), rows);
          setChecklist({ total: stats.total.pct, test: stats.test.pct, prod: stats.prod.pct, any: stats.total.base > 0 });
        }
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

  // Live opdatering: en kollega kan fx afslutte det sideløbende kort på sin egen skærm
  const timer = useRef(null);
  useEffect(() => {
    const refresh = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => loadAll(false), 300);
    };
    const channel = supabase
      .channel(`golive-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golive_runs' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golive_steps' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golive_comments' }, refresh)
      .subscribe();
    const onVisible = () => document.visibilityState === 'visible' && loadAll(false);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [id, loadAll]);

  const running = !!run && !run.finished_at;
  const now = useNow(running);

  /** Kør en handling, vis fejl og hent altid sandheden bagefter. */
  const guard = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e);
    }
    await loadAll(false);
    setBusy(false);
  };

  const applyLocal = (updates) =>
    setSteps((cur) => cur.map((s) => {
      const u = updates.find((x) => x.id === s.id);
      return u ? { ...s, ...u.patch } : s;
    }));

  const start = () =>
    guard(async () => {
      const at = new Date().toISOString();
      await api.startGoLive(id, user.id, at, startPlan(actions, at, user.id));
    });

  const finishStep = (step) =>
    guard(async () => {
      const at = new Date().toISOString();
      const plan = finishPlan(steps, step.id, at, user.id);
      if (plan.updates.length === 0) return;
      applyLocal(plan.updates);
      await api.updateGoLiveSteps(plan.updates);
      if (plan.runFinishedAt) await api.setGoLiveFinished(id, plan.runFinishedAt);
    });

  const startStep = (step) =>
    guard(async () => {
      const updates = startParallelPlan(steps, step.id, new Date().toISOString(), user.id);
      if (updates.length === 0) return;
      applyLocal(updates);
      await api.updateGoLiveSteps(updates);
    });

  const undoStep = (step) =>
    guard(async () => {
      const updates = undoPlan(steps, step.id);
      if (!updates) return;
      applyLocal(updates);
      await api.updateGoLiveSteps(updates);
      if (run?.finished_at) await api.setGoLiveFinished(id, null);
    });

  const reset = () => {
    if (!window.confirm('Nulstil go-live for dette site?\n\nAlle tider slettes, og go-live kan startes forfra. Kommentarerne bevares.')) return;
    return guard(() => api.resetGoLive(id));
  };

  const addComment = async (body) => {
    try {
      await api.addGoLiveComment({ site_id: id, body, author_id: user.id });
      await loadAll(false);
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  const removeComment = async (cid) => {
    try {
      await api.deleteGoLiveComment(cid);
      await loadAll(false);
    } catch (e) {
      toast.error(e);
    }
  };

  const seq = useMemo(() => sequentialSteps(steps), [steps]);
  const par = useMemo(() => parallelSteps(steps), [steps]);

  if (site === undefined) return <p className="muted">Indlæser…</p>;
  if (site === null) {
    return (
      <div className="card empty">
        <p>Sitet findes ikke (eller er slettet).</p>
        <Link to="/" className="btn">Til forsiden</Link>
      </div>
    );
  }

  const finished = !!run?.finished_at;
  const doneCount = steps.filter((s) => s.finished_at).length;
  const canReset = !!run && (isAdmin || run.started_by === user.id);
  const active = activeStep(steps);

  return (
    <div className="golive-page">
      <p className="breadcrumb"><Link to={`/sites/${id}`}>← Tilbage til {site.name}</Link></p>

      <div className={`card golive-head${finished ? ' golive-head-done' : running ? ' golive-head-live' : ''}`}>
        <div>
          <h1>Go-live: {site.name}</h1>
          {!run && <p className="muted">Ikke startet endnu.</p>}
          {running && (
            <p className="golive-sub">
              Startet {formatDateTime(run.started_at)}{run.started_by ? ` af ${nameOf(run.started_by)}` : ''} · {doneCount} af {steps.length} handlinger færdige
            </p>
          )}
          {finished && (
            <p className="golive-sub">
              Gennemført {formatDateTime(run.finished_at)} · {steps.length} handlinger
            </p>
          )}
        </div>
        {running && (
          <div className="golive-total" aria-label="Tid siden start">
            <span className="golive-total-label">Tid siden start</span>
            <span className="golive-clock golive-clock-big">{formatClock(now - new Date(run.started_at).getTime())}</span>
          </div>
        )}
        {finished && (
          <div className="golive-total">
            <span className="golive-total-label">Samlet tid</span>
            <span className="golive-clock golive-clock-big">{formatDuration(runDuration(run))}</span>
          </div>
        )}
      </div>

      {!run && (
        <div className="card pad golive-start-card">
          {actions.length === 0 ? (
            <>
              <p>Der er endnu ingen go-live-handlinger.</p>
              {isAdmin
                ? <Link to="/admin/opgaver" className="btn btn-primary">Opret handlinger</Link>
                : <p className="muted">En administrator kan oprette dem under Opgaver.</p>}
            </>
          ) : (
            <>
              {checklist && checklist.any && checklist.total < 100 && (
                <div className="notice notice-warn" role="status">
                  Tjeklisten for sitet er ikke færdig: samlet {checklist.total} % (test {checklist.test} %, produktion {checklist.prod} %).
                  Du kan godt starte go-live alligevel.
                </div>
              )}
              {checklist && checklist.any && checklist.total >= 100 && (
                <div className="notice notice-ok" role="status">Tjeklisten er færdig (100 %).</div>
              )}
              <p>
                Når du starter, begynder tiden at løbe, og det første kort bliver aktivt. Når du afslutter et kort, starter det næste automatisk.
                {actions.some((a) => a.parallel) && ' Sideløbende kort startes og afsluttes for sig.'}
              </p>
              <ol className="golive-preview">
                {actions.map((a) => (
                  <li key={a.id}>{a.title}{a.parallel && <span className="tag"> Sideløbende</span>}</li>
                ))}
              </ol>
              <button type="button" className="btn btn-primary golive-big golive-start-btn" disabled={busy} onClick={start}>
                Start go-live
              </button>
            </>
          )}
        </div>
      )}

      {run && par.length > 0 && (
        <section aria-label="Sideløbende">
          <h2 className="golive-group">Sideløbende</h2>
          {par.map((s) => (
            <Card key={s.id} step={s} steps={steps} now={now} nameOf={nameOf} busy={busy} onStart={startStep} onFinish={finishStep} onUndo={undoStep} />
          ))}
        </section>
      )}

      {run && seq.length > 0 && (
        <section aria-label="Rækkefølge">
          <h2 className="golive-group">I rækkefølge</h2>
          {seq.map((s, i) => (
            <Card key={s.id} step={s} number={i + 1} steps={steps} now={now} nameOf={nameOf} busy={busy} onStart={startStep} onFinish={finishStep} onUndo={undoStep} />
          ))}
        </section>
      )}

      {run && !finished && !active && !allFinished(steps) && (
        <p className="muted">Rækkefølgen er færdig. Go-live afsluttes, når de sideløbende kort også er færdige.</p>
      )}

      {finished && (
        <div className="notice notice-ok golive-finished" role="status">
          Go-live er gennemført på {formatDuration(runDuration(run))}. Tiderne indgår i <Link to="/go-live">statistikken</Link>.
        </div>
      )}

      <section className="card pad golive-comments">
        <h2>Kommentarer til go-live</h2>
        <p className="muted small">Notér, hvad der gik godt eller skidt, så vi kan blive bedre til næste gang.</p>
        <Comments
          comments={comments}
          onAdd={addComment}
          onDelete={removeComment}
          placeholder="Hvad gik godt? Hvad gik skidt? Hvad skal vi gøre anderledes næste gang?"
        />
      </section>

      {canReset && (
        <p className="golive-reset">
          <button type="button" className="link-btn danger small" onClick={reset}>Nulstil go-live for dette site</button>
        </p>
      )}
    </div>
  );
}
