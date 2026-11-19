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
await db.exec(`
  create schema if not exists extensions;
  create schema if not exists auth;
  create role anon nologin; create role authenticated nologin;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`);

await db.exec(read('supabase/migrations/001_init.sql'));
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

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
