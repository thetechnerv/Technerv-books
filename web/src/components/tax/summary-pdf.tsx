import 'server-only';
import path from 'node:path';
import { Document, Page, View, Text, Svg, Rect, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer';
import { format, parseISO } from 'date-fns';

/*
  One-page year-end summary for the accountant. Letter, Inter, hairline rules,
  tracked uppercase labels, tabular numbers. Mint is used as a bar, never as
  small text on white (darkened mint for text).
*/

const FAMILY = 'InterTax';
let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), 'node_modules/@fontsource/inter/files');
  Font.register({ family: FAMILY, fonts: [400, 500, 600, 700].map((w) => ({ src: path.join(dir, `inter-latin-${w}-normal.woff`), fontWeight: w })) });
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

const INK = '#0C1113';
const L2 = '#56615F';
const L3 = '#8E989A';
const HAIR = '#E3E8E9';
const SOFT = '#F4F7F7';
const MINT = '#03DDAA';
const MINT_TEXT = '#00866A';
const RED = '#C9302C';

const s = StyleSheet.create({
  page: { fontFamily: FAMILY, fontSize: 8.4, color: INK, paddingTop: 0, paddingBottom: 40, paddingHorizontal: 44, lineHeight: 1.35 },
  label: { fontSize: 6.4, fontWeight: 600, letterSpacing: 0.9, textTransform: 'uppercase', color: L3 },
  h2: { fontSize: 9.6, fontWeight: 600, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2.4, borderBottomWidth: 0.5, borderBottomColor: HAIR },
  num: { textAlign: 'right', fontFeatureSettings: ['tnum'] },
  muted: { color: L2 },
});

const nf = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m = (v: number) => `${v < -0.004 ? '−' : ''}$${nf.format(Math.abs(v))}`;
const d = (iso: string | null | undefined) => (iso ? format(parseISO(iso), 'MMM d, yyyy') : '—');

export type SummaryModel = {
  company: { legal: string; bn: string | null; gst: string | null; address: string };
  fy: number; start: string; end: string; generated: string; preparedBy: string;
  income: { revenue: { gifi: string; label: string; amount: number }[]; expenses: { gifi: string; label: string; amount: number }[]; totalRevenue: number; totalExpenses: number; netIncome: number };
  adjustments: { meals: number; cca: number; taxable: number; tax: number; rate: number };
  gst: { l101: number; l103: number; l106: number; l109: number; method: string; filed: string | null };
  balances: { name: string; balance: number }[];
  ar: { label: string; total: number }[]; arTotal: number;
  cash: { name: string; currency: string; balance: number; balanceCad: number }[];
  assets: { ccaClass: string; additions: number; cca: number; closing: number; rule: string }[];
  readiness: { title: string; done: boolean }[];
  counts: { invoices: number; expenses: number; receipts: number; missingReceipts: number; trips: number; bankTxns: number };
};

export async function renderSummaryPdf(model: SummaryModel): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<SummaryDocument m={model} />);
}

function Line({ label, value, code, bold, tone }: { label: string; value: number; code?: string; bold?: boolean; tone?: 'red' }) {
  return (
    <View style={[s.row, bold ? { borderBottomWidth: 0, backgroundColor: SOFT, paddingHorizontal: 3 } : {}]}>
      {code !== undefined && <Text style={{ width: 30, color: L3, fontWeight: 600, fontSize: 7.4 }}>{code}</Text>}
      <Text style={{ flex: 1, fontWeight: bold ? 600 : 400 }}>{label}</Text>
      <Text style={[s.num, { fontWeight: bold ? 700 : 500, color: tone === 'red' ? RED : INK }]}>{m(value)}</Text>
    </View>
  );
}

