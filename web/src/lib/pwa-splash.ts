/**
 * iOS needs one launch image per device size or it shows a blank screen while
 * the home-screen app starts. Portrait sizes in device pixels, with the CSS
 * point size and pixel ratio used in the media query.
 */
const DEVICES: Array<[w: number, h: number, ratio: number]> = [
  [1320, 2868, 3], // iPhone 16/17 Pro Max
  [1206, 2622, 3], // iPhone 16/17 Pro, 17
  [1260, 2736, 3], // iPhone Air
  [1290, 2796, 3], // iPhone 14/15 Pro Max, 15/16 Plus
  [1179, 2556, 3], // iPhone 14/15 Pro, 15, 16
  [1284, 2778, 3], // iPhone 12–14 Pro Max, 14 Plus
  [1170, 2532, 3], // iPhone 12–14, 12/13 Pro
  [1080, 2340, 3], // iPhone 12/13 mini
  [1125, 2436, 3], // iPhone X/XS/11 Pro
  [1242, 2688, 3], // iPhone XS Max/11 Pro Max
  [828, 1792, 2],  // iPhone XR/11
  [750, 1334, 2],  // iPhone SE 2/3, 8
  [2048, 2732, 2], // iPad Pro 12.9"
  [1668, 2388, 2], // iPad Pro 11"
  [1640, 2360, 2], // iPad Air
  [1620, 2160, 2], // iPad 10.2"
];

export const appleStartupImages = DEVICES.map(([w, h, r]) => ({
  url: `/icons/splash-${w}x${h}.png`,
  media: `(device-width: ${w / r}px) and (device-height: ${h / r}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)`,
}));
