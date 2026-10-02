import { Document, Page, View, Text, Svg, Rect, G, Path, Image, StyleSheet } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/stylesheet';
import { format, parseISO } from 'date-fns';
import type { PdfModel, PdfLine } from './model';

/*
  Invoice PDF. Letter size, 52pt side margins, Inter throughout.
  Hierarchy: document title → amount due → parties → lines → totals → how to pay.
  Labels are small caps (tracked uppercase 7pt), numbers use tabular figures,
  rules are 0.5pt hairlines. The accent is used sparingly and never for small text
  on white (it's darkened for that).
*/

const INK = '#0C1113';
const L2 = '#5A6467';
const L3 = '#8C9597';
const HAIR = '#E2E6E7';
const SUBTLE = '#F5F7F7';
const RED = '#C9302C';
const MARGIN = 52;
const PAGE_H = 792; // US Letter
const TOP = 44; // top padding on continuation pages; page 1's header bleeds into it

function mix(hex: string, other: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(other);
  return '#' + a.map((v, i) => Math.round(v * (1 - t) + b[i]! * t).toString(16).padStart(2, '0')).join('');
}
const base = StyleSheet.create({
  page: { fontFamily: 'Inter', fontSize: 9, color: INK, paddingTop: TOP, paddingBottom: 70, lineHeight: 1.4 },
  label: { fontSize: 6.8, fontWeight: 600, letterSpacing: 0.9, textTransform: 'uppercase', color: L3 },
  num: { fontFeatureSettings: ['tnum'] },
});

const fmtDate = (iso: string | null | undefined, p = 'MMM d, yyyy') => (iso ? format(parseISO(iso), p) : '');

function amount(n: number, opts: { negative?: boolean; currency?: string; code?: boolean } = {}) {
  const v = opts.negative ? -Math.abs(n) : n;
  const s = Math.abs(v).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sym = '$';
  return `${v < 0 ? '−' : ''}${sym}${s}${opts.code && opts.currency ? ` ${opts.currency}` : ''}`;
}

/** Re-flow "A · B · C · D" so line breaks fall between segments, not inside them. */
function pack(text: string, max: number) {
  const parts = text.split(/\s+·\s+/);
  const lines: string[] = [];
  for (const p of parts) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' · ' + p).length <= max) lines[lines.length - 1] = last + ' · ' + p;
    else lines.push(p);
  }
  return lines.join('\n');
}

const PLURAL_UNITS = new Set(['hour', 'month', 'session', 'day', 'week', 'user', 'seat', 'call', 'page', 'item', 'license', 'year']);
function qty(l: PdfLine) {
  const q = +l.quantity.toFixed(3);
  const n = q.toLocaleString('en-CA', { maximumFractionDigits: 3 });
  const u = (l.unit ?? '').trim();
  if (!u || u === 'each' || u === 'fixed') return n;
  return `${n} ${PLURAL_UNITS.has(u) && q !== 1 ? u + 's' : u}`;
}

