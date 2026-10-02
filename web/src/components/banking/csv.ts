// Bank / card statement parsing shared by the import wizard (browser) and the
// import actions (server). Pure functions only — no React, no Node APIs.
import { parse as parseDate, isValid, format } from 'date-fns';

export type PresetId = 'eq_bank' | 'debit_credit' | 'signed_amount' | 'custom';

/** Saved on money_accounts.csv_mapping. Column values are header names. */
export type CsvMapping = {
  preset: PresetId | 'generic_card';
  date: string;
  description: string;
  /** Signed amount column (presets eq_bank / signed_amount). */
  amount?: string | null;
  /** Money out column (debit/credit layout). */
  debit?: string | null;
  /** Money in column (debit/credit layout). */
  credit?: string | null;
  balance?: string | null;
  /** Optional second text column appended to the description (e.g. "Memo"). */
  memo?: string | null;
  dateFormat: string;
  /** Flip the sign of a single amount column (some card issuers export purchases as positive). */
  invert?: boolean;
};

export type ParsedRow = {
  line: number;          // 1-based row number in the file (after the header)
  posted_on: string;     // yyyy-MM-dd
  description: string;
  amount: number;        // + in, − out
  balance: number | null;
  external_id?: string | null;
};

export type RowError = { line: number; message: string };

export const DATE_FORMATS: { value: string; label: string }[] = [
  { value: 'yyyy-MM-dd', label: '2026-09-28' },
  { value: 'dd MMM yyyy', label: '28 Sep 2026' },
  { value: 'MMM d, yyyy', label: 'Sep 28, 2026' },
  { value: 'MM/dd/yyyy', label: '09/28/2026 (month first)' },
  { value: 'dd/MM/yyyy', label: '28/09/2026 (day first)' },
  { value: 'yyyy/MM/dd', label: '2026/09/28' },
  { value: 'dd-MMM-yyyy', label: '28-Sep-2026' },
  { value: 'M/d/yy', label: '9/28/26' },
  { value: 'yyyyMMdd', label: '20260928' },
];

export const PRESETS: { id: PresetId; label: string; hint: string }[] = [
  { id: 'eq_bank', label: 'EQ Bank', hint: 'Transfer date, Description, Amount, Balance' },
  { id: 'debit_credit', label: 'Debit / Credit', hint: 'Separate money-out and money-in columns (most cards)' },
  { id: 'signed_amount', label: 'Signed amount', hint: 'One Amount column, negative = money out' },
  { id: 'custom', label: 'Custom', hint: 'Pick every column yourself' },
];

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function findHeader(headers: string[], ...candidates: (string | RegExp)[]) {
  for (const c of candidates) {
    const hit = headers.find((h) => (typeof c === 'string' ? norm(h) === c : c.test(norm(h))));
    if (hit) return hit;
  }
  return null;
}

/** Guess the layout from the header row. */
export function detectMapping(headers: string[], sampleDates: (h: string) => string[]): CsvMapping {
  const date = findHeader(headers, 'transfer date', 'transaction date', 'date', 'posted date', 'posting date', /date/) ?? headers[0] ?? '';
  const description = findHeader(headers, 'description', 'transaction details', 'details', 'merchant', 'payee', 'name', 'memo', /desc/) ?? headers[1] ?? '';
  const amount = findHeader(headers, 'amount', 'amount cad', 'transaction amount', 'cad', /amount/);
  const debit = findHeader(headers, 'debit', 'withdrawals', 'withdrawal', 'money out', 'purchases', /debit|withdraw|money out/);
  const credit = findHeader(headers, 'credit', 'deposits', 'deposit', 'money in', 'payments', /credit|deposit|money in/);
  const balance = findHeader(headers, 'balance', 'running balance', /balance/);
  const isEq = !!findHeader(headers, 'transfer date') && !!amount;
  const preset: PresetId = isEq ? 'eq_bank' : debit && credit ? 'debit_credit' : amount ? 'signed_amount' : 'custom';
  const dateFormat = detectDateFormat(date ? sampleDates(date) : []);
  return {
    preset, date, description,
    amount: preset === 'debit_credit' ? null : amount,
    debit: preset === 'debit_credit' ? debit : null,
    credit: preset === 'debit_credit' ? credit : null,
    balance, dateFormat, memo: null, invert: false,
  };
}

