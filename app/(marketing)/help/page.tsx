// app/help/page.tsx — ChillarFlow premium help center platform
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CoinMark } from '@/components/CoinMark';

// 🎯 Grouped strictly by specific platform toolsets
const featureSubLinks = [
  { href: '/features/tracking', label: 'Chat Log Automation' }, /* ⚡ Was WhatsApp Tracking */
  { href: '/features/budgeting', label: 'Retention Metrics' },    /* ⚡ Was Leakage Budgeting */
  { href: '/features/planning', label: 'Household Settlement' }, /* ⚡ Was Household Planning */
  { href: '/shortcuts',         label: 'Power User Guide' }, 
];

// 🧭 The high-level main directories remain clean and distinct
const navLinks = [
  { href: '/pricing',  label: 'Pricing' },
  { href: '/reviews',  label: 'Reviews' }, 
  { href: '/about',    label: 'About'   },
  { href: '/help',     label: 'Help'    },
];

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
        a: 'Send a message in plain text format to your ChillarFlow bot: "450 Zomato", "grocery 1200 to settle", or "got petrol for 400, dinner 800, both joint". Our AI parses amount, category, and settlement automatically.',
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
        a: "Inside an isolated, completely separate encrypted cloud ledger vault. Each household's data sandbox is locked behind tight programmatic parameters. We never read, sell, or share anything with third parties.",
      },
      {
        q: 'Does ChillarFlow read my WhatsApp messages?',
        a: 'Only the ones you send explicitly to the ChillarFlow bot connection. We do not have visual or program access to any other personal chats. Records are securely parsed, converted into a transaction log statement entry, and dropped.',
      },
      {
        q: 'How do I export or delete my data?',
        a: 'Settings → Data → Export CSV downloads everything. Settings → Data → Delete all data permanently removes it from our cloud nodes. Both are one-tap structural functions.',
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
        a: 'Tap the transaction on the Expenses screen and edit the field. The AI learns from corrections — repeated edits to the same kind of message will train it for your household patterns.',
      },
      {
        q: "I can't see my partner's transactions.",
        a: "Confirm you're in Joint or Separate mode (not Solo) in Settings → Household. Then make sure your partner has logged in at least once with their own configuration number. Shared metrics sync on the dashboard layout screen.",
      },
    ],
  },
];

