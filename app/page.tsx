// app/page.tsx — ChillarFlow marketing landing page
// Place this at the ROOT of your Next.js project (replacing the current page.tsx)
// The app moves to /app route — see routing note at the bottom.

import Link from 'next/link';

export const metadata = {
  title: 'ChillarFlow — Track every rupee. Effortlessly.',
  description: 'ChillarFlow helps couples and solo entrepreneurs track household finances through WhatsApp and Telegram. No spreadsheets. Just send a message.',
};

const C = {
  bg:      '#0b0f1a',
  surface: '#131928',
  border:  '#1e2840',
  amber:   '#f59e0b',
  teal:    '#06b6d4',
  textW:   '#e8eeff',
  text2:   '#6b82a8',
  muted:   '#3d4f6e',
  green:   '#10b981',
};

const navLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/about',   label: 'About'   },
  { href: '/help',    label: 'Help'    },
];

const features = [
  {
    icon: '💬',
    title: 'Log from WhatsApp',
    desc: 'Send "450 Zomato" from WhatsApp. ChillarFlow categorises, records, and confirms — in seconds.',
  },
  {
    icon: '🤖',
    title: 'AI-powered parsing',
    desc: 'Gemini AI understands natural language. "Got grocery for 1200, petrol 400, to settle" logs three transactions in one message.',
  },
  {
    icon: '📊',
    title: 'Real financial clarity',
    desc: 'See exactly how much you earned, spent, saved, and retained. The retention velocity dashboard shows your true financial health.',
  },
  {
    icon: '🏠',
    title: 'Built for Indian households',
    desc: 'Joint pool, partner splits, settlement tracking, SIP investments — every feature maps to how Indian couples actually manage money.',
  },
  {
    icon: '🤝',
    title: 'Both partners, one view',
    desc: 'Each partner logs independently. The dashboard shows combined income, individual spending, and joint expenses in one place.',
  },
  {
    icon: '🔒',
    title: 'Private by default',
    desc: 'Your data lives in your own Supabase instance. We never sell data, show ads, or share anything with third parties.',
  },
];

const modes = [
  {
    name: 'ChillarFlow Home',
    tag: 'For couples',
    color: C.amber,
    features: ['Joint pool tracking', 'Partner activity breakdown', 'Settlement dashboard', 'Wealth retention velocity', 'Both Telegram & WhatsApp'],
  },
  {
    name: 'ChillarFlow Hustle',
    tag: 'For solopreneurs',
    color: C.teal,
    features: ['Personal + business split', 'Cash flow visualiser', 'Custom business categories', 'WhatsApp expense logging', 'Margin tracking'],
    badge: 'Coming soon',
  },
];