export function InvoiceDocument({ m }: { m: PdfModel }) {
  const accent = m.accent;
  const isEstimate = m.kind === 'estimate';
  const isCredit = m.kind === 'credit_note';
  const neg = isCredit;
  const title = isEstimate ? 'Estimate' : isCredit ? 'Credit note' : 'Invoice';
  const showCode = m.currency !== 'CAD';
  const midnight = m.theme === 'midnight';
  const minimal = m.theme === 'minimal';
  const paid = m.kind === 'invoice' && m.status === 'paid';
  const isVoid = m.status === 'void';
  const showPay = m.kind === 'invoice' && !paid && !isVoid && !!(m.paymentInstructions || m.etransferEmail || m.bankDetails);
  const amountDue = isEstimate || isCredit || paid || isVoid ? m.total : m.balance;
  const heroLabel = isVoid ? 'Voided' : isEstimate ? 'Estimate total' : isCredit ? 'Credit total' : paid ? 'Paid in full' : 'Amount due';
  const heroSub = isVoid ? 'Cancelled — nothing to pay' : isEstimate
    ? m.dueDate ? `Valid until ${fmtDate(m.dueDate)}` : null
    : isCredit ? `Issued ${fmtDate(m.issueDate)}`
    : paid ? (m.paidOn ? `Paid ${fmtDate(m.paidOn)}` : null)
    : m.dueDate ? (m.dueDate <= m.issueDate ? 'Due on receipt' : `Due ${fmtDate(m.dueDate)}`) : null;

  const ink = midnight ? '#FFFFFF' : INK;
  const headSub = midnight ? 'rgba(255,255,255,0.62)' : L2;

  const meta: { label: string; value: string }[] = [
    { label: isCredit ? 'Date' : 'Issued', value: fmtDate(m.issueDate) },
    ...(!isCredit && m.dueDate ? [{ label: isEstimate ? 'Valid until' : 'Due', value: m.dueDate <= m.issueDate && !isEstimate ? 'On receipt' : fmtDate(m.dueDate) }] : []),
    ...(m.poNumber ? [{ label: 'PO number', value: m.poNumber }] : []),
    ...(m.projectName ? [{ label: 'Project', value: m.projectName }] : []),
    ...(m.reference ? [{ label: isCredit ? 'Credits' : 'Reference', value: m.reference }] : []),
    ...(showCode ? [{ label: 'Currency', value: m.currency === 'USD' ? 'US dollars (USD)' : m.currency }] : []),
  ];

  return (
    <Document title={`${title} ${m.number}`} author={m.business.legalName} subject={m.title ?? undefined} creator="Tech Nerv Accounts" producer="Tech Nerv Accounts">
      <Page size="LETTER" style={base.page}>
        {/* ───── Top: accent bar / ink band ───── */}
        {m.theme === 'studio' && <View fixed style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: accent }} />}
        <View style={[{ paddingHorizontal: MARGIN, marginTop: -TOP, paddingTop: midnight ? 36 : 40, paddingBottom: midnight ? 24 : 0 }, midnight ? { backgroundColor: INK } : {}]}>
          {/* Brand + from | title */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {m.showLogo && (
                  m.logo
                    // eslint-disable-next-line jsx-a11y/alt-text
                    ? <Image src={{ data: m.logo.data, format: m.logo.format }} style={{ height: 30, maxWidth: 120, marginRight: 10, objectFit: 'contain' }} />
                    : <Mark size={30} mono={minimal} />
                )}
                <View style={{ marginLeft: m.showLogo && !m.logo ? 10 : 0 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: 600, color: ink, letterSpacing: -0.2 }}>{m.business.name}</Text>
                  {m.business.website && <Text style={{ fontSize: 8, color: headSub, marginTop: 0.5 }}>{m.business.website}</Text>}
                </View>
              </View>
              <View style={{ marginTop: 11 }}>
                <Text style={{ fontSize: 8.2, color: ink, fontWeight: 500 }}>{m.business.legalName}</Text>
                <Text style={{ fontSize: 8.2, color: headSub }}>{m.business.addressLines.join('  ·  ')}</Text>
                {(m.business.gstNumber || m.business.phone) && (
                  <Text style={{ fontSize: 8.2, color: headSub }}>
                    {[m.business.gstNumber && `GST/HST ${m.business.gstNumber}`, m.business.phone].filter(Boolean).join('  ·  ')}
                  </Text>
                )}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 26, fontWeight: 600, letterSpacing: -0.8, color: ink, lineHeight: 1.1 }}>{title}</Text>
              <Text style={{ fontSize: 10, color: midnight ? accent : L2, marginTop: 3, fontWeight: 500 }}>
                {m.number}{m.revision > 1 ? `  ·  Rev. ${m.revision}` : ''}
              </Text>
            </View>
          </View>

          {/* Hero: who it's for + amount due */}
          <View style={{ flexDirection: 'row', marginTop: 22, alignItems: 'flex-end' }}>
            <View style={{ flex: 1, paddingRight: 24 }}>
              <Text style={[base.label, midnight ? { color: accent } : {}]}>{isCredit ? 'Issued to' : isEstimate ? 'Prepared for' : 'Bill to'}</Text>
              <Text style={{ fontSize: 11.5, fontWeight: 600, marginTop: 5, color: ink }}>{m.client.name}</Text>
              {m.client.contact && <Text style={{ color: headSub, marginTop: 1 }}>Attn: {m.client.contact}</Text>}
              {m.client.addressLines.map((l, i) => <Text key={i} style={{ color: headSub }}>{l}</Text>)}
              {m.client.email && <Text style={{ color: headSub }}>{m.client.email}</Text>}
            </View>
            <View
              style={[
                { alignItems: 'flex-end', minWidth: 190 },
                minimal ? { borderRightWidth: 3, borderRightColor: accent, paddingRight: 12 } : {},
              ]}
            >
              <Text style={[base.label, midnight ? { color: accent } : {}]}>{heroLabel}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
                <Text style={[base.num, { fontSize: 25, fontWeight: 600, letterSpacing: -0.6, lineHeight: 1.05, color: isVoid ? (midnight ? 'rgba(255,255,255,0.5)' : L3) : ink, textDecoration: isVoid ? 'line-through' : 'none' }]}>
                  {amount(amountDue, { negative: neg })}
                </Text>
                {showCode && <Text style={{ fontSize: 10, fontWeight: 600, color: headSub, marginLeft: 4, marginBottom: 2 }}>{m.currency}</Text>}
              </View>
              {heroSub && <Text style={{ color: headSub, marginTop: 3 }}>{heroSub}</Text>}
            </View>
          </View>
        </View>

        {/* Stamps */}
        {paid && <Stamp text="Paid" sub={m.paidOn ? fmtDate(m.paidOn) : null} color={mix(accent, INK, 0.38)} />}
        {isVoid && <Stamp text="Void" sub="Not payable" color={RED} />}
        {isEstimate && m.status === 'accepted' && <Stamp text="Accepted" sub={null} color={mix(accent, INK, 0.38)} />}

        <View style={{ paddingHorizontal: MARGIN }}>
          {/* Meta strip */}
          <View style={{ flexDirection: 'row', marginTop: midnight ? 10 : 20, paddingVertical: 8, borderTopWidth: midnight ? 0 : 0.5, borderBottomWidth: 0.5, borderColor: HAIR }}>
            {meta.map((x, i) => (
              <View key={x.label} style={{ width: `${100 / Math.max(meta.length, 4)}%`, paddingLeft: i === 0 ? 0 : 12, paddingRight: 6, borderLeftWidth: i === 0 ? 0 : 0.5, borderLeftColor: HAIR }}>
                <Text style={base.label}>{x.label}</Text>
                <Text style={{ marginTop: 3, fontWeight: 500 }}>{x.value}</Text>
              </View>
            ))}
          </View>

          {(m.title || m.revisionNote) && (
            <View style={{ marginTop: 15 }}>
              {m.title && <Text style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: -0.15 }}>{m.title}</Text>}
              {m.revisionNote && <Text style={{ color: L3, marginTop: m.title ? 2 : 0, fontSize: 8 }}>{m.revisionNote}</Text>}
            </View>
          )}

          {/* Lines */}
          <View style={{ marginTop: m.title || m.revisionNote ? 12 : 20 }}>
            <View fixed style={{ flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 0.75, borderBottomColor: INK }}>
              <Text style={[base.label, { flex: 1, color: L2 }]}>Description</Text>
              <Text style={[base.label, { width: 70, textAlign: 'right', color: L2 }]}>Qty</Text>
              <Text style={[base.label, { width: 82, textAlign: 'right', color: L2 }]}>Rate</Text>
              <Text style={[base.label, { width: 88, textAlign: 'right', color: L2 }]}>Amount</Text>
            </View>
            {m.lines.map((l, i) => (
              <View key={i} wrap={false} style={{ flexDirection: 'row', paddingVertical: 6.5, borderBottomWidth: 0.5, borderBottomColor: HAIR }}>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={{ fontWeight: 500 }}>{l.description}</Text>
                  {l.detail && <Text style={{ color: L2, fontSize: 8.2, marginTop: 1.5 }}>{l.detail}</Text>}
                </View>
                <Text style={[base.num, { width: 70, textAlign: 'right', color: L2 }]}>{qty(l)}</Text>
                <Text style={[base.num, { width: 82, textAlign: 'right', color: L2 }]}>{amount(l.unitPrice)}</Text>
                <Text style={[base.num, { width: 88, textAlign: 'right', fontWeight: 500 }]}>{amount(l.amount, { negative: neg })}</Text>
              </View>
            ))}
          </View>

          {/* How to pay | totals */}
          <View wrap={false} style={{ flexDirection: 'row', marginTop: 14 }}>
            <View style={{ flex: 1, paddingRight: 30, paddingTop: 4 }}>
              {showPay ? (
                <>
                  <Text style={base.label}>How to pay</Text>
                  {m.paymentInstructions && <Text style={{ marginTop: 5, color: L2, fontSize: 8.4 }}>{m.paymentInstructions}</Text>}
                  <View style={{ marginTop: 8, backgroundColor: SUBTLE, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 9 }}>
                    {m.etransferEmail && m.currency === 'CAD' && <KeyValue k="e-Transfer" v={m.etransferEmail} />}
                    {m.bankDetails && <KeyValue k="EFT / wire" v={pack(m.bankDetails, 30)} />}
                    <KeyValue k="Reference" v={m.number} />
                  </View>
                </>
              ) : isEstimate ? (
                <>
                  <Text style={base.label}>Acceptance</Text>
                  <Text style={{ marginTop: 5, color: L2, fontSize: 8.4 }}>To go ahead, sign below or reply to approve. Work is scheduled once the estimate is accepted.</Text>
                  <View style={{ flexDirection: 'row', marginTop: 24 }}>
                    <SignLine label="Signature" flex={1.5} />
                    <SignLine label="Date" flex={0.9} />
                  </View>
                </>
              ) : isCredit ? (
                <>
                  <Text style={base.label}>About this credit</Text>
                  <Text style={{ marginTop: 5, color: L2, fontSize: 8.4 }}>
                    {m.reference ? `Issued against ${m.reference}. ` : ''}The credit total reduces the amount you owe and will be applied to your account. No payment is required.
                  </Text>
                </>
              ) : null}
            </View>
            <View style={{ width: 250 }}>
              <TotalRow label="Subtotal" value={amount(m.subtotal, { negative: neg })} />
              {m.discount > 0 && <TotalRow label="Discount" value={amount(-m.discount * (neg ? -1 : 1))} />}
              {m.taxes.map((t) => <TotalRow key={t.label} label={t.label} value={amount(t.amount, { negative: neg && t.amount !== 0 })} />)}
              {m.taxes.length === 0 && <TotalRow label="Tax" value={amount(0)} />}
              <TotalRow label={isCredit ? 'Total credit' : 'Total'} value={amount(m.total, { negative: neg, currency: m.currency, code: showCode })} strong rule />
              {!isEstimate && !isCredit && m.amountPaid > 0 && <TotalRow label="Amount paid" value={amount(-m.amountPaid)} />}
              {!isEstimate && !isCredit && !isVoid && (
                <BalanceRow label={paid ? 'Balance' : 'Balance due'} value={amount(m.balance, { currency: m.currency, code: showCode })} theme={m.theme} accent={accent} />
              )}
              {m.thankYou && !isVoid && (
                <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <View style={{ width: 12, height: 2, backgroundColor: minimal ? INK : accent, marginRight: 7, borderRadius: 1 }} />
                  <Text style={{ fontSize: 8.8, fontWeight: 500, color: INK }}>{m.thankYou}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Notes / terms */}
          {(m.notes || m.terms) && (
            <View wrap={false} style={{ flexDirection: 'row', marginTop: 16, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: HAIR }}>
              {m.notes && (
                <View style={{ flex: 1, paddingRight: m.terms ? 30 : 0 }}>
                  <Text style={base.label}>Notes</Text>
                  <Text style={{ marginTop: 4, color: L2, fontSize: 8.4 }}>{m.notes}</Text>
                </View>
              )}
              {m.terms && (
                <View style={{ width: m.notes ? 250 : undefined, flex: m.notes ? undefined : 1 }}>
                  <Text style={base.label}>Terms</Text>
                  <Text style={{ marginTop: 4, color: L2, fontSize: 8.4 }}>{m.terms}</Text>
                </View>
              )}
            </View>
          )}

        </View>

        {/* Running header on continuation pages */}
        <Text
          fixed
          style={{ position: 'absolute', top: 20, left: MARGIN, right: MARGIN, fontSize: 7.5, color: L3 }}
          render={({ pageNumber }) => (pageNumber > 1 ? `${title} ${m.number}  ·  ${m.client.name}` : '')}
        />

        {/* Footer */}
        <View fixed style={{ position: 'absolute', bottom: 28, left: MARGIN, right: MARGIN, flexDirection: 'row', alignItems: 'flex-end', borderTopWidth: 0.5, borderTopColor: HAIR, paddingTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7.2, color: L2 }}>{m.footer ?? m.business.legalName}</Text>
            <Text style={[base.num, { fontSize: 7.2, color: L3, marginTop: 1 }]}>
              {[m.business.legalName, m.business.businessNumber && `BN ${m.business.businessNumber}`, m.business.gstNumber && `GST/HST ${m.business.gstNumber}`, m.business.email].filter(Boolean).join('  ·  ')}
            </Text>
          </View>
        </View>
        <Text
          fixed
          style={{ position: 'absolute', top: PAGE_H - 28 - 10, left: MARGIN, right: MARGIN, textAlign: 'right', fontSize: 7.2, color: L3 }}
          render={({ pageNumber, totalPages }) => `${m.number}  ·  Page ${pageNumber} of ${totalPages}`}
        />
      </Page>
    </Document>
  );
}

