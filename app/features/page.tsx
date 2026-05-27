// app/features/page.tsx — ChillarFlow core features directory hub
import Link from 'next/link';
import { CoinMark } from '@/components/CoinMark';

export const metadata = {
  title: 'Platform Capabilities — ChillarFlow',
  description: 'Explore how ChillarFlow automates personal log entry tracking, catches lifestyle leakages, and maps to shared household goals.',
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


const featurePillars = [
  {
    icon: '💬',
    title: 'Chat App Logging',
    sub: 'WhatsApp & Telegram Automation',
    desc: 'Text your household bot like you are texting your partner. No sheets to balance, no custom apps to open. Records process instantly.',
    href: '/features/tracking',
    colorClass: 't-accent',
  },
  {
    icon: '📊',
    title: 'Leakage Budgeting',
    desc: 'Plug unallocated drains and subscription spikes through real-time retention calculations tailored for active Indian households.',
    href: '/features/budgeting',
    colorClass: 't-green',
  },
  {
    icon: '🤝',
    title: 'Household Planning',
    desc: 'Manage peer-to-peer settlement lines, shared pool milestones, and long-term joint equity tracking smoothly without friction.',
    href: '/features/planning',
    colorClass: 't-blue',
  },
];

export default function FeaturesHubPage() {
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
            <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
              <Link href="/features" className="t-body" style={{ textDecoration: 'none', fontWeight: 600, color: 'var(--textW)' }}>
                Features
              </Link>
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} className="t-body" style={{ textDecoration: 'none', fontWeight: 500 }}>
                  {l.label}
                </Link>
              ))}
            </div>
            <Link href="/app" className="cf-btn cf-btn-primary cf-btn-sm" style={{ fontWeight: 800 }}>Sign In</Link>
            <input type="checkbox" id="menu-toggle" style={{ display: 'none' }} />
            <label htmlFor="menu-toggle" className="mobile-menu-trigger">
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
            </label>
            <label htmlFor="menu-toggle" className="drawer-overlay"></label>
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
                      <Link key={sub.href} href={sub.href} className="t-body" style={{ textDecoration: 'none', fontSize: 14 }}>{sub.label}</Link>
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

      {/* ── Main Hub Hero ─────────────────────────────────────────────────── */}
      <section className="cf-content text-center animate-fade-up" style={{ padding: '80px 16px 40px' }}>
        <h1 className="t-display" style={{ marginBottom: 20, lineHeight: 1.1 }}>
          One plain message.<br />Total ecosystem control.
        </h1>
        <p className="t-body" style={{ fontSize: 18, maxWidth: 560, margin: '0 auto' }}>
          Explore the three functional pillars designed to eliminate spreadsheet mechanics and align financial operations cleanly.
        </p>
      </section>

      {/* ── Feature Pillars Grid Display ────────────────────────────────────── */}
      <section style={{ padding: '40px 16px 100px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {featurePillars.map((pillar) => (
            <Link key={pillar.title} href={pillar.href} className="cf-card" style={{ padding: '40px 32px', display: 'flex', flexDirection: 'column', textDecoration: 'none', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 40, marginBottom: 20 }}>{pillar.icon}</div>
              <h2 className="t-h1" style={{ marginBottom: 12 }}>{pillar.title}</h2>
              <p className="t-body" style={{ flex: 1, marginBottom: 32, lineHeight: 1.6 }}>{pillar.desc}</p>
              <span className={pillar.colorClass} style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                Explore capability matrix →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Global Bottom CTA Panel ─────────────────────────────────────────── */}
      <section className="text-center" style={{ padding: '100px 24px', borderTop: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--bg) 0%, var(--surface) 100%)' }}>
        <div className="cf-content" style={{ maxWidth: 560 }}>
          <h2 className="t-display" style={{ fontSize: 36, marginBottom: 16 }}>Ready for total asset control?</h2>
          <p className="t-body" style={{ marginBottom: 36 }}>Deploy your dedicated secure household ledger database framework in under 120 seconds.</p>
          <Link href="/app" className="cf-btn cf-btn-primary cf-btn-lg cf-btn-full" style={{ maxWidth: '340px', fontWeight: 800, boxShadow: 'var(--shadow-accent)' }}>
            Claim Your Secure Vault Setup
          </Link>
        </div>
      </section>
    </div>
  );
}
