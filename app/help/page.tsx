'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CoinMark } from '@/components/CoinMark';

const C = {
  bg: '#0b0f1a', surface: '#131928', border: '#1e2840',
  amber: '#f59e0b', teal: '#06b6d4', textW: '#e8eeff',
  text2: '#6b82a8', muted: '#3d4f6e',
};

const categories = [
  {
    id: 'getting-started',
    icon: '🚀',
    title: 'Getting started',
    sub: 'Set up your household in 3 minutes',
    articles: [
      {
        q: 'How do I sign up for ChillarFlow?',
        a: 'Open ChillarFlow on your phone, enter your email and choose a password. Then follow the 3-step setup: pick your household mode (Joint / Separate / Solo), add partner names, and connect WhatsApp or Telegram for instant logging.',
      },
      {
        q: 'What is "household mode" and which one should I pick?',
        a: 'It tells us how money flows in your home. Joint = both partners pool into one account for shared bills. Separate = each partner tracks alone but can split occasional shared costs. Solo = one person manages everything. You can switch later in Settings without losing data.',
      },
      {
        q: 'Do both partners need their own account?',
        a: 'No. One ChillarFlow household covers both of you. Each partner gets their own WhatsApp/Telegram number connected so logs are attributed to the right person, but you share one dashboard.',
      },
    ],
  },
  {
    id: 'logging',
    icon: '💬',
    title: 'Logging expenses',
    sub: 'WhatsApp, Telegram, and the number wizard',
    articles: [
      {
        q: 'How do I log an expense from WhatsApp?',
        a: 'Send a message in plain English to your ChillarFlow bot: "450 Zomato", "grocery 1200 to settle", or "got petrol for 400, dinner 800, both joint". Our AI parses amount, category, and settlement automatically.',
      },
      {
        q: "What's the difference between AI parsing and the number wizard?",
        a: 'AI parsing reads natural language and is counted against your monthly limit (30 free / unlimited on Pro). The number wizard is triggered when you send just a number (e.g. "500") — ChillarFlow then asks you category + settlement step by step. The wizard is always free.',
      },
      {
        q: 'Can I edit a logged transaction?',
        a: 'Yes. Open the Expenses screen, tap any transaction, and edit any field. Or reply to the confirmation message in WhatsApp with "edit" within 5 minutes.',
      },
      {
        q: 'What does "to settle" mean?',
        a: '"To settle" marks an expense for joint reimbursement — meaning you paid from your personal account but it was a shared expense. ChillarFlow tracks the running settlement balance between partners. View it on the Settle screen.',
      },
    ],
  },
  {
    id: 'joint',
    icon: '🤝',
    title: 'Joint pool & settlements',
    sub: 'How shared money works',
    articles: [
      {
        q: 'How does the joint pool work?',
        a: 'Each month, both partners contribute to the joint pool (e.g. ₹40,000 each). Shared expenses like rent and groceries are paid from the pool. The Dashboard shows pool balance, contributions, and net retention for the household.',
      },
      {
        q: 'When should I mark something for settlement vs paying from joint?',
        a: 'Pay from joint when you used the shared account/card. Mark for settlement when you used your personal card for something that should have come from joint (or for the other partner) — ChillarFlow then tracks who owes whom.',
      },
      {
        q: 'How do I clear a settlement?',
        a: 'On the Settle screen, tap "Settle now". The transaction is marked cleared and stays on record for audit. You can also bulk-settle by month.',
      },
    ],
  },
  {
    id: 'plans',
    icon: '✦',
    title: 'Plans & billing',
    sub: 'Free, Pro, and what each covers',
    articles: [
      {
        q: 'What do I get on the free plan?',
        a: 'Everything except unlimited AI parsing. You get 30 AI parses per month, unlimited number-wizard logging, full dashboard, partner tracking, goals, EMI tracker, and CSV export. Free forever.',
      },
      {
        q: 'How do I upgrade to Pro?',
        a: 'Email team@chillarflow.com with your household ID (found in Settings). We\'ll upgrade your account and confirm via email. Automated billing is coming soon.',
      },
      {
        q: 'Can I cancel anytime?',
        a: 'Yes. Pro is month-to-month. Cancel any time and you revert to the free plan at the end of the billing period. Your data stays intact.',
      },
    ],
  },
  {
    id: 'privacy',
    icon: '🔒',
    title: 'Privacy & data',
    sub: 'Where your data lives',
    articles: [
      {
        q: 'Where is my financial data stored?',
        a: "In a private Supabase database with row-level security. Each household's data is isolated. We never read, sell, or share data with third parties.",
      },
      {
        q: 'Does ChillarFlow read my WhatsApp messages?',
        a: 'Only the ones you send to the ChillarFlow bot. We do not have access to any other chats. Messages are processed by our AI parser, logged as transactions, and discarded.',
      },
      {
        q: 'How do I export or delete my data?',
        a: 'Settings → Data → Export CSV downloads everything. Settings → Data → Delete all data permanently removes it. Both are one-tap operations.',
      },
    ],
  },
  {
    id: 'trouble',
    icon: '🛠️',
    title: 'Troubleshooting',
    sub: "When things don't work",
    articles: [
      {
        q: "My WhatsApp message didn't log a transaction. What now?",
        a: 'Check three things: (1) Are you messaging the official ChillarFlow number from Settings → WhatsApp? (2) Did you include an amount? (3) Have you exceeded your free AI parse limit? If all three look fine, email team@chillarflow.com with the message text and timestamp.',
      },
      {
        q: 'AI parsed my expense wrong — wrong category or amount.',
        a: 'Tap the transaction on the Expenses screen and edit the field. The AI learns from corrections — repeated edits to the same kind of message will train it for your household.',
      },
      {
        q: "I can't see my partner's transactions.",
        a: "Confirm you're in Joint or Separate mode (not Solo) in Settings → Household. Then make sure your partner has logged in at least once with their own number. Their transactions appear on the Expenses screen tagged with their name.",
      },
    ],
  },
];

