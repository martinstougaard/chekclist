import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';
import { useToast } from '../lib/toast';
import { buildTree } from '../lib/progress';
import AdminGoLive from './AdminGoLive';
import { AddForm, ItemRow, Mover, TextField, nextPosition } from '../components/AdminParts';

export default function AdminTasks() {
  const toast = useToast();
  const [structure, setStructure] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [tab, setTab] = useState('tjekliste');

  const load = useCallback(async () => {
    try {
      setStructure(await api.loadStructure());
    } catch (e) {
      toast.error(e);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const tree = useMemo(() => (structure ? buildTree(structure) : []), [structure]);

  /** Kør en ændring i databasen og hent listen igen (også ved fejl, så skærmen er rigtig). */
  const run = async (fn) => {
    try {
      await fn();
    } catch (e) {
      toast.error(e);
    }
    await load();
  };

  const save = (table, id, patch) => run(() => api.updateRow(table, id, patch));

  const add = async (table, values, list) => {
    await run(() => api.insertRow(table, { ...values, position: nextPosition(list) }));
    toast.success(`Tilføjet: "${values.title}" (nederst på listen)`);
  };

  const remove = (table, item, warning) => {
    if (!window.confirm(warning)) return;
    return run(() => api.deleteRow(table, item.id));
  };

  /** Byt plads med nabo og gem nye positioner for hele listen. */
  const move = (table, list, index, dir) => {
    const next = [...list];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    return run(() =>
      Promise.all(
        next.map((item, i) => (item.position === i + 1 ? null : api.updateRow(table, item.id, { position: i + 1 })))
      )
    );
  };

  const moveTaskToSection = (task, sectionId) => {
    const target = tree.find((s) => s.id === sectionId);
    return run(() => api.updateRow('tasks', task.id, { section_id: sectionId, position: nextPosition(target.tasks) }));
  };

  const toggleSection = (id) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!structure) return <p className="muted">Indlæser opgaver…</p>;

  return (
    <div>
      <div className="page-head">
        <h1>Opgaver</h1>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'tjekliste'} className={`tab${tab === 'tjekliste' ? ' active' : ''}`} onClick={() => setTab('tjekliste')}>
          Tjekliste
        </button>
        <button role="tab" aria-selected={tab === 'golive'} className={`tab${tab === 'golive' ? ' active' : ''}`} onClick={() => setTab('golive')}>
          Go-live-handlinger
        </button>
      </div>
      {tab === 'golive' ? <AdminGoLive /> : (
      <>
      <p className="muted">
        Her bygger du standardlisten, som alle sites følger – i både test og produktion. Ændringer slår igennem på alle sites med det samme.
        Rækkefølgen her er den rækkefølge, opgaverne vises i. En opgave med underopgaver bliver først færdig, når alle underopgaver er afkrydset eller markeret som ikke relevante.
      </p>

      <div className="card pad">
        <h3>Ny sektion</h3>
        <AddForm
          placeholder="fx Grundopsætning"
          onAdd={(title) => add('sections', { title }, tree)}
          buttonLabel="Tilføj sektion"
        />
      </div>

      {tree.length === 0 && (
        <div className="card empty">
          <p>Listen er tom. Start med at oprette en sektion, fx "Grundopsætning".</p>
        </div>
      )}

      {tree.map((section, si) => (
        <section className="card admin-section" key={section.id}>
          <header className="admin-section-head">
            <button type="button" className="icon-btn" onClick={() => toggleSection(section.id)} aria-expanded={!collapsed.has(section.id)} title={collapsed.has(section.id) ? 'Fold ud' : 'Fold sammen'}>
              {collapsed.has(section.id) ? '▸' : '▾'}
            </button>
            <Mover index={si} count={tree.length} onMove={(dir) => move('sections', tree, si, dir)} />
            <TextField value={section.title} className="admin-title admin-section-title" onCommit={(title) => save('sections', section.id, { title })} />
            <span className="muted small">{section.tasks.length === 1 ? '1 opgave' : `${section.tasks.length} opgaver`}</span>
            <button
              type="button"
              className="icon-btn danger"
              title="Slet sektion"
              aria-label={`Slet sektionen ${section.title}`}
              onClick={() =>
                remove(
                  'sections',
                  section,
                  `Slet sektionen "${section.title}" med alle ${section.tasks.length} opgaver?\n\nAfkrydsninger og kommentarer på opgaverne bliver også slettet på alle sites.`
                )
              }
            >
              🗑
            </button>
          </header>

          {!collapsed.has(section.id) && (
            <div className="admin-section-body">
              <AddForm
                placeholder={`+ Ny opgave i "${section.title}"`}
                onAdd={(title) => add('tasks', { section_id: section.id, title }, section.tasks)}
                buttonLabel="Tilføj opgave"
              />
              {section.tasks.map((task, ti) => (
                <ItemRow
                  key={task.id}
                  item={task}
                  table="tasks"
                  index={ti}
                  count={section.tasks.length}
                  onMove={(dir) => move('tasks', section.tasks, ti, dir)}
                  onSave={save}
                  onDelete={(table, item) =>
                    remove(
                      table,
                      item,
                      `Slet opgaven "${item.title}"${task.subtasks.length ? ` og dens ${task.subtasks.length} underopgaver` : ''}?\n\nAfkrydsninger og kommentarer bliver også slettet på alle sites.`
                    )
                  }
                  extra={
                    tree.length > 1 && (
                      <select
                        className="move-section"
                        value={section.id}
                        onChange={(e) => moveTaskToSection(task, e.target.value)}
                        title="Flyt til anden sektion"
                        aria-label="Flyt til anden sektion"
                      >
                        {tree.map((s) => (
                          <option key={s.id} value={s.id}>{s.title}</option>
                        ))}
                      </select>
                    )
                  }
                >
                  <div className="admin-subs">
                    <AddForm
                      placeholder="+ Ny underopgave"
                      onAdd={(title) => add('subtasks', { task_id: task.id, title }, task.subtasks)}
                    />
                    {task.subtasks.map((sub, i) => (
                      <ItemRow
                        key={sub.id}
                        sub
                        item={sub}
                        table="subtasks"
                        index={i}
                        count={task.subtasks.length}
                        onMove={(dir) => move('subtasks', task.subtasks, i, dir)}
                        onSave={save}
                        onDelete={(table, item) =>
                          remove(table, item, `Slet underopgaven "${item.title}"?\n\nAfkrydsninger og kommentarer bliver også slettet på alle sites.`)
                        }
                      />
                    ))}
                  </div>
                </ItemRow>
              ))}
            </div>
          )}
        </section>
      ))}

      </>
      )}
    </div>
  );
}
