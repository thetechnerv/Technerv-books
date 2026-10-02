#!/usr/bin/env node
// Tech Nerv Supabase harness — run DDL/DML, migrations, seeds and SQL tests
// against the TechNerv-Internal project through the Supabase Management API.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.supabase.com/v1';
const APP_SCHEMA = 'accounts';

loadEnv(join(ROOT, '.env'));
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (!TOKEN || !REF) die('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF in harness/.env');

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

const commands = {
  async sql(query) {
    if (!query) die('Usage: db sql "<query>"');
    printRows(await q(query));
  },
  async file(path) {
    if (!path) die('Usage: db file <path.sql>');
    printRows(await q(readFileSync(path, 'utf8')));
  },
  async status() {
    const applied = await appliedMigrations();
    for (const f of migrationFiles()) {
      const row = applied.get(f.name);
      const mark = !row ? c.yellow('pending ') : row.checksum === f.checksum ? c.green('applied ') : c.red('changed ');
      console.log(`${mark} ${f.name}${row ? c.dim('  ' + row.applied_at) : ''}`);
    }
  },
  async migrate() {
    const applied = await appliedMigrations();
    const pending = migrationFiles().filter((f) => !applied.has(f.name));
    for (const f of migrationFiles()) {
      const row = applied.get(f.name);
      if (row && row.checksum !== f.checksum) console.warn(c.yellow(`warning: ${f.name} changed since it was applied`));
    }
    if (!pending.length) return console.log(c.green('Up to date.'));
    for (const f of pending) {
      process.stdout.write(`applying ${f.name} … `);
      await q(`begin;\n${f.sql}\n;insert into _harness.migrations(name, checksum) values (${lit(f.name)}, ${lit(f.checksum)});\ncommit;`);
      console.log(c.green('ok'));
    }
    await q(`notify pgrst, 'reload schema';`);
  },
  async seed(name) {
    const files = readdirSync(join(ROOT, 'seeds')).filter((f) => f.endsWith('.sql')).sort();
    const pick = name ? files.filter((f) => f.includes(name)) : files;
    if (!pick.length) die('No seed files matched.');
    for (const f of pick) {
      process.stdout.write(`seeding ${f} … `);
      await q(readFileSync(join(ROOT, 'seeds', f), 'utf8'));
      console.log(c.green('ok'));
    }
  },
  // Each test file runs inside a transaction that is always rolled back,
  // so tests can insert freely. A test fails by raising an exception.
  async test(filter) {
    const files = readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.sql')).sort()
      .filter((f) => !filter || f.includes(filter));
    let failed = 0;
    for (const f of files) {
      const sql = readFileSync(join(ROOT, 'tests', f), 'utf8');
      try {
        await q(`begin;\n${sql}\n;rollback;`);
        console.log(`${c.green('✓')} ${f}`);
      } catch (e) {
        failed++;
        console.log(`${c.red('✗')} ${f}\n  ${c.red(e.message)}`);
      }
    }
    console.log(failed ? c.red(`\n${failed} failed`) : c.green(`\n${files.length} passed`));
    if (failed) process.exit(1);
  },
  async tables() {
    printRows(await q(`
      select c.relname as table, c.reltuples::bigint as approx_rows,
             pg_size_pretty(pg_total_relation_size(c.oid)) as size,
             c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = ${lit(APP_SCHEMA)} and c.relkind = 'r' order by 1;`));
  },
  async describe(table) {
    if (!table) die('Usage: db describe <table>');
    printRows(await q(`
      select column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = ${lit(APP_SCHEMA)} and table_name = ${lit(table)} order by ordinal_position;`));
  },
  async reset(flag) {
    if (flag !== '--yes') die(`This drops schema "${APP_SCHEMA}" and all its data. Re-run with --yes.`);
    await q(`drop schema if exists ${APP_SCHEMA} cascade; delete from _harness.migrations;`);
    console.log(c.yellow(`Dropped schema ${APP_SCHEMA}.`));
  },
  // Adds the app schema to the PostgREST exposed schemas so supabase-js can reach it.
  async expose() {
    const cfg = await api('GET', `/projects/${REF}/postgrest`);
    const schemas = new Set(cfg.db_schema.split(',').map((s) => s.trim()));
    if (schemas.has(APP_SCHEMA)) return console.log(`${APP_SCHEMA} already exposed (${cfg.db_schema})`);
    schemas.add(APP_SCHEMA);
    const next = [...schemas].join(', ');
    await api('PATCH', `/projects/${REF}/postgrest`, { db_schema: next });
    console.log(c.green(`Exposed schemas: ${next}`));
  },
  async keys() {
    const keys = await api('GET', `/projects/${REF}/api-keys?reveal=true`);
    const pub = keys.find((k) => k.type === 'publishable') ?? keys.find((k) => k.name === 'anon');
    console.log(`NEXT_PUBLIC_SUPABASE_URL=https://${REF}.supabase.co`);
    console.log(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${pub.api_key}`);
  },
  // Locks sign-up and pre-creates an auth user for every member, so only the
  // people listed in accounts.members can sign in (with an emailed code).
  async 'auth-setup'() {
    const secret = await secretKey();
    const members = await q(`select full_name, email from accounts.members where active`);
    for (const m of members) {
      const res = await fetch(`https://${REF}.supabase.co/auth/v1/admin/users`, {
        method: 'POST',
        headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: m.email, email_confirm: true, user_metadata: { full_name: m.full_name } }),
      });
      const body = await res.json();
      const already = !res.ok && /already/i.test(body.msg ?? body.message ?? '');
      if (!res.ok && !already) throw new Error(body.msg ?? body.message ?? JSON.stringify(body));
      console.log(`${already ? c.dim('exists ') : c.green('created')} ${m.email}`);
    }
    await q(`update accounts.members m set user_id = u.id from auth.users u where lower(u.email) = lower(m.email) and m.user_id is null`);
    await api('PATCH', `/projects/${REF}/config/auth`, {
      disable_signup: true,
      external_email_enabled: true,
      mailer_otp_exp: 600,
      uri_allow_list: 'http://localhost:3000/**,http://127.0.0.1:3000/**',
    });
    console.log(c.green('Sign-ups disabled; members can sign in with an email code.'));
  },
  // Issue a 6-digit one-time code for a member (creates their sign-in if
  // needed, clears any lockout). Prints it once; they choose a 4-digit PIN after.
  async invite(email) {
    if (!email) die('Usage: db invite <member email>');
    const [m] = await q(`select id, full_name, email, user_id, active from accounts.members where lower(email) = lower(${lit(email)})`);
    if (!m) die(`No member with email ${email}. Add them in Settings → Members first.`);
    if (!m.active) die(`${m.full_name} is inactive.`);
    const webEnv = join(ROOT, '..', 'web', '.env.local');
    const pepper = existsSync(webEnv) ? readFileSync(webEnv, 'utf8').match(/^AUTH_PIN_PEPPER=(.+)$/m)?.[1]?.trim() : null;
    if (!pepper) die('AUTH_PIN_PEPPER missing from web/.env.local — it must match the deployed app.');
    const { randomInt, createHmac } = await import('node:crypto');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    // Same derivation as web/src/lib/passwords.ts derivePassword()
    const password = 'pin1.' + createHmac('sha256', pepper).update(`${m.email.trim().toLowerCase()}:${code}`).digest('base64url');
    const secret = await secretKey();
    const authApi = (path, method, body) => fetch(`https://${REF}.supabase.co/auth/v1/admin/${path}`, {
      method, headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.msg ?? j.message ?? JSON.stringify(j)); return j; });
    let userId = m.user_id;
    if (!userId) {
      const [u] = await q(`select id from auth.users where lower(email) = lower(${lit(m.email)})`);
      userId = u?.id ?? null;
    }
    if (userId) await authApi(`users/${userId}`, 'PUT', { password, email_confirm: true, ban_duration: 'none' });
    else userId = (await authApi('users', 'POST', { email: m.email, password, email_confirm: true, user_metadata: { full_name: m.full_name } })).id;
    await q(`update accounts.members set user_id = ${lit(userId)}, must_change_password = true, failed_pin_attempts = 0, locked_until = null,
      temp_password_expires_at = now() + interval '72 hours' where id = ${lit(m.id)}`);
    console.log(`\n  ${c.bold(m.full_name)} <${m.email}>\n  One-time code: ${c.green(c.bold(code.slice(0, 3) + ' ' + code.slice(3)))}\n  ${c.dim('Sign in → enter email → "I have a one-time code" → then choose a 4-digit PIN. Works once, for 72 hours.')}\n`);
  },
  // Writes web/.env.local with the URL, publishable key and secret key.
  async 'web-env'() {
    const keys = await api('GET', `/projects/${REF}/api-keys?reveal=true`);
    const pub = keys.find((k) => k.type === 'publishable');
    const sec = keys.find((k) => k.type === 'secret');
    const out = join(ROOT, '..', 'web', '.env.local');
    const lines = [
      `NEXT_PUBLIC_SUPABASE_URL=https://${REF}.supabase.co`,
      `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${pub.api_key}`,
      `SUPABASE_SECRET_KEY=${sec.api_key}`,
      `# Local development only: skip sign-in and act as this member. Ignored in production builds.`,
      `DEV_AUTH_BYPASS_EMAIL=deeparshsingh10@gmail.com`,
    ];
    writeFileSync(out, lines.join('\n') + '\n', { mode: 0o600 });
    console.log(c.green(`Wrote ${out}`));
  },
  async sample(flag) {
    const { generate } = await import('../seeds/sample/generate.mjs');
    const { sql: parts, files } = await generate({ q });
    const sql = `begin;\n${parts.filter(Boolean).join('\n')}\ncommit;`;
    process.stdout.write(`loading sample data (${(sql.length / 1024).toFixed(0)} KB SQL) … `);
    await q(sql);
    console.log(c.green('ok'));
    // Feature-specific sample data that builds on the generated set.
    for (const f of readdirSync(join(ROOT, 'seeds', 'sample')).filter((f) => f.endsWith('.sql')).sort()) {
      process.stdout.write(`  + ${f} … `);
      await q(readFileSync(join(ROOT, 'seeds', 'sample', f), 'utf8'));
      console.log(c.green('ok'));
    }
    if (files.length && flag !== '--no-files') {
      const secret = await secretKey();
      let n = 0;
      for (const f of files) {
        const res = await fetch(`https://${REF}.supabase.co/storage/v1/object/accounts/${f.path}`, {
          method: 'POST',
          headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': f.type, 'x-upsert': 'true' },
          body: f.body,
        });
        if (!res.ok) throw new Error(`upload ${f.path}: ${await res.text()}`);
        if (++n % 10 === 0) process.stdout.write(c.dim(`${n}/${files.length} files\r`));
      }
      console.log(c.green(`uploaded ${files.length} files`));
    }
  },
  // Wipes every transactional record and stored file, keeping settings,
  // members, accounts, categories and tax rates. Used once before going live.
  async 'fresh-start'(flag) {
    if (flag !== '--yes') die('This deletes ALL invoices, expenses, payments, clients, imports and files. Re-run with --yes.');
    await q(`truncate accounts.payment_allocations, accounts.payments, accounts.invoice_revisions, accounts.invoice_lines,
      accounts.invoices, accounts.recurring_invoices, accounts.bank_transactions, accounts.import_batches, accounts.expenses,
      accounts.recurring_expenses, accounts.member_transfers, accounts.mileage_trips, accounts.attachments, accounts.documents,
      accounts.tax_filings, accounts.rules, accounts.other_income, accounts.items, accounts.projects, accounts.clients, accounts.activity_log, accounts.fx_rates cascade;
      update accounts.business_profile set next_invoice_seq = 1001, next_estimate_seq = 1001;`);
    const secret = await secretKey();
    const list = async (prefix) => (await (await fetch(`https://${REF}.supabase.co/storage/v1/object/list/accounts`, {
      method: 'POST', headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000 }) })).json());
    const paths = [];
    const walk = async (prefix) => { for (const o of await list(prefix)) { const p = prefix ? `${prefix}/${o.name}` : o.name; if (o.id) paths.push(p); else await walk(p); } };
    await walk('');
    const keep = paths.filter((p) => !p.startsWith('branding/'));
    if (keep.length) await fetch(`https://${REF}.supabase.co/storage/v1/object/accounts`, {
      method: 'DELETE', headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: keep }) });
    console.log(c.yellow(`Cleared all records and ${keep.length} files. Settings and members kept.`));
  },
  // Regenerates web/src/lib/database.types.ts from the live schema.
  async types() {
    const res = await api('GET', `/projects/${REF}/types/typescript?included_schemas=${APP_SCHEMA}`);
    const out = join(ROOT, '..', 'web', 'src', 'lib', 'database.types.ts');
    writeFileSync(out, res.types);
    console.log(c.green(`Wrote ${out}`));
  },
  async help() {
    console.log(`${c.bold('Tech Nerv DB harness')}  ${c.dim(`project ${REF} · schema ${APP_SCHEMA}`)}

  sql "<query>"        run any SQL (DDL or DML) and print the result
  file <path.sql>      run a SQL file
  status               show applied / pending migrations
  migrate              apply pending migrations (each in a transaction)
  seed [name]          run seeds/*.sql (optionally filtered)
  test [name]          run tests/*.sql inside rolled-back transactions
  tables               list app tables with row counts and RLS status
  describe <table>     show a table's columns
  expose               expose the app schema to the REST API
  keys                 print URL + publishable key for the web app .env
  web-env              write web/.env.local
  types                regenerate web/src/lib/database.types.ts
  auth-setup           create auth users for members, disable sign-ups
  invite <email>       issue a 6-digit one-time sign-in code for a member (prints it once)
  sample               load the synthetic demo dataset (+ receipt files)
  fresh-start --yes    delete all records & files, keep settings (go-live)
  reset --yes          drop the app schema (destructive)`);
  },
};

