import type { ExpenseNature } from '@/lib/types';

export type MatchKind = 'expense' | 'payment' | 'transfer' | 'income';

/** An existing record a bank row could be. */
export type MatchSuggestion = {
  kind: MatchKind;
  id: string;
  title: string;
  subtitle: string;
  date: string;
  amount: number;
  currency: string;
  href: string | null;
  score: number;
  /** Same amount to the cent and within 3 days. */
  exact: boolean;
};

/** What a rule would fill in for a new expense. */
export type RuleSuggestion = {
  ruleId: string;
  matchText: string;
  vendor: string;
  categoryId: string | null;
  categoryName: string | null;
  nature: ExpenseNature | null;
  projectId: string | null;
};

export type ReviewItem = {
  id: string;
  accountId: string;
  accountName: string;
  accountKind: string;
  currency: string;
  postedOn: string;
  description: string;
  amount: number;
  matches: MatchSuggestion[];
  rule: RuleSuggestion | null;
  /** Prefill for "Create expense" / "Record income". */
  vendor: string;
  spentBy: string | null;
  clientGuess: string | null;
  /** Looks like a move between our own accounts (opposite row in another account). */
  transferTo: { accountId: string; accountName: string } | null;
};

export type Option = { value: string; label: string; group?: string };

export type ReviewLookups = {
  expenseCategories: Option[];
  incomeCategories: Option[];
  members: Option[];
  clients: (Option & { currency: string })[];
  accounts: Option[];
  openInvoices: { id: string; clientId: string; number: string; balance: number; currency: string; dueDate: string }[];
  lockBefore: string | null;
};