export function SummaryDocument({ m: x }: { m: SummaryModel }) {
  const done = x.readiness.filter((r) => r.done).length;
  return (
    <Document title={`Tech Nerv FY${x.fy} year-end summary`} author={x.company.legal} subject="Year-end summary for T2 preparation">
      <Page size="LETTER" style={s.page}>
        {/* Header band */}
        <View style={{ marginHorizontal: -44, paddingHorizontal: 44, paddingTop: 30, paddingBottom: 14, backgroundColor: INK, color: '#FFFFFF', marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <Svg width={26} height={4}><Rect x={0} y={0} width={26} height={4} rx={2} fill={MINT} /></Svg>
              <Text style={{ fontSize: 17, fontWeight: 700, marginTop: 8, letterSpacing: -0.3, lineHeight: 1.15 }}>Year-end summary · FY{x.fy}</Text>
              <Text style={{ fontSize: 8.4, color: '#B9C6C8', marginTop: 4 }}>{d(x.start)} – {d(x.end)} · for T2 preparation</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 9.4, fontWeight: 600 }}>{x.company.legal}</Text>
              <Text style={{ fontSize: 7.4, color: '#B9C6C8' }}>BN {x.company.bn ?? '—'} · GST/HST {x.company.gst ?? '—'}</Text>
              <Text style={{ fontSize: 7.4, color: '#B9C6C8' }}>{x.company.address}</Text>
            </View>
          </View>
        </View>

        {/* Headline numbers */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {[
            { k: 'Total revenue', v: x.income.totalRevenue },
            { k: 'Total expenses', v: x.income.totalExpenses },
            { k: 'Net income before tax', v: x.income.netIncome },
            { k: 'GST/HST net tax', v: x.gst.l109 },
          ].map((t) => (
            <View key={t.k} style={{ flex: 1, backgroundColor: SOFT, borderRadius: 6, padding: 8 }}>
              <Text style={s.label}>{t.k}</Text>
              <Text style={{ fontSize: 13, fontWeight: 700, marginTop: 3, letterSpacing: -0.2 }}>{m(t.v)}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 18 }}>
          {/* Left: income statement */}
          <View style={{ flex: 1.15 }}>
            <Text style={s.h2}>Income statement by GIFI</Text>
            {x.income.revenue.map((l) => <Line key={'r' + l.gifi} code={l.gifi} label={l.label} value={l.amount} />)}
            <Line code="8299" label="Total revenue" value={x.income.totalRevenue} bold />
            <View style={{ height: 4 }} />
            {x.income.expenses.map((l) => <Line key={'e' + l.gifi} code={l.gifi} label={l.label} value={l.amount} />)}
            <Line code="9368" label="Total expenses" value={x.income.totalExpenses} bold />
            <View style={{ height: 4 }} />
            <Line code="9970" label="Net income before taxes" value={x.income.netIncome} bold />

            <Text style={[s.h2, { marginTop: 12 }]}>To taxable income (estimate)</Text>
            <Line label="Add back 50% meals & entertainment" value={x.adjustments.meals} />
            <Line label="Less CCA (estimate, max claim)" value={-x.adjustments.cca} />
            <Line label="Estimated taxable income" value={x.adjustments.taxable} bold />
            <Line label={`Estimated tax at ${Math.round(x.adjustments.rate * 100)}% (small business)`} value={x.adjustments.tax} />
          </View>

          {/* Right */}
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>GST/HST · {x.gst.method}</Text>
            <Line code="101" label="Sales and other revenue" value={x.gst.l101} />
            <Line code="103" label="GST/HST collected" value={x.gst.l103} />
            <Line code="106" label="Input tax credits" value={x.gst.l106} />
            <Line code="109" label="Net tax" value={x.gst.l109} bold />
            <Text style={{ fontSize: 7.2, color: L2, marginTop: 2 }}>{x.gst.filed ? `Filed ${x.gst.filed}` : 'Not filed yet'}</Text>

            <Text style={[s.h2, { marginTop: 10 }]}>Shareholder loans at year-end</Text>
            {x.balances.map((b) => <Line key={b.name} label={`${b.name} (${b.balance >= 0 ? 'company owes' : 'owes company'})`} value={b.balance} tone={b.balance < 0 ? 'red' : undefined} />)}

            <Text style={[s.h2, { marginTop: 10 }]}>Accounts receivable at year-end</Text>
            {x.ar.map((a) => <Line key={a.label} label={a.label} value={a.total} />)}
            <Line label="Total receivables" value={x.arTotal} bold />

            <Text style={[s.h2, { marginTop: 10 }]}>Bank & card balances</Text>
            {x.cash.map((c) => <Line key={c.name} label={`${c.name}${c.currency !== 'CAD' ? ` (${c.currency} ${nf.format(c.balance)})` : ''}`} value={c.balanceCad} />)}

            <Text style={[s.h2, { marginTop: 10 }]}>Capital cost allowance (estimate)</Text>
            {x.assets.length === 0 && <Text style={s.muted}>No capital assets.</Text>}
            {x.assets.map((a) => (
              <View key={a.ccaClass} style={s.row}>
                <Text style={{ width: 44, fontWeight: 600 }}>Class {a.ccaClass}</Text>
                <Text style={{ flex: 1, color: L2, fontSize: 7.2 }}>+{m(a.additions)} · {a.rule}</Text>
                <Text style={[s.num, { width: 58, fontWeight: 600 }]}>{m(a.cca)}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Footer: readiness + counts */}
        <View style={{ marginTop: 14, borderTopWidth: 0.5, borderTopColor: HAIR, paddingTop: 8, flexDirection: 'row', gap: 18 }}>
          <View style={{ flex: 1.15 }}>
            <Text style={s.label}>Readiness · {done} of {x.readiness.length}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
              {x.readiness.map((r) => (
                <View key={r.title} style={{ width: '50%', paddingRight: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 2.5 }}>
                  <View style={{ width: 5, height: 5, borderRadius: 2.5, marginRight: 4, backgroundColor: r.done ? MINT : '#FFFFFF', borderWidth: r.done ? 0 : 0.7, borderColor: L3 }} />
                  <Text style={{ flex: 1, fontSize: 7.2, color: r.done ? MINT_TEXT : L2 }}>{r.title}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>In this package</Text>
            <Text style={{ fontSize: 7.4, color: L2, marginTop: 4 }}>
              {x.counts.invoices} invoices & credit notes · {x.counts.expenses} expenses · {x.counts.receipts} receipt files
              {x.counts.missingReceipts ? ` (${x.counts.missingReceipts} business expenses without one)` : ''} · {x.counts.trips} mileage trips · {x.counts.bankTxns} bank & card transactions
            </Text>
          </View>
        </View>

        <Text fixed style={{ position: 'absolute', bottom: 22, left: 44, right: 44, fontSize: 6.8, color: L3 }}>
          Prepared from the books by Tech Nerv Accounts on {x.generated} for {x.preparedBy}. Amounts in CAD. Estimates for T2 preparation — not a filed return; confirm with your accountant.
        </Text>
      </Page>
    </Document>
  );
}