export default function HelpPage() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="cf-page animate-fade-in" style={{ paddingBottom: 0 }}>

      {/* ── Nav Header ──────────────────────────────────────────────────────── */}
      <nav className="cf-header" style={{ position: 'relative', height: 64, padding: '0 24px', zIndex: 1100 }}>
        <div className="w-full flex justify-between items-center" style={{ maxWidth: 1100, margin: '0 auto' }}>
          
          <Link href="/" className="flex items-center" style={{ gap: 10, textDecoration: 'none' }}>
            <CoinMark size={36} color="var(--accent)" />
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--textW)', letterSpacing: '-0.02em' }}>ChillarFlow</span>
          </Link>

          <div className="flex items-center" style={{ gap: 16 }}>
            {/* Desktop link directory layout */}
            <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
              <Link href="/features" className="t-body" style={{ textDecoration: 'none', fontWeight: 500 }}>
                Features
              </Link>
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} className="t-body" style={{ textDecoration: 'none', fontWeight: 500, color: l.href === '/help' ? 'var(--textW)' : 'var(--text2)' }}>
                  {l.label}
                </Link>
              ))}
            </div>

            <Link href="/app" className="cf-btn cf-btn-primary cf-btn-sm" style={{ fontWeight: 800 }}>
              Sign In
            </Link>

            {/* Checkbox state logic driver switcher */}
            <input type="checkbox" id="menu-toggle" style={{ display: 'none' }} />
            
            <label htmlFor="menu-toggle" className="mobile-menu-trigger">
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
            </label>

            <label htmlFor="menu-toggle" className="drawer-overlay"></label>

            {/* Mobile panel drawer slider element box */}
            <div className="mobile-drawer">
              <div className="flex justify-between items-center" style={{ marginBottom: 28, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--textW)', letterSpacing: '-0.03em' }}>MENU</span>
                <label htmlFor="menu-toggle" style={{ color: 'var(--text3)', fontSize: 32, cursor: 'pointer', lineHeight: 0.5, padding: '4px' }}>&times;</label>
              </div>

              <div className="flex flex-col" style={{ gap: 24, flex: 1, overflowY: 'auto' }}>
                <div className="flex flex-col" style={{ gap: 12 }}>
                  <Link href="/features" className="t-h1" style={{ textDecoration: 'none' }}>Features</Link>
                  <div className="flex flex-col" style={{ gap: 14, paddingLeft: 12, borderLeft: '1.5px solid var(--border)' }}>
                    {featureSubLinks.map((sub) => (
                      <Link key={sub.href} href={sub.href} className="t-body" style={{ textDecoration: 'none', fontSize: 14 }}>
                        {sub.label}
                      </Link>
                    ))}
                  </div>
                </div>
                {navLinks.map((l) => (
                  <Link key={l.href} href={l.href} className="t-h1" style={{ textDecoration: 'none' }}>{l.label}</Link>
                ))}
              </div>

              <div className="flex flex-col" style={{ gap: 12, paddingTop: 16, marginTop: 'auto' }}>
                <Link href="/app" className="cf-btn cf-btn-primary cf-btn-full" style={{ fontWeight: 800 }}>Create Account (Sign Up)</Link>
                <Link href="/app" className="cf-btn cf-btn-ghost cf-btn-full" style={{ fontWeight: 600, border: '1px solid var(--border2)' }}>Sign In</Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* ── Help Search Hero ────────────────────────────────────────────────── */}
      <section className="cf-content text-center animate-fade-up" style={{ padding: '80px 16px 40px' }}>
        <div className="t-caption t-accent" style={{ marginBottom: 16, fontWeight: 700 }}>
          Help centre directory
        </div>
        <h1 className="t-display" style={{ marginBottom: 20, lineHeight: 1.1 }}>
          How can we help?
        </h1>
        <p className="t-body" style={{ fontSize: 17, margin: '0 auto 36px', maxWidth: 520 }}>
          Answers to operational questions. Can't find what you need?{' '}
          <Link href="mailto:team@chillarflow.com" className="t-accent" style={{ textDecoration: 'none', fontWeight: 600 }}>Email us</Link> — we reply within 24 hours.
        </p>

        {/* Visual search capsule structured to use token design utilities */}
        <div className="cf-input flex items-center" style={{ maxWidth: 520, margin: '0 auto', gap: 12, cursor: 'text', border: '1px solid var(--border)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <span style={{ color: 'var(--text3)', fontSize: 14, fontWeight: 400 }}>Search articles — settlement, WhatsApp, tracking updates…</span>
        </div>
      </section>

      {/* ── Category Matrix Directory Grid ──────────────────────────────────── */}
      <section style={{ padding: '40px 16px 60px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {categories.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="cf-card"
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 14,
                textDecoration: 'none'
              }}
            >
              <div style={{ fontSize: 32 }}>{c.icon}</div>
              <div style={{ flex: 1 }}>
                <div className="t-h2" style={{ marginBottom: 6 }}>{c.title}</div>
                <div className="t-body" style={{ fontSize: 13, lineHeight: 1.4 }}>{c.sub}</div>
              </div>
              <div className="t-accent" style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
                {c.articles.length} article{c.articles.length === 1 ? '' : 's'} →
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── Category Accordion Streams ──────────────────────────────────────── */}
      {categories.map((c) => (
        <section key={c.id} id={c.id} style={{ padding: '60px 16px', borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            
            <div className="flex items-center" style={{ gap: 16, marginBottom: 32 }}>
              <div style={{ fontSize: 36 }}>{c.icon}</div>
              <div>
                <h2 className="t-h1" style={{ fontSize: 26, margin: 0 }}>{c.title}</h2>
                <div className="t-body" style={{ fontSize: 13, marginTop: 4 }}>{c.sub}</div>
              </div>
            </div>

            <div className="flex flex-col" style={{ borderBottom: '1px solid var(--border)' }}>
              {c.articles.map((article, ai) => {
                const articleId = `${c.id}-${ai}`;
                const isOpen = open === articleId;
                return (
                  <div key={ai} style={{ borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={() => setOpen(isOpen ? null : articleId)}
                      style={{
                        width: '100%', textAlign: 'left', background: 'transparent', border: 'none',
                        padding: '22px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        gap: 16, cursor: 'pointer', fontFamily: 'inherit'
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--textW)', lineHeight: 1.4 }}>{article.q}</span>
                      <span style={{
                        flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                        background: isOpen ? 'var(--accent-bg)' : 'transparent',
                        color: isOpen ? 'var(--accent)' : 'var(--text3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .18s ease',
                        transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                        fontSize: 20, fontWeight: 500, lineHeight: 1
                      }}>+</span>
                    </button>
                    
                    {isOpen && (
                      <div className="t-body" style={{ fontSize: 14.5, lineHeight: 1.65, paddingBottom: 28, paddingRight: 24, color: 'var(--text1)' }}>
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

      {/* ── Contact Pipeline Bottom CTA ──────────────────────────────────────── */}
      <section className="text-center" style={{ padding: '100px 24px', borderTop: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--bg) 0%, var(--surface) 100%)' }}>
        <div className="cf-content" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 className="t-display" style={{ fontSize: 34, marginBottom: 12 }}>Still need help?</h2>
          <p className="t-body" style={{ fontSize: 15, marginBottom: 36, lineHeight: 1.6 }}>
            We're a dedicated, lean team. Email us with your household ID (Settings → About) and we'll resolve your query personally within 24 hours.
          </p>
          <a
            href="mailto:team@chillarflow.com"
            className="cf-btn cf-btn-primary cf-btn-lg cf-btn-full"
            style={{ maxWidth: '340px', fontWeight: 800, boxShadow: 'var(--shadow-accent)' }}
          >
            Email team@chillarflow.com
          </a>
          <div className="t-small t-muted" style={{ marginTop: 16, letterSpacing: '0.02em' }}>
            For Pro upgrades, billing sandboxes, or account migrations
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '40px 24px', background: 'var(--bg)' }}>
        <div className="flex justify-between items-center" style={{ maxWidth: 1100, margin: '0 auto', flexWrap: 'wrap', gap: 20 }}>
          <div className="t-small t-muted">© 2026 ChillarFlow. Secure, isolated financial vaults. Made with ♥ in India.</div>
          <div className="flex" style={{ gap: 24, flexWrap: 'wrap' }}>
            {[
              { href: '/pricing', label: 'Pricing' },
              { href: '/about',   label: 'About' },
              { href: '/help',    label: 'Help' },
              { href: 'mailto:team@chillarflow.com', label: 'Contact Vault Operations' },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="t-small t-muted" style={{ textDecoration: 'none' }}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
