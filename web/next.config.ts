import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Lets a production build run next to the dev server: NEXT_DIST_DIR=.next-prod next build
  distDir: process.env.NEXT_DIST_DIR || '.next',
  devIndicators: false,
  serverExternalPackages: ['@react-pdf/renderer'],
  // Bank CSV imports send parsed rows to a server action; a year of
  // transactions can exceed the 1 MB default.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  // Let a phone on the same Wi-Fi load the dev server (http://192.168.x.x:3000).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, // Settings embeds the invoice preview
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
