# Kumara Bhavanam — notes for Claude Code

Mobile-first PWA for one homestay (the whole first floor, groups up to 8) in Tirunelveli.
Two users: Krishna Kumar and Padmanabhan, both on Android Chrome.

Source of truth: `design/Kumara Bhavanam Product Requirements v1.3.md` (the PRD). Decisions below override the PRD where they differ.
Visual reference: `design/Kumara Bhavanam App Screens.html`. Rebuild screens in React + Tailwind; never copy its markup or runtime.

## Stack (do not change without asking the user)

- React + Vite + TypeScript + Tailwind CSS + vite-plugin-pwa
- Supabase (Postgres) via supabase-js. No other backend, no serverless functions.
- Hosting: Cloudflare Pages. Not Vercel.
- Fonts (Google Fonts): Anek Tamil for headings and every number; Hind Madurai for body.
- Tests: Vitest.

## Commands

```bash
npm install          # install dependencies
npm run dev          # local dev server
npm run build        # type-check and build to dist/
npm run preview      # serve the production build (test PWA install here)
npm test             # Vitest, run once
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint
npm run test:db      # runs all SQL in an in-memory Postgres (PGlite) and checks money, overlaps, guards, RLS
```

Database (see SETUP.md), run in the Supabase SQL editor in this order:
1. `supabase/migrations/001_init.sql` (schema, views, constraints, live RLS)
2. `supabase/migrations/002_create_booking.sql` (`create_booking` RPC: guest + stay + charges + advance, all or nothing)
3. `supabase/migrations/003_sources_referrers.sql` (several sources per stay, referrers list, driver room dropped; create_booking v2)
4. `supabase/demo_policies.sql` (DEMO ONLY: anon read/write; never on live; safe to re-run, and must be re-run after a migration adds a table)
5. `supabase/seed.sql` (DEMO ONLY: the 4 PRD stays; wipes tables first)
6. `supabase/seed_history.sql` (DEMO ONLY, optional: Nov 2025 – Oct 2026 history, with sample referrers)

New schema changes go in a new numbered migration (the demo database is already live); never edit an applied one.

Local preview: with no Supabase env set, `npm run dev` serves the app from an in-browser PGlite loaded with the same SQL (`src/dev/localBackend.ts`). Dev only; never in `dist/`.

After any SQL or money change, run `npm test` and `npm run test:db`; both must pass.
Screens read stays from the `stay_totals` view (stay + guest + money in one row).

## Hard rules

### Money
- All money is integer rupees (`integer` in Postgres, `number` holding an integer in TS). No floats, no paise, no `numeric`. The only division is the analytics night split (integer division, truncating, leftover on the last night).
- Charges and discounts follow the payment rule too: never edited or deleted, only voided with a reason.
- Totals and balances are NEVER stored. They are computed in exactly two places that must agree:
  - the Postgres view `stay_totals`
  - `src/lib/money.ts` (with Vitest tests)
  No component, hook or query does its own money arithmetic. Change one, change the other, update the tests.
- Base = nightly_rate × nights (per-night mode) or fixed_amount (fixed mode).
- Final = Base + Σ charges − Σ discounts. Balance = Final − Σ payments(advance, payment) + Σ refunds. Voided rows count for nothing.
- Negative balance shows as "Overpaid by ₹X" in terracotta.
- "Collected this month" counts non-voided payments by `paid_on`, not by stay dates.
- Payments are never UPDATEd or DELETEd, except one UPDATE that sets `voided = true` with a `void_reason`. A mistake is fixed by voiding and inserting a new row. Voided rows still show, struck through.
- Discount labels: Returning guest, Referral, Long stay, Other.

### Dates
- "Today" is Asia/Kolkata. Never use the device's local zone or Postgres `current_date` (UTC) for "today"; use the helpers in `src/lib/dates.ts`.
- Stay dates are half-open: `check_in` included, `check_out` excluded. Nights = check_out − check_in.
- Two stays with status `confirmed` or `checked_in` must never overlap. Enforced by a Postgres exclusion constraint (`btree_gist`, `daterange(check_in, check_out, '[)')`), not only in the UI. The UI also checks live, blocks on confirmed/checked_in overlaps and warns on tentative ones.

### Data and privacy
- Every insert records `created_by` = the name chosen in the "Who's using this?" picker.
- Never store a full Aadhaar number, any ID image, PDF or QR data. `id_checks` holds only doc_type, last 4 characters, checked_by, checked_at.
- UI says "ID checked", never "Verified".
- Bills never show ID details. Bills are titled "Bill", never "Tax invoice". No GST.
- The review request message never mentions a discount, gift or offer.
- A guest with past stays is archived, never deleted. Phone number is unique per guest.

