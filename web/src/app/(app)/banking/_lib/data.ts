import 'server-only';
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { db, must, type Db } from '@/lib/db';
import { num, round2 } from '@/lib/format';
import type { Row } from '@/lib/types';
import { cleanVendor } from '@/components/banking/csv';
import type { MatchSuggestion, ReviewItem, ReviewLookups, RuleSuggestion } from '@/components/banking/types';

export type BankAccount = Row<'money_accounts'>;

/** Accounts that have a bank feed: bank accounts and cards (not personal wallets). */
export async function feedAccounts(supabase?: Db) {
  const s = supabase ?? (await db());
  return must(await s.from('money_accounts').select('*').in('kind', ['bank', 'credit_card']).eq('archived', false).order('kind').order('name'));
}

type BalRow = { posted_on: string; amount: number; balance_after: number | null; created_at: string };

/**
 * The closing balance of the latest day in the feed. Rows on the same day can
 * share a timestamp, so pick the one no other row "continues" from
 * (its balance isn't another same-day row's opening balance).
 */
export function closingBalance(rows: BalRow[]) {
  if (!rows.length) return null;
  const lastDay = rows.reduce((m, r) => (r.posted_on > m ? r.posted_on : m), rows[0]!.posted_on);
  const day = rows.filter((r) => r.posted_on === lastDay && r.balance_after !== null);
  if (!day.length) return null;
  const opens = new Set(day.map((r) => round2(num(r.balance_after) - num(r.amount)).toFixed(2)));
  const newestFirst = [...day].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const last = newestFirst.find((r) => !opens.has(round2(num(r.balance_after)).toFixed(2))) ?? newestFirst[0]!;
  return num(last.balance_after);
}

export async function accountSummaries() {
  const supabase = await db();
  const accounts = await feedAccounts(supabase);
  return Promise.all(accounts.map(async (a) => {
    const [latest, review, batch, total] = await Promise.all([
      supabase.from('bank_transactions').select('posted_on, amount, balance_after, created_at').eq('account_id', a.id)
        .order('posted_on', { ascending: false }).limit(40),
      supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('account_id', a.id).eq('status', 'unreviewed'),
      supabase.from('import_batches').select('created_at, date_to').eq('account_id', a.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).eq('account_id', a.id),
    ]);
    const rows = must(latest) as BalRow[];
    const bal = closingBalance(rows);
    const balance = round2(num(a.opening_balance) + (bal ?? 0));
    return {
      account: a,
      balance,
      asOf: rows[0]?.posted_on ?? null,
      toReview: review.count ?? 0,
      count: total.count ?? 0,
      lastImport: must(batch)?.created_at ?? null,
      lastImportTo: must(batch)?.date_to ?? null,
    };
  }));
}

// ───────────── Suggestions ─────────────
type Txn = Pick<Row<'bank_transactions'>, 'id' | 'account_id' | 'posted_on' | 'amount' | 'description' | 'rule_id'>;

const words = (s: string) => new Set(s.toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)));
const STOP = new Set(['INTERAC', 'TRANSFER', 'DEPOSIT', 'CREDIT', 'DEBIT', 'PAYMENT', 'SENT', 'INCOMING', 'WIRE', 'MOBILE', 'CHEQUE', 'BILL', 'STORE', 'INC', 'LTD', 'KAMLOOPS']);
function overlap(a: string, b: string) {
  const wa = words(a); let n = 0;
  for (const w of words(b)) if (wa.has(w)) n++;
  return n;
}

const DAYS = 5;
const TOL = 0.02;

/**
 * Existing records each transaction could be: unmatched expenses (money out,
 * same paid-from account, total within 2¢, ±5 days), client payments and other
 * income (money in), and owner transfers in either direction.
 */
