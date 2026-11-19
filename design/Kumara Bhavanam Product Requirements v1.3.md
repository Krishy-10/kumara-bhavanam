# Kumara Bhavanam: Product Requirements v1.3

Nov 18, 2026 · @Krishna Somanathan

## What changed from v1.2

v1.3 cuts V1 to one daily loop that can ship in a weekend, and fixes four things that would have caused real problems.

| Area | v1.2 | v1.3 | Why |
| --- | --- | --- | --- |
| V1 scope | 18 must-haves incl. analytics, CSV, full identity register | The booking-to-payment loop only | A weekend build; analytics on 3 bookings means nothing |
| Hosting | Vercel | Cloudflare Pages (or Netlify) | Vercel Hobby is for non-commercial use only |
| Review discount | Discount next to review request; "Review Offer" line on invoice | Review request carries no offer. Discounts are Returning guest or Referral | Google treats any incentive for a review as fake engagement and removes those reviews |
| ID wording | "Verified" | "ID checked" | Physically checking a card is not Aadhaar verification |
| Identity register | 10 fields incl. consent, purpose, retention | Type, last 4, checked by, date | Enough for V1; the rest moves to V1.1 |
| Payment corrections | audit\_logs table | Void the row and add a new one | Same audit trail, no extra table |
| Stay Value Calculator | Hotel + eating out vs homestay | Adds a groceries input | Otherwise the savings figure is overstated |
| Festival rebooking | Not present | Occasion tag on each stay + one-tap rebook message | Highest-value CRM feature for a pilgrim homestay |
| Design | Three visual directions | One direction, defined in the design brief | Consistency |

## Product summary

Kumara Bhavanam is a phone-first app that lets the owner of one homestay record bookings, guests and payments, and send bills, in under a minute per booking.

**The business.** One unit: the entire first floor, for groups of up to about 8. It has bedding for the group, a separate room for a driver or helper, two bathrooms, a balcony, and a kitchen with utensils and an induction stove. Guests are mostly families and pilgrim groups, especially around Sashti. The pitch is half the cost of booking several hotel rooms, plus the option to cook.

**Example stay.** A group of 8 stayed 8 nights during Sashti and paid about ₹40,000. Three hotel rooms at ₹2,000 a night would have cost ₹48,000 before food.

**Principles**

- One loop done well beats many screens done halfway.
- Faster than paper, or nobody will use it.
- Big touch targets, few fields, sensible defaults.
- Collect the least guest data that does the job.
- Money records are never silently edited.
- Costs ₹0 a month to run.

## Users and the daily loop

Two users: Krishna Kumar and Padmanabhan, both on Android phones with Google accounts. Access works in two layers: Google sign-in once per phone (the lock), then a "Who's using this?" picker every time (attribution). The demo build has the picker only, with sample data.

The loop V1 must make effortless:

1. A guest calls or messages. The owner checks the dates are free and saves a booking (status Enquiry, Tentative or Confirmed).
2. An advance arrives. The owner records it as a payment.
3. The group arrives. The owner marks the booking Checked in, ticks the ID as checked, and adds any extra charges.
4. The group leaves. The owner collects the balance, marks it Completed, and shares the bill on WhatsApp.
5. Later, a thank-you or review request goes out, and the festival tag sets up next year's rebooking.

The home screen answers five questions without a tap: who is staying, who arrives next, how much was collected this month, who still owes money, and when the floor is next free.

## V1 scope: the weekend build

V1 is six screens and a bottom bar with three tabs: Home, Stays, Guests.

| Screen | What it does | Must work |
| --- | --- | --- |
| Login | Demo: "Who's using this?" picker with two names, no sign-in. Real: Google sign-in via Supabase first, then the same picker | Only allow-listed emails can sign in; the chosen name is saved on every record |
| Home | Status of the floor (occupied by whom, or free until when), next arrival, collected this month, total outstanding, one big New booking button | Every figure comes from saved records |
| New booking | Step 1: phone number first; a known number fills the guest. Step 2: dates, guests, driver room yes/no, occasion tag, source. Step 3: price (per night or fixed), extras, discount, advance | Blocks dates that overlap a Confirmed or Checked-in stay; warns on Tentative overlaps |
| Stay detail | Status, dates, money summary, payments list, charges list, ID checked, actions: Add payment, Add charge, Check in, Check out, Share bill, Message guest | Balance always recalculated, never stored |
| Stays | Upcoming, current and past stays as a list, plus a 60-day strip showing booked and free dates | Blocked dates (maintenance, family use) shown |
| Guests | Search by name or phone; guest page with past stays, total spent, notes | No duplicate guest for the same phone number |

