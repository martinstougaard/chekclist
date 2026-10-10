import { useState } from 'react';
import { useAuth } from '../lib/auth';

/** Bruges til både "Nyt site" og "Rediger site". */
export default function SiteForm({ initial, submitLabel, onSubmit, onCancel, extra }) {
  const { profiles, user } = useAuth();
  const [name, setName] = useState(initial?.name || '');
  const [responsible, setResponsible] = useState(
    initial ? initial.responsible_id || '' : user.id
  );
  const [deadline, setDeadline] = useState(initial?.deadline || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        responsible_id: responsible || null,
        deadline: deadline || null,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="form">
      <label>
        Navn på site
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="fx Aalborg lager" required autoFocus />
      </label>
      <label>
        Ansvarlig
        <select value={responsible} onChange={(e) => setResponsible(e.target.value)}>
          <option value="">Ingen valgt</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label>
        Deadline
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </label>
      <div className="form-actions">
        {extra}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onCancel}>Annullér</button>
        <button className="btn btn-primary" disabled={busy || !name.trim()}>{submitLabel}</button>
      </div>
    </form>
  );
}