export async function matchSuggestions(txns: Txn[], supabase?: Db): Promise<Record<string, MatchSuggestion[]>> {
  const s = supabase ?? (await db());
  const out: Record<string, MatchSuggestion[]> = Object.fromEntries(txns.map((t) => [t.id, []]));
  if (!txns.length) return out;
  const dates = txns.map((t) => t.posted_on).sort();
  const from = format(addDays(parseISO(dates[0]!), -DAYS), 'yyyy-MM-dd');
  const to = format(addDays(parseISO(dates[dates.length - 1]!), DAYS), 'yyyy-MM-dd');
  const accountIds = [...new Set(txns.map((t) => t.account_id))];
  const accounts = must(await s.from('money_accounts').select('id, currency').in('id', accountIds));
  const currencyOf = Object.fromEntries(accounts.map((a) => [a.id, a.currency]));

  const [exps, pays, transfers, income] = await Promise.all([
    s.from('expense_overview').select('id, spent_on, vendor, description, total, total_cad, currency, paid_from_account_id, category_name, spent_by_name')
      .is('bank_transaction_id', null).in('paid_from_account_id', accountIds).gte('spent_on', from).lte('spent_on', to),
    s.from('payments').select('id, received_on, amount, currency, method, reference, deposit_account_id, clients(display_name, company_name)')
      .gte('received_on', from).lte('received_on', to),
    s.from('member_transfers').select('id, occurred_on, kind, amount, account_id, notes, members(full_name)')
      .gte('occurred_on', from).lte('occurred_on', to),
    s.from('other_income').select('id, received_on, source, description, amount, currency, account_id')
      .is('bank_transaction_id', null).gte('received_on', from).lte('received_on', to),
  ]);
  const E = must(exps), P = must(pays), T = must(transfers), I = must(income);

  // Drop anything another bank row already points at.
  const taken = async (col: 'matched_expense_id' | 'matched_payment_id' | 'matched_transfer_id' | 'matched_income_id', ids: string[]) => {
    if (!ids.length) return new Set<string>();
    const rows = must(await s.from('bank_transactions').select(col).in(col, ids));
    return new Set(rows.map((r) => (r as Record<string, string>)[col]!));
  };
  const [tE, tP, tT, tI] = await Promise.all([
    taken('matched_expense_id', E.map((e) => e.id!)), taken('matched_payment_id', P.map((p) => p.id)),
    taken('matched_transfer_id', T.map((t) => t.id)), taken('matched_income_id', I.map((i) => i.id)),
  ]);

  const score = (days: number, diff: number, words: number) => Math.max(0, 100 - days * 9 - diff * 200 + words * 12);
  for (const t of txns) {
    const cur = currencyOf[t.account_id] ?? 'CAD';
    const amt = Math.abs(num(t.amount));
    const list: MatchSuggestion[] = [];
    const near = (d: string) => Math.abs(differenceInCalendarDays(parseISO(d), parseISO(t.posted_on)));
    if (num(t.amount) < 0) {
      for (const e of E) {
        if (tE.has(e.id!) || e.paid_from_account_id !== t.account_id) continue;
        const v = cur === 'CAD' ? num(e.total_cad) : e.currency === cur ? num(e.total) : null;
        if (v === null) continue;
        const diff = Math.abs(v - amt), days = near(e.spent_on!);
        if (diff > TOL + 1e-9 || days > DAYS) continue;
        list.push({ kind: 'expense', id: e.id!, title: e.vendor!, subtitle: [e.category_name, e.spent_by_name?.split(' ')[0]].filter(Boolean).join(' · '),
          date: e.spent_on!, amount: v, currency: cur, href: `/expenses/${e.id}`, score: score(days, diff, overlap(t.description, `${e.vendor} ${e.description ?? ''}`)), exact: diff < 0.005 && days <= 3 });
      }
    } else {
      for (const p of P) {
        if (tP.has(p.id) || (p.deposit_account_id && p.deposit_account_id !== t.account_id) || p.currency !== cur) continue;
        const diff = Math.abs(num(p.amount) - amt), days = near(p.received_on);
        if (diff > TOL + 1e-9 || days > DAYS) continue;
        const client = p.clients as { display_name: string; company_name: string | null } | null;
        list.push({ kind: 'payment', id: p.id, title: `Payment from ${client?.display_name ?? 'client'}`, subtitle: [METHOD[p.method] ?? p.method, p.reference].filter(Boolean).join(' · '),
          date: p.received_on, amount: num(p.amount), currency: cur, href: `/payments?id=${p.id}`, score: score(days, diff, overlap(t.description, `${client?.display_name ?? ''} ${client?.company_name ?? ''}`)), exact: diff < 0.005 && days <= 3 });
      }
      for (const i of I) {
        if (tI.has(i.id) || (i.account_id && i.account_id !== t.account_id) || i.currency !== cur) continue;
        const diff = Math.abs(num(i.amount) - amt), days = near(i.received_on);
        if (diff > TOL + 1e-9 || days > DAYS) continue;
        list.push({ kind: 'income', id: i.id, title: i.source, subtitle: i.description ?? 'Other income', date: i.received_on, amount: num(i.amount), currency: cur,
          href: null, score: score(days, diff, overlap(t.description, `${i.source} ${i.description ?? ''}`)) + (/INTEREST/i.test(t.description) && /interest/i.test(i.description ?? '') ? 10 : 0), exact: diff < 0.005 && days <= 3 });
      }
    }
    for (const tr of T) {
      if (tT.has(tr.id) || (tr.account_id && tr.account_id !== t.account_id) || cur !== 'CAD') continue;
      const out = ['reimbursement', 'dividend', 'salary'].includes(tr.kind);
      if (tr.kind !== 'other' && out !== num(t.amount) < 0) continue;
      const diff = Math.abs(num(tr.amount) - amt), days = near(tr.occurred_on);
      if (diff > TOL + 1e-9 || days > DAYS) continue;
      const who = (tr.members as { full_name: string } | null)?.full_name ?? 'owner';
      list.push({ kind: 'transfer', id: tr.id, title: `${TRANSFER[tr.kind] ?? 'Transfer'} · ${who}`, subtitle: tr.notes ?? 'Owner transfer', date: tr.occurred_on, amount: num(tr.amount), currency: cur,
        href: '/balances', score: score(days, diff, overlap(t.description, who)), exact: diff < 0.005 && days <= 3 });
    }
    out[t.id] = list.sort((a, b) => b.score - a.score).slice(0, 5);
  }
  return out;
}

