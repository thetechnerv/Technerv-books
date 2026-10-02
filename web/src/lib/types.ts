import type { Database } from './database.types';

type S = Database['accounts'];
export type Row<T extends keyof S['Tables']> = S['Tables'][T]['Row'];
export type Insert<T extends keyof S['Tables']> = S['Tables'][T]['Insert'];
export type Update<T extends keyof S['Tables']> = S['Tables'][T]['Update'];
export type View<T extends keyof S['Views']> = S['Views'][T]['Row'];
export type Enum<T extends keyof S['Enums']> = S['Enums'][T];

export type InvoiceStatus = Enum<'invoice_status'>;
export type InvoiceKind = Enum<'invoice_kind'>;
export type ExpenseNature = Enum<'expense_nature'>;
export type PaymentMethod = Enum<'payment_method'>;

/** Result shape every server action returns so forms can show inline errors. */
export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