async function secretKey() {
  const keys = await api('GET', `/projects/${REF}/api-keys?reveal=true`);
  return (keys.find((k) => k.type === 'secret') ?? keys.find((k) => k.name === 'service_role')).api_key;
}

async function appliedMigrations() {
  await q(`create schema if not exists _harness;
    create table if not exists _harness.migrations(
      name text primary key, checksum text not null, applied_at timestamptz not null default now());`);
  const rows = await q(`select name, checksum, applied_at from _harness.migrations`);
  return new Map(rows.map((r) => [r.name, r]));
}

function migrationFiles() {
  const dir = join(ROOT, 'migrations');
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => {
    const sql = readFileSync(join(dir, f), 'utf8');
    return { name: basename(f), sql, checksum: createHash('sha256').update(sql).digest('hex').slice(0, 16) };
  });
}

async function q(query) {
  return api('POST', `/projects/${REF}/database/query`, { query });
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(typeof data === 'object' ? data.message ?? JSON.stringify(data) : data);
  return data;
}

function printRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return console.log(c.dim('(no rows)'));
  console.table(rows);
}

function lit(s) { return `'${String(s).replace(/'/g, "''")}'`; }

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function die(msg) { console.error(c.red(msg)); process.exit(1); }

const [cmd = 'help', ...args] = process.argv.slice(2);
if (!commands[cmd]) die(`Unknown command "${cmd}". Run: node bin/db.mjs help`);
commands[cmd](...args).catch((e) => die(e.message));