const METHOD: Record<string, string> = { etransfer: 'e-Transfer', eft: 'EFT', wire: 'Wire', cheque: 'Cheque', card: 'Card', cash: 'Cash', stripe: 'Stripe', other: 'Other' };
const TRANSFER: Record<string, string> = { reimbursement: 'Reimbursement', repayment: 'Repayment', contribution: 'Contribution', dividend: 'Dividend', salary: 'Salary', other: 'Transfer' };

/** Rule pre-fill for each transaction: its stored rule, else the best current match. */
export async function ruleSuggestions(txns: Txn[], supabase?: Db): Promise<Record<string, RuleSuggestion | null>> {
  const s = supabase ?? (await db());
  const rules = must(await s.from('rules').select('*, categories(name)').order('priority', { ascending: false }));
  const out: Record<string, RuleSuggestion | null> = {};
  for (const t of txns) {
    const r = (t.rule_id && rules.find((x) => x.id === t.rule_id)) || bestRule(rules, t.description);
    out[t.id] = r ? {
      ruleId: r.id, matchText: r.match_text, vendor: r.vendor_rename || cleanVendor(t.description), categoryId: r.category_id,
      categoryName: (r.categories as { name: string } | null)?.name ?? null, nature: r.nature, projectId: r.project_id,
    } : null;
  }
  return out;
}

export function bestRule<T extends { match_text: string; priority: number; created_at: string }>(rules: T[], description: string): T | null {
  const d = description.toUpperCase();
  return rules.filter((r) => d.includes(r.match_text.toUpperCase()))
    .sort((a, b) => b.priority - a.priority || b.match_text.length - a.match_text.length || a.created_at.localeCompare(b.created_at))[0] ?? null;
}