**Out of V1:** analytics charts, Business Pulse, CSV export, Stay Value Calculator, multiple users, offline creation, Form C workflow, privacy notice screens. Each waits for a real request or real data.

**Defaults that save typing:** check-in today, 1 night, last used nightly rate, 2 guests, payment mode UPI.

## Money rules

The app stores line items and works out every total; no total is ever typed or saved.

```latex
\text{Base} = \text{nightly rate} \times \text{nights} \quad \text{or} \quad \text{agreed fixed amount}
```

```latex
\text{Final} = \text{Base} + \sum \text{charges} - \sum \text{discounts}
```

```latex
\text{Balance} = \text{Final} - \sum \text{payments} + \sum \text{refunds}
```

**Pricing.** Two modes per stay: per night, or a fixed amount for the whole stay (common for long festival bookings). The owner can always override the base before confirming.

**Charges and discounts.** Each is its own line with a label and amount. Discount labels come from a short list: Returning guest, Referral, Long stay, Other.

**Payments.** Each payment is a row: amount, date, mode (Cash, UPI, Bank transfer, Card, Other), optional reference, and a type (Advance, Payment, Refund).

**Rules**

- A payment is never edited or deleted. A mistake is fixed by voiding it (with a reason) and adding the correct one; voided rows stay visible, struck through.
- If payments exceed the final amount, the stay shows "Overpaid by ₹X" in red.
- A cancelled stay keeps its payments on record but counts nothing towards the month's revenue unless money was kept.
- "Collected this month" counts payments by payment date, not by stay date.

## Bills and sharing

The owner can produce a bill for any stay, at any point, in two taps.

- **Contents:** property name and contact, bill number (KB-2026-0001, issued by the database so two phones never clash), bill date, guest name and phone, stay dates and nights, number of guests, accommodation line, each charge and discount, final amount, each payment, balance, and a Paid / Balance due stamp.
- **Never on the bill:** any ID detail.
- **Share:** on Android the app builds a PDF and hands it to the phone's share sheet, so it goes straight into the guest's WhatsApp chat. A fallback copies a text version of the bill.
- **Reprint:** any past bill can be opened again and shows current payments.
- **No GST** in V1. The bill is labelled "Bill", not "Tax invoice".

## Guest ID: a minimal register

V1 records that an ID was seen and checked, never the ID itself.

| Field | Detail |
| --- | --- |
| Document type | Aadhaar, Passport, Driving licence, Voter ID, Other |
| Last 4 characters | Optional |
| Status | Not yet checked / ID checked |
| Checked by and date | Filled automatically when ticked |

**Never stored:** full Aadhaar numbers, card photos, PDFs, QR data. UIDAI is moving to stop private businesses storing Aadhaar copies, and this keeps the owner clear of that.

**Wording:** the app says "ID checked", never "Verified". Looking at a card is not Aadhaar verification.

**Foreign guests:** V1 only adds a Nationality field and a reminder that Form C must be filed within 24 hours. The full passport workflow waits until a foreign guest actually books.

**Moved to V1.1:** consent records, stated purpose, retention dates, and an English and Tamil privacy note.

## Guest messages

The app drafts messages; the owner reads, edits and sends them. Nothing is sent automatically.

| Message | When | Rule |
| --- | --- | --- |
| Thank you | Day of check-out | Personal, names the occasion if tagged |
| Review request | 1 to 3 days after check-out | Includes the Google review link. No discount, gift or offer attached, and sent to every guest, not only happy ones |
| Returning guest offer | Any time after a completed stay | A discount for coming back or referring another group. Never mentions reviews |
| Festival rebooking | About 4 weeks before a festival | Sent to past guests with that occasion tag, e.g. "We're keeping the floor free for Sashti. Would your group like it again?" |