/** First format that parses every sample (ambiguous day/month resolves to whichever fits all rows). */
export function detectDateFormat(samples: string[]) {
  const vals = samples.map((s) => s.trim()).filter(Boolean).slice(0, 60);
  if (!vals.length) return 'yyyy-MM-dd';
  for (const f of DATE_FORMATS) if (vals.every((v) => toIsoDate(v, f.value))) return f.value;
  return 'yyyy-MM-dd';
}

const REF = new Date(2000, 0, 1);
export function toIsoDate(value: string, fmt: string): string | null {
  const v = value.trim().replace(/\s+/g, ' ');
  if (!v) return null;
  // Tolerate a trailing time ("2026-09-28 00:00:00") and upper-case months ("28 SEP 2026").
  const candidates = [v, v.split(/[ T](?=\d{1,2}:\d{2})/)[0]!];
  for (const c of candidates) {
    const fixed = c.replace(/\b([A-Z])([A-Z]{2})\b/g, (_, a: string, b: string) => a + b.toLowerCase());
    const d = parseDate(fixed, fmt, REF);
    if (isValid(d) && d.getFullYear() > 1990 && d.getFullYear() < 2100) return format(d, 'yyyy-MM-dd');
  }
  return null;
}

/** "$1,234.56", "-12.00", "(12.00)", "12.00 CR", "−4.10", "" → number | null */
export function parseAmount(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/\s*(CR)$/i.test(s)) { s = s.replace(/\s*CR$/i, ''); }
  if (/\s*(DR)$/i.test(s)) { neg = !neg; s = s.replace(/\s*DR$/i, ''); }
  s = s.replace(/[−–]/g, '-').replace(/[$\s,]|CAD|USD|US/gi, '');
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return neg ? -n : n;
}

/** Apply a mapping to parsed CSV records. */
export function mapRows(records: Record<string, string>[], m: CsvMapping) {
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  const dc = m.preset === 'debit_credit' || m.preset === 'generic_card' || (!m.amount && (m.debit || m.credit));
  records.forEach((r, i) => {
    const line = i + 1;
    const rawDate = r[m.date] ?? '';
    const desc = [r[m.description], m.memo ? r[m.memo] : ''].map((x) => (x ?? '').trim()).filter(Boolean).join(' · ');
    if (!rawDate.trim() && !desc) return; // blank line
    const posted_on = toIsoDate(rawDate, m.dateFormat);
    if (!posted_on) { errors.push({ line, message: `Couldn't read the date "${rawDate}"` }); return; }
    let amount: number | null;
    if (dc) {
      const out = parseAmount(m.debit ? r[m.debit] : null);
      const inn = parseAmount(m.credit ? r[m.credit] : null);
      if (out === null && inn === null) { errors.push({ line, message: 'No amount in the debit or credit column' }); return; }
      // Debit = money out (purchases on a card), credit = money in (payments to the card).
      amount = Math.round(((inn ? Math.abs(inn) : 0) - (out ? Math.abs(out) : 0)) * 100) / 100;
    } else {
      amount = parseAmount(m.amount ? r[m.amount] : null);
      if (amount === null) { errors.push({ line, message: `Couldn't read the amount "${m.amount ? r[m.amount] ?? '' : ''}"` }); return; }
      if (m.invert) amount = -amount;
    }
    if (amount === 0) { errors.push({ line, message: 'Amount is zero' }); return; }
    const balance = m.balance ? parseAmount(r[m.balance]) : null;
    rows.push({ line, posted_on, description: desc || '(no description)', amount, balance });
  });
  return { rows, errors };
}

export function validateMapping(m: CsvMapping): string | null {
  if (!m.date) return 'Choose the date column.';
  if (!m.description) return 'Choose the description column.';
  const dc = m.preset === 'debit_credit' || m.preset === 'generic_card';
  if (dc && !m.debit && !m.credit) return 'Choose the debit and credit columns.';
  if (!dc && !m.amount && !(m.debit || m.credit)) return 'Choose the amount column.';
  return null;
}

