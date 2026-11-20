import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync } from 'node:fs';

// Runs the migration and both seeds in an in-memory Postgres (PGlite) and checks
// the money figures, the overlap constraint, payment guards and RLS.
// Usage: npm run test:db
const root = process.argv[2] ?? process.cwd();
const read = (p) => readFileSync(`${root}/${p}`, 'utf8');
const db = new PGlite({ extensions: { btree_gist } });

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const one = async (sql) => (await db.query(sql)).rows[0];
const expectError = async (sql, re, msg) => {
  try { await db.exec(sql); ok(false, `${msg} (no error)`); }
  catch (e) { ok(re.test(e.message), `${msg} → ${e.message.split('\n')[0]}`); }
};

// Minimal Supabase stand-ins.
const STUBS = `
  create schema if not exists extensions;
  create schema if not exists auth;
  create role anon nologin; create role authenticated nologin;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`;
await db.exec(STUBS);

await db.exec(read('supabase/migrations/001_init.sql'));
await db.exec(read('supabase/migrations/002_create_booking.sql'));
await db.exec(read('supabase/migrations/003_sources_referrers.sql'));
await db.exec(read('supabase/migrations/004_commission_past_stays.sql'));
console.log('migration ok');
await db.exec(read('supabase/demo_policies.sql'));
await db.exec(read('supabase/seed.sql'));
console.log('seed ok');

const homeChecks = async (label) => {
  const lak = await one(`select * from stay_totals where guest_name = 'Lakshmi Narayanan' and status = 'checked_in'`);
  ok(lak.final === 40000 && lak.paid === 35000 && lak.balance === 5000, `${label}: Lakshmi final ${lak.final}, paid ${lak.paid}, balance ${lak.balance}`);
  const col = await one(`select coalesce(sum(case when type = 'refund' then -amount else amount end), 0)::int as amount,
                                count(*) filter (where type <> 'refund')::int as n
                         from payments where not voided and paid_on >= '2026-11-01' and paid_on < '2026-12-01'`);
  ok(col.amount === 37000 && col.n === 3, `${label}: collected in Nov ${col.amount} from ${col.n} payments`);
  const tc = await one(`select coalesce(sum(balance), 0)::int as v from stay_totals where status in ('checked_in','completed') and balance > 0`);
  ok(tc.v === 5000, `${label}: to collect ${tc.v}`);
};
await homeChecks('seed');
const pri = await one(`select final, balance from stay_totals where guest_name = 'Priya Sundaram' and status = 'confirmed'`);
ok(pri.final === 10000 && pri.balance === 8000, `Priya final ${pri.final}, due ${pri.balance}`);
const mee = await db.query(`select to_char(night, 'YYYY-MM') m, sum(amount)::int a from stay_night_revenue r join stays s on s.id = r.stay_id
                            join guests g on g.id = s.guest_id where g.name = 'Meena Venkatesh' group by 1 order by 1`);
ok(JSON.stringify(mee.rows) === JSON.stringify([{ m: '2026-10', a: 9000 }, { m: '2026-11', a: 4500 }]), `Meena split ${JSON.stringify(mee.rows)}`);

await db.exec(read('supabase/seed_history.sql'));
console.log('history ok');
await homeChecks('with history');
const cnt = await one(`select count(*)::int n, count(*) filter (where bill_no like 'KB-2026-%')::int n26 from stays`);
ok(cnt.n26 === 44, `stays ${cnt.n}, 2026 bills ${cnt.n26}`);
const dup = await one(`select count(*)::int n from (select bill_no from stays group by 1 having count(*) > 1) x`);
ok(dup.n === 0, 'bill numbers unique');
const ov = await one(`select count(*)::int n from stays a join stays b on a.id < b.id
  and daterange(a.check_in, a.check_out) && daterange(b.check_in, b.check_out)
  where a.status <> 'cancelled' and b.status <> 'cancelled'`);
ok(ov.n === 0, `no overlapping non-cancelled stays (${ov.n})`);
const hist = await one(`select count(*)::int n from stay_totals where bill_no not in ('KB-2026-0041','KB-2026-0042','KB-2026-0043','KB-2026-0044') and balance <> 0`);
ok(hist.n === 0, 'all history stays have balance 0');
const split = await one(`select count(*)::int n from stay_totals t join (select stay_id, sum(amount) s from stay_night_revenue group by 1) r
  on r.stay_id = t.stay_id where r.s <> t.final`);
