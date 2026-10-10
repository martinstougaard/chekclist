import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTree,
  indexProgress,
  rawTaskStats,
  taskState,
  finish,
  siteStats,
} from './progress.js';

const structure = {
  sections: [
    { id: 'sB', title: 'B', position: 2 },
    { id: 'sA', title: 'A', position: 1 },
  ],
  tasks: [
    { id: 't1', section_id: 'sA', title: 'Ret settings', position: 1 },
    { id: 't2', section_id: 'sA', title: 'Opret lokation', position: 2 },
    { id: 't3', section_id: 'sB', title: 'Godkend', position: 1 },
  ],
  subtasks: [
    { id: 'u2', task_id: 't1', title: 'Anden', position: 2 },
    { id: 'u1', task_id: 't1', title: 'Første', position: 1 },
  ],
};
const tree = buildTree(structure);
const row = (env, key, status) => ({
  environment: env,
  status,
  task_id: key.startsWith('t') ? key : null,
  subtask_id: key.startsWith('u') ? key : null,
});

test('træet sorteres efter position', () => {
  assert.deepEqual(tree.map((s) => s.id), ['sA', 'sB']);
  assert.deepEqual(tree[0].tasks.map((t) => t.id), ['t1', 't2']);
  assert.deepEqual(tree[0].tasks[0].subtasks.map((s) => s.id), ['u1', 'u2']);
});

test('tomt site: 0 % og intet er færdigt', () => {
  const s = siteStats(tree, []);
  // pr. miljø: u1, u2, t2, t3 = 4 trin
  assert.equal(s.test.total, 4);
  assert.equal(s.total.total, 8);
  assert.equal(s.total.pct, 0);
});

test('ingen opgaver giver 0 %, ikke 100 %', () => {
  assert.equal(siteStats([], []).total.pct, 0);
});

test('opgave med underopgaver er først færdig når alle er done eller na', () => {
  const t1 = tree[0].tasks[0];
  let idx = indexProgress([row('test', 'u1', 'done')]);
  assert.equal(taskState(rawTaskStats(t1, 'test', idx)), 'partial');
  idx = indexProgress([row('test', 'u1', 'done'), row('test', 'u2', 'na')]);
  assert.equal(taskState(rawTaskStats(t1, 'test', idx)), 'done');
  idx = indexProgress([row('test', 'u1', 'na'), row('test', 'u2', 'na')]);
  assert.equal(taskState(rawTaskStats(t1, 'test', idx)), 'na');
});

test('test og produktion tælles hver for sig', () => {
  const s = siteStats(tree, [row('test', 'u1', 'done'), row('test', 'u2', 'done')]);
  assert.equal(s.test.done, 2);
  assert.equal(s.prod.done, 0);
  assert.equal(s.test.pct, 50);
  assert.equal(s.total.pct, 25);
});

test('irrelevante trin tæller ikke med i nævneren', () => {
  const rows = [
    row('test', 'u1', 'done'),
    row('test', 'u2', 'na'),
    row('test', 't2', 'na'),
    row('test', 't3', 'done'),
  ];
  const s = siteStats(tree, rows);
  assert.equal(s.test.base, 2);
  assert.equal(s.test.pct, 100);
});

test('99 % rundes ned, så 100 % kun vises når alt er færdigt', () => {
  assert.equal(finish({ done: 199, na: 0, total: 200 }).pct, 99);
  assert.equal(finish({ done: 200, na: 0, total: 200 }).pct, 100);
});

test('hvis alt er irrelevant, er miljøet færdigt', () => {
  assert.equal(finish({ done: 0, na: 3, total: 3 }).pct, 100);
});

test('opgave uden underopgaver bruger sin egen status', () => {
  const t2 = tree[0].tasks[1];
  const idx = indexProgress([row('prod', 't2', 'done')]);
  assert.equal(taskState(rawTaskStats(t2, 'prod', idx)), 'done');
  assert.equal(taskState(rawTaskStats(t2, 'test', idx)), 'open');
});