// ───────────── Duplicate keys ─────────────
/** Same normalisation as accounts.normalise_bank_description() in SQL. */
export function normaliseDescription(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
/** account|date|amount|description — sha256 of this is the stored dedupe_hash. */
export function dedupeKey(accountId: string, postedOn: string, amount: number, description: string) {
  return `${accountId}|${postedOn}|${(Math.round(amount * 100) / 100).toFixed(2)}|${normaliseDescription(description)}`;
}

// ───────────── OFX / QFX ─────────────
export function looksLikeOfx(text: string) {
  return /<OFX>/i.test(text) || /^OFXHEADER:/m.test(text);
}

/** Minimal SGML/XML OFX reader: one row per <STMTTRN>. */
export function parseOfx(text: string): { rows: ParsedRow[]; errors: RowError[]; currency: string | null; ledgerBalance: number | null } {
  const tag = (block: string, name: string) => {
    const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1]!.trim() : null;
  };
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]!);
  blocks.forEach((b, i) => {
    const line = i + 1;
    const dt = tag(b, 'DTPOSTED');
    const amt = parseAmount(tag(b, 'TRNAMT'));
    const posted_on = dt && /^\d{8}/.test(dt) ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}` : null;
    if (!posted_on) { errors.push({ line, message: 'Missing date' }); return; }
    if (amt === null || amt === 0) { errors.push({ line, message: 'Missing amount' }); return; }
    const name = tag(b, 'NAME'); const memo = tag(b, 'MEMO');
    const description = [name, memo && memo !== name ? memo : null].filter(Boolean).join(' · ').replace(/&amp;/g, '&') || '(no description)';
    rows.push({ line, posted_on, description, amount: amt, balance: null, external_id: tag(b, 'FITID') });
  });
  const ledger = text.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i);
  return { rows, errors, currency: tag(text, 'CURDEF'), ledgerBalance: ledger ? parseAmount(ledger[1]) : null };
}

/** A short, readable vendor name from a raw bank description: "SQ *KAMLOOPS COFFEE CO" → "Kamloops Coffee Co". */
export function cleanVendor(desc: string) {
  let s = desc
    .replace(/^(SQ|TST|SP|PP|PAYPAL|DD|POS|IDP|VISA|MC)\s*\*\s*/i, '')
    .replace(/^(INTERAC\s+)?E-TRANSFER\s+(SENT|DEPOSIT|RECEIVED)\s+/i, '')
    .replace(/^(EFT CREDIT|EFT DEBIT|INCOMING WIRE|BILL PAYMENT|PREAUTHORIZED DEBIT|PAD)\s+/i, '')
    .replace(/\s+#?\d{3,}.*$/, '')
    .replace(/\s+(KAMLOOPS|VANCOUVER|CALGARY|TORONTO|BC|AB|ON|CA|CAN)\b.*$/i, '')
    .replace(/[*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) s = desc.trim();
  if (/^[^a-z]*$/.test(s)) s = s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\.(Com|Ca)\b/g, (x) => x.toLowerCase());
  return s.slice(0, 60);
}

/** The keyword a new rule should match on: "LINKEDIN PREMIUM" → "LINKEDIN", "SQ *KAMLOOPS COFFEE CO" → "KAMLOOPS COFFEE". */
export function ruleKeyword(desc: string) {
  const s = desc.toUpperCase()
    .replace(/^(SQ|TST|SP|PP|PAYPAL|POS)\s*\*\s*/, '')
    .replace(/^(INTERAC\s+)?E-TRANSFER\s+(SENT|DEPOSIT|RECEIVED)\s+/, '')
    .replace(/\s+#?\d{3,}.*$/, '')
    .trim();
  const words = s.split(/\s+/).filter(Boolean);
  if (!words.length) return desc.toUpperCase().slice(0, 20);
  const first = words[0]!;
  // One distinctive word is enough ("LINKEDIN", "NETFLIX.COM"); short ones need a second word.
  return (first.length >= 6 || words.length === 1 ? first : words.slice(0, 2).join(' ')).slice(0, 30);
}
