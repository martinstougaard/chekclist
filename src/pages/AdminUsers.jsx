import { useState } from 'react';
import * as api from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';
import { formatDate } from '../lib/format';

export default function AdminUsers() {
  const { profiles, user, refreshProfiles } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const invite = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.callAdmin({ action: 'invite', email, name });
      toast.success(`Invitation sendt til ${email.trim()}.`);
      setEmail('');
      setName('');
      // Profilen oprettes først, når brugeren er oprettet – det sker ved invitationen
      await refreshProfiles();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
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

      <form className="card pad form form-inline" onSubmit={invite}>
        <h3>Inviter en kollega</h3>
        <p className="muted small">Personen får en e-mail med et link, hvor man vælger sin adgangskode.</p>
        <div className="form-row">
          <label>
            Navn
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fornavn Efternavn" required />
          </label>
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="navn@firma.dk" required />
          </label>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Sender…' : 'Send invitation'}</button>
        </div>
      </form>

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
                  {p.id !== user.id && (
                    <button className="link-btn danger" onClick={() => remove(p)}>Fjern</button>
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
