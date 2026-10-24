import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { configured } from './lib/supabase';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './lib/toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import Sites from './pages/Sites';
import SitePage from './pages/SitePage';
import GoLive from './pages/GoLive';
import GoLiveStats from './pages/GoLiveStats';
import IssuesOverview from './pages/IssuesOverview';
import AdminTasks from './pages/AdminTasks';
import AdminUsers from './pages/AdminUsers';

function Splash({ children }) {
  return (
    <div className="auth-wrap">
      <p className="muted">{children}</p>
    </div>
  );
}

function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

function Gate() {
  const auth = useAuth();
  if (auth.loading) return <Splash>Indlæser…</Splash>;
  if (!auth.session) return <Login />;
  if (auth.mustSetPassword) return <SetPassword first />;
  if (!auth.profilesLoaded) return <Splash>Henter din bruger…</Splash>;
  if (!auth.profile) {
    return (
      <Splash>
        Din bruger har ingen profil i databasen. Kontakt en administrator.{' '}
        <button className="link-btn" onClick={auth.signOut}>Log ud</button>
      </Splash>
    );
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Sites />} />
        <Route path="/sites/:id" element={<SitePage />} />
        <Route path="/sites/:id/go-live" element={<GoLive key="golive" kind="golive" />} />
        <Route path="/sites/:id/technical-go-live" element={<GoLive key="technical" kind="technical" />} />
        <Route path="/go-live" element={<GoLiveStats />} />
        <Route path="/spoergsmaal" element={<IssuesOverview />} />
        <Route path="/adgangskode" element={<SetPassword />} />
        <Route path="/admin/opgaver" element={<AdminOnly><AdminTasks /></AdminOnly>} />
        <Route path="/admin/brugere" element={<AdminOnly><AdminUsers /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  if (!configured) {
    return (
      <Splash>
        Appen mangler VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY. Se README.md, trin om miljøvariabler.
      </Splash>
    );
  }
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
