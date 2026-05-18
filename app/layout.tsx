import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Goku & Kari Finances',
  description: 'Shared household expense tracker',
  manifest: '/manifest.json', // Points to your PWA config file
  icons: {
    apple: '/apple-touch-icon.png', // Forces iOS Safari compliance
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
