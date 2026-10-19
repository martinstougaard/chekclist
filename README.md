# WMS Site-tjekliste

Web-app til at gennemgå tjeklisten, når et nyt site bygges i WMS – både i **test** og i **produktion**.

- **Forside:** alle sites med ansvarlig, oprettelsesdato, deadline og procesbarer (samlet, test og produktion).
- **Site-side:** tjeklisten for test og produktion, afkrydsning (✓) eller "ikke relevant" (–), underopgaver, vejledning pr. opgave og kommentarer på opgaver og på hele sitet.
- **Ekstra opgaver til ét site:** nederst på hvert site kan alle brugere tilføje opgaver, der kun gælder det site, fx noget sitet selv har bedt om. De kan gælde test, produktion eller begge, og de tæller med i procesbarerne.
- **Go-live:** en "Go-live"-knap på hvert site åbner en side med store handlingskort, der køres igennem i rækkefølge. Start- og sluttid gemmes for hvert kort, og man kan skrive kommentarer til selve go-live'et. Siden **Go-live** i menuen viser statistik over tid.
- **Opgaver (administratorer):** opret sektioner, opgaver og underopgaver, og sortér dem i den rækkefølge, de skal vises. Her oprettes også go-live-handlingerne (fanen *Go-live-handlinger*).
- **Brugere (administratorer):** inviter kolleger på e-mail og vælg, hvem der er administrator.

Teknik: React + Vite, Supabase (database og login), Netlify (hosting og én funktion til invitationer).

---

## Sådan sætter du det op (første gang)

### 1. Supabase (database og login)

