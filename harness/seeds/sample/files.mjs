// Synthetic receipt images (SVG) and placeholder PDFs for the demo dataset.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (n) => Number(n).toFixed(2);

export function receiptSvg({ vendor, date, description, subtotal, gst, pst, total, currency, card, seed }) {
  const n = parseInt(seed.replace(/-/g, '').slice(0, 6), 16);
  const tilt = ((n % 7) - 3) * 0.35;
  const w = 360, rows = [];
  let y = 150;
  const line = (left, right, opts = {}) => {
    rows.push(`<text x="28" y="${y}" font-size="${opts.size ?? 13}" ${opts.bold ? 'font-weight="700"' : ''}>${esc(left)}</text>`);
    if (right !== undefined) rows.push(`<text x="${w - 28}" y="${y}" font-size="${opts.size ?? 13}" text-anchor="end" ${opts.bold ? 'font-weight="700"' : ''}>${esc(right)}</text>`);
    y += opts.gap ?? 22;
  };
  line(description ?? 'Purchase', fmt(subtotal), { gap: 30 });
  rows.push(`<line x1="28" x2="${w - 28}" y1="${y - 14}" y2="${y - 14}" stroke="#000" stroke-dasharray="3 4" opacity=".5"/>`);
  line('SUBTOTAL', fmt(subtotal));
  if (Number(gst) > 0) line('GST 5%  #8' + String(n).padStart(8, '0').slice(0, 8) + 'RT0001', fmt(gst), { size: 11.5 });
  if (Number(pst) > 0) line('PST 7%', fmt(pst));
  y += 6;
  line('TOTAL ' + currency, fmt(total), { bold: true, size: 16, gap: 34 });
  line(card, 'APPROVED', { size: 11.5 });
  line('AUTH ' + String(n).slice(0, 6), date, { size: 11.5, gap: 40 });
  const h = y + 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w + 40}" height="${h + 40}" viewBox="0 0 ${w + 40} ${h + 40}">
<rect width="100%" height="100%" fill="#E9ECEC"/>
<g transform="translate(20 20) rotate(${tilt} ${w / 2} ${h / 2})" font-family="ui-monospace, Menlo, monospace" fill="#1d1d1f">
<rect width="${w}" height="${h}" rx="4" fill="#FFFEFA" stroke="#D9DAD6"/>
<text x="${w / 2}" y="58" font-size="20" font-weight="700" text-anchor="middle">${esc(vendor.toUpperCase())}</text>
<text x="${w / 2}" y="82" font-size="11.5" text-anchor="middle" opacity=".7">Store #${(n % 900) + 100} · Customer copy</text>
<text x="${w / 2}" y="104" font-size="11.5" text-anchor="middle" opacity=".7">${esc(date)}  ${String((n % 12) + 8).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}</text>
<line x1="28" x2="${w - 28}" y1="124" y2="124" stroke="#000" stroke-dasharray="3 4" opacity=".5"/>
${rows.join('\n')}
<text x="${w / 2}" y="${h - 22}" font-size="11.5" text-anchor="middle" opacity=".6">THANK YOU · SAMPLE RECEIPT</text>
</g></svg>`;
}

// A tiny but valid one-page PDF with a title and a few lines of text.
export function simplePdf(title, lines) {
  const text = [
    'BT /F2 20 Tf 72 720 Td (' + pdfEsc(title) + ') Tj ET',
    ...lines.map((l, i) => `BT /F1 12 Tf 72 ${684 - i * 20} Td (${pdfEsc(l)}) Tj ET`),
    '0.012 0.866 0.667 rg 72 750 36 6 re f',
  ].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

const pdfEsc = (s) => String(s).replace(/[()\\]/g, (c) => '\\' + c).replace(/[^\x20-\x7e]/g, '-');