### Secrets and config
- Only `VITE_`-prefixed public values go in the client: `VITE_APP_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the publishable/anon key, which is public by design and safe only because of RLS).
- NEVER put the Supabase service_role / secret key, a database password or any other secret in the repo, in `.env*` files read by Vite, or in client code.
- `.env.local` is gitignored. `.env.example` (no real values) is committed.
- Demo-mode RLS policies that let `anon` read and write are for the kb-demo project only and are labelled DEMO ONLY in SQL. Never run them against the live project.

### Modes
- `VITE_APP_MODE = demo | live`.
- demo: no sign-in, picker only, small "Demo" badge visible on every screen.
- live (later, not V1 demo): Google sign-in via Supabase Auth + `allowed_users`, then the same picker. Keep auth behind one gate component so live mode slots in without moving the picker.

### Bill numbers
- Allocated by the database when a booking is inserted (trigger + per-year counter), never by the client. Format `KB-<year>-<4 digits>`, e.g. KB-2026-0001. Stored on the stay; never changes, including on reprints.

### Messages
- Templates live in a `message_templates` table (shared by both phones): kind (thank_you | review_request), language (en | ta), title, body, preset flag, created_by.
- V1 ships 5–6 English review-request presets plus thank-you presets; users can add their own. Tamil text is a TODO for the user.
- Placeholders (`{guest}`, `{occasion}`, `{nights}`, `{review_link}`) are filled automatically; the draft stays editable. Nothing sends automatically.
- Review-request templates (preset or user-made) must never mention a discount, offer, gift, coupon, voucher or cashback. Enforce it in the UI on save and with a DB check.

### Analytics (added to V1 by the user, Nov 19 2026)
- An analytics dashboard with filters is in scope. Every figure comes from `stay_totals` / `money.ts` and saved records; no screen does its own money maths.
- Integer rupees only, here too.
- Cash collected is counted by `paid_on`. Booked revenue and occupancy are split by night: each night of a stay goes to the month it falls in; a stay's Final is split with integer division and the leftover rupees go to the last night. This split lives only in the DB view and `money.ts`.
- Cancelled stays count for nothing in booked revenue or occupancy.

### Home figures (decided Nov 19 2026)
- "To collect" = sum of positive balances on `checked_in` and `completed` stays only. Future stays show their due amount on the Next arrival card.
- A cancelled stay's balance is 0. Money kept still counts in Collected by payment date; refunds subtract in the month they are paid out.

### Sources and referrers (decided Nov 20 2026)
- No driver room: the toggle and the `driver_room` column are gone.
- "How they found us" allows several answers: `stays.sources text[]` (values from `SOURCES` in `src/lib/labels.ts`). In analytics a stay counts once under each of its sources.
- Referrers are a shared list (`referrers`: name, optional phone, archived not deleted). A stay links to one only when its sources include Referral (DB check). In New booking: pick an existing referrer, or type a new name (and optional phone) which `create_booking` adds; a known phone, or a name only one referrer has, reuses that referrer.
- Commission is NOT built yet. It will hang off `referrers` in the ledger work; never on the guest's bill.

### Other defaults (stated to the user, not objected to)
- Blocked dates: start and end both inclusive. They warn in New booking (not a hard DB block). V1 includes a small "Block dates" form on Stays.
- Stay detail has a status menu: Enquiry → Tentative → Confirmed, and Cancel. Check out warns if a balance is due but allows it.
- Bill counter resets each year (KB-2027-0001 in January), year taken from the booking's creation date in IST.
- Demo hosting sits behind Cloudflare Access (email one-time code) because demo RLS lets `anon` read and write.
- `seed.sql` holds exactly the 4 PRD stays; `seed_history.sql` (optional) adds Dec 2025 – Oct 2026 sample history for analytics without changing November figures.

### Approved libraries
react-router-dom, @tanstack/react-query, jspdf (bill PDF), recharts (analytics), motion (animations). Ask before adding others.

### UI
- Mobile-first at 390 px wide. Touch targets ≥ 48 px; primary buttons 56–60 px.
- Modern, fluid feel: small purposeful animations (screen transitions, sheets, number changes, list entry). All motion respects `prefers-reduced-motion`.
- Accessibility: WCAG AA contrast, real `<button>`/`<label>`, visible focus rings, inputs ≥ 16 px (no zoom on focus), `aria-live` on live totals, never colour alone for meaning.
- Calendar on Stays shows a full month, swipeable between months.
- Use the Tailwind named colours: peacock #0F5E5A, marigold #F2A93B, terracotta #A8401F, jasmine #FFFBF5, haldi #FFF4E0, teak #2B1D14, muted #6E5A4B, line #F0E6D8. No raw hex in components.
- Card radius 16–28 px, pills 999 px. Kolam dot grid only on the current-stay card and night-progress dots.
- Format money with Indian grouping (₹1,00,000) via `src/lib/format.ts`.

## Out of scope for V1 (don't build, don't scaffold)
Business Pulse, CSV export, Stay Value Calculator, Google sign-in, PIN, offline writes, Form C workflow, GST, Zoho, multiple properties, "Come again" / returning-guest offer and festival rebooking messages. (Analytics charts were moved into V1 by the user.)

## Working agreement
- Work in the phases the user set; stop at each checkpoint.
- If the PRD is ambiguous on money rules or the data model, ask. Don't guess.
