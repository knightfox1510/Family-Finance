
// app/pricing/page.tsx

import Link from 'next/link';

export const metadata = {
  title: 'Pricing — ChillarFlow',
  description: 'Free for individuals. Affordable Pro for power users. No hidden fees.',
};

const C = {
  bg: '#0b0f1a', surface: '#131928', border: '#1e2840',
  amber: '#f59e0b', teal: '#06b6d4', textW: '#e8eeff',
  text2: '#6b82a8', muted: '#3d4f6e', green: '#10b981', red: '#ef4444',
};

const plans = [
  {
    name: 'Free',
    price: '₹0',
    period: 'forever',
    color: C.teal,
    features: [
      '30 AI expense parses per month',
      'WhatsApp & Telegram logging',
      'Interactive number wizard (always free)',
      'Full dashboard & analytics',
      'Partner activity tracking',
      'Settlement dashboard',
      'Goals & EMI tracker',
      'Data export (CSV)',
      'Up to 2 partners',
    ],
    notIncluded: [
      'Unlimited AI parses',
      'Priority support',
    ],
    cta: 'Start free',
    ctaHref: '/app/auth',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '₹299',
    period: 'per month',
    color: C.amber,
    features: [
      'Unlimited AI expense parses',
      'WhatsApp & Telegram logging',
      'Interactive number wizard',
      'Full dashboard & analytics',
      'Partner activity tracking',
      'Settlement dashboard',
      'Goals & EMI tracker',
      'Data export (CSV)',
      'Up to 2 partners',
      'Priority email support',
      'Early access to new features',
    ],
    notIncluded: [],
    cta: 'Upgrade to Pro',
    ctaHref: 'mailto:team@chillarflow.com?subject=Pro Upgrade Request',
    highlight: true,
  },
];

const faqs = [
  {
    q: 'What counts as an AI parse?',
    a: 'Any natural language message processed by our AI — like "450 Zomato to settle" or "grocery 1200, petrol 400". The number wizard (sending just a number like "500") is always free and doesn\'t count toward your limit.',
  },
  {
    q: 'What happens when I hit the free limit?',
    a: 'You can still log expenses using the number wizard (send any amount like "500" and follow the prompts). Only natural language parsing is paused until the next month or until you upgrade.',
  },
  {
    q: 'How do I upgrade to Pro?',
    a: 'Email us at team@chillarflow.com with your household ID (found in Settings). We\'ll upgrade your account and confirm via email. We\'re working on automated payment — coming soon.',
  },
  {
    q: 'Does my partner need a separate subscription?',
    a: 'No. One Pro subscription covers your entire household — both partners get unlimited AI parses.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Pro is month-to-month. Cancel any time and you\'ll revert to the free plan at the end of the billing period.',
  },
  {
    q: 'Is my financial data safe?',
    a: 'Your data is stored in a private Supabase database. We never sell data, show ads, or share anything with third parties. You can export and delete your data at any time from Settings.',
  },
];

export default function PricingPage() {
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

      {/* Hero */}
      <section style={{ padding: '80px 24px 60px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 48, fontWeight: 800, margin: '0 0 16px' }}>Simple, honest pricing</h1>
        <p style={{ color: C.text2, fontSize: 18, margin: 0 }}>Free for casual use. Pro for power users. No surprises.</p>
      </section>

      {/* Plans */}
      <section style={{ padding: '0 24px 80px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          {plans.map((p) => (
            <div key={p.name} style={{
              background: p.highlight ? `${C.amber}10` : C.surface,
              border: `2px solid ${p.highlight ? C.amber : C.border}`,
              borderRadius: 16, padding: '32px 28px',
              position: 'relative',
            }}>
              {p.highlight && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: C.amber, color: C.bg, fontSize: 11, fontWeight: 800, padding: '4px 16px', borderRadius: 99 }}>
                  MOST POPULAR
                </div>
              )}
              <div style={{ color: p.color, fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 48, fontWeight: 800 }}>{p.price}</span>
                <span style={{ color: C.text2, fontSize: 14 }}>/ {p.period}</span>
              </div>
              <div style={{ height: 1, background: C.border, margin: '24px 0' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
                {p.features.map((f) => (
                  <div key={f} style={{ display: 'flex', gap: 10, fontSize: 14, color: C.text2 }}>
                    <span style={{ color: C.green, flexShrink: 0 }}>✓</span> {f}
                  </div>
                ))}
                {p.notIncluded.map((f) => (
                  <div key={f} style={{ display: 'flex', gap: 10, fontSize: 14, color: C.muted }}>
                    <span style={{ flexShrink: 0 }}>✗</span> {f}
                  </div>
                ))}
              </div>
              <Link href={p.ctaHref} style={{
                display: 'block', textAlign: 'center',
                background: p.highlight ? C.amber : 'transparent',
                color: p.highlight ? C.bg : C.textW,
                border: `1px solid ${p.highlight ? C.amber : C.border}`,
                padding: '13px', borderRadius: 10, fontWeight: 700, fontSize: 15, textDecoration: 'none',
              }}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, marginTop: 24 }}>
          All prices in INR. GST extra if applicable.
        </p>
      </section>

      {/* FAQ */}
      <section style={{ padding: '60px 24px 100px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <h2 style={{ fontSize: 32, fontWeight: 800, textAlign: 'center', marginBottom: 48 }}>Frequently asked questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {faqs.map((f, i) => (
              <div key={i} style={{ borderTop: `1px solid ${C.border}`, padding: '24px 0' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{f.q}</div>
                <div style={{ color: C.text2, fontSize: 14, lineHeight: 1.7 }}>{f.a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ color: C.muted, fontSize: 13 }}>
          Questions? Email us at{' '}
          <a href="mailto:team@chillarflow.com" style={{ color: C.amber }}>team@chillarflow.com</a>
        </div>
      </footer>
    </div>
  );
}
