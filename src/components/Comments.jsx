import { useState } from 'react';
import { ENV_LABEL, } from '../lib/progress';
import { formatDateTime, splitLinks } from '../lib/format';
import { useAuth } from '../lib/auth';

export function Linkified({ text }) {
  return splitLinks(text).map((part, i) =>
    part.link ? (
      <a key={i} href={part.text} target="_blank" rel="noopener noreferrer">
        {part.text}
      </a>
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
}

/**
 * Kommentartråd. `comments` er allerede filtreret til det rette sted.
 * onAdd(body) og onDelete(id) returnerer promises.
 */
export default function Comments({ comments, onAdd, onDelete, placeholder = 'Skriv en kommentar…' }) {
  const { user, isAdmin, nameOf } = useAuth();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onAdd(text);
      setBody('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="comments">
      {comments.length === 0 && <p className="muted small">Ingen kommentarer endnu.</p>}
      {comments.map((c) => (
        <div className="comment" key={c.id}>
          <div className="comment-meta">
            <strong>{c.author_id ? nameOf(c.author_id) : 'Slettet bruger'}</strong>
            <span>{formatDateTime(c.created_at)}</span>
            {c.environment && <span className={`tag tag-${c.environment}`}>{ENV_LABEL[c.environment]}</span>}
            {(c.author_id === user.id || isAdmin) && (
              <button
                type="button"
                className="link-btn danger small"
                onClick={() => window.confirm('Slet kommentaren?') && onDelete(c.id)}
              >
                Slet
              </button>
            )}
          </div>
          <div className="comment-body">
            <Linkified text={c.body} />
          </div>
        </div>
      ))}
      <form className="comment-form" onSubmit={submit}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && submit(e)}
          placeholder={placeholder}
          rows={2}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>
          Gem kommentar
        </button>
      </form>
    </div>
  );
}
