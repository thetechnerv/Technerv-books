import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tech Nerv Accounts',
    short_name: 'TN Accounts',
    start_url: '/',
    display: 'standalone',
    background_color: '#070b0c',
    theme_color: '#03DDAA',
    icons: [{ src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  };
}
