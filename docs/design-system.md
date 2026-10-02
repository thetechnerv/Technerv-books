# Design system

[← Docs index](README.md) · Full build brief: [`web/DESIGN.md`](../web/DESIGN.md) · [Search & shell](features/search-and-shell.md)

Apple Human Interface Guidelines structure, dressed in the Tech Nerv palette from technerv.com.
Mobile-first; desktop gets denser, macOS-like sizing.

## Brand palette (from technerv.com)

| Token | Value | Use |
|---|---|---|
| Mint | `#03DDAA` | Primary accent fills (buttons, switches, tab "+") with ink text `#032920` |
| Teal | `#05A38C` | Revenue in charts, secondary accent |
| Ocean | `#0680A2` | Info / "sent" / bank |
| Ink | `#0C1113` | Light-mode text, dark-mode base |
| Surfaces (site) | `#101C1E`, `#162527` | Inspiration for dark cells |
| Muted text (site) | `#9BB1B5` | |

In light mode accent **text** uses a deeper `#00866A` (`--accent-text`) so it meets contrast;
dark mode uses `#2EE6B8`.

## Tokens (`web/src/app/globals.css`)

- **Backgrounds**: `bg-bg` (grouped background), `bg-cell` (rows/cards), `bg-elevated` (sheets),
  `bg-inset`, fills `bg-fill`, `bg-fill-2`, `bg-fill-3`.
- **Labels**: `text-label`, `text-label-2/3/4` (iOS primary → quaternary).
- **Semantic**: `accent`, `blue`, `red`, `orange`, `purple` each with a `-soft` tint.
- **Materials**: `material-bar`, `material-thick`, `material-glass`, `material-sidebar`
  (backdrop blur + saturation; solid under `prefers-reduced-transparency`).
- **Type scale** (responsive; iOS sizes on phones, ~2pt smaller ≥1024px):
  `text-large` 34, `title1` 28, `title2` 22, `title3` 20, `headline` 17 semibold, `body` 17,
  `callout` 16, `subhead` 15, `footnote` 13, `caption` 12, `caption2` 11. Display sizes get
  negative tracking. Numbers use `tabular`.
- **Radii**: `rounded-group` (16 phone / 12 desktop), `md` 12, `lg` 16, `xl` 22, sheets 28 top.
- **Chart colours**: `--chart-in` `#05A38C`, `--chart-out` `#D97A2E` (dark `#C96F28`) — validated
  for colour-blind separation and contrast against `#ffffff` and `#111a1c`.
- **Layout vars**: `--row-h` (48/40), `--tabbar-h` (64), `--safe-top/bottom`, and
  **`--sticky-top`** (set by `Page`: nav bar + toolbar height, for sticky table headers).

Fonts: `-apple-system / SF Pro` on Apple devices, **Inter** (next/font) elsewhere. PDFs use Inter
(SF Pro can't be embedded).

### CSS gotchas learned the hard way
- Base element rules live in `@layer base`; un-layered rules override every Tailwind utility
  (this once made all input font sizes ignore their classes).
- Custom classes that need `lg:` variants must be declared with `@utility` (e.g. `material-bar`).
- Grid columns holding money need `minmax(0,1fr)` or they refuse to shrink on phones.
- A container with `overflow-hidden` breaks `position: sticky` for its children — use
  `overflow-clip` for rounded table cards.
- `cn()` uses tailwind-merge so a caller's `hidden` beats a component's `inline-flex`.

## Components (`web/src/components/ui`)

| Component | Notes |
|---|---|
| `Page` | Screen scaffold: iOS large title that collapses into a blurred nav bar; `back`, `actions`, sticky `toolbar`, `wide`. Publishes `--sticky-top` |
| `Section`, `Row`, `IconTile`, `Card` | Inset-grouped lists (`inset` = separator indent) |
| `Button`, `IconButton` | filled / tinted / gray / plain / destructive / outline; sm / md / lg; `href` |
| `Sheet`, `SheetAction` | Bottom sheet on phones (drag to dismiss with velocity projection), centred dialog on desktop |
| `Segmented`, `LinkSegmented` | Sliding-thumb segmented control (URL-driven variant for filters) |
| `Input`, `TextArea`, `Select`, `Toggle`, `Switch`, `AmountInput`, `Chips` | Form rows for grouped sections; native select = iOS picker wheel; selected chip auto-scrolls into view |
| `Badge`, `StatusBadge` | Tinted pills; invoice / bank / nature statuses (credit-note wording via `kind`) |
| `Avatar`, `Money`, `BigMoney` | Gradient initials; tabular currency; Wallet-style hero amount |
| `Menu` | Pull-down that scales from its trigger; scrolls when long |
| `useToast` | HUD toasts with optional **Undo** action |
| `useConfirm` | Alert-style confirmation — destructive actions only |
| `EmptyState`, `Skeleton`, `ListSkeleton` | Empty and loading states |
| `charts/BarChart` | Grouped columns: ≤24px bars, 4px rounded tops, legend, hover tooltip, sr-only table |

## Interaction rules

- Press feedback on pointer-down (`pressable` → scale 0.97). Springs: `bounce` 0–0.2, 0.3–0.45 s.
- Sheets are modal (dimmed); undo toasts for reversible actions; confirm only destructive ones.
- Phones: 44pt targets, thumb-reachable primary actions, editors hide the tab bar
  (`/new`, `/edit`, `?edit=1`, `/banking/import`) so their sticky Save bar sits at the bottom.
- Reduced motion → cross-fades; reduced transparency → solid materials; increased contrast → stronger separators.
- Copy: plain, specific, sentence case ("Record payment", not "Submit").
