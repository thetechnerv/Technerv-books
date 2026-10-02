import 'server-only';
import { db, must } from '@/lib/db';
import { num, round2, daysUntil } from '@/lib/format';

export type LedgerEntry = {
  member_id: string; occurred_on: string; entry_type: 'expense' | 'transfer' | 'mileage'; entity_id: string; kind: string;
  label: string; detail: string | null; total_cad: number; amount: number; settled: boolean; settled_on: string | null;
  repay_by: string | null; created_at: string; running: number;
};

export type OpenItem = { id: string; type: 'expense' | 'mileage'; kind: string; label: string; detail: string | null; date: string; amount: number; repay_by: string | null };

export type MemberSummary = {
  member: { id: string; full_name: string; initials: string | null; color: string | null };
  balance: number;
  breakdown: { outOfPocket: number; personal: number; mileage: number; contributions: number; reimbursements: number; repayments: number; otherTransfers: number };
  unsettled: { outOfPocket: number; personal: number; mileage: number; net: number; count: number };
  open: OpenItem[];
  loanItems: (OpenItem & { daysLeft: number; alert: boolean })[];
  ledger: LedgerEntry[];
};

/** Everything behind the Owner balances screen, per member, from `member_ledger` (sums to `member_balances`). */
export async function ownerBalances(alertDays: number) {
  const supabase = await db();
  const [members, balances, ledger] = await Promise.all([
    supabase.from('members').select('id, full_name, initials, color').eq('active', true).order('full_name'),
    supabase.from('member_balances').select('*'),
    supabase.from('member_ledger').select('*').order('occurred_on').order('created_at'),
  ]);
  const rows = must(ledger).map((r) => ({ ...r, amount: num(r.amount), total_cad: num(r.total_cad) })) as Omit<LedgerEntry, 'running'>[];
  const balanceBy = Object.fromEntries(must(balances).map((b) => [b.member_id!, num(b.balance)]));

  return must(members).map((m): MemberSummary => {
    const mine = rows.filter((r) => r.member_id === m.id);
    let running = 0;
    const withRunning = mine.map((r) => { running = round2(running + r.amount); return { ...r, running }; });
    const sum = (f: (r: (typeof mine)[number]) => boolean) => round2(mine.filter(f).reduce((s, r) => s + r.amount, 0));
    const isOpen = (r: (typeof mine)[number]) => r.entry_type !== 'transfer' && !r.settled;
    const open: OpenItem[] = mine.filter(isOpen).map((r) => ({
      id: r.entity_id, type: r.entry_type as 'expense' | 'mileage', kind: r.kind, label: r.label, detail: r.detail, date: r.occurred_on, amount: r.amount, repay_by: r.repay_by,
    })).reverse();
    const loanItems = open.filter((o) => o.amount < 0 && o.repay_by).map((o) => {
      const daysLeft = daysUntil(o.repay_by!);
      return { ...o, daysLeft, alert: daysLeft <= alertDays };
    }).sort((a, b) => a.daysLeft - b.daysLeft);
    const personal = (r: (typeof mine)[number]) => r.kind === 'personal_on_business' || r.kind === 'personal_portion';
    return {
      member: m,
      balance: balanceBy[m.id] ?? 0,
      breakdown: {
        outOfPocket: sum((r) => r.kind === 'out_of_pocket'),
        personal: sum(personal),
        mileage: sum((r) => r.kind === 'mileage'),
        contributions: sum((r) => r.kind === 'contribution'),
        reimbursements: sum((r) => r.kind === 'reimbursement'),
        repayments: sum((r) => r.kind === 'repayment'),
        otherTransfers: mine.filter((r) => ['dividend', 'salary', 'other'].includes(r.kind)).length,
      },
      unsettled: {
        outOfPocket: sum((r) => isOpen(r) && r.kind === 'out_of_pocket'),
        personal: sum((r) => isOpen(r) && personal(r)),
        mileage: sum((r) => isOpen(r) && r.kind === 'mileage'),
        net: sum(isOpen),
        count: open.length,
      },
      open,
      loanItems,
      ledger: withRunning.reverse(),
    };
  });
}
