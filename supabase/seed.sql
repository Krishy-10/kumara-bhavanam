-- =============================================================================
-- DEMO ONLY · seed.sql · the PRD's "Demo sample data" (today = 19 Nov 2026)
-- Run on the kb-demo project after the migrations (001–004) and demo_policies.sql.
-- It wipes every app table first, so it can be re-run to reset the demo.
-- NEVER run this on the live project.
--
-- Phone numbers start with 00000 so they can never belong to a real person:
-- tapping "Open in WhatsApp" in the demo cannot message a stranger.
--
-- Hand check (also in src/lib/money.test.ts):
--   Lakshmi   fixed 40,000 + 1,000 bedding − 1,000 returning = 40,000
--             paid 10,000 (2 Nov) + 25,000 (14 Nov); the second 25,000 is voided
--             balance 5,000
--   Priya     2 nights × 5,000 + 500 − 500 = 10,000; advance 2,000 (10 Nov); due 8,000
--   Ravi      2 nights × 5,000 = 10,000; tentative, nothing paid
--   Meena     3 nights × 4,500 = 13,500; paid 13,500 on 30 Oct; balance 0
--   Home: Collected in Nov = 10,000 + 25,000 + 2,000 = 37,000 (3 payments)
--         To collect (checked in + completed) = 5,000
--         Floor free 22 to 24 Nov; blocked 28–29 Nov
-- =============================================================================

begin;

truncate table public.commission_payouts, public.commissions, public.payments, public.charges, public.id_checks, public.stays,
               public.guests, public.referrers, public.blocked_dates, public.message_templates,
               public.bill_counters
  restart identity cascade;

update public.app_settings
   set property_name = 'Kumara Bhavanam',
       contact_phone = '+91 00000 00000',
       address = 'First floor, Tirunelveli, Tamil Nadu',
       google_review_link = null;   -- the owner adds the real link in Settings

-- Guests ---------------------------------------------------------------------
insert into public.guests (id, name, phone, city, language, created_at, created_by) values
  ('a0000000-0000-4000-8000-000000000001', 'Lakshmi Narayanan', '+910000000101', 'Chennai',    'ta', '2025-10-05 10:00+05:30', 'Krishna Kumar'),
  ('a0000000-0000-4000-8000-000000000002', 'Priya Sundaram',    '+910000000102', 'Coimbatore', 'en', '2026-04-20 10:00+05:30', 'Padmanabhan'),
  ('a0000000-0000-4000-8000-000000000003', 'Ravi Shankar',      '+910000000103', 'Madurai',    'ta', '2026-11-17 18:30+05:30', 'Padmanabhan'),
  ('a0000000-0000-4000-8000-000000000004', 'Meena Venkatesh',   '+910000000104', 'Bengaluru',  'en', '2026-10-25 09:15+05:30', 'Krishna Kumar');

-- Stays (bill numbers continue after the 40 bookings in seed_history.sql) -----
insert into public.stays
  (id, guest_id, bill_no, check_in, check_out, guests_count, status,
   pricing_mode, nightly_rate, fixed_amount, occasion, sources, created_at, created_by) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'KB-2026-0041',
   '2026-11-14', '2026-11-22', 8, 'checked_in', 'fixed',     null, 40000, 'Pilgrimage', array['Returning guest'], '2026-10-20 11:00+05:30', 'Krishna Kumar'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'KB-2026-0042',
   '2026-10-30', '2026-11-02', 5, 'completed',  'per_night', 4500, null,  'Holiday',       array['WhatsApp'], '2026-10-25 09:20+05:30', 'Krishna Kumar'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'KB-2026-0043',
   '2026-11-24', '2026-11-26', 6, 'confirmed',  'per_night', 5000, null,  'Temple visit', array['Returning guest'], '2026-11-10 16:45+05:30', 'Padmanabhan'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'KB-2026-0044',
   '2026-12-04', '2026-12-06', 4, 'tentative',  'per_night', 5000, null,  'Wedding',       array['Phone'],    '2026-11-17 18:35+05:30', 'Padmanabhan');

-- Charges and discounts ------------------------------------------------------
insert into public.charges (stay_id, kind, label, amount, created_at, created_by) values
  ('b0000000-0000-4000-8000-000000000001', 'charge',   'Extra bedding',   1000, '2026-11-14 13:00+05:30', 'Krishna Kumar'),
  ('b0000000-0000-4000-8000-000000000001', 'discount', 'Returning guest', 1000, '2026-10-20 11:00+05:30', 'Krishna Kumar'),
  ('b0000000-0000-4000-8000-000000000002', 'charge',   'Extra bedding',    500, '2026-11-10 16:45+05:30', 'Padmanabhan'),
  ('b0000000-0000-4000-8000-000000000002', 'discount', 'Returning guest',  500, '2026-11-10 16:45+05:30', 'Padmanabhan');

