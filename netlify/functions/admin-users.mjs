// Netlify-funktion til brugeradministration (kræver den hemmelige nøgle, som aldrig må
// ligge i frontend). Kun loggede administratorer kan kalde den.
//
//   POST { action: "create", email, name, password }  → opretter bruger med adgangskode (ingen mail)
//   POST { action: "password", id, password }         → sætter ny adgangskode på en bruger
//   POST { action: "delete", id }                     → sletter en bruger

import { createClient } from '@supabase/supabase-js';

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const validPassword = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 72;

async function handle(req) {
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
  if (callerError || !caller?.user) {
    return json(401, { error: `Din login-session er ugyldig${callerError ? ` (${callerError.message})` : ''}.` });
  }

  // 2) Er vedkommende administrator?
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('role')
    .eq('id', caller.user.id)
    .maybeSingle();
  if (profileError) {
    return json(500, { error: `Kunne ikke læse brugerprofilen: ${profileError.message}. Tjek den hemmelige nøgle (SUPABASE_SERVICE_ROLE_KEY) i Netlify.` });
  }
  if (profile?.role !== 'admin') return json(403, { error: 'Kun administratorer kan gøre dette.' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Ugyldig forespørgsel.' });
  }

  // 3) Udfør handlingen
  if (body.action === 'create') {
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json(400, { error: 'Ugyldig e-mailadresse.' });
    if (!validPassword(body.password)) return json(400, { error: 'Adgangskoden skal være mindst 8 tegn.' });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: name ? { name } : undefined,
    });
    if (error) return json(400, { error: error.message });
    return json(200, { ok: true, id: data?.user?.id });
  }

  if (body.action === 'password') {
    const id = String(body.id || '');
    if (!id) return json(400, { error: 'Bruger-id mangler.' });
    if (!validPassword(body.password)) return json(400, { error: 'Adgangskoden skal være mindst 8 tegn.' });
    // email_confirm: true gør også, at en tidligere inviteret (ubekræftet) bruger kan logge ind
    const { error } = await admin.auth.admin.updateUserById(id, { password: body.password, email_confirm: true });
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
}

export default async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    // Fanger uventede fejl, så de vises i appen og i Netlifys funktionslog i stedet for en tom 502
    console.error('admin-users fejlede:', e);
    return json(500, { error: `Uventet fejl i serverfunktionen: ${e?.message || e}` });
  }
};