1. Opret en konto på [supabase.com](https://supabase.com) og et nyt projekt. Vælg en EU-region.
2. Gå til **SQL Editor → New query**, indsæt hele indholdet af `supabase/schema.sql`, og tryk **Run**.
3. Gå til **Authentication** og find indstillingen **Allow new users to sign up** (under *Sign In / Providers* → *User Signups*). **Slå den fra**, så kun inviterede kan komme ind.
4. Gå til **Authentication → Users → Add user → Create new user**. Skriv din egen e-mail og en adgangskode, og sæt flueben i *Auto Confirm User*. Den **første bruger bliver automatisk administrator**.
5. Find tre værdier, som du skal bruge i trin 3:
   - **Project URL:** tryk på **Connect** øverst i projektet. Den ser ud som `https://abcdefghijklmnop.supabase.co`.
   - **Publishable key** (`sb_publishable_…`) og **Secret key** (`sb_secret_…`): gå til **Settings → API Keys** og vælg fanen *Publishable and secret API keys*. Står der en knap, der hedder *Create new API keys*, så tryk på den først.

   Supabase kalder de ældre nøgler `anon` og `service_role` for forældede, så brug de nye.

### 2. Læg koden på GitHub

Opret et (privat) repository på GitHub og læg projektmappen op. Filen `.env` skal **ikke** med (den er udelukket i `.gitignore`).

### 3. Netlify (hosting)

1. Opret en konto på [netlify.com](https://www.netlify.com) → **Add new project → Import an existing project** og vælg dit repository. Build-indstillingerne står i `netlify.toml`, så du behøver ikke ændre dem.
2. Under **Project configuration → Environment variables** tilføjer du:

   | Navn | Værdi |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | Publishable key (navnet står som `ANON`, fordi koden læser det navn) |
   | `SUPABASE_URL` | Project URL (samme som ovenfor) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Secret key. Markér den som **secret**. |

   Secret key giver fuld adgang til databasen. Den må **aldrig** have `VITE_` foran, og den må ikke ligge i git.
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
- **Ekstra opgaver** ligger i en egen sektion nederst på sitet ("Ekstra opgaver til dette site"). Man tilføjer dem i boksen under listen og vælger, om de gælder test, produktion eller begge. Kun opgaver for det miljø, man står i, vises, og kun de tæller med dér. Alle brugere kan rette og slette dem (✎ ved opgaven). Sletter man en, forsvinder dens afkrydsninger og kommentarer også.
- **Ændrer du listen**, slår det igennem på alle sites med det samme. Nye opgaver dukker op som åbne på eksisterende sites, og procenterne regnes om.
- **Sletter du en opgave**, forsvinder dens afkrydsninger og kommentarer også.
- **Live-opdatering:** krydser en kollega af, mens du har sitet åbent, opdateres siden af sig selv.

## Go-live

**Opret handlingerne (administratorer):** Opgaver → fanen *Go-live-handlinger*. Tilføj handlingerne, sortér dem, og skriv evt. en vejledning til hver. Sæt kryds i *Sideløbende* ved en handling, der løses af en anden samtidig med den første (fx DNS og certifikat). Den kan så startes og afsluttes uafhængigt af rækkefølgen.

**Gennemfør et go-live:** åbn sitet og tryk **Go-live**. Tryk **Start go-live**, og tiden begynder at løbe:

- Handlingerne vises som store kort. Det første kort i rækkefølgen er straks aktivt.
- Trykker man **Færdig** på det aktive kort, gemmes sluttiden, og det næste kort starter automatisk på nøjagtig samme tidspunkt. Kort, der venter, kan ikke afsluttes.
- Sideløbende kort har deres egen **Start** og **Færdig**.
- Ved en fejl trykker man **Fortryd** på kortet (muligt, så længe det næste kort ikke er afsluttet).
- Go-live er gennemført, når alle kort, også de sideløbende, er færdige. Flere kan have siden åben samtidig, og den opdaterer sig selv.
- Knappen kan altid trykkes. Er tjeklisten ikke færdig, vises bare en advarsel.
- Et site har ét go-live. **Nulstil** sletter tiderne, så man kan starte forfra (kommentarerne bevares). Nulstilling kan gøres af administratorer og af den, der startede go-live'et.

**Kommentarer:** nederst på go-live-siden kan alle notere, hvad der gik godt eller skidt.

**Statistik:** menupunktet *Go-live* viser antal gennemførte, gennemsnit, hurtigste og seneste tid, samlet tid pr. go-live over tid og gennemsnit, hurtigste og langsomste tid pr. handling.

Hvert go-live får sin egen kopi af handlingerne, så senere ændringer eller sletning af en handling ikke ændrer tidligere målinger. Sletter man selve sitet, forsvinder dets go-live også. Tiderne tages fra browserens ur på den computer, der trykker, så computerne bør have rigtig tid.

## Opdatering af en database, der allerede kører

Når der kommer nye funktioner, der kræver ændringer i databasen, ligger der en fil i `supabase/migrations/`. Rækkefølgen er:

1. Kør filen i Supabase → **SQL Editor** (indsæt indholdet, og tryk **Run**). Filerne er skrevet, så de kan køres igen uden skade, og de sletter ikke data.
2. Læg derefter den nye kode på GitHub. Netlify bygger sitet om af sig selv.

Gør det i den rækkefølge. Lægger du ny kode op, før databasen er opdateret, kan sitesiden vise en fejl, indtil SQL'en er kørt.

| Fil | Hvad den gør |
|---|---|
| `002_ekstra_opgaver_pr_site.sql` | Tilføjer ekstra opgaver, der kun gælder ét site. |
| `003_go_live.sql` | Tilføjer go-live: handlinger, tidsmåling og kommentarer. Kør den, hvis 002 allerede er kørt. |

En helt ny installation behøver ikke disse filer, for `schema.sql` indeholder allerede alt.

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
supabase/migrations/             Opdateringer til en database, der allerede kører
netlify/functions/admin-users.mjs  Invitér og fjern brugere (bruger service_role-nøglen)
src/lib/progress.js              Fremskridtsberegning (testet)
src/lib/api.js                   Alle kald til databasen
src/lib/golive.js                Go-live: rækkefølge, tidsstempler og statistik (testet)
src/pages/                       Forside, site-side, go-live, statistik, opgaveadmin, brugeradmin, login
```
