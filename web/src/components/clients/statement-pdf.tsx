import 'server-only';
import path from 'node:path';
import { Document, Page, View, Text, Svg, Rect, G, Path, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer';
import { format, parseISO } from 'date-fns';
import { money } from '@/lib/format';
import type { Statement } from './statement';
import { countryName } from './tax';

// ───────────────────────── Fonts ─────────────────────────
const FAMILY = 'InterStatement';
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), 'node_modules/@fontsource/inter/files');
  Font.register({ family: FAMILY, fonts: [400, 500, 600, 700].map((w) => ({ src: path.join(dir, `inter-latin-${w}-normal.woff`), fontWeight: w })) });
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

export async function renderStatementPdf(s: Statement): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<StatementDocument s={s} />);
}

// ───────────────────────── Palette ─────────────────────────
const INK = '#0C1113';
const L2 = '#56615F';
const L3 = '#8E989A';
const HAIR = '#E3E8E9';
const SOFT = '#F4F7F7';
const MINT = '#03DDAA';
const MINT_TEXT = '#00866A';
const RED = '#D92D20';
const AGING_COLORS = [MINT, '#F2B53A', '#EB8A2F', '#E25C2A', RED];

const X = 46; // side margin
const s = StyleSheet.create({
  page: { fontFamily: FAMILY, fontSize: 8.6, color: INK, paddingTop: 40, paddingBottom: 68, paddingHorizontal: X, lineHeight: 1.35 },
  caption: { fontSize: 6.6, fontWeight: 600, letterSpacing: 0.9, textTransform: 'uppercase', color: L3 },
  h2: { fontSize: 10.5, fontWeight: 600, letterSpacing: -0.1 },
  muted: { color: L2 },
  faint: { color: L3 },
  num: { textAlign: 'right', fontFeatureSettings: ['tnum'] },
  tnum: { fontFeatureSettings: ['tnum'] },
  row: { flexDirection: 'row' },
});

const d = (iso: string | null | undefined, p = 'MMM d, yyyy') => (iso ? format(parseISO(iso), p) : '');
const nf = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plural = (k: number, one: string) => `${k} ${k === 1 ? one : one + 's'}`;
const n = (v: number) => (Math.abs(v) < 0.005 ? '0.00' : v < 0 ? `−${nf.format(-v)}` : nf.format(v));

// Table columns (points)
const COL = { date: 68, due: 58, charge: 64, credit: 64, balance: 70 };

