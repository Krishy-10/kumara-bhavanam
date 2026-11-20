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
4. `supabase/migrations/004_commission_past_stays.sql` (commissions + commission_payouts, stay_totals commission columns; create_booking v3 for past stays)
5. `supabase/migrations/005_tasks_checklists.sql` (checklist_items with starter items, checklist_ticks, tasks; no money)
6. `supabase/migrations/006_expenses.sql` (expenses: void-only, by date paid, optional stay link; no money on the bill)
7. `supabase/demo_policies.sql` (DEMO ONLY: anon read/write; never on live; safe to re-run, and must be re-run after a migration adds a table)
8. `supabase/seed.sql` (DEMO ONLY: the 4 PRD stays; wipes tables first)
9. `supabase/seed_history.sql` (DEMO ONLY, optional: Nov 2025 – Oct 2026 history, with sample referrers and commissions)

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
- Commission: see "Commission and past stays" below. Never on the guest's bill.

### Commission and past stays (decided Nov 21 2026, migration 004)
- Typed per booking in integer rupees, only on a stay that has a referrer (DB check). At most one live commission per stay.
- "Owed, then paid": `commissions` holds what is owed; `commission_payouts` records it paid in full (one live payout, amount must equal the commission; no part payments).
- Both are void-only like payments (`guard_money_row`). A commission with a live payout can't be voided; void the payout first.
- `stay_totals` carries `commission`, `commission_paid`, `commission_owed`; `money.ts` mirrors them in `commissionTotals`. Guest Final and Balance never include commission.
- Insights shows commission alongside revenue (paid counted by `paid_on`, owed as of today); booked revenue is unchanged.
- Past stays go through `create_booking` v3: status `completed` (check-out on or before today, IST), fixed price, money recorded as type `payment` on the date paid. They get a bill number like any booking.
- Ledger CSV export: bookings and payments files, BOM + CRLF, amounts as plain integers, cells starting with = + - @ prefixed with '. No ID details.

### Tasks, reminders and checklists (decided Nov 21 2026, migration 005)
- In-app only: nothing is sent, no phone notifications. Screens: Home "To do today" card, `/tasks`, `/checklists`, and cards on Stay detail.
- Checklists: one shared list per stage (`before_check_in`, `at_check_out`) in `checklist_items`, edited on either phone (add, rename, reorder, remove). Items are archived, never deleted. Starter items are inserted by 005.
- Ticks are per stay in `checklist_ticks` (created_by = who ticked, created_at = when). Untick deletes the tick. Tentative/confirmed stays show the before-check-in list; checked-in/completed show the at-check-out list.
- "Tick all" on a stay's checklist ticks every unticked item in one go (toast with Undo, which removes only those ticks).
- Checklists warn, never block: Check in / Check out show how many items are unticked and allow going ahead (together with the balance-due warning).
- Tasks (`tasks`): title, due date (IST), optional for_person (one of the picker names; null = either), optional stay link; ticked done with done_by/done_at; can be edited or deleted. Done tasks show for 30 days.
- Automatic reminders are computed in `src/lib/tasks.ts`, never stored: arrival prep (confirmed, arriving today or tomorrow, before-check-in list unfinished) and balance to collect (checked_in/completed with balance > 0, the view's figure). No review-request or Form C reminders (owner's choice).

### Expenses (decided Nov 20 2026, migration 006)
- `expenses`: category (`EXPENSE_CATEGORIES` in `src/lib/labels.ts`: Electricity, Water, Cleaning, Laundry, Repairs, Supplies, Gas, Internet, Other), integer amount > 0, mode, paid_on, optional note (required for Other), optional stay link.
- Void-only like payments (`guard_money_row`): a mistake is voided with a reason and entered again. Voided rows show struck through and count for nothing.
- Counted by `paid_on`. Never on a guest's bill, Final or Balance, even when linked to a stay; booked revenue is unchanged.
- `money.ts`: `expensesBetween`, `expensesByCategory`, `expensesByMonth`, `leftAfterCosts` (= collected − spent − commission paid, all by date paid; may be negative, shown in terracotta).
- Screens: Ledger → Expenses tab (Spent, Left after costs, Where it went, month groups), an Expenses CSV export, a card on Stay detail when linked, and Insights tiles Spent / Left after costs (shown only without occasion/source filters, since expenses belong to the house).

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

## Round 2 scope (decided Nov 21 2026)
Moved into V1 by the user, built in this order with a checkpoint after each:
1. Booking date picker with quick month jump; Pipeline board (Enquiry → Tentative → Confirmed).
2. Ledger: every booking's money in one list, past bookings can be added, referrer commission, CSV export.
   Commission is typed per booking (integer rupees), never on the guest's bill.
3. Tasks and reminders (in-app only, nothing sends) and pre-check-in / post-check-out checklists.
4. Expenses (water, cleaning…), never on the guest's bill.
Live mode (Google sign-in, kb-live project) comes after this round and before any real guest data.
Money rules for commission and expenses (void-only? counted by date paid?) are asked before phase 2/4 starts.

## Out of scope for V1 (don't build, don't scaffold)
Business Pulse, Stay Value Calculator, Google sign-in, PIN, offline writes, Form C workflow, GST, Zoho, multiple properties, "Come again" / returning-guest offer and festival rebooking messages. (Analytics charts, CSV export and the pipeline were moved into V1 by the user.)

## Working agreement
- Work in the phases the user set; stop at each checkpoint.
- If the PRD is ambiguous on money rules or the data model, ask. Don't guess.
