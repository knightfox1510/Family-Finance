import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChillarFlow — Track every rupee. Effortlessly.',
  description: 'Household finance tracker for couples and families. Log expenses via WhatsApp and Telegram.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ChillarFlow',
  },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="obsidian" suppressHydrationWarning>
      <head>
        {/* iOS Touch Icons and Basic Startup Launch Handshakes (FIXED STRINGS HERE) */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-startup-image" href="/icon-512x512.png" />
        
        {/* No-flash: read theme from localStorage before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('cf_theme') || 'obsidian';
                document.documentElement.setAttribute('data-theme', t);
                document.documentElement.style.background = t === 'pearl' ? '#f5f5f5' : '#0a0a0a';
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
