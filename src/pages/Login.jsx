import { useState } from 'react';
import { supabase, linkError } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(linkError ? 'Linket er ugyldigt eller udløbet. Bed en administrator om en ny adgangskode.' : '');
  const [info, setInfo] = useState('');

  const login = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setError('Forkert e-mail eller adgangskode.');
    setBusy(false);
  };

  const forgot = async () => {
    if (!email.trim()) {
      setError('Skriv din e-mail i feltet ovenfor først.');
      return;
    }
    setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) setError(error.message);
    else setInfo('Hvis e-mailen findes, er der sendt et link. Kommer der ingen mail, så bed en administrator om en ny adgangskode.');
  };

  return (
    <div className="auth-wrap">
      <form className="card auth-card" onSubmit={login}>
        <div className="brand brand-large">
          <span className="brand-mark" aria-hidden="true">✓</span>
          <span>WMS Site-tjekliste</span>
        </div>
        <h1>Log ind</h1>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label>
          Adgangskode
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="form-error">{error}</p>}
        {info && <p className="form-info">{info}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Logger ind…' : 'Log ind'}
        </button>
        <button type="button" className="link-btn" onClick={forgot}>
          Glemt adgangskode?
        </button>
      </form>
    </div>
  );
}
