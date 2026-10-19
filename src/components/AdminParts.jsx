import { useEffect, useRef, useState } from 'react';

export const nextPosition = (list) => list.reduce((max, x) => Math.max(max, x.position), 0) + 1;

/** Tekstfelt der gemmer, når man forlader det (og kun hvis der er ændret noget). */
export function TextField({ value, onCommit, className, placeholder, multiline, rows = 3 }) {
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
export function AddForm({ placeholder, onAdd, buttonLabel = 'Tilføj' }) {
  const [text, setText] = useState('');
  const input = useRef(null);
  const submit = async (e) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText('');
    input.current?.focus(); // klar til næste, så man kan indtaste flere i træk
    await onAdd(value);
  };
  return (
    <form className="add-form" onSubmit={submit}>
      <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button className="btn btn-sm" disabled={!text.trim()}>{buttonLabel}</button>
    </form>
  );
}

export function Mover({ index, count, onMove }) {
  return (
    <span className="mover">
      <button type="button" className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} title="Flyt op" aria-label="Flyt op">↑</button>
      <button type="button" className="icon-btn" disabled={index === count - 1} onClick={() => onMove(1)} title="Flyt ned" aria-label="Flyt ned">↓</button>
    </span>
  );
}

export function ItemRow({ item, index, count, table, sub, onMove, onSave, onDelete, children, extra }) {
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
