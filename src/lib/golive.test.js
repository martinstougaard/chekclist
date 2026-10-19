import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeStep, allFinished, finishPlan, formatClock, formatDuration, goLiveStats,
  runDuration, startParallelPlan, startPlan, stepDuration, stepStatus, undoPlan,
} from './golive.js';

const T0 = '2026-10-20T08:00:00.000Z';
const T1 = '2026-10-20T08:05:00.000Z';
const T2 = '2026-10-20T08:12:30.000Z';
const T3 = '2026-10-20T08:20:00.000Z';

const actions = [
  { id: 'a0', title: 'Sideløbende: DNS', position: 1, parallel: true },
  { id: 'a1', title: 'Frys data', position: 2, parallel: false },
  { id: 'a2', title: 'Migrér', position: 3, parallel: false },
  { id: 'a3', title: 'Tænd', position: 4, parallel: false },
];
// Gør startPlan-rækker til trin med id
const mk = (plan) => plan.map((r, i) => ({ id: `s${i}`, site_id: 'x', ...r }));

test('startPlan: første sekventielle kort starter, sideløbende venter', () => {
  const steps = mk(startPlan(actions, T0, 'u1'));
  assert.equal(steps.length, 4);
  assert.equal(steps[0].started_at, null); // sideløbende
  assert.equal(steps[1].started_at, T0);
  assert.equal(steps[2].started_at, null);
  assert.equal(activeStep(steps).title, 'Frys data');
  assert.equal(stepStatus(steps[0], steps), 'ready');
  assert.equal(stepStatus(steps[1], steps), 'active');
  assert.equal(stepStatus(steps[2], steps), 'waiting');
});

test('startPlan: uden sekventielle handlinger starter intet', () => {
  const steps = mk(startPlan([{ id: 'p', title: 'P', position: 1, parallel: true }], T0, 'u1'));
  assert.equal(steps[0].started_at, null);
  assert.equal(activeStep(steps), null);
});

test('afslutning af sekventielt kort starter næste på samme tidspunkt', () => {
  const steps = mk(startPlan(actions, T0, 'u1'));
  const { updates, runFinishedAt } = finishPlan(steps, 's1', T1, 'u2');
  assert.equal(runFinishedAt, null);
  assert.deepEqual(updates, [
    { id: 's1', patch: { finished_at: T1, finished_by: 'u2' } },
    { id: 's2', patch: { started_at: T1, started_by: 'u2' } },
  ]);
});

test('kan ikke afslutte et ventende kort eller et ikke-startet sideløbende kort', () => {
  const steps = mk(startPlan(actions, T0, 'u1'));
  assert.deepEqual(finishPlan(steps, 's3', T1, 'u').updates, []);
  assert.deepEqual(finishPlan(steps, 's0', T1, 'u').updates, []);
  assert.deepEqual(finishPlan(steps, 'findes-ikke', T1, 'u').updates, []);
});

test('sideløbende kort afsluttes uafhængigt og starter ikke noget', () => {
  let steps = mk(startPlan(actions, T0, 'u1'));
  const [u] = startParallelPlan(steps, 's0', T0, 'u3');
  assert.equal(u.patch.started_at, T0);
  steps = steps.map((s) => (s.id === 's0' ? { ...s, ...u.patch } : s));
  assert.equal(stepStatus(steps[0], steps), 'active');
  assert.deepEqual(startParallelPlan(steps, 's0', T1, 'u3'), []); // kan ikke startes to gange
  assert.deepEqual(startParallelPlan(steps, 's1', T1, 'u3'), []); // kun sideløbende
  const { updates } = finishPlan(steps, 's0', T1, 'u3');
  assert.equal(updates.length, 1);
});

test('go-live er først færdigt, når alle kort inkl. sideløbende er afsluttet', () => {
  let steps = mk(startPlan(actions, T0, 'u1'));
  const apply = (ups) => { steps = steps.map((s) => { const u = ups.find((x) => x.id === s.id); return u ? { ...s, ...u.patch } : s; }); };
  apply(startParallelPlan(steps, 's0', T0, 'u'));
  apply(finishPlan(steps, 's1', T1, 'u').updates);
  apply(finishPlan(steps, 's2', T2, 'u').updates);
  const last = finishPlan(steps, 's3', T3, 'u');
  assert.equal(last.runFinishedAt, null); // sideløbende mangler stadig
  apply(last.updates);
  assert.equal(allFinished(steps), false);
  const par = finishPlan(steps, 's0', T3, 'u');
  assert.equal(par.runFinishedAt, T3);
});

