// app/pricing/page.tsx — ChillarFlow premium marketing pricing platform
import Link from 'next/link';
import { CoinMark } from '@/components/marketing/CoinMark';

export const metadata = {
  title: 'Pricing — ChillarFlow',
  description: 'Free for individuals. Affordable Pro for power users. No hidden fees.',
};

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


const plans = [
  {
    name: 'Free',
    price: '₹0',
    period: 'forever',
    accentClass: 't-green',
    borderStyle: '1px solid var(--border)',
    backgroundStyle: 'var(--surface)',
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
    cta: 'Start tracking free',
    ctaHref: '/app',
    btnClass: 'cf-btn-ghost',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '₹299',
    period: 'per month',
    accentClass: 't-accent',
    borderStyle: '2px solid var(--accent)',
    backgroundStyle: 'var(--accent-bg)',
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
    cta: 'Upgrade to Pro Account',
    ctaHref: 'mailto:team@chillarflow.com?subject=Pro Upgrade Request',
    btnClass: 'cf-btn-primary',
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
    a: 'You can still log expenses using the number wizard (send any amount like "500" and follow the step-by-step chat prompts). Only natural language parsing is paused until the next billing cycle resets or until you upgrade.',
  },
  {
    q: 'How do I upgrade to Pro?',
    a: 'Email us at team@chillarflow.com with your unique household ID (found in Settings). We\'ll upgrade your account parameters manually and confirm via email. Automated billing pipelines are arriving soon.',
  },
  {
    q: 'Does my partner need a separate subscription?',
    a: 'No. One Pro subscription completely covers your entire household ledger vault — both partners get unlimited AI parses simultaneously.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Pro is completely flexible month-to-month. Cancel at any point and your profile reverts smoothly to the free plan tier at the end of the current cycle. Your logged history remains fully intact.',
  },
  {
    q: 'Is my financial data safe?',
    a: 'Your logs live completely isolated inside a private, sandboxed, encrypted database vault. We never look at your data, show ads, or track transaction origins for commercial monetization. You retain full export and destruction controls.',
  },
];

