import 'server-only';
import path from 'node:path';
import { Font, renderToBuffer } from '@react-pdf/renderer';
import { InvoiceDocument } from './invoice-document';
import type { PdfModel } from './model';

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), 'node_modules/@fontsource/inter/files');
  Font.register({
    family: 'Inter',
    fonts: [400, 500, 600, 700].map((w) => ({ src: path.join(dir, `inter-latin-${w}-normal.woff`), fontWeight: w })),
  });
  // Never hyphenate names, numbers or emails.
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

export async function renderInvoicePdf(model: PdfModel): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<InvoiceDocument m={model} />);
}

export function pdfFileName(model: Pick<PdfModel, 'number' | 'revision' | 'revisionNote'>) {
  return `${model.number}${model.revisionNote ? `-r${model.revision}` : ''}.pdf`;
}
