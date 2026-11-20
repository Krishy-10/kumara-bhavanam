# Setup: Supabase demo project and local app

About 15 minutes. You need a free Supabase account and Node.js 20 or newer.

> **Keys, in one line:** the app only ever uses the **Project URL** and the
> **publishable key** (older projects call it the **anon public** key). Those are
> public by design. **Never** copy the **secret** / **service_role** key into this
> project, a `.env` file, a chat or a commit.

---

## 1. Create the demo project

1. Go to <https://supabase.com/dashboard> and sign in.
2. **New project**.
   - Name: `kb-demo`
   - Database password: click **Generate**, then save it in your password manager. The app doesn't need it.
   - Region: **South Asia (Mumbai)** (closest to Tirunelveli).
3. Wait about 2 minutes for it to finish setting up.

(The live project, `kb-live`, comes later with Google sign-in. Don't create it yet.)

## 2. Run the SQL, in this order

In the project: **SQL Editor → New query**. For each file below, open it in
this repo, copy all of it, paste it into the editor, then click **Run**.
Each should end with "Success. No rows returned".

| # | File | What it does |
|---|------|--------------|
| 1 | `supabase/migrations/001_init.sql` | Tables, `stay_totals` view, overlap rule, bill numbers, payment guards, live RLS |
| 2 | `supabase/migrations/002_create_booking.sql` | `create_booking`: saves guest, stay, extras and advance in one step |
| 3 | `supabase/migrations/003_sources_referrers.sql` | Several "how they found us" answers per stay, the referrers list, no driver room |
| 4 | `supabase/demo_policies.sql` | **Demo only.** Lets the app read and write without sign-in |
| 5 | `supabase/seed.sql` | The 4 PRD sample stays, blocked dates, message templates |
| 6 | `supabase/seed_history.sql` | *Optional.* 12 months of sample history (and sample referrers) for the analytics screen |

**Already set up before 20 Nov 2026?** Run only `003_sources_referrers.sql`, then
`demo_policies.sql` again (it is safe to re-run). Your bookings are kept.

If step 1 complains about `btree_gist`, open **Database → Extensions**, turn on
**btree_gist**, then run step 1 again.

### Check it worked

Paste this into a new query and run it:

```sql
select guest_name, bill_no, status, final, paid, balance
from stay_totals
where bill_no in ('KB-2026-0041','KB-2026-0042','KB-2026-0043','KB-2026-0044')
order by bill_no;
```

You should see:

| guest_name | bill_no | status | final | paid | balance |
|---|---|---|---|---|---|
| Lakshmi Narayanan | KB-2026-0041 | checked_in | 40000 | 35000 | 5000 |
| Meena Venkatesh | KB-2026-0042 | completed | 13500 | 13500 | 0 |
| Priya Sundaram | KB-2026-0043 | confirmed | 10000 | 2000 | 8000 |
| Ravi Shankar | KB-2026-0044 | tentative | 10000 | 0 | 10000 |

### Resetting the demo

Run `seed.sql` again (it clears every table first), then `seed_history.sql` if
you want the history. Don't run either on the live project.

## 3. Connect the app

1. In Supabase: **Project Settings → API Keys** (on some projects, **Settings → API**).
   - Copy the **Project URL** (looks like `https://abcd1234.supabase.co`).
   - Copy the **Publishable key** (`sb_publishable_…`), or on older projects the
     **anon public** key (a long `eyJ…` string).
   - Do **not** copy the secret / service_role key.
2. In this folder, copy `.env.example` to a new file named `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

3. Open `.env.local` and fill it in:

   ```
   VITE_APP_MODE=demo
   VITE_SUPABASE_URL=https://abcd1234.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```

`.env.local` is in `.gitignore`, so it never gets committed.

## 4. Run it

```bash
npm install
```

```bash
npm run dev
```

Open the address it prints (usually <http://localhost:5173>).

On Windows, if PowerShell says "running scripts is disabled on this system",
use `npm.cmd` in place of `npm` (e.g. `npm.cmd run dev`), or use Command Prompt.
To try it on your phone over the same Wi-Fi, run `npm.cmd run dev -- --host`
and open the **Network** address it prints.

No Supabase project yet? Leave `.env.local` out and `npm run dev` runs a
**local preview**: the same SQL files load into an in-browser Postgres
(PGlite) with the sample data. It resets on every reload and exists only in
`npm run dev`; production builds never include it.

Other checks:

```bash
npm test
```

```bash
npm run test:db
```

`npm test` runs the money unit tests. `npm run test:db` runs every SQL file in
an in-memory Postgres and checks the totals, the overlap rule and the payment
guards. It needs no Supabase project.

## Good to know

- **Free plan pause.** Supabase pauses a free project after about a week with
  no activity. Daily use avoids it. If it pauses, open the dashboard and click
  **Restore**.
- **Demo data is public.** The demo's write access works for anyone who has the
  app's URL. Use sample data only, and put the site behind Cloudflare Access
  (see DEPLOY.md).
- **Phone numbers in the samples start with 00000**, so "Open in WhatsApp" in
  the demo can't message a real person.
