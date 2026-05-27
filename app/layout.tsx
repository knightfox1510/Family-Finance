export const metadata: Metadata = {
  title: 'ChillarFlow — Track every rupee. Effortlessly.',
  description: '...',
  // ADD THIS:
  verification: {
    facebook: 'oa5jc12kl8z9f18sz2c6n1lwm7apiu',
  },
  // ... rest of your metadata
};

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
  themeColor: '#09090b',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="obsidian" suppressHydrationWarning>
      <head>
        {/* No-flash: read theme from localStorage before React hydrates */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('cf_theme') || 'obsidian';
                document.documentElement.setAttribute('data-theme', t);
                document.documentElement.style.background = t === 'pearl' ? '#fafafa' : '#09090b';
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