export default function PricingPage() {
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
            {/* Desktop links layout structure */}
            <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
              <Link href="/features" className="t-body" style={{ textDecoration: 'none', fontWeight: 500 }}>
                Features
              </Link>
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} className="t-body" style={{ textDecoration: 'none', fontWeight: 500, color: l.href === '/pricing' ? 'var(--textW)' : 'var(--text2)' }}>
                  {l.label}
                </Link>
              ))}
            </div>

            <Link href="/app" className="cf-btn cf-btn-primary cf-btn-sm" style={{ fontWeight: 800 }}>
              Sign In
            </Link>

            {/* Core Interaction Functional Pipeline Input Switch */}
            <input type="checkbox" id="menu-toggle" style={{ display: 'none' }} />
            
            <label htmlFor="menu-toggle" className="mobile-menu-trigger">
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
            </label>

            <label htmlFor="menu-toggle" className="drawer-overlay"></label>

            {/* Sliding Mobile System Control Drawer Container Box */}
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

      {/* ── Pricing Hero Summary Section ───────────────────────────────────── */}
      <section className="cf-content text-center animate-fade-up" style={{ padding: '80px 16px 48px' }}>
        <h1 className="t-display" style={{ marginBottom: 16, lineHeight: 1.1 }}>
          Simple, honest metrics.
        </h1>
        <p className="t-body" style={{ fontSize: 18, margin: 0, color: 'var(--text2)' }}>
          Free for casual tracking. High retention velocity tools for power users. No hidden surprises.
        </p>
      </section>

      {/* ── Plans Card Section Matrix ────────────────────────────────────────── */}
      <section style={{ padding: '0 16px 80px' }}>
        <div style={{ maxWidth: 840, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28 }}>
          {plans.map((p) => (
            <div key={p.name} className="cf-card" style={{
              background: p.backgroundStyle,
              border: p.borderStyle,
              padding: '40px 32px',
              position: 'relative',
              overflow: 'visible', /* ⚡ CRITICAL OVERRIDE: Stops internal hidden boundary checks from clipping absolute overlay children */
              marginTop: p.highlight ? '12px' : '0px', /* Adds explicit balance tracking spacing to clear card layout heights */
            }}>
              
              {/* ⚡ ABSOLUTE UNCLIPPED PILL BADGE COMPONENT */}
              {p.highlight && (
                <div style={{ 
                  position: 'absolute', 
                  top: '-12px', 
                  left: '50%', 
                  transform: 'translateX(-50%)', 
                  background: 'var(--accent)', 
                  color: '#0a0a0a', 
                  fontSize: '10px', 
                  fontWeight: 900, 
                  letterSpacing: '0.06em',
                  padding: '4px 12px',
                  borderRadius: '99px',      /* Beautiful native system pill shape geometry */
                  boxShadow: 'var(--shadow-accent)',
                  display: 'flex',           
                  alignItems: 'center',
                  justifyContent: 'center',
                  whiteSpace: 'nowrap',      
                  width: 'auto',             
                  zIndex: 10,                /* Locks execution visibility stack priority above border layers */
                }}>
                  UNLIMITED OPERATIONS
                </div>
              )}
              
              <div className={`t-caption ${p.accentClass}`} style={{ marginBottom: 8, fontWeight: 700 }}>{p.name}</div>
              
              <div className="flex items-baseline" style={{ gap: 6, marginBottom: 8 }}>
                <span className="t-number" style={{ fontSize: 48 }}>{p.price}</span>
                <span className="t-body" style={{ fontSize: 14, color: 'var(--text2)' }}>/ {p.period}</span>
              </div>
              
              <div className="cf-divider" style={{ margin: '24px 0', opacity: 0.5 }} />
              
              <div className="flex flex-col" style={{ gap: 14, marginBottom: 40 }}>
                {p.features.map((f) => (
                  <div key={f} className="t-body flex items-start" style={{ gap: 10, fontSize: 14 }}>
                    <span className="t-green" style={{ fontWeight: 'bold', flexShrink: 0 }}>✓</span> <span>{f}</span>
                  </div>
                ))}
                {p.notIncluded.map((f) => (
                  <div key={f} className="t-body flex items-start" style={{ gap: 10, fontSize: 14, color: 'var(--text3)' }}>
                    <span style={{ flexShrink: 0, fontWeight: 'bold' }}>✗</span> <span>{f}</span>
                  </div>
                ))}
              </div>
              
              <Link href={p.ctaHref} className={`cf-btn ${p.btnClass} cf-btn-full`} style={{ fontWeight: 800 }}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
        <p className="t-small t-muted text-center" style={{ marginTop: 28, letterSpacing: '0.01em' }}>
          All prices processed in INR. Cloud pipeline infrastructure configurations apply globally.
        </p>
      </section>

      {/* ── Frequently Asked Questions Accordion Grid ─────────────────────── */}
      <section style={{ padding: '80px 16px 100px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 className="t-h1 text-center" style={{ fontSize: 32, marginBottom: 48 }}>Frequently asked questions</h2>
          
          <div className="flex flex-col">
            {faqs.map((f, i) => (
              <div key={i} style={{ borderTop: '1px solid var(--border)', padding: '24px 0' }}>
                <h3 className="t-h2" style={{ marginBottom: 12, fontSize: 16, fontWeight: 700, color: 'var(--textW)' }}>{f.q}</h3>
                <p className="t-body" style={{ fontSize: 14, lineHeight: 1.65, margin: 0, color: 'var(--text2)' }}>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Operational Contact Footer ────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '40px 24px', background: 'var(--bg)', textAlign: 'center' }}>
        <div className="t-small t-muted" style={{ fontSize: 13.5 }}>
          Have structural questions? Reach secure support anytime at{' '}
          <a href="mailto:team@chillarflow.com" className="t-accent" style={{ textDecoration: 'none', fontWeight: 600 }}>team@chillarflow.com</a>
        </div>
      </footer>
    </div>
  );
}
