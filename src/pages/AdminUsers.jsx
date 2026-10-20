import { useState } from 'react';
import * as api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatDate } from '../lib/format';

/** 12 tegn uden tegn, der kan forveksles (0/O, 1/l/I). */
function generatePassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export default function AdminUsers() {
  const { profiles, user, refreshProfiles } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null); // { name, email, password } – vises én gang

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.callAdmin({ action: 'create', email, name, password });
      setCreated({ name: name.trim(), email: email.trim().toLowerCase(), password });
      setEmail('');
      setName('');
      setPassword('');
      await refreshProfiles();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (p) => {
    const next = window.prompt(`Ny adgangskode til ${p.name} (mindst 8 tegn):`, generatePassword());
    if (next === null) return;
    if (next.length < 8) {
      toast.error('Adgangskoden skal være mindst 8 tegn.');
      return;
    }
    try {
      await api.callAdmin({ action: 'password', id: p.id, password: next });
      setCreated({ name: p.name, email: p.email, password: next, reset: true });
    } catch (err) {
      toast.error(err);
    }
  };

  const copyLogin = async () => {
    const text = `Log ind på ${window.location.origin}\nE-mail: ${created.email}\nAdgangskode: ${created.password}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Kopieret.');
    } catch {
      toast.error('Kunne ikke kopiere. Markér teksten og kopiér den selv.');
    }
  };

  const changeRole = async (p, role) => {
    if (p.id === user.id) return;
    try {
      await api.updateProfile(p.id, { role });
      await refreshProfiles();
    } catch (err) {
      toast.error(err);
    }
  };

  const remove = async (p) => {
    if (!window.confirm(`Fjern ${p.name} (${p.email})? Personen kan ikke logge ind igen. Deres afkrydsninger og kommentarer bliver stående.`)) return;
    try {
      await api.callAdmin({ action: 'delete', id: p.id });
      toast.success(`${p.name} er fjernet.`);
      await refreshProfiles();
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Brugere</h1>
      </div>

      <form className="card pad form form-inline" onSubmit={create}>
        <h3>Opret en bruger</h3>
        <p className="muted small">
          Du vælger en adgangskode og giver den videre til kollegaen. Der sendes ingen e-mail. Kollegaen kan selv skifte den bagefter under "Adgangskode".
        </p>
        <div className="form-row">
          <label>
            Navn
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fornavn Efternavn" required />
          </label>
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="navn@firma.dk" required />
          </label>
          <label>
            Adgangskode
            <span className="pw-row">
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mindst 8 tegn" minLength={8} required autoComplete="off" />
              <button type="button" className="btn btn-sm" onClick={() => setPassword(generatePassword())}>Lav en</button>
            </span>
          </label>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Opretter…' : 'Opret bruger'}</button>
        </div>
      </form>

      {created && (
        <div className="card pad created-card" role="status">
          <h3>{created.reset ? 'Ny adgangskode sat' : 'Bruger oprettet'}</h3>
          <p>Giv disse oplysninger til {created.name}. Adgangskoden vises ikke igen, når du lukker boksen.</p>
          <dl className="created-login">
            <div><dt>E-mail</dt><dd>{created.email}</dd></div>
            <div><dt>Adgangskode</dt><dd><code>{created.password}</code></dd></div>
          </dl>
          <button type="button" className="btn btn-sm" onClick={copyLogin}>Kopiér login-oplysninger</button>{' '}
          <button type="button" className="btn btn-sm" onClick={() => setCreated(null)}>Luk</button>
        </div>
      )}

      <div className="card table-card">
        <table className="table">
          <thead>
            <tr>
              <th>Navn</th>
              <th>E-mail</th>
              <th>Oprettet</th>
              <th>Rolle</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td data-label="Navn">{p.name}{p.id === user.id && <span className="muted"> (dig)</span>}</td>
                <td data-label="E-mail">{p.email}</td>
                <td data-label="Oprettet">{formatDate(p.created_at)}</td>
                <td data-label="Rolle">
                  <select value={p.role} disabled={p.id === user.id} onChange={(e) => changeRole(p, e.target.value)} aria-label={`Rolle for ${p.name}`}>
                    <option value="user">Bruger</option>
                    <option value="admin">Administrator</option>
                  </select>
                </td>
                <td className="right">
                  <button className="link-btn" onClick={() => resetPassword(p)}>Ny adgangskode</button>
                  {p.id !== user.id && (
                    <>{' · '}<button className="link-btn danger" onClick={() => remove(p)}>Fjern</button></>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Administratorer kan redigere opgavelisten og styre brugere. Alle andre kan oprette sites, krydse af og kommentere.
      </p>
    </div>
  );
}