ok(split.n === 0, 'night split adds back to final for every booked stay');
const ret = await db.query(`select g.name, count(*)::int n from stays s join guests g on g.id = s.guest_id
  where g.name in ('Lakshmi Narayanan','Priya Sundaram') group by 1 order by 1`);
ok(ret.rows.every((r) => r.n === 2), `returning guests ${JSON.stringify(ret.rows)}`);

// Bill counter continues after seed numbers
const as = (role) => `set role ${role}; select set_config('request.jwt.claims', '{"role":"${role}"}', false);`;
await db.exec(`${as('anon')}
  insert into stays (guest_id, check_in, check_out, status, pricing_mode, nightly_rate, created_by)
  values ('a0000000-0000-4000-8000-000000000003', '2027-01-10', '2027-01-12', 'enquiry', 'per_night', 5000, 'Krishna Kumar');
  reset role;`);
const nb = await one(`select bill_no from stays where check_in = '2027-01-10'`);
ok(/^KB-20\d\d-\d{4}$/.test(nb.bill_no), `app insert got bill ${nb.bill_no}`);

await expectError(`${as('anon')} insert into stays (guest_id, bill_no, check_in, check_out, pricing_mode, nightly_rate, created_by)
  values ('a0000000-0000-4000-8000-000000000003', 'KB-2026-9999', '2027-02-10', '2027-02-12', 'per_night', 5000, 'X');`,
  /issued by the database/, 'app cannot choose a bill number');
await db.exec('reset role;');

await expectError(`insert into stays (guest_id, check_in, check_out, status, pricing_mode, fixed_amount, created_by)
  values ('a0000000-0000-4000-8000-000000000003', '2026-11-21', '2026-11-23', 'confirmed', 'fixed', 1000, 'X');`,
  /stays_no_double_booking/, 'overlap with checked-in stay is refused');
await db.exec(`insert into stays (guest_id, check_in, check_out, status, pricing_mode, fixed_amount, created_by)
  values ('a0000000-0000-4000-8000-000000000003', '2026-11-22', '2026-11-24', 'confirmed', 'fixed', 1000, 'X');`);
ok(true, 'check-out day 22 Nov is free for a check-in on 22 Nov');
await db.exec(`delete from stays where check_in = '2026-11-22' and created_by = 'X'`);
await expectError(`insert into stays (guest_id, check_in, check_out, status, pricing_mode, fixed_amount, created_by)
  values ('a0000000-0000-4000-8000-000000000003', '2026-11-25', '2026-11-25', 'enquiry', 'fixed', 1000, 'X');`,
  /stays_dates_valid/, 'zero-night stay refused');

const pid = (await one(`select id from payments where amount = 10000 and paid_on = '2026-11-02'`)).id;
await expectError(`delete from payments where id = '${pid}'`, /never deleted/, 'payment delete refused (owner role)');
await expectError(`update payments set amount = 9000 where id = '${pid}'`, /cannot be edited/, 'payment edit refused');
await expectError(`update payments set voided = true, void_reason = 'x', voided_by = 'K', amount = 1 where id = '${pid}'`, /Only the void fields/, 'void + edit refused');
await expectError(`update payments set voided = true where id = '${pid}'`, /payments_void_has_reason/, 'void without reason refused');
await expectError(`update payments set voided = false, void_reason = null where void_reason = 'Entered twice'`, /already voided/, 'un-void refused');
await expectError(`${as('anon')} delete from payments where id = '${pid}';`, /permission denied/, 'anon has no delete on payments');
await db.exec('reset role;');
await db.exec(`${as('anon')} delete from stays;`); // RLS: no delete policy, so 0 rows are affected
await db.exec('reset role;');
const still = await one(`select count(*)::int n from stays`);
ok(still.n > 50, `stays still there after anon delete attempt (${still.n})`);

await expectError(`insert into message_templates (kind, title, body, created_by) values ('review_request', 'x', 'Leave a review and get 10% off your next stay', 'K')`,
  /review_request_has_no_incentive/, 'review template with an offer refused');
