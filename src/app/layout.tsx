import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';
import { APP_CONFIG } from '@/lib/config';

export const metadata: Metadata = {
  title: `${APP_CONFIG.name} - Cuadrícula Fotográfica en Tiempo Real`,
  description: APP_CONFIG.description,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: APP_CONFIG.shortName,
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0284c7',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="bg-slate-950 text-slate-100 antialiased selection:bg-sky-500 selection:text-white min-h-screen flex flex-col">
        <ToastProvider>
          <OfflineBanner />
          <main className="flex-1 flex flex-col">{children}</main>
          <InstallPrompt />
        </ToastProvider>
      </body>
    </html>
  );
}
