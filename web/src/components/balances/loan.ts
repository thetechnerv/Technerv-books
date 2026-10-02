import { format, parseISO } from 'date-fns';

/**
 * s.15(2) repay-by date: one year after the end of the fiscal year in which the
 * shareholder loan arose. Mirrors SQL `accounts.shareholder_loan_repay_by`.
 */
export function repayByDate(spentOn: string, yearEnd = '09-30') {
  const [m, d] = yearEnd.split('-').map(Number);
  const on = parseISO(spentOn);
  let end = new Date(on.getFullYear(), m! - 1, d!);
  if (on > end) end = new Date(on.getFullYear() + 1, m! - 1, d!);
  return format(new Date(end.getFullYear() + 1, end.getMonth(), end.getDate()), 'yyyy-MM-dd');
}