await db.exec(`insert into message_templates (kind, title, body, created_by) values ('thank_you', 'x', 'Come back for a discount', 'K')`);
ok(true, 'thank-you template is not restricted');
await expectError(`insert into id_checks (stay_id, doc_type, last4, checked_by, created_by)
  values ('b0000000-0000-4000-8000-000000000002', 'aadhaar', '1234 5678 9012', 'K', 'K')`, /id_checks_last4_check|check constraint/, 'full Aadhaar refused');
await expectError(`insert into charges (stay_id, kind, label, amount, created_by) values ('b0000000-0000-4000-8000-000000000002', 'discount', 'Review offer', 500, 'K')`,
  /charges_discount_label/, 'discount label outside the list refused');
await expectError(`update stays set bill_no = 'KB-2026-0001' where bill_no = 'KB-2026-0041'`, /never change/, 'bill number cannot change');

// Live mode: authenticated but not allow-listed sees nothing.
await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"role":"authenticated","email":"stranger@example.com"}', false);`);
const live = await one(`select count(*)::int n from stays`);
ok(live.n === 0, `non-allow-listed signed-in user sees ${live.n} stays`);
await db.exec('reset role;');

// create_booking: one atomic call, as the app makes it (anon, demo).
const booking = (over = {}) => JSON.stringify({
  created_by: 'Padmanabhan',
  guest: { phone: '+910000000999', name: 'Test Guest', city: 'Tenkasi', language: 'en' },
  stay: { check_in: '2027-03-10', check_out: '2027-03-13', guests_count: 5, status: 'confirmed',
          pricing_mode: 'per_night', nightly_rate: 5000, occasion: 'Temple visit', sources: ['Phone'] },
  charges: [{ kind: 'charge', label: 'Extra bedding', amount: 500 }, { kind: 'discount', label: 'Referral', amount: 500 }],
  advance: { amount: 3000, mode: 'upi', paid_on: '2026-11-19' },
  ...over,
});
const asAnon = async (sql, params) => {
  await db.exec(as('anon'));
  try { return (await db.query(sql, params)).rows[0]; } finally { await db.exec('reset role;'); }
};
const made = (await asAnon(`select public.create_booking($1::jsonb) as r`, [booking()])).r;
const mt = await one(`select final, paid, balance, created_by from stay_totals where stay_id = '${made.stay_id}'`);
ok(/^KB-\d{4}-\d{4}$/.test(made.bill_no) && mt.final === 15000 && mt.paid === 3000 && mt.balance === 12000 && mt.created_by === 'Padmanabhan',
  `create_booking saved ${made.bill_no}: final ${mt.final}, paid ${mt.paid}, balance ${mt.balance}`);

const stayCount = async () => (await one(`select count(*)::int n from stays`)).n;
const before = await stayCount();
const expectRpcError = async (payload, re, msg) => {
  try { await asAnon(`select public.create_booking($1::jsonb) as r`, [payload]); ok(false, `${msg} (no error)`); }
  catch (e) { ok(re.test(e.message), `${msg} → ${e.message.split('\n')[0]}`); }
};
await expectRpcError(booking({ stay: { check_in: '2026-11-20', check_out: '2026-11-23', status: 'confirmed', pricing_mode: 'per_night', nightly_rate: 5000 } }),
  /stays_no_double_booking/, 'create_booking refuses an overlap');
await expectRpcError(booking({ stay: { check_in: '2027-04-10', check_out: '2027-04-12', status: 'confirmed', pricing_mode: 'per_night', nightly_rate: 5000 },
  advance: { amount: 2500.5, mode: 'upi', paid_on: '2026-11-19' } }),
  /invalid input syntax for type integer/, 'create_booking refuses a fractional advance');
ok((await stayCount()) === before, 'failed bookings leave nothing behind (all or nothing)');

const again = (await asAnon(`select public.create_booking($1::jsonb) as r`, [booking({
  guest: { phone: '+910000000999', name: 'Test Guest Renamed' },
  stay: { check_in: '2027-05-01', check_out: '2027-05-02', status: 'enquiry', pricing_mode: 'fixed', fixed_amount: 4000 },
  charges: [], advance: null })])).r;
ok(again.guest_id === made.guest_id, 'same phone reuses the guest (no duplicate)');
const gname = await one(`select name, city from guests where id = '${made.guest_id}'`);
ok(gname.name === 'Test Guest Renamed' && gname.city === 'Tenkasi', `guest updated, blanks kept (${gname.name}, ${gname.city})`);