function TotalRow({ label, value, strong, rule }: { label: string; value: string; strong?: boolean; rule?: boolean }) {
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }, rule ? { borderTopWidth: 0.5, borderTopColor: HAIR, marginTop: 4, paddingTop: 8 } : {}]}>
      <Text style={{ color: strong ? INK : L2, fontWeight: strong ? 600 : 400, flex: 1, paddingRight: 10 }}>{label}</Text>
      <Text style={[base.num, { fontWeight: strong ? 600 : 400 }]}>{value}</Text>
    </View>
  );
}

function BalanceRow({ label, value, theme, accent }: { label: string; value: string; theme: string; accent: string }) {
  const filled = theme === 'midnight' || theme === 'minimal';
  const style: Style = filled
    ? { backgroundColor: theme === 'minimal' ? mix(accent, '#FFFFFF', 0.78) : INK, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 9, marginTop: 8 }
    : { borderTopWidth: 1.5, borderTopColor: accent, marginTop: 8, paddingTop: 9 };
  const color = theme === 'midnight' ? '#FFFFFF' : INK;
  return (
    <View style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, style]}>
      <Text style={{ fontSize: 10.5, fontWeight: 600, color }}>{label}</Text>
      <Text style={[base.num, { fontSize: 13, fontWeight: 700, color: theme === 'midnight' ? accent : color, letterSpacing: -0.2 }]}>{value}</Text>
    </View>
  );
}