/** Who most often spends on this account (and vendor, when known). */
export async function likelySpender(accountId: string, vendor: string | null, supabase?: Db) {
  const s = supabase ?? (await db());
  const tally = (rows: { spent_by: string }[]) => {
    const c = new Map<string, number>();
    for (const r of rows) c.set(r.spent_by, (c.get(r.spent_by) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  if (vendor) {
    const byVendor = must(await s.from('expenses').select('spent_by').eq('paid_from_account_id', accountId).ilike('vendor', vendor).limit(200));
    const v = tally(byVendor);
    if (v) return v;
  }
  const byAccount = must(await s.from('expenses').select('spent_by').eq('paid_from_account_id', accountId).order('spent_on', { ascending: false }).limit(200));
  const a = tally(byAccount);
  if (a) return a;
  const acct = must(await s.from('money_accounts').select('owner_member_id').eq('id', accountId).single());
  return acct.owner_member_id;
}

/** Bank of Canada rate for a currency on (or before) a date. */
export async function rateOn(currency: string, on: string, supabase?: Db) {
  if (currency === 'CAD') return 1;
  const s = supabase ?? (await db());
  const r = must(await s.from('fx_rates').select('rate_to_cad').eq('currency', currency).lte('rate_date', on).order('rate_date', { ascending: false }).limit(1).maybeSingle());
  if (r) return num(r.rate_to_cad);
  const any = must(await s.from('fx_rates').select('rate_to_cad').eq('currency', currency).order('rate_date').limit(1).maybeSingle());
  return num(any?.rate_to_cad) || 1.4;
}

// ───────────── Review queue ─────────────
export async function reviewItems(txns: Row<'bank_transactions'>[], supabase?: Db): Promise<ReviewItem[]> {
  const s = supabase ?? (await db());
  if (!txns.length) return [];
  const accountIds = [...new Set(txns.map((t) => t.account_id))];
  const [accts, matches, rules, history, clients] = await Promise.all([
    s.from('money_accounts').select('id, name, kind, currency, owner_member_id').in('id', accountIds),
    matchSuggestions(txns, s),
    ruleSuggestions(txns, s),
    s.from('expenses').select('spent_by, vendor, paid_from_account_id').in('paid_from_account_id', accountIds).order('spent_on', { ascending: false }).limit(1000),
    s.from('clients').select('id, display_name, company_name, currency'),
  ]);
  const A = Object.fromEntries(must(accts).map((a) => [a.id, a]));
  const H = must(history);
  const C = must(clients);
  const mode = (xs: string[]) => {
    const c = new Map<string, number>();
    for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  // Opposite rows in our other accounts (same amount, other sign, ±5 days) look like transfers.
  const others = must(await s.from('bank_transactions').select('id, account_id, amount, posted_on, money_accounts(name)')
    .eq('status', 'unreviewed').in('amount', [...new Set(txns.map((t) => -num(t.amount)))]));
  return txns.map((t) => {
    const a = A[t.account_id]!;
    const twin = others.find((o) => o.account_id !== t.account_id && num(o.amount) === -num(t.amount)
      && Math.abs(differenceInCalendarDays(parseISO(o.posted_on), parseISO(t.posted_on))) <= 5);
    const transferTo = twin ? { accountId: twin.account_id, accountName: (twin.money_accounts as { name: string } | null)?.name ?? 'other account' } : null;
    const rule = rules[t.id] ?? null;
    const vendor = rule?.vendor ?? cleanVendor(t.description);
    const spentBy = mode(H.filter((h) => h.paid_from_account_id === t.account_id && h.vendor.toLowerCase() === vendor.toLowerCase()).map((h) => h.spent_by))
      ?? mode(H.filter((h) => h.paid_from_account_id === t.account_id).map((h) => h.spent_by)) ?? a.owner_member_id;
    const clientGuess = num(t.amount) > 0
      ? C.filter((c) => c.currency === a.currency).map((c) => ({ id: c.id, n: overlap(t.description, `${c.display_name} ${c.company_name ?? ''}`) }))
        .filter((x) => x.n > 0).sort((x, y) => y.n - x.n)[0]?.id ?? null
      : null;
    return {
      id: t.id, accountId: t.account_id, accountName: a.name, accountKind: a.kind, currency: a.currency, postedOn: t.posted_on,
      description: t.description, amount: num(t.amount), matches: matches[t.id] ?? [], rule, vendor, spentBy, clientGuess, transferTo,
    };
  });
}

export async function reviewLookups(supabase?: Db): Promise<ReviewLookups> {
  const s = supabase ?? (await db());
  const [cats, members, clients, accounts, invoices, profile] = await Promise.all([
    s.from('categories').select('id, name, kind').eq('archived', false).order('sort'),
    s.from('members').select('id, full_name').eq('active', true).order('full_name'),
    s.from('clients').select('id, display_name, currency').order('display_name'),
    feedAccounts(s),
    s.from('invoices').select('id, client_id, number, balance, currency, due_date').eq('kind', 'invoice').in('status', ['sent', 'partial']).order('due_date'),
    s.from('business_profile').select('lock_books_before').single(),
  ]);
  const C = must(cats);
  return {
    expenseCategories: C.filter((c) => c.kind === 'expense').map((c) => ({ value: c.id, label: c.name })),
    incomeCategories: C.filter((c) => c.kind === 'income').map((c) => ({ value: c.id, label: c.name })),
    members: must(members).map((m) => ({ value: m.id, label: m.full_name })),
    clients: must(clients).map((c) => ({ value: c.id, label: c.display_name, currency: c.currency })),
    accounts: accounts.map((a) => ({ value: a.id, label: a.name })),
    openInvoices: must(invoices).filter((i) => num(i.balance) > 0).map((i) => ({ id: i.id, clientId: i.client_id, number: i.number ?? '', balance: num(i.balance), currency: i.currency, dueDate: i.due_date ?? '' })),
    lockBefore: must(profile).lock_books_before,
  };
}