// --- 003: several sources, referrers, no driver room -------------------------
const rpc = async (over) => (await asAnon(`select public.create_booking($1::jsonb) as r`, [booking({ charges: [], advance: null, ...over })])).r;
const stayOf = (id) => one(`select sources, referrer_id, referrer_name from stay_totals where stay_id = '${id}'`);
const st = (check_in, check_out, extra = {}) => ({ check_in, check_out, status: 'enquiry', pricing_mode: 'fixed', fixed_amount: 3000, ...extra });

const legacy = await rpc({ stay: st('2027-06-01', '2027-06-02', { source: 'Walk-in' }) });
ok(JSON.stringify((await stayOf(legacy.stay_id)).sources) === '["Walk-in"]', 'old single "source" from a previous app version still saves');

const multi = await rpc({ stay: st('2027-06-03', '2027-06-04', { sources: ['WhatsApp', ' Referral ', '', 'WhatsApp'] }) });
ok(JSON.stringify((await stayOf(multi.stay_id)).sources) === '["WhatsApp","Referral"]', 'sources trimmed, blanks and repeats dropped, order kept');

const newRef = await rpc({ stay: st('2027-06-05', '2027-06-06', { sources: ['Referral'] }), referrer: { name: ' Selvam (driver) ', phone: '+910000000399' } });
const nr = await stayOf(newRef.stay_id);
ok(nr.referrer_id === newRef.referrer_id && nr.referrer_name === 'Selvam (driver)', `new referrer added and linked (${nr.referrer_name})`);
const samePhone = await rpc({ stay: st('2027-06-07', '2027-06-08', { sources: ['Referral'] }), referrer: { name: 'Selvam', phone: '+910000000399' } });
ok(samePhone.referrer_id === newRef.referrer_id, 'a known referrer phone reuses that referrer (no duplicate)');
const sameName = await rpc({ stay: st('2027-06-13', '2027-06-14', { sources: ['Referral'] }), referrer: { name: 'anitha travels' } });
ok(sameName.referrer_id === 'd1000000-0000-4000-8000-000000000003', 'the same name typed again (no phone) reuses that referrer');
const byId = await rpc({ stay: st('2027-06-09', '2027-06-10', { sources: ['Phone', 'Referral'] }), referrer: { id: 'd1000000-0000-4000-8000-000000000001' } });
ok((await stayOf(byId.stay_id)).referrer_name === 'Murugan (auto driver)', 'an existing referrer is picked by id');
const noReferral = await rpc({ stay: st('2027-06-11', '2027-06-12', { sources: ['Phone'] }), referrer: { name: 'Should not save' } });
ok(noReferral.referrer_id === null && (await one(`select count(*)::int n from referrers where name = 'Should not save'`)).n === 0,
  'a referrer is ignored unless Referral is chosen');
await expectError(`update stays set referrer_id = 'd1000000-0000-4000-8000-000000000001' where id = '${legacy.stay_id}'`,
  /stays_referrer_needs_referral/, 'a referrer without Referral is refused by the database');
await expectError(`${as('anon')} delete from referrers;`, /permission denied/, 'anon cannot delete referrers');
await db.exec('reset role;');
const murugan = await one(`select count(*)::int n from stay_totals where referrer_name = 'Murugan (auto driver)'`);
ok(murugan.n === 3, `sample referrer Murugan has ${murugan.n} stays`);
const noDriver = await one(`select count(*)::int n from information_schema.columns where table_name in ('stays','stay_totals') and column_name in ('driver_room','source')`);
ok(noDriver.n === 0, 'driver_room and single source are gone');
await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"role":"authenticated","email":"stranger@example.com"}', false);`);
ok((await one(`select count(*)::int n from referrers`)).n === 0, 'non-allow-listed signed-in user sees no referrers');
await db.exec('reset role;');

