import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, arrivedViaLink } from './supabase';
import * as api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = indlæser, null = ikke logget ind
  const [profiles, setProfiles] = useState([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [mustSetPassword, setMustSetPassword] = useState(arrivedViaLink);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY') setMustSetPassword(true);
      if (event === 'SIGNED_OUT') setMustSetPassword(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  const refreshProfiles = useCallback(async () => {
    setProfiles(await api.loadProfiles());
    setProfilesLoaded(true);
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfiles([]);
      setProfilesLoaded(false);
      return;
    }
    refreshProfiles().catch((e) => {
      console.error(e);
      setProfilesLoaded(true);
    });
  }, [userId, refreshProfiles]);

  const value = useMemo(() => {
    const profile = profiles.find((p) => p.id === userId) || null;
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return {
      loading: session === undefined,
      session,
      user: session?.user || null,
      profile,
      profiles,
      profilesLoaded,
      isAdmin: profile?.role === 'admin',
      nameOf: (id) => (id ? byId.get(id)?.name || 'Ukendt' : null),
      refreshProfiles,
      mustSetPassword,
      passwordSet: () => setMustSetPassword(false),
      signOut: () => supabase.auth.signOut(),
    };
  }, [session, profiles, profilesLoaded, userId, mustSetPassword, refreshProfiles]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
