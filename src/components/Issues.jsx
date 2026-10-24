import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';

/** Felt, der gemmer, når man forlader det, og kun hvis teksten er ændret. */
function Field({ label, value, onCommit, placeholder, rows = 2 }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="issue-field">
      <span>{label}</span>
      <textarea
        value={text}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== value && onCommit(text.trim())}
      />
    </label>
  );
}

/** Ét spørgsmål med løsning og forebyggende handling. */
export function IssueCard({ issue, siteName, onChange, onDelete }) {
  const { nameOf } = useAuth();
  const solved = issue.status === 'solved';
  return (
    <article className={`card issue${solved ? ' issue-solved' : ''}`} aria-label={issue.question}>
      <header className="issue-head">
        <span className={`badge ${solved ? 'badge-live' : 'badge-warn'}`}>{solved ? 'Løst' : 'Åbent'}</span>
        {siteName && <strong className="issue-site">{siteName}</strong>}
        <span className="muted small">
          {formatDate(issue.created_at)}
          {issue.created_by ? ` · noteret af ${nameOf(issue.created_by)}` : ''}
          {issue.asked_by ? ` · stillet af ${issue.asked_by}` : ''}
        </span>
        <button type="button" className="icon-btn danger issue-del" title="Slet" aria-label={`Slet spørgsmålet ${issue.question}`} onClick={onDelete}>🗑</button>
      </header>
      <Field label="Spørgsmål" value={issue.question} rows={2} onCommit={(question) => question && onChange({ question })} />
      <Field label="Løsning" value={issue.answer} placeholder="Hvad var svaret, eller hvordan blev det løst?" onCommit={(answer) => onChange({ answer })} />
      <Field label="Forebyggende handling" value={issue.prevention} placeholder="Hvad kan vi gøre, så vi undgår spørgsmålet næste gang vi går live?" onCommit={(prevention) => onChange({ prevention })} />
      <div className="issue-foot">
        {issue.prevention && (
          <label className="inline check">
            <input type="checkbox" checked={issue.prevention_done} onChange={(e) => onChange({ prevention_done: e.target.checked })} />
            Forebyggende handling er udført
          </label>
        )}
        <button
          type="button"
          className={`btn btn-sm ${solved ? '' : 'btn-primary'}`}
          onClick={() => onChange({ status: solved ? 'open' : 'solved', solved_at: solved ? null : new Date().toISOString() })}
        >
          {solved ? 'Åbn igen' : 'Markér som løst'}
        </button>
      </div>
    </article>
  );
}

/** Formular til at registrere et nyt spørgsmål. */
export function IssueForm({ onAdd }) {
  const [question, setQuestion] = useState('');
  const [askedBy, setAskedBy] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!question.trim() || busy) return;
    setBusy(true);
    try {
      await onAdd({ question: question.trim(), asked_by: askedBy.trim() });
      setQuestion('');
      setAskedBy('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card pad issue-form" onSubmit={submit}>
      <h3>Registrér et spørgsmål</h3>
      <label>
        Spørgsmål
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} placeholder="Hvad blev der spurgt om?" required />
      </label>
      <label>
        Hvem spurgte? <span className="muted small">(valgfrit)</span>
        <input value={askedBy} onChange={(e) => setAskedBy(e.target.value)} placeholder="fx Lagerchef Jens" />
      </label>
      <p className="muted small">Løsning og forebyggende handling udfylder du bagefter, på selve spørgsmålet.</p>
      <button className="btn btn-primary" disabled={busy || !question.trim()}>Registrér spørgsmål</button>
    </form>
  );
}
