import { ImageResponse } from 'next/og';
import { MARK_PATH } from '../../icon';

/**
 * PWA icons and iOS launch screens, rendered on demand and cached.
 *   /icons/icon-192.png, /icons/icon-512.png      rounded app icon ("any")
 *   /icons/maskable-512.png                       full-bleed, mark inside the 80% safe zone
 *   /icons/shortcut-<expense|receipt|invoice|review>.png   home-screen shortcut icons
 *   /icons/splash-<w>x<h>.png                     iOS apple-touch-startup-image
 */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const headers = { 'Cache-Control': 'public, max-age=604800, immutable' };

  let m = name.match(/^icon-(\d+)\.png$/);
  if (m) return mark(Number(m[1]), { rounded: true, scale: 0.6 }, headers);

  m = name.match(/^maskable-(\d+)\.png$/);
  if (m) return mark(Number(m[1]), { rounded: false, scale: 0.46 }, headers);

  m = name.match(/^shortcut-(expense|receipt|invoice|review)\.png$/);
  if (m) return shortcut(m[1] as keyof typeof GLYPHS, headers);

  m = name.match(/^splash-(\d+)x(\d+)\.png$/);
  if (m) return splash(Number(m[1]), Number(m[2]), headers);

  return new Response('Not found', { status: 404 });
}

function mark(px: number, o: { rounded: boolean; scale: number }, headers: Record<string, string>) {
  const size = Math.min(1024, Math.max(48, px));
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03DDAA', borderRadius: o.rounded ? size * 0.22 : 0 }}>
        <svg width={size * o.scale} height={size * o.scale * (576 / 652)} viewBox="0 0 652 576">
          <g transform="translate(0 576) scale(0.1 -0.1)" fill="#0C1113"><path d={MARK_PATH} /></g>
        </svg>
      </div>
    ),
    { width: size, height: size, headers },
  );
}

// Simple filled glyphs drawn on a 24×24 grid.
const GLYPHS = {
  expense: 'M6 2h12a1 1 0 0 1 1 1v18l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1Zm3 6v2h6V8H9Zm0 4v2h6v-2H9Z',
  receipt: 'M9 4 7.5 6H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.5L15 4H9Zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  invoice: 'M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm7 1.5V8h4.5L13 3.5ZM8 12v2h8v-2H8Zm0 4v2h6v-2H8Z',
  review: 'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm2 8v6h14v-6h-4a3 3 0 0 1-6 0H5Z',
};

function shortcut(kind: keyof typeof GLYPHS, headers: Record<string, string>) {
  const size = 192;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0C1113', borderRadius: size * 0.22 }}>
        <svg width={104} height={104} viewBox="0 0 24 24"><path d={GLYPHS[kind]} fill="#03DDAA" fillRule="evenodd" /></svg>
      </div>
    ),
    { width: size, height: size, headers },
  );
}

function splash(w: number, h: number, headers: Record<string, string>) {
  const W = Math.min(2000, w), H = Math.min(3000, h);
  const icon = Math.round(Math.min(W, H) * 0.24);
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#070B0C' }}>
        <div style={{ width: icon, height: icon, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03DDAA', borderRadius: icon * 0.24, boxShadow: '0 24px 80px rgba(3,221,170,0.35)' }}>
          <svg width={icon * 0.6} height={icon * 0.6 * (576 / 652)} viewBox="0 0 652 576">
            <g transform="translate(0 576) scale(0.1 -0.1)" fill="#0C1113"><path d={MARK_PATH} /></g>
          </svg>
        </div>
        <div style={{ marginTop: icon * 0.32, color: '#F5F8F9', fontSize: icon * 0.2, fontWeight: 600, letterSpacing: -1 }}>Tech Nerv Accounts</div>
      </div>
    ),
    { width: W, height: H, headers },
  );
}
