import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ['@react-pdf/renderer'],
  // Bank CSV imports send parsed rows to a server action; a year of
  // transactions can exceed the 1 MB default.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
};

export default nextConfig;