function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 1.5 }}>
      <Text style={{ width: 62, color: L3, fontSize: 8 }}>{k}</Text>
      <Text style={[base.num, { flex: 1, fontSize: 8.4, fontWeight: 500 }]}>{v}</Text>
    </View>
  );
}

function SignLine({ label, flex }: { label: string; flex: number }) {
  return (
    <View style={{ flex, marginRight: 12 }}>
      <View style={{ borderBottomWidth: 0.75, borderBottomColor: L3, height: 18 }} />
      <Text style={[base.label, { marginTop: 4 }]}>{label}</Text>
    </View>
  );
}

function Stamp({ text, sub, color }: { text: string; sub: string | null; color: string }) {
  return (
    <View
      style={{
        position: 'absolute', top: 152, left: 272, width: 124, height: sub ? 44 : 34,
        borderWidth: 1.6, borderColor: color, borderRadius: 7, opacity: 0.9,
        transform: 'rotate(-8deg)', justifyContent: 'center', alignItems: 'center',
      }}
    >
      <Text style={{ fontSize: 15, lineHeight: 1, fontWeight: 700, color, letterSpacing: 3.5, textTransform: 'uppercase', marginLeft: 3.5 }}>{text}</Text>
      {sub && <Text style={{ fontSize: 6.8, lineHeight: 1, marginTop: 5, fontWeight: 600, color, letterSpacing: 1, textTransform: 'uppercase', marginLeft: 1 }}>{sub}</Text>}
    </View>
  );
}

