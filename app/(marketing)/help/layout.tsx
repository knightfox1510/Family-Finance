import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help Center — ChillarFlow',
  description: 'How to use ChillarFlow — WhatsApp logging, Telegram bot, dashboard, and settings.',
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
