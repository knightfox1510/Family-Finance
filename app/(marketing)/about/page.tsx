// app/about/page.tsx — ChillarFlow premium marketing story platform
import Link from 'next/link';
import { CoinMark } from '@/components/marketing/CoinMark';

export const metadata = {
  title: 'About — ChillarFlow',
  description: 'Why we built ChillarFlow and who it\'s for.',
};

const featureSubLinks = [
  { href: '/features/tracking', label: 'WhatsApp Tracking' },
  { href: '/features/budgeting', label: 'Leakage Budgeting' },
  { href: '/features/planning', label: 'Household Planning' },
  { href: '/shortcuts',         label: 'Power User Guide' }, /* ⚡ Added */
];

const navLinks = [
  { href: '/features', label: 'Features' },
  { href: '/pricing',  label: 'Pricing' },
  { href: '/reviews',  label: 'Reviews' }, /* ⚡ Added */
  { href: '/about',    label: 'About'   },
  { href: '/help',     label: 'Help'    },
];

export default function AboutPage() {
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
            {/* Desktop link directory layout navigation bar */}
            <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
              <Link href="/features" className="t-body" style={{ textDecoration: 'none', fontWeight: 500 }}>
                Features
              </Link>
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} className="t-body" style={{ textDecoration: 'none', fontWeight: 500, color: l.href === '/about' ? 'var(--textW)' : 'var(--text2)' }}>
                  {l.label}
                </Link>
              ))}
            </div>

            <Link href="/app" className="cf-btn cf-btn-primary cf-btn-sm" style={{ fontWeight: 800 }}>
              Sign In
            </Link>

            {/* Checkbox state logic interaction driver switcher */}
            <input type="checkbox" id="menu-toggle" style={{ display: 'none' }} />
            
            <label htmlFor="menu-toggle" className="mobile-menu-trigger">
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
            </label>

            <label htmlFor="menu-toggle" className="drawer-overlay"></label>

            {/* Mobile directory sliding component box overlay container */}
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

      {/* ── Brand Narrative Content Block ───────────────────────────────────── */}
      <div className="cf-content animate-fade-up" style={{ maxWidth: 680, padding: '80px 16px 100px' }}>
        <div className="t-caption t-accent" style={{ marginBottom: 16, fontWeight: 700 }}>Our story</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(32px, 6vw, 42px)', marginBottom: 32, lineHeight: 1.2 }}>
          Built because we were tired of fighting about money.
        </h1>

        <div className="flex flex-col" style={{ gap: 24, fontSize: 16, lineHeight: 1.75 }}>
          <p className="t-body">
            Managing finances as a couple in India is weirdly hard. You have joint expenses — rent, groceries, electricity — and personal ones. You have SIPs running. Your parents need a transfer. Your partner booked a Swiggy order on their card.
          </p>
          <p className="t-body">
            Every app we tried was either too simple (basic expense trackers with no partner concept) or too complex (accounting tools built for businesses). None of them understood how Indian households actually work — joint pools, UPI transfers, EMIs, "to settle" arrangements.
          </p>
          <p className="t-body">
            So we built ChillarFlow. The core idea is simple: <strong style={{ color: 'var(--textW)' }}>your phone is already in your hand, and WhatsApp is already open</strong>. Logging an expense should be as easy as texting your partner about it.
          </p>

          {/* Inline feature mock block styled to match design token ecosystem */}
          <div className="cf-card-inset" style={{ border: '1px solid var(--border)', padding: '24px 22px', margin: '8px 0' }}>
            <div style={{ fontSize: 18, fontStyle: 'italic', fontWeight: 600, lineHeight: 1.5, color: 'var(--textW)', marginBottom: 12, letterSpacing: '-0.01em' }}>
              "450 Zomato, 1200 Big Bazaar to settle, 400 Ola"
            </div>
            <div className="t-body" style={{ fontSize: 14, lineHeight: 1.6 }}>
              Three transactions. One message. ChillarFlow logs, categorises, and marks the grocery for joint reimbursement — automatically.
            </div>
          </div>

          <p className="t-body">
            We're a small team. We use this app ourselves, every day. When something is broken or annoying, we feel it. That keeps us honest about what actually matters.
          </p>
          <p className="t-body">
            ChillarFlow is free to start. We charge a small monthly fee for unlimited AI parses — that's how we keep the lights on and the AI bills paid. No ads, no data selling, no dark patterns.
          </p>
          <p className="t-body">
            We're building a second product for solopreneurs — home bakers, freelancers, gym owners — who mix personal and business cash. More on that soon.
          </p>
        </div>

        {/* Contact info element using standardized card utilities */}
        <div className="cf-card" style={{ marginTop: 60, padding: '32px 28px', border: '1px solid var(--border)' }}>
          <div className="t-h1" style={{ marginBottom: 16 }}>Get in touch</div>
          <div className="flex flex-col" style={{ gap: 12, fontSize: 14.5 }}>
            <div className="t-body">For support: <a href="mailto:team@chillarflow.com" className="t-accent" style={{ textDecoration: 'none', fontWeight: 600 }}>team@chillarflow.com</a></div>
            <div className="t-body">For everything else: <a href="mailto:team@chillarflow.com" className="t-accent" style={{ textDecoration: 'none', fontWeight: 600 }}>team@chillarflow.com</a></div>
            <div className="t-small t-muted" style={{ marginTop: 8, letterSpacing: '0.01em' }}>We're a lean team. We respond personally within 24 hours.</div>
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', padding: '40px 24px', background: 'var(--bg)' }}>
        <div className="flex justify-between items-center" style={{ maxWidth: 1100, margin: '0 auto', flexWrap: 'wrap', gap: 20 }}>
          <div className="t-small t-muted">© 2026 ChillarFlow. Secure, isolated financial vaults. Made with ♥ in India.</div>
          <div className="flex" style={{ gap: 24, flexWrap: 'wrap' }}>
            {[
              { href: '/pricing', label: 'Pricing' },
              { href: '/about',   label: 'About' },
              { href: '/help',    label: 'Help' },
              { href: 'mailto:team@chillarflow.com', label: 'Contact' },
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
