import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm';
import { PwaManager } from '@/components/shell/pwa';
import { appleStartupImages } from '@/lib/pwa-splash';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Tech Nerv Accounts', template: '%s · Tech Nerv Accounts' },
  description: 'Invoices, expenses and tax-ready books for Tech Nerv Solutions Inc.',
  applicationName: 'Tech Nerv Accounts',
  appleWebApp: { capable: true, title: 'TN Accounts', statusBarStyle: 'black-translucent', startupImage: appleStartupImages },
  formatDetection: { telephone: false, email: false, address: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f4f5' },
    { media: '(prefers-color-scheme: dark)', color: '#070b0c' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get('theme')?.value;
  return (
    <html lang="en-CA" className={inter.variable} data-theme={theme === 'light' || theme === 'dark' ? theme : undefined} suppressHydrationWarning>
      <body>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
          <PwaManager />
        </ToastProvider>
      </body>
    </html>
  );
}
