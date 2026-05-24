import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FamilyFinance',
  description: 'Household finance tracker for couples and families',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FamilyFinance',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // Prevents iOS from zooming on input focus (belt-and-suspenders alongside font-size:16px)
  userScalable: false,
  viewportFit: 'cover', // Allows content to extend into the notch/home-indicator area
  themeColor: '#0b0f1a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark-navy" suppressHydrationWarning>
      {/*
        suppressHydrationWarning is required because we set data-theme on the
        client via localStorage — the server always renders "dark-navy" and the
        client immediately updates it, causing a harmless mismatch that React
        would otherwise warn about.

        The inline script below reads localStorage BEFORE React hydrates so
        there is zero flash of the wrong theme, even on fast connections.
      */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('ff_theme') || 'dark-navy';
                document.documentElement.setAttribute('data-theme', t);
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
