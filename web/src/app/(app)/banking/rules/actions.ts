'use server';
import { revalidatePath } from 'next/cache';
import { db, must } from '@/lib/db';
import { currentMember } from '@/lib/session';
import { num } from '@/lib/format';
import type { ActionResult, ExpenseNature } from '@/lib/types';
import { revalidateBanking } from '../_lib/review';

export type RuleInput = {
  matchText: string; vendorRename?: string | null; categoryId?: string | null; nature?: ExpenseNature | null; projectId?: string | null; priority?: number | null;
};

const isId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);
const NATURES: ExpenseNature[] = ['business', 'personal', 'mixed'];

function clean(input: RuleInput) {
  const matchText = (input.matchText ?? '').trim().replace(/\s+/g, ' ');
  if (matchText.length < 3) return 'Match text needs at least 3 characters, e.g. “LINKEDIN”.';
  if (input.categoryId && !isId(input.categoryId)) return 'Choose a category.';
  if (input.nature && !NATURES.includes(input.nature)) return 'Choose business, personal or mixed.';
  if (!input.categoryId && !input.nature && !input.vendorRename?.trim()) return 'A rule needs at least a vendor name, category or type.';
  return {
    match_text: matchText.slice(0, 80).toUpperCase(),
    vendor_rename: input.vendorRename?.trim().slice(0, 120) || null,
    category_id: input.categoryId || null,
    nature: input.nature || null,
    project_id: input.projectId && isId(input.projectId) ? input.projectId : null,
    priority: Math.max(-100, Math.min(100, Math.round(num(input.priority)))),
  };
}

function done() {
  revalidatePath('/banking/rules');
  revalidateBanking();
}

export async function createRule(input: RuleInput & { applyToUnreviewed?: boolean }): Promise<ActionResult<{ id: string; applied: number }>> {
  await currentMember();
  try {
    const row = clean(input);
    if (typeof row === 'string') return { ok: false, error: row };
    const supabase = await db();
    const dupe = must(await supabase.from('rules').select('id').ilike('match_text', row.match_text).limit(1));
    if (dupe.length) return { ok: false, error: `There’s already a rule for “${row.match_text}”. Edit that one instead.` };
    const rule = must(await supabase.from('rules').insert(row).select('id').single());
    let applied = 0;
    if (input.applyToUnreviewed !== false) applied = num(must(await supabase.rpc('apply_rules_to_unreviewed', {})));
    done();
    return { ok: true, data: { id: rule.id, applied }, message: 'Rule saved' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t save the rule.' }; }
}

export async function updateRule(id: string, input: RuleInput): Promise<ActionResult> {
  await currentMember();
  try {
    if (!isId(id)) return { ok: false, error: 'Rule not found.' };
    const row = clean(input);
    if (typeof row === 'string') return { ok: false, error: row };
    const supabase = await db();
    const dupe = must(await supabase.from('rules').select('id').ilike('match_text', row.match_text).neq('id', id).limit(1));
    if (dupe.length) return { ok: false, error: `There’s already a rule for “${row.match_text}”.` };
    const rows = must(await supabase.from('rules').update(row).eq('id', id).select('id'));
    if (!rows.length) return { ok: false, error: 'Rule not found.' };
    await supabase.rpc('apply_rules_to_unreviewed', {});
    done();
    return { ok: true, message: 'Rule updated' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t save the rule.' }; }
}

export async function deleteRule(id: string): Promise<ActionResult> {
  await currentMember();
  try {
    if (!isId(id)) return { ok: false, error: 'Rule not found.' };
    const supabase = await db();
    must(await supabase.from('rules').delete().eq('id', id).select('id'));
    await supabase.rpc('apply_rules_to_unreviewed', {});
    done();
    return { ok: true, message: 'Rule deleted' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t delete the rule.' }; }
}

/** How many imported transactions a match text would catch, with a few examples. */
export async function testRule(matchText: string): Promise<ActionResult<{ total: number; unreviewed: number; examples: { description: string; amount: number; posted_on: string; status: string }[] }>> {
  await currentMember();
  try {
    const text = (matchText ?? '').trim();
    if (text.length < 3) return { ok: false, error: 'Type at least 3 characters.' };
    const supabase = await db();
    const pattern = `%${text.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    const [all, open, ex] = await Promise.all([
      supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).ilike('description', pattern),
      supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).ilike('description', pattern).eq('status', 'unreviewed'),
      supabase.from('bank_transactions').select('description, amount, posted_on, status').ilike('description', pattern).order('posted_on', { ascending: false }).limit(5),
    ]);
    return { ok: true, data: { total: all.count ?? 0, unreviewed: open.count ?? 0, examples: must(ex).map((r) => ({ ...r, amount: num(r.amount) })) } };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t test the rule.' }; }
}

/** Re-run every rule over the review queue so suggestions are up to date. */
export async function applyRulesToUnreviewed(): Promise<ActionResult<{ applied: number }>> {
  await currentMember();
  try {
    const supabase = await db();
    const applied = num(must(await supabase.rpc('apply_rules_to_unreviewed', {})));
    done();
    return { ok: true, data: { applied }, message: applied ? `${applied} to review now have a suggestion` : 'No transactions to review match a rule' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t apply rules.' }; }
}
