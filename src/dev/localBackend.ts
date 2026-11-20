/**
 * DEV ONLY · local preview backend.
 *
 * When `npm run dev` runs without a Supabase project in .env.local, the app's
 * Supabase client sends its requests here instead of over the network. This
 * module runs the real migrations and demo seed in PGlite (Postgres compiled to
 * WebAssembly, in the browser tab) and answers the small set of PostgREST
 * requests the app makes, as the `anon` role with the demo RLS policies.
 *
 * It exists so screens can be built and checked against the exact SQL that
 * runs in Supabase. It is never part of a production build: it is only
 * imported behind `import.meta.env.DEV` (see src/lib/supabase.ts). Data lives
 * in memory and resets on every reload.
 */
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import m001 from '../../supabase/migrations/001_init.sql?raw';
import m002 from '../../supabase/migrations/002_create_booking.sql?raw';
import m003 from '../../supabase/migrations/003_sources_referrers.sql?raw';
import m004 from '../../supabase/migrations/004_commission_past_stays.sql?raw';
import m005 from '../../supabase/migrations/005_tasks_checklists.sql?raw';
import m006 from '../../supabase/migrations/006_expenses.sql?raw';
import demoPolicies from '../../supabase/demo_policies.sql?raw';
import seed from '../../supabase/seed.sql?raw';
import seedHistory from '../../supabase/seed_history.sql?raw';

const SUPABASE_STUBS = `
  create schema if not exists extensions;
  create schema if not exists auth;
  create role anon nologin;
  create role authenticated nologin;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
`;

let ready: Promise<PGlite> | null = null;

function database(): Promise<PGlite> {
  ready ??= (async () => {
    const db = await PGlite.create({ extensions: { btree_gist } });
    for (const sql of [SUPABASE_STUBS, m001, m002, m003, m004, m005, m006, demoPolicies, seed, seedHistory]) {
      await db.exec(sql);
    }
    return db;
  })();
  return ready;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new PostgrestError(400, 'PGRST100', `Unsupported name: ${name}`);
  return `"${name}"`;
}

class PostgrestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: string | null = null,
    public hint: string | null = null,
  ) {
    super(message);
  }
}

const OPS: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };

/** One `col=op.value` filter → SQL, pushing values into params. */
function filterSql(col: string, expr: string, params: unknown[]): string {
  const c = ident(col);
  let negate = false;
  if (expr.startsWith('not.')) {
    negate = true;
    expr = expr.slice(4);
  }
  const dot = expr.indexOf('.');
  const op = expr.slice(0, dot);
  const val = expr.slice(dot + 1);
  let sql: string;
  if (op === 'is') {
    if (!['null', 'true', 'false'].includes(val)) throw new PostgrestError(400, 'PGRST100', `Bad is value: ${val}`);
    sql = `${c} is ${val}`;
  } else if (op === 'in') {
    const items = val.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''));
    params.push(items);
    sql = `${c}::text = any($${params.length}::text[])`;
  } else if (op in OPS) {
    const v = op === 'like' || op === 'ilike' ? val.replace(/\*/g, '%') : val;
    params.push(v);
    sql = op === 'like' || op === 'ilike' ? `${c}::text ${OPS[op]} $${params.length}` : `${c} ${OPS[op]} $${params.length}`;
  } else {
    throw new PostgrestError(400, 'PGRST100', `Unsupported operator: ${op}`);
  }
  return negate ? `not (${sql})` : sql;
}

/** or=(a.eq.1,b.ilike.*x*) → (a = $1 or b ilike $2). No nesting. */
function orSql(group: string, params: unknown[]): string {
  const inner = group.replace(/^\(|\)$/g, '');
  const parts = inner.split(',').map((p) => {
    const dot = p.indexOf('.');
    return filterSql(p.slice(0, dot), p.slice(dot + 1), params);
  });
  return `(${parts.join(' or ')})`;
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'or', 'columns', 'on_conflict']);

function whereSql(q: URLSearchParams, params: unknown[]): string {
  const parts: string[] = [];
  for (const [key, value] of q) {
    if (key === 'or') parts.push(orSql(value, params));
    else if (!RESERVED.has(key)) parts.push(filterSql(key, value, params));
  }
  return parts.length ? `where ${parts.join(' and ')}` : '';
}

function selectSql(q: URLSearchParams): string {
  const sel = q.get('select') ?? '*';
  if (sel === '*') return '*';
  return sel.split(',').map((c) => ident(c.trim())).join(', ');
}

