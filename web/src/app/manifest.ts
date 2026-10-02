import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Tech Nerv Accounts',
    short_name: 'TN Accounts',
    description: 'Invoices, expenses, owner balances and tax-ready books for Tech Nerv Solutions Inc.',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#070b0c',
    theme_color: '#070b0c',
    categories: ['finance', 'business', 'productivity'],
    lang: 'en-CA',
    dir: 'ltr',
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press the home-screen icon (Android; iOS ignores these).
    shortcuts: [
      { name: 'Add expense', short_name: 'Expense', url: '/expenses/new?source=shortcut', icons: [{ src: '/icons/shortcut-expense.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Snap a receipt', short_name: 'Receipt', url: '/expenses/new?scan=1&source=shortcut', icons: [{ src: '/icons/shortcut-receipt.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'New invoice', short_name: 'Invoice', url: '/invoices/new?source=shortcut', icons: [{ src: '/icons/shortcut-invoice.png', sizes: '192x192', type: 'image/png' }] },
      { name: 'Review bank transactions', short_name: 'Review', url: '/banking/review?source=shortcut', icons: [{ src: '/icons/shortcut-review.png', sizes: '192x192', type: 'image/png' }] },
    ],
  };
}