export default function HelpPage() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif', color: C.textW }}>

      {/* Nav */}
      <nav style={{ borderBottom: `1px solid ${C.border}`, padding: '0 24px', position: 'sticky', top: 0, zIndex: 50, background: C.bg }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 64 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <CoinMark size={36} color={C.amber} />
            <span style={{ fontWeight: 800, fontSize: 18, color: C.textW, letterSpacing: '-0.02em' }}>ChillarFlow</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            {[
              { href: '/pricing', label: 'Pricing' },
              { href: '/about', label: 'About' },
              { href: '/help', label: 'Help' },
            ].map((l) => (
              <Link key={l.href} href={l.href} style={{ color: l.href === '/help' ? C.textW : C.text2, fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
                {l.label}
              </Link>
            ))}
            <Link href="/app" style={{ background: C.amber, color: C.bg, padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '80px 24px 40px', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: C.amber, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          Help centre
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 48px)', fontWeight: 800, margin: '0 0 20px', color: C.textW, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          How can we help?
        </h1>
        <p style={{ color: C.text2, fontSize: 17, margin: '0 auto 36px', maxWidth: 520, lineHeight: 1.6 }}>
          Answers to the questions we hear most. Can't find what you need?{' '}
          <Link href="/about" style={{ color: C.amber }}>Email us</Link> — we reply within 24 hours.
        </p>

        {/* Search bar (visual) */}
        <div style={{
          maxWidth: 520, margin: '0 auto',
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 12, padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
          fontSize: 15, color: C.muted,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.text2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <span>Search articles — settlement, WhatsApp, Pro plan…</span>
        </div>
      </section>

      {/* Category grid */}
      <section style={{ padding: '40px 24px 60px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {categories.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 14, padding: '24px 22px',
                display: 'flex', flexDirection: 'column', gap: 12,
                cursor: 'pointer', textDecoration: 'none',
                transition: 'border-color .15s, transform .15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = C.amber + '66';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = C.border;
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: 28 }}>{c.icon}</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.textW, marginBottom: 4 }}>{c.title}</div>
                <div style={{ fontSize: 13, color: C.text2 }}>{c.sub}</div>
              </div>
              <div style={{ fontSize: 12, color: C.amber, fontWeight: 600, marginTop: 4 }}>
                {c.articles.length} article{c.articles.length === 1 ? '' : 's'} →
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Articles per category — accordion */}
      {categories.map((c) => (
        <section key={c.id} id={c.id} style={{ padding: '40px 24px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
              <div style={{ fontSize: 32 }}>{c.icon}</div>
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: C.textW, letterSpacing: '-0.02em' }}>{c.title}</h2>
                <div style={{ fontSize: 13, color: C.text2, marginTop: 4 }}>{c.sub}</div>
              </div>
            </div>
            <div>
              {c.articles.map((article, ai) => {
                const articleId = `${c.id}-${ai}`;
                const isOpen = open === articleId;
                return (
                  <div key={ai} style={{ borderTop: `1px solid ${C.border}` }}>
                    <button
                      onClick={() => setOpen(isOpen ? null : articleId)}
                      style={{
                        width: '100%', textAlign: 'left',
                        background: 'transparent', border: 'none',
                        padding: '20px 0',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 600, color: C.textW, lineHeight: 1.5 }}>{article.q}</span>
                      <span style={{
                        flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                        background: isOpen ? C.amber + '22' : 'transparent',
                        color: isOpen ? C.amber : C.text2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .15s',
                        transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                        fontSize: 18, lineHeight: 1, fontWeight: 600,
                      }}>+</span>
                    </button>
                    {isOpen && (
                      <div style={{ fontSize: 14, color: C.text2, lineHeight: 1.7, paddingBottom: 24, paddingRight: 40 }}>
                        {article.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      {/* Still need help CTA */}
      <section style={{ padding: '80px 24px 100px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
        <div style={{ maxWidth: 540, margin: '0 auto' }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, color: C.textW, letterSpacing: '-0.02em', marginBottom: 12 }}>
            Still need help?
          </h2>
          <p style={{ color: C.text2, fontSize: 15, margin: '0 0 32px', lineHeight: 1.6 }}>
            We're a small team. Email us with your household ID (Settings → About) and we'll get back personally within 24 hours.
          </p>
          <a
            href="mailto:team@chillarflow.com"
            style={{
              display: 'inline-block',
              background: C.amber, color: C.bg,
              padding: '14px 32px', borderRadius: 10,
              fontWeight: 700, fontSize: 15,
            }}
          >
            Email team@chillarflow.com
          </a>
          <div style={{ marginTop: 18, fontSize: 13, color: C.muted }}>
            For Pro upgrades, billing, or partnerships
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '40px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ color: C.muted, fontSize: 13 }}>© 2026 ChillarFlow. Made with ♥ in India.</div>
          <div style={{ display: 'flex', gap: 24 }}>
            {[
              { href: '/pricing', label: 'Pricing' },
              { href: '/about', label: 'About' },
              { href: '/help', label: 'Help' },
              { href: 'mailto:team@chillarflow.com', label: 'Contact' },
            ].map((l) => (
              <Link key={l.href} href={l.href} style={{ color: C.muted, fontSize: 13, textDecoration: 'none' }}>{l.label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
