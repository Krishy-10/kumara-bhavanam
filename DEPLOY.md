# Deploy: put the demo online and install it on your phones

About 30 minutes, once. After that, every change you push goes live by itself.

What you end up with:

- The app at an address like `https://kb-demo.pages.dev`, hosted free on
  **Cloudflare Pages**.
- **Cloudflare Access** in front of it: only the email addresses you list can
  open it, by typing a one-time code sent to that email.
- The app installed on both Android phones, opening full screen like any other app.

> **Keys, in one line:** Cloudflare needs only the Supabase **Project URL** and
> the **publishable / anon** key. Both are public by design. **Never** paste the
> **secret / service_role** key or the database password into Cloudflare,
> GitHub, a `.env` file or a chat.

---

## 0. Before you start

You need:

- [ ] The Supabase demo project `kb-demo`, with the SQL already run. See
      [SETUP.md](SETUP.md), steps 1 and 2.
- [ ] Its **Project URL** and **publishable / anon key**. See SETUP.md, step 3.
- [ ] A GitHub account. The code goes in a **private** repository.
- [ ] A free Cloudflare account (<https://dash.cloudflare.com/sign-up>).
- [ ] The email addresses of everyone who should open the demo (Krishna Kumar
      and Padmanabhan).

## 1. Put the code on GitHub (private)

Claude can do this step for you: say "push to GitHub" and confirm. To do it
yourself, with the GitHub CLI signed in, run this in the project folder:

```bash
gh repo create kumara-bhavanam --private --source . --push
```

Check that the repository says **Private** on GitHub. `.env.local` is in
`.gitignore`, so your keys never leave your computer this way.

## 2. Create the Cloudflare Pages project

1. Cloudflare dashboard → **Workers & Pages** → **Create**.
2. Pick the **Pages** tab (not Workers). If you only see Workers, look for
   "Looking to deploy Pages? **Get started**". Then **Import an existing Git
   repository**.
3. **Connect GitHub**. When GitHub asks, give Cloudflare access to **only the
   `kumara-bhavanam` repository**.
4. Choose the repository and click **Begin setup**.
5. Fill in:

   | Setting | Value |
   |---|---|
   | Project name | `kb-demo` (this becomes `kb-demo.pages.dev`; Cloudflare adds a suffix if the name is taken) |
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

6. Open **Environment variables (advanced)** and add these four:

   | Variable | Value |
   |---|---|
   | `VITE_APP_MODE` | `demo` |
   | `VITE_SUPABASE_URL` | your Project URL, like `https://abcd1234.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | your publishable key (`sb_publishable_…`) or anon key (`eyJ…`) |
   | `NODE_VERSION` | `22` |

7. **Save and Deploy**. The first build takes 2–3 minutes. Note the address
   it gives you, e.g. `https://kb-demo.pages.dev`.

**Don't open the address on your phone yet.** Lock it with Access first (next
step), because the demo database lets anyone who has the app write to it.

Good to know:

- `VITE_` values are baked in when the app is built. If you change one, go to
  **Deployments** → the latest one → **⋯** → **Retry deployment**.
- `public/_headers` (security headers) and `public/_redirects` (so links like
  `/stays/…` work) are picked up by Cloudflare automatically. Nothing to set.

## 3. Lock it with Cloudflare Access

1. Cloudflare dashboard → **Zero Trust**. The first time, choose a team name
   (anything, e.g. `kumarabhavanam`) and the **Free** plan (up to 50 people).
   Cloudflare may ask for a payment method to activate the free plan.
2. **Access** → **Applications** → **Add an application** → **Self-hosted**.
3. Fill in:
   - Application name: `Kumara Bhavanam demo`
   - Session duration: **1 month**, so you aren't asked for a code every day.
   - Public hostname: domain `kb-demo.pages.dev` (your address from step 2).
   - Click **Add public hostname** and add `*.kb-demo.pages.dev` too. That
     covers the preview builds Cloudflare makes for other branches.
4. Add a policy:
   - Name: `Owners`
   - Action: **Allow**
   - Include → **Emails** → type each allowed email address.
5. Login methods: keep **One-time PIN** on. That's the "email me a code" sign-in.
6. Save.

### Let the app icon and manifest through

Chrome reads the app's name and icon before asking to install it. These two
files contain no guest data, so let them through Access:

1. **Add an application** → **Self-hosted** again.
2. Name: `Kumara Bhavanam install files`.
3. Add three public hostnames, all on `kb-demo.pages.dev`, with these paths:
   `manifest.webmanifest`, `icons/*` and `favicon.svg`.
4. Policy: Action **Bypass**, Include → **Everyone**.
5. Save.

### Check it

Open the address in a private browser window. You should see a Cloudflare
page asking for your email, not the app. Enter an allowed email, type the
code you receive, and the "Who's using this?" screen appears.

## 4. Install on each Android phone

1. Open the address in **Chrome**. Enter your email, then the code.
2. Pick your name on "Who's using this?".
3. Chrome may show **Install app** at the bottom. If not: tap **⋮** (top right)
   → **Add to Home screen** → **Install**.
4. The Kumara Bhavanam icon (a marigold "KB" circle on peacock green) appears
   on the home screen. It opens full screen, with no address bar.

Check on each phone:

- [ ] The **Demo** badge is visible.
- [ ] Home shows the sample figures. Collected this month is ₹37,000 on the
      original seed data.
- [ ] Open a stay → **Share bill** → the phone's share sheet opens with
      `Bill KB-….pdf` → pick WhatsApp. Send it to yourself first.
- [ ] Both phones share the data. Enter a test payment on one phone, then
      switch away from the app and back on the other: the payment appears,
      with the first phone's name on it.

Updates arrive by themselves: after a new deploy, the app picks up the new
version the next time it is opened (sometimes the time after that).

## 5. Changing the app later

Push to `main` on GitHub. Cloudflare builds and publishes in about 2 minutes.
Pushes to other branches get their own preview address
(`<branch>.kb-demo.pages.dev`), also behind Access.

## If something goes wrong

| What you see | What to do |
|---|---|
| Home says "Supabase is not configured" | An environment variable is missing or misspelt. Fix it in Pages → Settings → Variables, then **Retry deployment** |
| Red error boxes where the figures should be ("Failed to fetch" or similar) | The free Supabase project paused after a quiet week. Supabase dashboard → **Restore**, then tap **Try again** |
| No "Install" or "Add to Home screen" option | Check the "install files" Access app from step 3. Then in Chrome: ⋮ → Settings → Site settings → the site → **Clear & reset**, and open it again |
| Asked for an email code every time | Raise the session duration on the Access app (step 3) |
| Build fails on Cloudflare | Open the build log. Run `npm run build` on your computer to see the same error |

## How safe the demo is

- Only the listed emails can load the app, and so read the publishable key
  inside it.
- The demo database still lets anyone **who has that key** read and write
  (`supabase/demo_policies.sql`). Keep the demo to **sample data only**: no
  real guests, phone numbers or payments.
- Real use comes with the **live** version: a separate `kb-live` project, no
  demo policies, Google sign-in, and only the allowed users. Don't run
  `demo_policies.sql`, `seed.sql` or `seed_history.sql` on it.

## On Windows: "running scripts is disabled"

If PowerShell refuses `npm`, use `npm.cmd` instead (e.g. `npm.cmd run build`),
or run the command in Command Prompt or Git Bash.
