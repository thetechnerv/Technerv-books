'use server';
import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { db, must, type Db } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { num, round2 } from '@/lib/format';
import type { ActionResult, Insert, Row } from '@/lib/types';
import type { Json } from '@/lib/database.types';
import { dedupeKey, type CsvMapping } from '@/components/banking/csv';
import { bestRule, matchSuggestions } from '../_lib/data';
import { linkMatch, revalidateBanking } from '../_lib/review';

export type ImportRow = { posted_on: string; description: string; amount: number; balance: number | null; external_id?: string | null };
export type CheckResult = {
  status: ('new' | 'duplicate')[];
  overlaps: boolean[];
  newCount: number;
  duplicateCount: number;
  batches: { fileName: string; from: string | null; to: string | null }[];
};

const MAX_ROWS = 5000;
const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function cleanRows(rows: ImportRow[]): ImportRow[] | string {
  if (!Array.isArray(rows) || !rows.length) return 'There are no transactions in this file.';
  if (rows.length > MAX_ROWS) return `That’s more than ${MAX_ROWS.toLocaleString()} rows — split the file into smaller date ranges.`;
  const out: ImportRow[] = [];
  for (const r of rows) {
    if (!r || typeof r.posted_on !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.posted_on)) return 'A row has an unreadable date.';
    const amount = round2(Number(r.amount));
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 1e10) return 'A row has an unreadable amount.';
    const balance = r.balance === null || r.balance === undefined || !Number.isFinite(Number(r.balance)) ? null : round2(Number(r.balance));
    out.push({ posted_on: r.posted_on, description: String(r.description ?? '').trim().slice(0, 300) || '(no description)', amount, balance, external_id: r.external_id ? String(r.external_id).slice(0, 120) : null });
  }
  return out;
}

/**
 * Duplicate detection: a row is a duplicate when the account already has a row
 * with the same date, amount and normalised description. Identical rows inside
 * one file are only duplicates as many times as they already exist.
 */
async function dedupe(supabase: Db, accountId: string, rows: ImportRow[]) {
  const dates = rows.map((r) => r.posted_on).sort();
  const from = dates[0]!, to = dates[dates.length - 1]!;
  const [existing, batches] = await Promise.all([
    supabase.from('bank_transactions').select('posted_on, amount, description').eq('account_id', accountId).gte('posted_on', from).lte('posted_on', to).limit(20000),
    supabase.from('import_batches').select('file_name, date_from, date_to').eq('account_id', accountId).lte('date_from', to).gte('date_to', from).order('date_from'),
  ]);
  const have = new Map<string, number>();
  for (const e of must(existing)) {
    const k = dedupeKey(accountId, e.posted_on, num(e.amount), e.description);
    have.set(k, (have.get(k) ?? 0) + 1);
  }
  const B = must(batches);
  const seen = new Map<string, number>();
  const status: ('new' | 'duplicate')[] = [];
  const hashes: (string | null)[] = [];
  for (const r of rows) {
    const k = dedupeKey(accountId, r.posted_on, r.amount, r.description);
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    const existingCount = have.get(k) ?? 0;
    if (n < existingCount) { status.push('duplicate'); hashes.push(null); continue; }
    status.push('new');
    // First copy uses the plain hash; further identical rows (two $5 coffees) get a suffix.
    hashes.push(n === 0 ? sha(k) : `${sha(k)}:${n}`);
  }
  const overlaps = rows.map((r) => B.some((b) => b.date_from && b.date_to && r.posted_on >= b.date_from && r.posted_on <= b.date_to));
  return { status, hashes, overlaps, batches: B.map((b) => ({ fileName: b.file_name, from: b.date_from, to: b.date_to })) };
}

