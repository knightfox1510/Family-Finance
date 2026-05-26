
// app/help/page.tsx

import Link from 'next/link';

export const metadata = {
  title: 'Help Center — ChillarFlow',
  description: 'How to use ChillarFlow — WhatsApp logging, Telegram bot, dashboard, and settings.',
};

const C = {
  bg: '#0b0f1a', surface: '#131928', border: '#1e2840',
  amber: '#f59e0b', teal: '#06b6d4', textW: '#e8eeff',
  text2: '#6b82a8', muted: '#3d4f6e',
};

const sections = [
  {
    title: 'Getting started',
    items: [
      {
        q: 'How do I create an account?',
        a: 'Go to chillarflow.com and click "Start free". Enter your email and choose a password. A 5-step setup wizard will guide you through choosing your household mode, entering partner names, and optionally linking your WhatsApp or Telegram.',
      },
      {
        q: 'What is a household mode?',
        a: 'ChillarFlow has three modes: Joint Household (two partners share a joint pool and track shared expenses), Separate Finances (two partners track independently but can split costs), and Solo Manager (one person tracking everything alone). You can change this in Settings anytime.',
      },
      {
        q: 'How does my partner join?',
        a: 'Share your Household ID from Settings with your partner. They sign up, choose "Join Partner", and paste the code. They\'ll be linked to your household as Partner B.',
      },
    ],
  },
  {
    title: 'WhatsApp logging',
    items: [
      {
        q: 'How do I set up WhatsApp logging?',
        a: 'Go to Settings → WhatsApp Integration. Enter your WhatsApp number (with country code, e.g. 919876543210). Save settings. Then send a message to the ChillarFlow WhatsApp number provided — send /start to activate.',
      },
      {
        q: 'What can I send to the WhatsApp bot?',
        a: null,
        table: [
          { msg: '450 Zomato',                    result: 'Logs Rs.450 personal expense, category: Online Food Orders' },
          { msg: '1200 grocery to settle',         result: 'Logs Rs.1200 Groceries, joint pool reimburses' },
          { msg: '400 Ola settle with Priya',      result: 'Logs Rs.400 Cab Services, partner split with Priya' },
          { msg: '500',                            result: 'Opens interactive wizard (free, no AI)' },
          { msg: '/recent',                        result: 'Shows last 3 transactions with edit options' },
          { msg: '/summary',                       result: 'This month spending snapshot' },
          { msg: '/usage',                         result: 'How many AI parses you\'ve used this month' },
          { msg: '/upgrade',                       result: 'How to upgrade to Pro plan' },
        ],
      },
      {
        q: 'What is the interactive wizard?',
        a: 'Send any number (e.g. "500") and the bot will guide you step by step: choose a category, choose which account paid, and choose a settlement track. This path never uses AI and never counts toward your monthly limit.',
      },
    ],
  },
  {
    title: 'Telegram logging',
    items: [
      {
        q: 'How do I link my Telegram account?',
        a: 'Go to Settings → Telegram Bot Integration. Enter your Telegram username (without @). Save. Then open Telegram, find the ChillarFlow bot, and send /start. The syntax is identical to WhatsApp.',
      },
      {
        q: 'Can both partners use the same bot?',
        a: 'Yes. Each partner links their own Telegram username or WhatsApp number. The bot knows who is sending based on the linked profile and attributes expenses accordingly.',
      },
    ],
  },
  {
    title: 'AI parsing and usage limits',
    items: [
      {
        q: 'What counts as an AI parse?',
        a: 'Any natural language message that our Gemini AI processes — like "450 Zomato" or "grocery 1200 to settle". The interactive wizard (just sending a number) is always free.',
      },
      {
        q: 'What happens when I hit 30 parses?',
        a: 'The AI parsing pauses for the rest of the month. You can still log using the number wizard. The counter resets on the 1st of each month. Upgrade to Pro for unlimited parses.',
      },
      {
        q: 'How do I check my usage?',
        a: 'Send /usage to the bot, or go to Settings → Your Plan in the app.',
      },
    ],
  },
  {
    title: 'Dashboard and reports',
    items: [
      {
        q: 'What is "Retention Velocity"?',
        a: 'Retention Velocity shows how much of your combined income you actually kept after all spending and investments. It\'s your real financial health number — not just savings, but true surplus after lifestyle costs.',
      },
      {
        q: 'How do Partner Activity cards work?',
        a: 'Each partner gets their own breakdown: income, personal lifestyle spending, investments, joint pool contributions, and retained amount. This helps you see individual patterns without judgment.',
      },
      {
        q: 'Can I filter by date range?',
        a: 'Yes. Use the filter bar on the dashboard to select this month, last month, 3 months, 6 months, 12 months, or the current calendar year.',
      },
    ],
  },
  {
    title: 'Settlements',
    items: [
      {
        q: 'What are the three settlement tracks?',
        a: '"Personal (No Settlement)" — expense stays with the person who paid. "Joint Reimbursement" — the joint pool pays you back. "Partner Split" — your partner owes you directly. The Settlement Dashboard shows all pending amounts.',
      },
      {
        q: 'How do I settle up?',
        a: 'Go to the Settle tab. You\'ll see a summary of who owes whom and how much. Click "Settle All" to clear all pending settlements in one go, or settle individual items.',
      },
    ],
  },
];

export default function HelpPage() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: C.textW }}>
      {/* Nav */}
      <nav style={{ borderBottom: `1px solid ${C.border}`, padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 64 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 36, height: 36, background: C.amber, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: C.bg }}>C</div>
            <span style={{ fontWeight: 800, fontSize: 18, color: C.textW }}>ChillarFlow</span>
          </Link>
          <Link href="/app" style={{ background: C.amber, color: C.bg, padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Sign In</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '60px 24px 100px' }}>
        <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 8 }}>Help Center</h1>
        <p style={{ color: C.text2, fontSize: 16, marginBottom: 48 }}>
          Can't find what you need?{' '}
          <a href="mailto:team@chillarflow.com" style={{ color: C.amber }}>Email us</a> and we'll reply within 24 hours.
        </p>

        {sections.map((section) => (
          <div key={section.title} style={{ marginBottom: 60 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: C.amber, marginBottom: 24, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>
              {section.title}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {section.items.map((item, i) => (
                <div key={i} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.border}`, padding: '20px 0' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{item.q}</div>
                  {item.a && <div style={{ color: C.text2, fontSize: 14, lineHeight: 1.7 }}>{item.a}</div>}
                  {item.table && (
                    <div style={{ background: C.surface, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                      {item.table.map((row, ri) => (
                        <div key={ri} style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16, padding: '12px 16px', borderTop: ri === 0 ? 'none' : `1px solid ${C.border}` }}>
                          <code style={{ background: `${C.border}60`, padding: '4px 10px', borderRadius: 6, fontSize: 13, color: C.teal, alignSelf: 'center' }}>{row.msg}</code>
                          <span style={{ fontSize: 13, color: C.text2, alignSelf: 'center' }}>{row.result}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '28px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>💬</div>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>Still need help?</div>
          <div style={{ color: C.text2, fontSize: 14, marginBottom: 20 }}>We're a small team and we actually respond. Usually within a few hours.</div>
          <a href="mailto:team@chillarflow.com" style={{ background: C.amber, color: C.bg, padding: '12px 28px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Email team@chillarflow.com
          </a>
        </div>
      </div>

      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ color: C.muted, fontSize: 13 }}>© 2026 ChillarFlow. Made with ♥ in India.</div>
      </footer>
    </div>
  );
}