export function StatementDocument({ s: st }: { s: Statement }) {
  const { client: c, business: b, currency: cur } = st;
  const period = `${d(st.from)} – ${d(st.to)}`;
  const agingTotal = st.aging.reduce((t, a) => t + a.amount, 0);
  const overdue = st.aging.slice(1).reduce((t, a) => t + a.amount, 0);
  const billTo = [
    c.contact_name ? `Attn: ${c.contact_name}` : null,
    c.address_line1, c.address_line2,
    [[c.city, c.province].filter(Boolean).join(', '), c.postal_code].filter(Boolean).join('  '),
    c.country && c.country !== 'CA' ? countryName(c.country) : null,
    c.email,
  ].filter(Boolean) as string[];
  const from = [
    b.address_line1, b.address_line2,
    [[b.city, b.province].filter(Boolean).join(', '), b.postal_code].filter(Boolean).join('  '),
    b.gst_number ? `GST/HST ${b.gst_number}` : null,
    b.email,
    b.phone,
  ].filter(Boolean) as string[];

  return (
    <Document title={`Statement – ${c.display_name} – ${period}`} author={b.legal_name} subject="Statement of account" creator="Tech Nerv Accounts" producer="Tech Nerv Accounts">
      <Page size="LETTER" style={s.page}>
        {/* Running header on continuation pages */}
        <View fixed style={{ position: 'absolute', top: 20, left: X, right: X, flexDirection: 'row', justifyContent: 'space-between' }}
          render={({ pageNumber }) => (pageNumber > 1 ? (
            <>
              <Text style={[s.caption, { color: L3 }]}>Statement · {c.company_name ?? c.display_name}</Text>
              <Text style={[s.caption, { color: L3 }]}>{period}</Text>
            </>
          ) : null)} />

        {/* ───────── Masthead ───────── */}
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
          <View style={[s.row, { alignItems: 'center' }]}>
            <Mark size={30} />
            <View style={{ marginLeft: 9 }}>
              <Text style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: -0.3, lineHeight: 1.1 }}>{b.operating_name ?? 'Tech Nerv'}</Text>
              <Text style={{ fontSize: 7.6, color: L3, marginTop: 1.5 }}>{b.legal_name}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.05 }}>Statement</Text>
            <Text style={{ fontSize: 9, color: L2, marginTop: 4 }}>{period}</Text>
            <Text style={[s.caption, { color: MINT_TEXT, marginTop: 5 }]}>Account summary · {cur}</Text>
          </View>
        </View>

        <View style={{ height: 0.75, backgroundColor: HAIR, marginTop: 22, marginBottom: 18 }} />

        {/* ───────── Parties + balance ───────── */}
        <View style={[s.row, { alignItems: 'stretch' }]}>
          <View style={{ flex: 1.15, paddingRight: 14 }}>
            <Text style={s.caption}>Statement for</Text>
            <Text style={{ fontSize: 10, fontWeight: 600, marginTop: 5 }}>{c.company_name ?? c.display_name}</Text>
            {billTo.map((l, i) => <Text key={i} style={[s.muted, { marginTop: 1.2 }]}>{l}</Text>)}
          </View>
          <View style={{ flex: 1, paddingRight: 14 }}>
            <Text style={s.caption}>From</Text>
            <Text style={{ fontSize: 10, fontWeight: 600, marginTop: 5 }}>{b.legal_name}</Text>
            {from.map((l, i) => <Text key={i} style={[s.muted, { marginTop: 1.2 }]}>{l}</Text>)}
          </View>
          <View style={{ width: 168, backgroundColor: INK, borderRadius: 10, padding: 14, justifyContent: 'space-between' }}>
            <Text style={[s.caption, { color: MINT }]}>{st.closing < -0.004 ? 'Credit balance' : 'Balance due'}</Text>
            <View>
              <Text style={[s.tnum, { fontSize: 22, fontWeight: 700, color: '#FFFFFF', letterSpacing: -0.6, marginTop: 8, lineHeight: 1.05 }]}>{money(Math.abs(st.closing), cur)}</Text>
              <Text style={{ fontSize: 7.6, color: '#9AA6A8', marginTop: 4 }}>{Math.abs(st.closing) < 0.005 ? 'Paid in full' : cur} · as of {d(st.to)}</Text>
              {overdue > 0.004 && <Text style={{ fontSize: 7.6, color: '#FF8A80', marginTop: 2, fontWeight: 600 }}>{money(overdue, cur)} past due</Text>}
            </View>
          </View>
        </View>

        {/* ───────── Summary strip ───────── */}
        <View style={[s.row, { backgroundColor: SOFT, borderRadius: 9, marginTop: 18, paddingVertical: 11 }]}>
          {[
            ['Opening balance', st.opening, d(st.from)],
            ['Invoiced', st.charges, plural(st.lines.filter((l) => l.kind === 'invoice').length, 'invoice')],
            ['Payments & credits', st.credits, plural(st.lines.filter((l) => l.kind === 'payment').length, 'payment')],
            ['Closing balance', st.closing, d(st.to)],
          ].map(([label, value, sub], i) => (
            <View key={i} style={{ flex: 1, paddingHorizontal: 13, borderLeftWidth: i ? 0.75 : 0, borderLeftColor: HAIR }}>
              <Text style={{ fontSize: 7.4, color: L2 }}>{label as string}</Text>
              <Text style={[s.tnum, { fontSize: 11.5, fontWeight: 600, marginTop: 3, letterSpacing: -0.2 }]}>{money(value as number, cur)}</Text>
              <Text style={{ fontSize: 6.8, color: L3, marginTop: 1.5 }}>{sub as string}</Text>
            </View>
          ))}
        </View>

        {/* ───────── Activity ───────── */}
        <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 24, marginBottom: 7 }]}>
          <Text style={s.h2}>Account activity</Text>
          <Text style={[s.faint, { fontSize: 7.4 }]}>Amounts in {cur}</Text>
        </View>
        <View style={[s.row, { borderBottomWidth: 0.75, borderBottomColor: INK, paddingBottom: 5 }]} fixed={false}>
          <Text style={[s.caption, { width: COL.date }]}>Date</Text>
          <Text style={[s.caption, { flex: 1 }]}>Details</Text>
          <Text style={[s.caption, { width: COL.due }]}>Due</Text>
          <Text style={[s.caption, s.num, { width: COL.charge }]}>Charges</Text>
          <Text style={[s.caption, s.num, { width: COL.credit }]}>Credits</Text>
          <Text style={[s.caption, s.num, { width: COL.balance }]}>Balance</Text>
        </View>

        <TableRow date={d(st.from)} title="Opening balance" muted balance={st.opening} />
        {st.lines.map((l, i) => (
          <TableRow key={i} date={d(l.date)} title={l.title} detail={l.detail} due={l.due ? d(l.due) : ''}
            charge={l.charge || undefined} credit={l.credit || undefined} balance={l.balance} kind={l.kind} />
        ))}
        {st.lines.length === 0 && (
          <View style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: HAIR }}>
            <Text style={[s.faint, { textAlign: 'center' }]}>No invoices, payments or credits in this period.</Text>
          </View>
        )}
        <View wrap={false} style={[s.row, { backgroundColor: SOFT, borderRadius: 7, marginTop: 6, paddingVertical: 8, paddingHorizontal: 8, alignItems: 'center' }]}>
          <Text style={[s.tnum, { width: COL.date - 8, fontWeight: 600 }]}>{d(st.to)}</Text>
          <Text style={{ flex: 1, fontWeight: 600 }}>Closing balance</Text>
          <Text style={[s.num, { width: COL.charge, color: L2 }]}>{n(st.charges)}</Text>
          <Text style={[s.num, { width: COL.credit, color: L2 }]}>{n(st.credits)}</Text>
          <Text style={[s.num, { width: COL.balance - 8, fontWeight: 700, fontSize: 9.4 }]}>{n(st.closing)}</Text>
        </View>

        {/* ───────── Aging ───────── */}
        <View wrap={false} style={{ marginTop: 24 }}>
          <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 9 }]}>
            <Text style={s.h2}>Aging summary</Text>
            <Text style={[s.faint, { fontSize: 7.4 }]}>Unpaid invoices by days past due, as of {d(st.to)}</Text>
          </View>
          <View style={[s.row, { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: HAIR }]}>
            {agingTotal > 0.004 && st.aging.map((a, i) => (a.amount > 0 ? <View key={a.key} style={{ flexGrow: a.amount, flexBasis: 0, backgroundColor: AGING_COLORS[i] }} /> : null))}
          </View>
          <View style={[s.row, { marginTop: 10 }]}>
            {st.aging.map((a, i) => (
              <View key={a.key} style={{ flex: 1, paddingLeft: i ? 12 : 0, borderLeftWidth: i ? 0.75 : 0, borderLeftColor: HAIR }}>
                <View style={[s.row, { alignItems: 'center' }]}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: AGING_COLORS[i], marginRight: 4 }} />
                  <Text style={{ fontSize: 7.4, color: L2 }}>{a.label}</Text>
                </View>
                <Text style={[s.tnum, { fontSize: 10.5, fontWeight: 600, marginTop: 3, color: a.amount > 0.004 ? (i >= 3 ? RED : INK) : L3 }]}>{money(a.amount, cur)}</Text>
              </View>
            ))}
          </View>
          {st.unapplied > 0.004 && (
            <Text style={[s.muted, { marginTop: 8, fontSize: 7.6 }]}>Less unapplied credits of {money(st.unapplied, cur)}. Balance due {money(st.closing, cur)}.</Text>
          )}
        </View>

        {/* ───────── Open invoices ───────── */}
        {st.openItems.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <View wrap={false}>
              <Text style={[s.h2, { marginBottom: 7 }]}>Open invoices</Text>
              <View style={[s.row, { borderBottomWidth: 0.75, borderBottomColor: INK, paddingBottom: 5 }]}>
                <Text style={[s.caption, { width: 70 }]}>Invoice</Text>
                <Text style={[s.caption, { flex: 1 }]}>Description</Text>
                <Text style={[s.caption, { width: 64 }]}>Issued</Text>
                <Text style={[s.caption, { width: 64 }]}>Due</Text>
                <Text style={[s.caption, s.num, { width: 64 }]}>Amount</Text>
                <Text style={[s.caption, s.num, { width: 64 }]}>Balance</Text>
                <Text style={[s.caption, s.num, { width: 68 }]}>Status</Text>
              </View>
            </View>
            {st.openItems.map((o) => (
              <View key={o.number} wrap={false} style={[s.row, { paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: HAIR }]}>
                <Text style={{ width: 70, fontWeight: 600 }}>{o.number}</Text>
                <Text style={[s.muted, { flex: 1, paddingRight: 8 }]}>{o.title ?? ''}</Text>
                <Text style={[s.muted, s.tnum, { width: 64 }]}>{d(o.issued)}</Text>
                <Text style={[s.muted, s.tnum, { width: 64 }]}>{d(o.due)}</Text>
                <Text style={[s.num, s.muted, { width: 64 }]}>{n(o.total)}</Text>
                <Text style={[s.num, { width: 64, fontWeight: 600 }]}>{n(o.balance)}</Text>
                <Text style={[s.num, { width: 68, fontWeight: 600, color: o.daysOverdue > 0 ? RED : MINT_TEXT }]}>
                  {o.daysOverdue > 0 ? `${o.daysOverdue} ${o.daysOverdue === 1 ? 'day' : 'days'} late` : 'Not yet due'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ───────── How to pay ───────── */}
        {(b.payment_instructions || b.etransfer_email || b.bank_details) && (
          <View wrap={false} style={{ marginTop: 26, borderRadius: 9, borderWidth: 0.75, borderColor: HAIR, padding: 14 }}>
            <View style={[s.row]}>
              <View style={{ flex: 1.3, paddingRight: 18 }}>
                <Text style={s.caption}>How to pay</Text>
                {b.payment_instructions && <Text style={[s.muted, { marginTop: 5 }]}>{b.payment_instructions}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                {b.etransfer_email && <PayLine label="Interac e-Transfer" value={b.etransfer_email} />}
                {b.bank_details && <PayLine label="Bank transfer (EFT)" value={b.bank_details} />}
                <PayLine label="Reference" value="Your invoice number(s)" />
              </View>
            </View>
          </View>
        )}
        {b.invoice_thank_you && <Text style={{ marginTop: 16, fontSize: 9, fontWeight: 500, color: MINT_TEXT }}>{b.invoice_thank_you}</Text>}

        {/* ───────── Footer ───────── */}
        <View fixed style={{ position: 'absolute', bottom: 30, left: X, right: X, borderTopWidth: 0.75, borderTopColor: HAIR, paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 7, color: L3 }}>{b.invoice_footer ?? b.legal_name}{b.email ? `  ·  Questions? ${b.email}` : ''}</Text>
          <Text style={{ fontSize: 7, color: L3 }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

function TableRow({ date, title, detail, due, charge, credit, balance, muted, kind }: {
  date: string; title: string; detail?: string | null; due?: string; charge?: number; credit?: number; balance: number; muted?: boolean; kind?: string;
}) {
  return (
    <View wrap={false} style={[s.row, { paddingVertical: 5.5, borderBottomWidth: 0.5, borderBottomColor: HAIR }]}>
      <Text style={[{ width: COL.date }, s.muted, s.tnum]}>{date}</Text>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ fontWeight: muted ? 400 : 500, color: muted ? L2 : INK }}>{title}</Text>
        {detail ? <Text style={{ fontSize: 7.3, color: L3, marginTop: 1 }}>{detail}</Text> : null}
      </View>
      <Text style={[{ width: COL.due }, s.muted, s.tnum]}>{due ?? ''}</Text>
      <Text style={[s.num, { width: COL.charge }]}>{charge !== undefined ? n(charge) : ''}</Text>
      <Text style={[s.num, { width: COL.credit, color: kind === 'payment' || kind === 'credit_note' ? MINT_TEXT : INK }]}>{credit !== undefined ? n(credit) : ''}</Text>
      <Text style={[s.num, { width: COL.balance, fontWeight: 600, color: muted ? L2 : INK }]}>{n(balance)}</Text>
    </View>
  );
}

function PayLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={{ fontSize: 7, color: L3 }}>{label}</Text>
      <Text style={{ fontWeight: 500, marginTop: 1 }}>{value}</Text>
    </View>
  );
}

/** The Tech Nerv mark (paths from components/shell/logo.tsx): ink "T" strokes on a mint squircle. */
function Mark({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x="0" y="0" width="100" height="100" rx="24" ry="24" fill={MINT} />
      <G transform="translate(19 21) scale(0.0954)">
        <G transform="translate(0 576) scale(0.1 -0.1)">
          <Path fill={INK} d="M680 5228 c0 -2 -1 -360 -3 -795 -2 -653 0 -794 11 -798 50 -19 302 14 447 58 269 83 477 210 691 422 98 97 229 281 269 375 10 25 24 52 30 60 6 8 24 49 39 90 16 41 34 91 42 110 31 82 84 428 71 463 -6 16 -70 17 -802 17 -437 0 -795 -1 -795 -2z" />
          <Path fill={INK} d="M3615 5209 c-234 -39 -443 -122 -645 -255 -143 -94 -315 -265 -418 -416 -40 -59 -72 -109 -72 -112 0 -3 -13 -27 -28 -53 -61 -103 -121 -273 -155 -433 l-22 -105 0 -1695 0 -1695 42 -3 c23 -2 97 4 164 13 202 26 324 64 519 162 327 164 595 449 734 778 21 50 42 98 47 107 10 20 20 59 57 213 l26 110 3 880 c2 484 5 890 8 903 l5 22 790 0 790 0 5 23 c9 35 1 1551 -8 1565 -6 9 -191 12 -870 11 -789 -1 -871 -3 -972 -20z" />
        </G>
      </G>
    </Svg>
  );
}