function orderSql(q: URLSearchParams): string {
  const order = q.get('order');
  if (!order) return '';
  return (
    'order by ' +
    order
      .split(',')
      .map((part) => {
        const [col, dir = 'asc', nulls] = part.split('.');
        const d = dir === 'desc' ? 'desc' : 'asc';
        const n = nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : '';
        return `${ident(col!)} ${d}${n}`;
      })
      .join(', ')
  );
}

function limitSql(q: URLSearchParams): string {
  const limit = q.get('limit');
  const offset = q.get('offset');
  return `${limit && /^\d+$/.test(limit) ? `limit ${limit}` : ''} ${offset && /^\d+$/.test(offset) ? `offset ${offset}` : ''}`;
}

async function asAnon<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const db = await database();
  return db.transaction(async (tx) => {
    await tx.exec(`set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);`);
    return fn(tx);
  });
}

async function run(method: string, path: string, q: URLSearchParams, body: unknown): Promise<unknown> {
  const params: unknown[] = [];

  const rpc = /^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/.exec(path);
  if (rpc) {
    const args = Object.entries((body ?? {}) as Record<string, unknown>).map(([k, v]) => {
      params.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
      return `${ident(k)} => $${params.length}`;
    });
    const sql = `select to_json(public.${ident(rpc[1]!)}(${args.join(', ')})) as j`;
    return asAnon(async (tx) => (await tx.query<{ j: unknown }>(sql, params)).rows[0]?.j ?? null);
  }

  const m = /^\/rest\/v1\/([a-z_][a-z0-9_]*)$/.exec(path);
  if (!m) throw new PostgrestError(404, 'PGRST125', `Unknown path ${path}`);
  const table = `public.${ident(m[1]!)}`;

  let sql: string;
  if (method === 'GET') {
    sql = `select coalesce(json_agg(t), '[]'::json) as j from (
             select ${selectSql(q)} from ${table} ${whereSql(q, params)} ${orderSql(q)} ${limitSql(q)}) t`;
  } else if (method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r as object)))].map(ident);
    params.push(JSON.stringify(rows));
    sql = `with w as (insert into ${table} (${cols.join(', ')})
             select ${cols.join(', ')} from json_populate_recordset(null::${table}, $1::json) returning *)
           select coalesce(json_agg(w), '[]'::json) as j from w`;
  } else if (method === 'PATCH') {
    const cols = Object.keys(body as object).map(ident);
    params.push(JSON.stringify(body));
    const where = whereSql(q, params);
    sql = `with w as (update ${table} set (${cols.join(', ')}) =
             (select ${cols.join(', ')} from json_populate_record(null::${table}, $1::json)) ${where} returning *)
           select coalesce(json_agg(w), '[]'::json) as j from w`;
  } else if (method === 'DELETE') {
    sql = `with w as (delete from ${table} ${whereSql(q, params)} returning *)
           select coalesce(json_agg(w), '[]'::json) as j from w`;
  } else {
    throw new PostgrestError(405, 'PGRST117', `Unsupported method ${method}`);
  }
  return asAnon(async (tx) => (await tx.query<{ j: unknown }>(sql, params)).rows[0]?.j ?? []);
}

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/** A `fetch` that answers Supabase REST calls from the in-browser database. */
export async function localFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = new Request(input, init);
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  const text = method === 'GET' || method === 'HEAD' ? '' : await req.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;

  try {
    const result = await run(method, url.pathname, url.searchParams, body);
    if (req.headers.get('accept')?.includes('vnd.pgrst.object')) {
      const rows = result as unknown[];
      if (rows.length !== 1) {
        return json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `${rows.length} rows`, hint: null });
      }
      return json(200, rows[0]);
    }
    const minimal = req.headers.get('prefer')?.includes('return=minimal');
    return json(method === 'POST' && !url.pathname.includes('/rpc/') ? 201 : 200, minimal ? undefined : result);
  } catch (e) {
    if (e instanceof PostgrestError) return json(e.status, { code: e.code, message: e.message, details: e.details, hint: e.hint });
    const pg = e as { code?: string; message?: string; detail?: string; hint?: string };
    const status = pg.code === '23505' || pg.code === '23P01' ? 409 : pg.code === '42501' ? 403 : 400;
    return json(status, { code: pg.code ?? 'XX000', message: pg.message ?? String(e), details: pg.detail ?? null, hint: pg.hint ?? null });
  }
}