// --- 004: referrer commission, payouts, past stays ---------------------------
const kt = (bill) => one(`select commission_id, commission, commission_paid, commission_owed, final, balance from stay_totals where bill_no = '${bill}'`);
const k1 = await kt('KB-2025-0006');
ok(k1.commission === 500 && k1.commission_paid === 500 && k1.commission_owed === 0, `sample paid commission: ${k1.commission} paid ${k1.commission_paid} owed ${k1.commission_owed}`);
const k2 = await kt('KB-2026-0005');
ok(k2.commission === 500 && k2.commission_paid === 0 && k2.commission_owed === 500, `sample owed commission: owed ${k2.commission_owed}`);
ok(k2.balance === 0, `commission never touches the guest's balance (balance ${k2.balance})`);
const k0 = await kt('KB-2026-0041');
ok(k0.commission_id === null && k0.commission === 0 && k0.commission_owed === 0, 'a stay with no commission shows 0');
const owedAll = await one(`select coalesce(sum(commission_owed), 0)::int v from stay_totals`);
ok(owedAll.v === 1500, `owed to referrers in the samples: ${owedAll.v}`);
const finalsSame = await one(`select count(*)::int n from stay_totals where final <> base + charges - discounts`);
ok(finalsSame.n === 0, 'final is still base + charges − discounts for every stay');

// The app's flow, as anon: add, pay, void.
const murStay = byId.stay_id; // Murugan, from the 003 tests above
const asAnonExec = async (sql) => { await db.exec(as('anon')); try { await db.exec(sql); } finally { await db.exec('reset role;'); } };
await asAnonExec(`insert into commissions (stay_id, amount, created_by) values ('${murStay}', 750, 'Padmanabhan')`);
const kc = await one(`select id from commissions where stay_id = '${murStay}' and not voided`);
ok(!!kc, 'anon (demo) can add a commission');
await expectError(`${as('anon')} insert into commissions (stay_id, amount, created_by) values ('${murStay}', 100, 'K');`,
  /commissions_one_live_per_stay/, 'only one live commission per stay');
await db.exec('reset role;');
await expectError(`insert into commissions (stay_id, amount, created_by) values ('${legacy.stay_id}', 500, 'K')`,
  /needs a booking with a referrer/, 'commission refused on a stay with no referrer');
await expectError(`insert into commissions (stay_id, amount, created_by) values ('${murStay}', 0, 'K')`, /check constraint/, 'zero commission refused');
await expectError(`insert into commission_payouts (commission_id, amount, mode, paid_on, created_by) values ('${kc.id}', 500, 'cash', '2026-11-21', 'K')`,
  /full commission/, 'a part payout is refused');
await asAnonExec(`insert into commission_payouts (commission_id, amount, mode, paid_on, created_by) values ('${kc.id}', 750, 'cash', '2026-11-21', 'Padmanabhan')`);
let km = await one(`select commission, commission_paid, commission_owed from stay_totals where stay_id = '${murStay}'`);
ok(km.commission_paid === 750 && km.commission_owed === 0, `marked paid: owed ${km.commission_owed}`);
await expectError(`insert into commission_payouts (commission_id, amount, mode, paid_on, created_by) values ('${kc.id}', 750, 'cash', '2026-11-22', 'K')`,
  /commission_payouts_one_live/, 'cannot pay the same commission twice');
await expectError(`update commissions set voided = true, void_reason = 'Wrong amount', voided_by = 'K' where id = '${kc.id}'`,
  /Void the payment to the referrer first/, 'a paid commission cannot be voided before its payout');
await expectError(`update commissions set amount = 900 where id = '${kc.id}'`, /cannot be edited/, 'commission edit refused');
await expectError(`delete from commission_payouts`, /never deleted/, 'payout delete refused');
await expectError(`${as('anon')} delete from commissions;`, /permission denied/, 'anon has no delete on commissions');
await db.exec('reset role;');
await asAnonExec(`update commission_payouts set voided = true, void_reason = 'Paid twice', voided_by = 'Padmanabhan' where commission_id = '${kc.id}' and not voided`);
await asAnonExec(`update commissions set voided = true, void_reason = 'Wrong amount', voided_by = 'Padmanabhan' where id = '${kc.id}'`);
km = await one(`select commission_id, commission, commission_owed from stay_totals where stay_id = '${murStay}'`);
ok(km.commission_id === null && km.commission === 0, 'voided commission and payout count for nothing');
await expectError(`insert into commission_payouts (commission_id, amount, mode, paid_on, created_by) values ('${kc.id}', 750, 'cash', '2026-11-21', 'K')`,
  /voided/, 'a voided commission cannot be paid');
