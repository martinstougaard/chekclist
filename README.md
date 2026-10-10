# WMS Site-tjekliste

Web-app til at gennemgå tjeklisten, når et nyt site bygges i WMS – både i **test** og i **produktion**.

- **Forside:** alle sites med ansvarlig, oprettelsesdato, deadline og procesbarer (samlet, test og produktion).
- **Site-side:** tjeklisten for test og produktion, afkrydsning (✓) eller "ikke relevant" (–), underopgaver, vejledning pr. opgave og kommentarer på opgaver og på hele sitet.
- **Opgaver (administratorer):** opret sektioner, opgaver og underopgaver, og sortér dem i den rækkefølge, de skal vises.
- **Brugere (administratorer):** inviter kolleger på e-mail og vælg, hvem der er administrator.

Teknik: React + Vite, Supabase (database og login), Netlify (hosting og én funktion til invitationer).

---

## Sådan sætter du det op (første gang)

### 1. Supabase (database og login)

1. Opret en konto på [supabase.com](https://supabase.com) og et nyt projekt. Vælg en EU-region.
2. Gå til **SQL Editor → New query**, indsæt hele indholdet af `supabase/schema.sql`, og tryk **Run**.
3. Gå til **Authentication** og find indstillingen **Allow new users to sign up** (under *Sign In / Providers* → *User Signups*). **Slå den fra**, så kun inviterede kan komme ind.
4. Gå til **Authentication → Users → Add user → Create new user**. Skriv din egen e-mail og en adgangskode, og sæt flueben i *Auto Confirm User*. Den **første bruger bliver automatisk administrator**.
5. Gå til **Project Settings → API** og notér: *Project URL*, *anon public key* og *service_role key*. Brug dem i trin 3.

### 2. Læg koden på GitHub

Opret et (privat) repository på GitHub og læg projektmappen op. Filen `.env` skal **ikke** med (den er udelukket i `.gitignore`).

### 3. Netlify (hosting)

1. Opret en konto på [netlify.com](https://www.netlify.com) → **Add new project → Import an existing project** og vælg dit repository. Build-indstillingerne står i `netlify.toml`, så du behøver ikke ændre dem.
2. Under **Project configuration → Environment variables** tilføjer du:

   | Navn | Værdi |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_URL` | Project URL (samme som ovenfor) |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key. Markér den som **secret**. |

   `service_role`-nøglen giver fuld adgang til databasen. Den må **aldrig** have `VITE_` foran, og den må ikke ligge i git.
3. Tryk **Deploy**. Notér adressen, fx `https://dit-navn.netlify.app`.

### 4. Fortæl Supabase, hvor appen ligger

I Supabase: **Authentication → URL Configuration**
- **Site URL:** adressen fra Netlify.
- **Redirect URLs:** tilføj samme adresse (fx `https://dit-navn.netlify.app/**`).

Uden dette virker linkene i invitationer og "glemt adgangskode" ikke.

### 5. Log ind og kom i gang

1. Åbn appen og log ind med den bruger, du lavede i trin 1.4.
2. Gå til **Opgaver** og byg listen op: sektioner → opgaver → underopgaver.
3. Gå til **Brugere** og inviter dine kolleger. De får en e-mail med et link, hvor de vælger deres adgangskode.
4. Gå til **Sites → + Nyt site**.

---

## Sådan virker det

- **Test og produktion** har præcis samme opgaver, men afkrydses hver for sig.
- **Procesbarer:** hvert trin (en underopgave, eller en opgave uden underopgaver) tæller som ét. *Ikke relevante* trin (–) tæller ikke med. En bar når først 100 %, når alt er færdigt eller markeret irrelevant. *Samlet* er test og produktion lagt sammen.
- **Opgave med underopgaver** bliver færdig automatisk, når alle underopgaver er ✓ eller –. Knapperne på selve overskriften virker på alle underopgaver på én gang.
- **Ændrer du listen**, slår det igennem på alle sites med det samme. Nye opgaver dukker op som åbne på eksisterende sites, og procenterne regnes om.
- **Sletter du en opgave**, forsvinder dens afkrydsninger og kommentarer også.
- **Live-opdatering:** krydser en kollega af, mens du har sitet åbent, opdateres siden af sig selv.

## Kør lokalt (valgfrit)

```bash
npm install
cp .env.example .env     # udfyld VITE_SUPABASE_URL og VITE_SUPABASE_ANON_KEY
npm run dev              # http://localhost:5173
npm test                 # tester fremskridtsberegningen
```

Invitationer og fjernelse af brugere går via Netlify-funktionen og virker derfor kun på det udgivne site, eller lokalt med [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`netlify dev`) og `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` i `.env`.

## Gode at vide

- **Supabase gratis-plan pauser projektet efter 7 dages inaktivitet.** Data bevares. Åbn projektet i Supabase-dashboardet og tryk *Restore*, hvis appen ikke svarer efter en lang ferie. Pro-planen (25 USD/md.) fjerner pausen.
- **Invitationsmails:** Supabases indbyggede mailafsender har en meget lav grænse for antal mails og er ikke til produktion. Skal I invitere mange, eller kommer mails i spam, så sæt egen SMTP op under *Authentication → SMTP Settings*. Alternativt kan du oprette brugere direkte under *Authentication → Users → Add user*, så de får en adgangskode af dig.
- **Mailtekster** (invitation, nulstilling) kan oversættes til dansk under *Authentication → Email Templates*.
- **Sikkerhed:** adgangen styres i databasen (Row Level Security i `schema.sql`), ikke kun i appen. Kun administratorer kan ændre opgavelisten, også hvis nogen forsøger at kalde databasen direkte.
- **Backup:** gratis-planen har ingen automatiske backups. Overvej en jævnlig eksport (*Database → Backups* i Supabase, eller `pg_dump`), hvis listen bliver forretningskritisk.

## Mappestruktur

```
supabase/schema.sql              Database: tabeller, rettigheder, automatisk profil ved ny bruger
netlify/functions/admin-users.mjs  Invitér og fjern brugere (bruger service_role-nøglen)
src/lib/progress.js              Fremskridtsberegning (testet)
src/lib/api.js                   Alle kald til databasen
src/pages/                       Forside, site-side, opgaveadmin, brugeradmin, login
```
