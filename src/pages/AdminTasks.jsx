import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../lib/api';
import { useToast } from '../lib/toast';
import { buildTree } from '../lib/progress';

const nextPosition = (list) => list.reduce((max, x) => Math.max(max, x.position), 0) + 1;

/** Tekstfelt der gemmer, når man forlader det (og kun hvis der er ændret noget). */
function TextField({ value, onCommit, className, placeholder, multiline, rows = 3 }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const next = text.trim();
    if (next === value) return;
    if (!multiline && !next) {
      setText(value); // titler må ikke være tomme
      return;
    }
    onCommit(next);
  };
  const props = {
    value: text,
    className,
    placeholder,
    onChange: (e) => setText(e.target.value),
    onBlur: commit,
  };
  return multiline ? (
    <textarea {...props} rows={rows} />
  ) : (
    <input {...props} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
  );
}

/** Lille formular til at tilføje noget nyt til en liste. */
function AddForm({ placeholder, onAdd, buttonLabel = 'Tilføj' }) {
  const [text, setText] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    await onAdd(value);
  };
  return (
    <form className="add-form" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
      <button className="btn btn-sm" disabled={!text.trim()}>{buttonLabel}</button>
    </form>
  );
}

function Mover({ index, count, onMove }) {
  return (
    <span className="mover">
      <button type="button" className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} title="Flyt op" aria-label="Flyt op">↑</button>
      <button type="button" className="icon-btn" disabled={index === count - 1} onClick={() => onMove(1)} title="Flyt ned" aria-label="Flyt ned">↓</button>
    </span>
  );
}

function ItemRow({ item, index, count, table, sub, onMove, onSave, onDelete, children, extra }) {
  const [showDesc, setShowDesc] = useState(false);
  return (
    <div className={`admin-item${sub ? ' admin-sub' : ''}`}>
      <div className="admin-item-row">
        <Mover index={index} count={count} onMove={onMove} />
        <TextField
          value={item.title}
          className="admin-title"
          onCommit={(title) => onSave(table, item.id, { title })}
        />
        {extra}
        <button
          type="button"
          className={`btn btn-sm${showDesc || item.description ? ' btn-soft' : ''}`}
          onClick={() => setShowDesc((v) => !v)}
          aria-expanded={showDesc}
        >
          Vejledning{item.description ? ' •' : ''}
        </button>
        <button type="button" className="icon-btn danger" onClick={() => onDelete(table, item)} title="Slet" aria-label={`Slet ${item.title}`}>
          🗑
        </button>
      </div>
      {showDesc && (
        <TextField
          multiline
          value={item.description}
          className="admin-desc"
          placeholder="Vejledning: trin, tips og links. Vises, når man klikker på ⓘ ved opgaven."
          onCommit={(description) => onSave(table, item.id, { description })}
        />
      )}
      {children}
    </div>
  );
}

export default function AdminTasks() {
  const toast = useToast();
  const [structure, setStructure] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());

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

  const add = (table, values, list) =>
    run(() => api.insertRow(table, { ...values, position: nextPosition(list) }));

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
      <p className="muted">
        Her bygger du standardlisten, som alle sites følger – i både test og produktion. Ændringer slår igennem på alle sites med det samme.
        Rækkefølgen her er den rækkefølge, opgaverne vises i. En opgave med underopgaver bliver først færdig, når alle underopgaver er afkrydset eller markeret som ikke relevante.
      </p>

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
                    <AddForm
                      placeholder="+ Ny underopgave"
                      onAdd={(title) => add('subtasks', { task_id: task.id, title }, task.subtasks)}
                    />
                  </div>
                </ItemRow>
              ))}
              <AddForm
                placeholder={`+ Ny opgave i "${section.title}"`}
                onAdd={(title) => add('tasks', { section_id: section.id, title }, section.tasks)}
                buttonLabel="Tilføj opgave"
              />
            </div>
          )}
        </section>
      ))}

      <div className="card pad">
        <h3>Ny sektion</h3>
        <AddForm
          placeholder="fx Grundopsætning"
          onAdd={(title) => add('sections', { title }, tree)}
          buttonLabel="Tilføj sektion"
        />
      </div>
    </div>
  );
}
