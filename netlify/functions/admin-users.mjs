// Netlify-funktion til brugeradministration (kræver service role-nøglen, som aldrig må
// ligge i frontend). Kun loggede administratorer kan kalde den.
//
//   POST { action: "invite", email, name? }  → sender invitation på e-mail
//   POST { action: "delete", id }            → sletter en bruger

import { createClient } from '@supabase/supabase-js';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Metoden er ikke tilladt.' });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return json(500, {
      error: 'Serveren mangler SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i Netlify.',
    });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Hvem kalder?
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Du er ikke logget ind.' });
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller?.user) return json(401, { error: 'Din login-session er ugyldig.' });

  // 2) Er vedkommende administrator?
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .maybeSingle();
  if (profile?.role !== 'admin') return json(403, { error: 'Kun administratorer kan gøre dette.' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Ugyldig forespørgsel.' });
  }

  // 3) Udfør handlingen
  if (body.action === 'invite') {
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json(400, { error: 'Ugyldig e-mailadresse.' });

    const redirectTo = req.headers.get('origin') || process.env.URL;
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: name ? { name } : undefined,
      redirectTo,
    });
    if (error) return json(400, { error: error.message });
    return json(200, { ok: true });
  }

  if (body.action === 'delete') {
    const id = String(body.id || '');
    if (!id) return json(400, { error: 'Bruger-id mangler.' });
    if (id === caller.user.id) return json(400, { error: 'Du kan ikke slette dig selv.' });
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json(400, { error: error.message });
    return json(200, { ok: true });
  }

  return json(400, { error: 'Ukendt handling.' });
};