await asAnonExec(`insert into commissions (stay_id, amount, created_by) values ('${murStay}', 600, 'Padmanabhan')`);
km = await one(`select commission, commission_owed from stay_totals where stay_id = '${murStay}'`);
ok(km.commission === 600 && km.commission_owed === 600, 'after voiding, a new commission can be added');
await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"role":"authenticated","email":"stranger@example.com"}', false);`);
ok((await one(`select count(*)::int n from commissions`)).n === 0 && (await one(`select count(*)::int n from commission_payouts`)).n === 0,
  'non-allow-listed signed-in user sees no commissions or payouts');
await db.exec('reset role;');

// Past stay: completed, paid at the time as a 'payment'.
const past = await rpc({
  guest: { phone: '+910000000777', name: 'Past Guest' },
  stay: { check_in: '2025-06-01', check_out: '2025-06-04', guests_count: 6, status: 'completed', pricing_mode: 'fixed', fixed_amount: 15000, sources: ['Phone'] },
  advance: { amount: 15000, mode: 'cash', paid_on: '2025-06-04', type: 'payment' },
});
const pt = await one(`select status, final, paid, balance, bill_no from stay_totals where stay_id = '${past.stay_id}'`);
const ptp = await one(`select type from payments where stay_id = '${past.stay_id}'`);
ok(pt.status === 'completed' && pt.final === 15000 && pt.balance === 0 && ptp.type === 'payment' && /^KB-\d{4}-\d{4}$/.test(pt.bill_no),
  `past stay saved as completed and paid (${pt.bill_no}, ${ptp.type})`);
await expectRpcError(booking({ stay: { check_in: '2030-01-01', check_out: '2030-01-03', status: 'completed', pricing_mode: 'fixed', fixed_amount: 1000 }, charges: [], advance: null }),
  /checked out by today/, 'a "past" stay in the future is refused');
await expectRpcError(booking({ stay: st('2027-07-01', '2027-07-02'), charges: [], advance: { amount: 500, mode: 'upi', paid_on: '2026-11-20', type: 'refund' } }),
  /advance or a payment/, 'the first payment cannot be a refund');
const advDefault = await rpc({ stay: st('2027-07-03', '2027-07-04'), advance: { amount: 500, mode: 'upi', paid_on: '2026-11-20' } });
ok((await one(`select type from payments where stay_id = '${advDefault.stay_id}'`)).type === 'advance', 'without a type, the first payment is still an advance');

// --- Upgrade path: a database set up before 003, with data, then 003 ---------
const up = new PGlite({ extensions: { btree_gist } });
await up.exec(STUBS);
await up.exec(read('supabase/migrations/001_init.sql'));
await up.exec(read('supabase/migrations/002_create_booking.sql'));
await up.exec(`
  insert into guests (id, name, phone, created_by) values ('a9000000-0000-4000-8000-000000000001', 'Old Guest', '+910000000888', 'K');
  insert into stays (id, guest_id, check_in, check_out, driver_room, status, pricing_mode, nightly_rate, source, created_by) values
    ('b9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', '2026-01-01', '2026-01-03', true, 'completed', 'per_night', 5000, 'Phone', 'K'),
    ('b9000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000001', '2026-02-01', '2026-02-02', false, 'completed', 'per_night', 5000, null, 'K');`);
await up.exec(read('supabase/migrations/003_sources_referrers.sql'));
await up.exec(read('supabase/migrations/004_commission_past_stays.sql'));
await up.exec(read('supabase/demo_policies.sql'));
await up.exec(read('supabase/demo_policies.sql')); // safe to run twice
const upRows = (await up.query(`select bill_no, sources, final from stay_totals order by check_in`)).rows;
ok(JSON.stringify(upRows.map((r) => r.sources)) === '[["Phone"],[]]' && upRows[0].final === 10000,
  `upgrade keeps existing stays: sources ${JSON.stringify(upRows.map((r) => r.sources))}, final ${upRows[0].final}`);
await up.exec(`set role anon; select set_config('request.jwt.claims', '{"role":"anon"}', false);`);
ok((await up.query(`select count(*)::int n from referrers`)).rows[0].n === 0, 'after upgrade the demo can read referrers');
ok((await up.query(`select count(*)::int n from commissions`)).rows[0].n === 0, 'after upgrade the demo can read commissions');
const upK = (await up.query(`select commission, commission_owed from stay_totals order by check_in limit 1`)).rows[0];
ok(upK.commission === 0 && upK.commission_owed === 0, 'after upgrade, older stays show no commission');
await up.exec('reset role;');

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