test('tider: kortets varighed er fra start til afslutning, og næste kort starter præcis når det forrige slutter', () => {
  let steps = mk(startPlan(actions, T0, 'u1'));
  const apply = (ups) => { steps = steps.map((s) => { const u = ups.find((x) => x.id === s.id); return u ? { ...s, ...u.patch } : s; }); };
  apply(finishPlan(steps, 's1', T1, 'u').updates);
  apply(finishPlan(steps, 's2', T2, 'u').updates);
  assert.equal(stepDuration(steps[1]), 5 * 60000);
  assert.equal(stepDuration(steps[2]), 7.5 * 60000);
  assert.equal(steps[2].started_at, steps[1].finished_at);
  assert.equal(stepDuration(steps[3]), null);
});

test('fortryd: sekventielt kort åbnes igen og næste kort bliver ventende', () => {
  let steps = mk(startPlan(actions, T0, 'u1'));
  const apply = (ups) => { steps = steps.map((s) => { const u = ups.find((x) => x.id === s.id); return u ? { ...s, ...u.patch } : s; }); };
  apply(finishPlan(steps, 's1', T1, 'u').updates);
  const undo = undoPlan(steps, 's1');
  apply(undo);
  assert.equal(stepStatus(steps[1], steps), 'active');
  assert.equal(stepStatus(steps[2], steps), 'waiting');
  assert.equal(steps[1].started_at, T0); // starttiden bevares
});

test('fortryd er ikke muligt, hvis næste kort allerede er afsluttet', () => {
  let steps = mk(startPlan(actions, T0, 'u1'));
  const apply = (ups) => { steps = steps.map((s) => { const u = ups.find((x) => x.id === s.id); return u ? { ...s, ...u.patch } : s; }); };
  apply(finishPlan(steps, 's1', T1, 'u').updates);
  apply(finishPlan(steps, 's2', T2, 'u').updates);
  assert.equal(undoPlan(steps, 's1'), null);
  assert.ok(undoPlan(steps, 's2'));
  assert.equal(undoPlan(steps, 's3'), null); // ikke afsluttet
});

test('formatDuration og formatClock', () => {
  assert.equal(formatDuration(38000), '38 s');
  assert.equal(formatDuration(252000), '4 min 12 s');
  assert.equal(formatDuration(3900000), '1 t 05 min');
  assert.equal(formatDuration(null), '–');
  assert.equal(formatClock(252000), '00:04:12');
  assert.equal(formatClock(-5), '00:00:00');
});

test('statistik: kun afsluttede go-lives, gennemsnit pr. handling og tidslinje', () => {
  const run = (site, start, end) => ({ site_id: site, started_at: start, finished_at: end });
  const runs = [
    run('A', '2026-10-01T08:00:00Z', '2026-10-01T09:00:00Z'),
    run('B', '2026-10-10T08:00:00Z', '2026-10-10T08:40:00Z'),
    run('C', '2026-10-15T08:00:00Z', null), // i gang
  ];
  const st = (site, title, pos, s, e) => ({ site_id: site, title, position: pos, parallel: false, started_at: s, finished_at: e });
  const steps = [
    st('A', 'Frys', 1, '2026-10-01T08:00:00Z', '2026-10-01T08:10:00Z'),
    st('A', 'Migrér', 2, '2026-10-01T08:10:00Z', '2026-10-01T09:00:00Z'),
    st('B', 'Frys', 1, '2026-10-10T08:00:00Z', '2026-10-10T08:06:00Z'),
    st('B', 'Migrér', 2, '2026-10-10T08:06:00Z', '2026-10-10T08:40:00Z'),
    st('C', 'Frys', 1, '2026-10-15T08:00:00Z', '2026-10-15T08:01:00Z'), // tæller ikke
  ];
  const stats = goLiveStats(runs, steps);
  assert.equal(stats.runs.length, 2);
  assert.equal(stats.runs[0].site_id, 'A');
  assert.equal(stats.runs[0].duration, 3600000);
  assert.equal(runDuration(runs[2]), null);
  const frys = stats.actions.find((a) => a.title === 'Frys');
  assert.equal(frys.count, 2);
  assert.equal(frys.avg, 8 * 60000);
  assert.equal(frys.min, 6 * 60000);
  assert.equal(frys.max, 10 * 60000);
  assert.equal(frys.last, 6 * 60000);
  assert.deepEqual(stats.actions.map((a) => a.title), ['Frys', 'Migrér']);
});