export async function checkImport(accountId: string, rows: ImportRow[]): Promise<ActionResult<CheckResult>> {
  await currentMember();
  try {
    if (!isId(accountId)) return { ok: false, error: 'Choose an account.' };
    const clean = cleanRows(rows);
    if (typeof clean === 'string') return { ok: false, error: clean };
    const supabase = await db();
    const d = await dedupe(supabase, accountId, clean);
    const newCount = d.status.filter((s) => s === 'new').length;
    return { ok: true, data: { status: d.status, overlaps: d.overlaps, newCount, duplicateCount: clean.length - newCount, batches: d.batches } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t check the file.' }; }
}

export type CommitResult = { batchId: string; imported: number; duplicates: number; matched: number; withRule: number; toReview: number };

/**
 * Import: new rows go in as "to review" with rule suggestions; a row with exactly
 * one exact candidate record (same amount to the cent, within 3 days, not wanted
 * by another row) is matched automatically.
 */
export async function commitImport(input: {
  accountId: string; fileName: string; format: 'csv' | 'ofx'; rows: ImportRow[]; mapping?: CsvMapping | null; saveMapping?: boolean;
}): Promise<ActionResult<CommitResult>> {
  const me = await currentMember();
  try {
    if (!isId(input.accountId)) return { ok: false, error: 'Choose an account.' };
    const clean = cleanRows(input.rows);
    if (typeof clean === 'string') return { ok: false, error: clean };
    const supabase = await db();
    const account = must(await supabase.from('money_accounts').select('id, kind, opening_balance').eq('id', input.accountId).maybeSingle());
    if (!account || !['bank', 'credit_card'].includes(account.kind)) return { ok: false, error: 'That account can’t take imports.' };

    // Statements are often newest-first; process oldest-first so running balances and order make sense.
    const rows = clean[0]!.posted_on > clean[clean.length - 1]!.posted_on ? [...clean].reverse() : clean;
    const d = await dedupe(supabase, input.accountId, rows);
    const fresh = rows.map((r, i) => ({ r, hash: d.hashes[i] })).filter((x) => x.hash) as { r: ImportRow; hash: string }[];
    const dates = rows.map((r) => r.posted_on).sort();

    // The original file is uploaded right after (POST /api/banking/imports/<id>); its path is fixed up front
    // so the batch row is written once (each write shows up in the activity feed).
    const batchId = randomUUID();
    const batch = must(await supabase.from('import_batches').insert({
      id: batchId, file_path: `bank/imports/${batchId}.csv.gz`, account_id: input.accountId, file_name: (input.fileName || 'statement.csv').slice(0, 160), rows_total: rows.length,
      rows_imported: fresh.length, rows_duplicate: rows.length - fresh.length, date_from: dates[0], date_to: dates[dates.length - 1],
      imported_by: me.id, file_format: input.format === 'ofx' ? 'ofx' : 'csv',
    }).select('id').single());

    let matched = 0, withRule = 0;
    if (fresh.length) {
      // Balance after each row: the bank's figure when the file has one, otherwise
      // everything already imported up to that day plus this file's rows so far.
      const opening = num(account.opening_balance);
      const first = fresh[0]!.r.posted_on;
      const [before, after] = await Promise.all([
        supabase.from('bank_transactions').select('amount').eq('account_id', input.accountId).lt('posted_on', first).limit(50000),
        supabase.from('bank_transactions').select('amount, posted_on').eq('account_id', input.accountId).gte('posted_on', first).limit(50000),
      ]);
      const base = must(before).reduce((s, t) => s + num(t.amount), 0);
      const later = must(after).map((t) => ({ on: t.posted_on, amount: num(t.amount) }));
      const rules = must(await supabase.from('rules').select('id, match_text, priority, created_at'));
      const t0 = Date.now();
      let fileSum = 0;
      const inserts: Insert<'bank_transactions'>[] = fresh.map(({ r, hash }, i) => {
        fileSum += r.amount;
        const balance = r.balance !== null
          ? round2(r.balance - opening)
          : round2(base + later.filter((t) => t.on <= r.posted_on).reduce((s, t) => s + t.amount, 0) + fileSum);
        const rule = bestRule(rules, r.description);
        if (rule) withRule++;
        return {
          account_id: input.accountId, posted_on: r.posted_on, description: r.description, amount: r.amount, balance_after: balance,
          source: 'csv', external_id: r.external_id ?? null, dedupe_hash: hash, status: 'unreviewed', import_batch: batch.id,
          rule_id: rule?.id ?? null, created_at: new Date(t0 + i).toISOString(),
        };
      });
      const inserted: Row<'bank_transactions'>[] = [];
      try {
        for (let i = 0; i < inserts.length; i += 500) {
          inserted.push(...must(await supabase.from('bank_transactions').insert(inserts.slice(i, i + 500)).select('*')));
        }
      } catch (e) {
        await supabase.from('import_batches').delete().eq('id', batch.id);
        throw e;
      }

      // Confident auto-matches only.
      const sugg = await matchSuggestions(inserted, supabase);
      const wanted = new Map<string, number>();
      for (const t of inserted) for (const m of sugg[t.id] ?? []) wanted.set(m.id, (wanted.get(m.id) ?? 0) + 1);
      for (const t of inserted) {
        const list = sugg[t.id] ?? [];
        const exact = list.filter((m) => m.exact);
        if (exact.length !== 1 || list.length !== 1 || wanted.get(exact[0]!.id) !== 1) continue;
        if (await linkMatch(supabase, t, exact[0]!.kind, exact[0]!.id, me.id, { auto: true })) matched++;
      }
    }

    if (input.saveMapping && input.mapping && input.format === 'csv') {
      await supabase.from('money_accounts').update({ csv_mapping: input.mapping as unknown as Json }).eq('id', input.accountId);
    }
    revalidateBanking(input.accountId);
    revalidatePath('/banking/import');
    return {
      ok: true,
      data: { batchId: batch.id, imported: fresh.length, duplicates: rows.length - fresh.length, matched, withRule, toReview: fresh.length - matched },
      message: `Imported ${fresh.length}`,
    };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Import failed.' }; }
}