export default function HomePage() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif', color: C.textW }}>

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav style={{ borderBottom: `1px solid ${C.border}`, padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 64 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 36, height: 36, background: C.amber, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: C.bg }}>
              C
            </div>
            <span style={{ fontWeight: 800, fontSize: 18, color: C.textW }}>ChillarFlow</span>
          </Link>

          <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} style={{ color: C.text2, fontSize: 14, textDecoration: 'none', fontWeight: 500 }}>
                {l.label}
              </Link>
            ))}
            <Link href="/app" style={{ background: C.amber, color: C.bg, padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section style={{ padding: '100px 24px 80px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{ display: 'inline-block', background: `${C.amber}18`, border: `1px solid ${C.amber}44`, borderRadius: 99, padding: '6px 18px', fontSize: 13, color: C.amber, fontWeight: 600, marginBottom: 28 }}>
            Now with WhatsApp expense logging
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 24px', letterSpacing: '-0.02em' }}>
            Track every rupee.
            <br />
            <span style={{ color: C.amber }}>Effortlessly.</span>
          </h1>
          <p style={{ fontSize: 18, color: C.text2, lineHeight: 1.7, margin: '0 0 40px', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
            ChillarFlow turns a WhatsApp message into a tracked, categorised, settled expense — in seconds.
            Built for Indian couples and solopreneurs who are done with spreadsheets.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/app/auth" style={{ background: C.amber, color: C.bg, padding: '14px 32px', borderRadius: 10, fontWeight: 700, fontSize: 16, textDecoration: 'none' }}>
              Start free — no card needed
            </Link>
            <Link href="/pricing" style={{ background: 'transparent', color: C.textW, padding: '14px 32px', borderRadius: 10, fontWeight: 600, fontSize: 16, textDecoration: 'none', border: `1px solid ${C.border}` }}>
              See pricing
            </Link>
          </div>
          <p style={{ color: C.muted, fontSize: 13, marginTop: 16 }}>30 AI parses free every month. No credit card.</p>
        </div>
      </section>

      {/* ── WhatsApp demo ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '0 24px 100px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', background: '#075e54', borderRadius: 16, overflow: 'hidden' }}>
          {/* Chat header */}
          <div style={{ background: '#128c7e', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, background: C.amber, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: C.bg }}>C</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>ChillarFlow</div>
              <div style={{ color: '#d1fae5', fontSize: 12 }}>online</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 10, background: '#e5ddd5' }}>
            {[
              { from: 'user', text: '450 Zomato, 1200 Big Bazaar to settle, 400 Ola' },
              { from: 'bot',  text: 'Transaction logged!\n\nAmount: Rs.450\nCategory: Online Food Orders\nAccount: Rahul\nSettlement: Personal\nNote: Zomato' },
              { from: 'bot',  text: 'Transaction logged!\n\nAmount: Rs.1200\nCategory: Groceries\nAccount: Rahul\nSettlement: Joint Reimbursement\nNote: Big Bazaar' },
              { from: 'bot',  text: 'Transaction logged!\n\nAmount: Rs.400\nCategory: Cab Services\nAccount: Rahul\nSettlement: Personal\nNote: Ola' },
            ].map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  background: m.from === 'user' ? '#dcf8c6' : '#fff',
                  color: '#111',
                  padding: '10px 14px',
                  borderRadius: m.from === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  maxWidth: '80%',
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                }}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, marginTop: 16 }}>
          One message. Three transactions. AI does the rest.
        </p>
      </section>

      {/* ── Products ──────────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 24px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 800, marginBottom: 12 }}>Two products. One platform.</h2>
          <p style={{ textAlign: 'center', color: C.text2, fontSize: 16, marginBottom: 60 }}>Same powerful engine. Tuned for your life.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
            {modes.map((m) => (
              <div key={m.name} style={{ background: C.surface, border: `1px solid ${m.color}44`, borderRadius: 16, padding: '32px 28px', position: 'relative' }}>
                {m.badge && (
                  <div style={{ position: 'absolute', top: 20, right: 20, background: `${C.teal}22`, color: C.teal, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99 }}>
                    {m.badge}
                  </div>
                )}
                <div style={{ fontSize: 13, color: m.color, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{m.tag}</div>
                <h3 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 24px', color: m.color }}>{m.name}</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {m.features.map((f) => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: C.text2 }}>
                      <span style={{ color: m.color, flexShrink: 0 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '80px 24px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 800, marginBottom: 60 }}>Everything you need. Nothing you don't.</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {features.map((f) => (
              <div key={f.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px 22px' }}>
                <div style={{ fontSize: 32, marginBottom: 14 }}>{f.icon}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px' }}>{f.title}</h3>
                <p style={{ color: C.text2, fontSize: 14, lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────────── */}
      <section style={{ padding: '100px 24px', textAlign: 'center', borderTop: `1px solid ${C.border}` }}>
        <h2 style={{ fontSize: 40, fontWeight: 800, marginBottom: 16 }}>Ready to see where your money goes?</h2>
        <p style={{ color: C.text2, fontSize: 16, marginBottom: 40 }}>Free forever for basic usage. Upgrade when you need more.</p>
        <Link href="/app/auth" style={{ background: C.amber, color: C.bg, padding: '16px 40px', borderRadius: 12, fontWeight: 700, fontSize: 17, textDecoration: 'none' }}>
          Create your household — it's free
        </Link>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '40px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ color: C.muted, fontSize: 13 }}>© 2026 ChillarFlow. Made with ♥ in India.</div>
          <div style={{ display: 'flex', gap: 24 }}>
            {[
              { href: '/pricing', label: 'Pricing' },
              { href: '/about',   label: 'About'   },
              { href: '/help',    label: 'Help'     },
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