/** The Tech Nerv mark (paths from components/shell/logo.tsx): ink "T" strokes on a mint squircle. */
function Mark({ size, mono }: { size: number; mono?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x="0" y="0" width="100" height="100" rx="24" ry="24" fill={mono ? INK : '#03DDAA'} />
      <G transform="translate(19 21) scale(0.0954)">
        <G transform="translate(0 576) scale(0.1 -0.1)">
          <Path fill={mono ? '#FFFFFF' : INK} d="M680 5228 c0 -2 -1 -360 -3 -795 -2 -653 0 -794 11 -798 50 -19 302 14 447 58 269 83 477 210 691 422 98 97 229 281 269 375 10 25 24 52 30 60 6 8 24 49 39 90 16 41 34 91 42 110 31 82 84 428 71 463 -6 16 -70 17 -802 17 -437 0 -795 -1 -795 -2z" />
          <Path fill={mono ? '#FFFFFF' : INK} d="M3615 5209 c-234 -39 -443 -122 -645 -255 -143 -94 -315 -265 -418 -416 -40 -59 -72 -109 -72 -112 0 -3 -13 -27 -28 -53 -61 -103 -121 -273 -155 -433 l-22 -105 0 -1695 0 -1695 42 -3 c23 -2 97 4 164 13 202 26 324 64 519 162 327 164 595 449 734 778 21 50 42 98 47 107 10 20 20 59 57 213 l26 110 3 880 c2 484 5 890 8 903 l5 22 790 0 790 0 5 23 c9 35 1 1551 -8 1565 -6 9 -191 12 -870 11 -789 -1 -871 -3 -972 -20z" />
        </G>
      </G>
    </Svg>
  );
}