**How it sends:** each draft has three buttons: Copy, Open in WhatsApp (opens the guest's chat with the text filled in), and Open in email. The owner taps Send in WhatsApp.

**Language:** each template exists in English and Tamil; the owner picks per guest, and the choice is remembered.

V1 ships the thank-you and review request. The other two follow in V1.1.

## Data model

Six tables in V1. A guest has many stays; a stay has many payments and many charges.

| Table | Key fields | Notes |
| --- | --- | --- |
| guests | id, name, phone (unique), email, city, language, notes, created\_at | Phone is the lookup key |
| stays | id, guest\_id, check\_in, check\_out, guests\_count, driver\_room, status, pricing\_mode, nightly\_rate, fixed\_amount, occasion, source, notes | Status: enquiry, tentative, confirmed, checked\_in, completed, cancelled |
| payments | id, stay\_id, amount, type, mode, paid\_on, reference, voided, void\_reason, created\_by | Type: advance, payment, refund. Never updated except to void |
| charges | id, stay\_id, kind, label, amount | Kind: charge or discount |
| id\_checks | id, stay\_id, doc\_type, last4, checked\_by, checked\_at | One per stay |
| blocked\_dates | id, start\_date, end\_date, reason | Maintenance or family use |

**Database rules**

- A database constraint stops two Confirmed or Checked-in stays from overlapping (Postgres exclusion constraint on the date range), so a bug in the app can't double-book the floor.
- Row-level security on every table: only signed-in users whose email is in an allowed\_users table can read or write.
- A view, stay\_totals, works out base, charges, discounts, paid and balance per stay. Every screen reads from it, so the maths lives in one place.
- Bill numbers come from a database sequence.
- A guest with past stays cannot be deleted, only archived.

## Tech stack and hosting

Everything runs on free plans that allow commercial use, for ₹0 a month.

| Layer | Choice | Note |
| --- | --- | --- |
| App | React + Vite + Tailwind | Installable PWA via vite-plugin-pwa |
| Hosting | Cloudflare Pages | Free plan allows commercial use. Netlify is the fallback. Not Vercel Hobby, which is personal and non-commercial only |
| Database and login | Supabase (Postgres + Auth) | Free plan pauses a project after about a week with no activity; daily use avoids it |
| Bills | HTML template rendered to PDF in the browser | Shared through the Web Share API |
| Charts (V1.1) | Recharts | Not in V1 |

**PWA behaviour**

- Installs to the home screen on Android with its own icon and splash screen, opening full screen.
- Online-first. When offline, shows the last loaded data, marks it "Offline, read only", and disables saving. No offline writes until there is a proper sync queue.

**Backups:** a free scheduled GitHub Action exports the database every week to a private repo, because the Supabase free plan's own backups are limited. A one-tap export of stays and payments to CSV comes in V1.1.

## Roadmap

Each phase starts only when the one before it has a clear signal of real use.

1. **V1, this weekend.** The loop: bookings, guests, charges, payments, bills, ID check, thank-you and review messages.
   - Gate to V1.1: the owner has entered every booking for 3 weeks without being reminded.
2. **V1.1, after about a month of data.**
   - Returning guest offer and festival rebooking messages
   - Monthly summary: collected, outstanding, nights booked, guests hosted
   - Business Pulse: 3 or 4 plain-sentence observations from simple rules
   - Stay Value Calculator with hotel, eating out and groceries inputs, shareable as an image
   - CSV export; consent and retention fields; English and Tamil privacy note
   - Gate to V2: the owner asks for something V1.1 can't do.
3. **V2, only if needed.** Separate logins per family member, enquiry pipeline, seasonal comparisons across years, automated reminders, Form C workflow, multi-property support if this is offered to other homestays.

## Demo plan and success measures

The weekend demo succeeds if the owner enters one real past booking on their own phone without help.

**Before the demo**

- [ ] Load 4 to 5 realistic sample stays with no overlapping dates, including one long festival stay with an advance and a balance
- [ ] Install the app on the owner's phone and log them in
- [ ] Send the link in the family WhatsApp group and pin it

**During the demo**

- [ ] Hand over the phone and ask them to enter their last real booking; say nothing unless they're stuck
- [ ] Note every hesitation and every question
- [ ] Count taps for a full booking; above about 15, cut fields

**What counts as success**

| Measure | Target |
| --- | --- |
| Time to enter a booking | Under 1 minute after the first week |
| Bookings recorded in the app | Every booking, from week 2 |
| Payments with a record | 100% |
| Bills shared from the app | Most stays |
| Still in use | Entries keep coming in 3 weeks later |

## Risks and open questions

The biggest risk is the owner going back to paper because the app is slower; every scope call should be judged against that.

| Risk | Mitigation |
| --- | --- |
| Slower than a notebook | Phone-first entry, defaults, under 15 taps, watch a real entry before adding anything |
| Wrong totals | All maths in one database view; payments never edited |
| Double booking | Database constraint on overlapping dates |
| Supabase project pauses | Daily use; a free uptime ping as a backstop |
| Krish is the only one who can fix it | A one-page setup and recovery note kept with the code |
| Guest data exposure | No ID images or full numbers; one login with row-level security |

**Open questions**

- [ ] Is the nightly rate flat for the floor, or does it change with group size or season?
- [ ] Is the driver room charged separately?
- [ ] Who will enter bookings day to day, and are they more comfortable in Tamil or English?
- [ ] Does the property have a Google Business Profile and review link yet?
- [ ] Is the property registered under the Tamil Nadu homestay scheme, and does that require a specific guest register format?

## Build notes for Claude Code

Build the demo first, in this order, and keep it runnable after every step.

1. Scaffold React + Vite + Tailwind + vite-plugin-pwa. App name "Kumara Bhavanam", theme colour #0F5E5A, background #FFFBF5.
2. Create two Supabase projects: kb-demo (sample data, no sign-in) and kb-live (Google sign-in, real data). One env var, VITE\_APP\_MODE = demo | live, switches between them.
3. Write the SQL migration: the six tables in Data model, plus allowed\_users (email, display\_name), a created\_by text column on stays, payments and charges, the stay\_totals view, the overlap exclusion constraint (needs the btree\_gist extension), and the bill-number sequence.
4. Row-level security: in demo mode, allow the anon role full access to the demo project only. In live mode, allow access only when auth.email() is in allowed\_users.
5. Seed the demo project with the sample data below.
6. Build screens in this order: Who's using this? picker, Home, New booking (3 steps), Stay detail, Stays, Guests, Message guest.
7. Put all money maths in one module (src/lib/money.ts) that mirrors stay\_totals, with unit tests for: per-night, fixed, charges, discounts, voided payments, refunds, overpayment.
8. Deploy to Cloudflare Pages.

**Picker behaviour:** two large cards, Krishna Kumar and Padmanabhan. The choice is saved on the device and shown in the header with a "Switch" link. Every insert writes it to created\_by. In demo mode a small "Demo" badge stays visible on every screen.

**Design tokens** (from the Claude Design canvas)

| Token | Value | Use |
| --- | --- | --- |
| peacock | #0F5E5A | Main buttons, current stay card, active tab |
| marigold | #F2A93B | Booked nights, secondary button, highlights |
| terracotta | #A8401F | Money owed, errors (text-safe on light backgrounds) |
| jasmine | #FFFBF5 | App background |
| haldi | #FFF4E0 | Soft highlight cards |
| teak | #2B1D14 | Text, the money bar on New booking |
| muted | #6E5A4B | Secondary text |
| line | #F0E6D8 | Card borders |
| Fonts | Anek Tamil (headings, all numbers), Hind Madurai (body) | Google Fonts |
| Radius | 16 to 28 px on cards, 999 px on pills |  |
| Touch targets | 48 px minimum, primary buttons 56 to 60 px |  |

**Demo sample data** (today is 19 Nov 2026; no overlapping dates)

| Guest | Dates | Guests | Price | Payments | Status |
| --- | --- | --- | --- | --- | --- |
| Lakshmi Narayanan | 14 to 22 Nov | 8 + driver | Fixed ₹40,000; extra bedding +₹1,000; returning guest −₹1,000 | ₹10,000 UPI 2 Nov; ₹25,000 cash 14 Nov; one ₹25,000 cash voided (entered twice) | Checked in |
| Priya Sundaram | 24 to 26 Nov | 6 | ₹5,000 per night; bedding +₹500; returning guest −₹500 | ₹2,000 UPI advance | Confirmed |
| Ravi Shankar | 4 to 6 Dec | 4 + driver | ₹5,000 per night | None | Tentative |
| Meena Venkatesh | 30 Oct to 2 Nov | 5 | ₹4,500 per night | ₹13,500 UPI 30 Oct, paid in full (so Home shows ₹37,000 collected in Nov, matching the design) | Completed |

Blocked dates: 28 to 29 Nov, "Family function".

**Done means:** the owner can take a booking from enquiry to a shared bill without leaving the app, and every figure on Home matches the sum of the records.
