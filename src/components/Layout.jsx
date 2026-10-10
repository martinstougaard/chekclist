import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Layout({ children }) {
  const { profile, isAdmin, signOut } = useAuth();
  const { pathname } = useLocation();
  const cls = (active) => (active ? 'active' : undefined);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">✓</span>
            <span>WMS Site-tjekliste</span>
          </Link>
          <nav className="nav">
            <Link to="/" className={cls(pathname === '/' || pathname.startsWith('/sites'))}>
              Sites
            </Link>
            {isAdmin && (
              <Link to="/admin/opgaver" className={cls(pathname === '/admin/opgaver')}>
                Opgaver
              </Link>
            )}
            {isAdmin && (
              <Link to="/admin/brugere" className={cls(pathname === '/admin/brugere')}>
                Brugere
              </Link>
            )}
          </nav>
          <div className="topbar-user">
            <span className="topbar-name">{profile.name}</span>
            <Link to="/adgangskode" className="topbar-link">Adgangskode</Link>
            <button type="button" className="link-btn" onClick={signOut}>Log ud</button>
          </div>
        </div>
      </header>
      <main className="container">{children}</main>
    </div>
  );
}
