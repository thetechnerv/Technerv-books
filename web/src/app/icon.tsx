import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export const MARK_PATH = 'M680 5228 c0 -2 -1 -360 -3 -795 -2 -653 0 -794 11 -798 50 -19 302 14 447 58 269 83 477 210 691 422 98 97 229 281 269 375 10 25 24 52 30 60 6 8 24 49 39 90 16 41 34 91 42 110 31 82 84 428 71 463 -6 16 -70 17 -802 17 -437 0 -795 -1 -795 -2z M3615 5209 c-234 -39 -443 -122 -645 -255 -143 -94 -315 -265 -418 -416 -40 -59 -72 -109 -72 -112 0 -3 -13 -27 -28 -53 -61 -103 -121 -273 -155 -433 l-22 -105 0 -1695 0 -1695 42 -3 c23 -2 97 4 164 13 202 26 324 64 519 162 327 164 595 449 734 778 21 50 42 98 47 107 10 20 20 59 57 213 l26 110 3 880 c2 484 5 890 8 903 l5 22 790 0 790 0 5 23 c9 35 1 1551 -8 1565 -6 9 -191 12 -870 11 -789 -1 -871 -3 -972 -20z';

export function appIcon(px: number, rounded: boolean) {
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#03DDAA', borderRadius: rounded ? px * 0.22 : 0 }}>
        <svg width={px * 0.6} height={px * 0.53} viewBox="0 0 652 576">
          <g transform="translate(0 576) scale(0.1 -0.1)" fill="#0C1113"><path d={MARK_PATH} /></g>
        </svg>
      </div>
    ),
    { width: px, height: px },
  );
}

export default function Icon() { return appIcon(512, true); }
