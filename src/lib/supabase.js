import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key);

// Invitations- og nulstillingslinks lander på siden med #type=invite / #type=recovery.
// Supabase-klienten rydder hashen, så vi aflæser den her, før klienten oprettes.
const hashParams = new URLSearchParams(
  typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
);
export const arrivedViaLink = ['invite', 'recovery'].includes(hashParams.get('type'));
export const linkError = hashParams.get('error_description');

export const supabase = configured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
