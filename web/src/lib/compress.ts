'use client';

export type Prepared = { blob: Blob; name: string; type: string; originalSize: number; compression: 'webp' | 'gzip' | null };

const TEXTY = /^(text\/|application\/(json|xml|csv))/;

/**
 * Shrinks a file before upload.
 *  - Photos/scans → WebP, longest edge ≤ 2400px, quality 0.82 (receipts stay
 *    sharp enough for CRA while typically 80–95% smaller than a phone JPEG/HEIC).
 *  - Text-like files (CSV, JSON, TXT) → gzip.
 *  - PDFs and office files are already compressed internally, so stored as-is.
 */
export async function prepareFile(file: File): Promise<Prepared> {
  const originalSize = file.size;
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml' && file.type !== 'image/gif') {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.82));
      // Safari < 17 can't encode WebP and silently returns PNG; fall back to JPEG.
      const out = blob && blob.type === 'image/webp' ? blob : await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
      if (out && out.size < originalSize) {
        const ext = out.type === 'image/webp' ? 'webp' : 'jpg';
        return { blob: out, name: file.name.replace(/\.[^.]+$/, '') + '.' + ext, type: out.type, originalSize, compression: 'webp' };
      }
    } catch { /* fall through to raw upload */ }
  }
  if (TEXTY.test(file.type) && typeof CompressionStream !== 'undefined' && file.size > 2048) {
    const gz = await new Response(file.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    return { blob: gz, name: file.name + '.gz', type: file.type, originalSize, compression: 'gzip' };
  }
  return { blob: file, name: file.name, type: file.type || 'application/octet-stream', originalSize, compression: null };
}