-- Payments -------------------------------------------------------------------
insert into public.payments (stay_id, amount, type, mode, paid_on, reference, created_at, created_by) values
  ('b0000000-0000-4000-8000-000000000001', 10000, 'advance', 'upi',  '2026-11-02', null, '2026-11-02 09:00+05:30', 'Krishna Kumar'),
  ('b0000000-0000-4000-8000-000000000001', 25000, 'payment', 'cash', '2026-11-14', null, '2026-11-14 13:05+05:30', 'Krishna Kumar'),
  ('b0000000-0000-4000-8000-000000000002',  2000, 'advance', 'upi',  '2026-11-10', null, '2026-11-10 16:50+05:30', 'Padmanabhan'),
  ('b0000000-0000-4000-8000-000000000004', 13500, 'payment', 'upi',  '2026-10-30', null, '2026-10-30 12:00+05:30', 'Krishna Kumar');

-- Lakshmi's ₹25,000 cash entered twice: inserted, then voided (never deleted).
insert into public.payments (id, stay_id, amount, type, mode, paid_on, created_at, created_by) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 25000, 'payment', 'cash', '2026-11-14', '2026-11-14 13:06+05:30', 'Padmanabhan');
update public.payments
   set voided = true, void_reason = 'Entered twice', voided_by = 'Krishna Kumar'
 where id = 'c0000000-0000-4000-8000-000000000001';

-- ID check: type and last 4 only ---------------------------------------------
insert into public.id_checks (stay_id, doc_type, last4, checked_by, checked_at, created_by) values
  ('b0000000-0000-4000-8000-000000000001', 'aadhaar', '4821', 'Krishna Kumar', '2026-11-14 13:10+05:30', 'Krishna Kumar');

-- Blocked dates (both days included) -----------------------------------------
insert into public.blocked_dates (start_date, end_date, reason, created_by) values
  ('2026-11-28', '2026-11-29', 'Family function', 'Krishna Kumar');

-- Message templates (English presets; Tamil is a TODO for the owner) --------
-- Placeholders: {guest} {occasion} {nights} {review_link}
-- Review requests must never mention a discount, offer or gift (DB-checked).
insert into public.message_templates (kind, language, title, body, is_preset, sort_order, created_by) values
  ('thank_you', 'en', 'Warm thank you',
   E'Vanakkam {guest} ji,\n\nThank you for staying with us at Kumara Bhavanam for {occasion}. It was a joy to host your family for {nights} nights. We hope the kitchen and the balcony made it feel like home.\n\nSafe travels, and you are always welcome back.\n\nWarm regards,\nKumara Bhavanam',
   true, 10, 'Krishna Kumar'),
  ('thank_you', 'en', 'Short thank you',
   E'Vanakkam {guest} ji, thank you for staying at Kumara Bhavanam. We hope you reached home safely. It was lovely to have you with us.',
   true, 20, 'Krishna Kumar'),

  ('review_request', 'en', 'Warm and personal',
   E'Vanakkam {guest} ji,\n\nThank you once again for staying with us for {occasion}. If you have a minute, we would be grateful for an honest review on Google. It helps other families find us:\n{review_link}\n\nWarm regards,\nKumara Bhavanam',
   true, 10, 'Krishna Kumar'),
  ('review_request', 'en', 'Short and simple',
   E'Vanakkam {guest} ji, it was a pleasure hosting you. Could you share a few honest words about your stay on Google? {review_link}\nThank you!',
   true, 20, 'Krishna Kumar'),
  ('review_request', 'en', 'For pilgrim groups',
   E'Vanakkam {guest} ji,\n\nWe hope {occasion} was peaceful and fulfilling. Many pilgrim families look for a place like ours, and your honest review would help them decide:\n{review_link}\n\nWith regards,\nKumara Bhavanam',
   true, 30, 'Krishna Kumar'),
  ('review_request', 'en', 'For families',
   E'Vanakkam {guest} ji,\n\nThank you for choosing Kumara Bhavanam for your family. If the stay felt like home, or if something could be better, please tell us in a Google review. Every honest word helps:\n{review_link}',
   true, 40, 'Krishna Kumar'),
  ('review_request', 'en', 'Gentle reminder',
   E'Vanakkam {guest} ji, a gentle reminder in case you have a moment: an honest Google review of your stay would mean a lot to us. {review_link}\nThank you, and hope to see you again.',
   true, 50, 'Krishna Kumar'),
  ('review_request', 'en', 'Feedback first',
   E'Vanakkam {guest} ji,\n\nHow was your stay with us? We would love to hear what went well and what we can improve. You can reply here, or share an honest review on Google:\n{review_link}\n\nThank you,\nKumara Bhavanam',
   true, 60, 'Krishna Kumar');

commit;
