# Home-screen app (PWA)

[← Docs index](../README.md) · Related: [Search & shell](search-and-shell.md) · [Auth & security](../auth-and-security.md)

The app installs to the iPhone / Android home screen and runs full-screen. Instructions for users
live in the app at **Settings → Install on your phone** (`/settings/install`) and in the
[user guide](../user-guide.html#install).

## Pieces

| Piece | File | Notes |
|---|---|---|
| Manifest | `web/src/app/manifest.ts` → `/manifest.webmanifest` | `id`/`scope` `/`, `start_url` `/?source=pwa`, `display: standalone`, dark background/theme `#070b0c`, icons 192/512 + maskable, **shortcuts** (Add expense, Snap a receipt, New invoice, Review) |
| Icons & launch screens | `web/src/app/icons/[name]/route.tsx` | `ImageResponse`, cached 7 days: `icon-192/512.png`, `maskable-512.png` (mark inside the 80% safe zone), `shortcut-*.png`, `splash-<w>x<h>.png` |
| iOS launch images | `web/src/lib/pwa-splash.ts` → `metadata.appleWebApp.startupImage` | 16 portrait sizes (iPhone SE → 17 Pro Max, iPads) with device-width/height/ratio media queries |
| iOS meta | `web/src/app/layout.tsx` | `apple-mobile-web-app-capable`, title "TN Accounts", status bar `black-translucent` (content draws under it; `--safe-top` padding everywhere), `apple-icon` 180px, format-detection off |
| Service worker | `web/public/sw.js` | See caching policy below; registered in production only (or `NEXT_PUBLIC_SW_IN_DEV=1`) |
| Offline page | `web/public/offline.html` | Self-contained, light/dark, auto-reloads on reconnect |
| Client manager | `web/src/components/shell/pwa.tsx` | `PwaManager` (register, update toast "A new version is ready → Reload", offline pill), `PullToRefresh` (standalone only), `useStandalone()` |
| Install UI | `web/src/components/shell/install-guide.tsx` | `InstallGuide` (platform-aware steps, Chrome `beforeinstallprompt` button), `InstallHint` (dismissible card on Home for phones not yet installed; `localStorage` key `tn-install-hint-dismissed`) |
| Headers | `web/next.config.ts` | `sw.js`: no-cache, `Service-Worker-Allowed: /`, strict CSP; global: nosniff, `X-Frame-Options: SAMEORIGIN`, referrer policy, `Permissions-Policy` (camera self) |
| Proxy | `web/src/proxy.ts` | Matcher skips `icons/`, `sw.js`, `offline.html`, manifest so they load signed-out |

## Caching policy (privacy first)

- **Never cached**: page HTML, RSC payloads, `/api/*`, files, Supabase requests — financial data stays off the device.
- **Cache-first**: `/_next/static/*` (content-hashed), `/icons/*`, fonts.
- **Navigations**: network; on failure → `offline.html`.
- Bump `VERSION` in `sw.js` to force old caches out. Updates: the new worker waits; the toast's
  Reload posts `SKIP_WAITING`, then the page reloads on `controllerchange`. The app checks for an
  update whenever it returns to the foreground.

## Standalone UX details

- **Pull to refresh** (no browser reload button in standalone): only at scroll top, not inside
  sheets/inputs/horizontal scrollers; rubber-banded; calls `router.refresh()`; light haptic on Android.
- Editors hide the tab bar; every screen has an in-app back button (no browser back).
- Inputs are ≥16px on phones (iOS won't zoom on focus).
- Sidebar (iPad landscape) is padded for the status bar.

## Testing on a phone before hosting

1. Same Wi-Fi as the Mac. `allowedDevOrigins` already allows `192.168.*.*`, `10.*.*.*`, `*.local`.
2. The dev sign-in bypass only works for `localhost`. To use it from the phone on a **trusted** network,
   add `DEV_BYPASS_ALLOW_LAN=1` to `web/.env.local` and restart `npm run dev` — remove it afterwards
   (anyone on the network could otherwise open the books).
3. Open `http://<mac-ip>:3000` in Safari → Share → Add to Home Screen.
4. Service workers need **HTTPS** (except on localhost), so offline/update features only switch on
   once the app is hosted. Full-screen mode, icon and launch screen work either way.

Not verifiable in the Claude desktop browser pane: it can't register service workers at all; verify on a
real device after hosting (Safari Web Inspector → Service Workers, or Chrome DevTools → Application).

## Ideas
- Android **share target** (send a receipt photo from Photos straight into New expense) — iOS doesn't support share targets.
- Badging API for the review count on the icon (Android/desktop).
