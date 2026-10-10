import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useToast } from '../lib/toast';

/**
 * Bruges både når man kommer fra en invitation/nulstillingslink (first = true, vises
 * i stedet for appen) og når man selv vælger "Adgangskode" i menuen.
 */
export default function SetPassword({ first = false }) {
  const { passwordSet, profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Adgangskoden skal være mindst 8 tegn.');
    if (password !== repeat) return setError('De to adgangskoder er ikke ens.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    toast.success('Adgangskoden er gemt.');
    passwordSet();
    navigate('/', { replace: true });
  };

  const form = (
    <form className="card auth-card" onSubmit={submit}>
      <h1>{first ? 'Vælg din adgangskode' : 'Skift adgangskode'}</h1>
      {first && <p className="muted">Velkommen{profile ? `, ${profile.name}` : ''}! Vælg en adgangskode for at komme i gang.</p>}
      <label>
        Ny adgangskode
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required autoFocus />
      </label>
      <label>
        Gentag adgangskode
        <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Gemmer…' : 'Gem adgangskode'}
      </button>
    </form>
  );

  return first ? <div className="auth-wrap">{form}</div> : <div className="narrow">{form}</div>;
}
