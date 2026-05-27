// app/page.tsx — ChillarFlow premium marketing landing page
import Link from 'next/link';
import { CoinMark } from '@/components/CoinMark';

export const metadata = {
  title: 'ChillarFlow — Track every rupee. Effortlessly.',
  description: 'ChillarFlow helps couples and solo entrepreneurs stop income leakage through WhatsApp and Telegram. No spreadsheets. Just send a message.',
};

const featureSubLinks = [
  { href: '/features/tracking', label: 'WhatsApp Tracking' },
  { href: '/features/budgeting', label: 'Leakage Budgeting' },
  { href: '/features/planning', label: 'Household Planning' },
];

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
    title: 'AI-Powered Parsing',
    desc: 'Gemini AI understands natural language. "Got grocery for 1200, petrol 400, to settle" logs three transactions in one message.',
  },
  {
    icon: '📊',
    title: 'Plug Income Leakages',
    desc: 'Don’t just track what went out. Our Income Retention dashboard calculates your wealth velocity, instantly highlighting hidden subscription traps and unallocated lifestyle drains.',
  },
  {
    icon: '🏠',
    title: 'Built for Indian Households',
    desc: 'Joint pool tracking, partner splits, informal peer settlement balances, and auto-segregated pride milestones — mapping seamlessly to how Indian homes actually run.',
  },
  {
    icon: '🤝',
    title: 'Both Partners, One View',
    desc: 'Each partner logs independently via their personal chat apps. The dashboard automatically syncs combined income, individual spending, and shared goals.',
  },
  {
    icon: '🔒',
    title: 'Your Own Private Vault',
    desc: 'Your financial logs are completely isolated in an encrypted, dedicated database sandbox. We never look at your balances, show ads, or monetize your lifestyle patterns.',
  },
];

const modes = [
  {
    name: 'ChillarFlow Home',
    tag: 'For couples',
    accentClass: 't-accent',
    borderStyle: '1px solid var(--accent-glow)',
    features: ['Joint pool tracking', 'Partner activity breakdown', 'Settlement dashboard', 'Wealth retention velocity', 'Both Telegram & WhatsApp'],
  },
  {
    name: 'ChillarFlow Hustle',
    tag: 'For solopreneurs',
    accentClass: 't-green',
    borderStyle: '1px solid rgba(34,197,94,0.2)',
    features: ['Personal + business split', 'Cash flow visualiser', 'Custom business categories', 'WhatsApp expense logging', 'Margin tracking'],
    badge: 'Coming soon',
  },
];

export default function HomePage() {
  return (
    <div className="cf-page animate-fade-in" style={{ paddingBottom: 0 }}>
      
      {/* ── Dynamic Layout Engine CSS Fix Injection Block ────────────────────── */}
      <style dangerouslySetInnerHTML={{__html: `
        /* Ensure responsive toggle pipeline acts instantly on interaction */
        #menu-toggle:checked ~ .mobile-drawer { 
          transform: translateX(0) !important; 
          opacity: 1 !important; 
          visibility: visible !important; 
        }
        #menu-toggle:checked ~ .drawer-overlay { 
          opacity: 0.6 !important; 
          visibility: visible !important; 
        }

        /* Responsive Mobile Elements Execution Breakpoint */
        @media (max-width: 768px) {
          .nav-links-desktop { display: none !important; }
          .mobile-menu-trigger { display: flex !important; }
        }
      `}} />

      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav className="cf-header" style={{ position: 'relative', height: 64, padding: '0 24px', zIndex: 1100 }}>
        <div className="w-full flex justify-between items-center" style={{ maxWidth: 1100, margin: '0 auto' }}>
          
          <Link href="/" className="flex items-center" style={{ gap: 10, textDecoration: 'none' }}>
            <CoinMark size={36} color="var(--accent)" />
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--textW)', letterSpacing: '-0.02em' }}>ChillarFlow</span>
          </Link>

          <div className="flex items-center" style={{ gap: 16 }}>
            {/* Desktop Link Layout Block */}
            <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
              <Link href="/features" className="t-body" style={{ textDecoration: 'none', fontWeight: 500 }}>
                Features
              </Link>
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} className="t-body" style={{ textDecoration: 'none', fontWeight: 500 }}>
                  {l.label}
                </Link>
              ))}
            </div>

            {/* Persistent Display Block: Visible on both Desktop and Mobile */}
            <Link href="/app" className="cf-btn cf-btn-primary cf-btn-sm" style={{ fontWeight: 800 }}>
              Sign In
            </Link>

            {/* Core Interaction Functional Pipeline Input Switch */}
            <input type="checkbox" id="menu-toggle" style={{ display: 'none' }} />
            
            {/* Mobile Three-Line Hamburger Icon Trigger Button */}
            <label htmlFor="menu-toggle" className="mobile-menu-trigger" style={{ display: 'none', flexDirection: 'column', gap: 5, cursor: 'pointer', padding: '8px', zIndex: 1200 }}>
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
              <span style={{ width: 22, height: 2, background: 'var(--textW)', borderRadius: 2 }}></span>
            </label>

            {/* Semi-Transparent Background Overlay Mask */}
            <label htmlFor="menu-toggle" className="drawer-overlay" style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: '#000', opacity: 0, visibility: 'hidden', transition: 'all 0.25s ease', zIndex: 1000 }}></label>

            {/* Sliding Navigation Drawer Component Panel */}
            <div className="mobile-drawer" style={{ position: 'fixed', top: 0, right: 0, width: '300px', height: '100vh', background: 'var(--surface)', padding: '32px 24px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 20, transform: 'translateX(100%)', opacity: 0, visibility: 'hidden', transition: 'all 0.28s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 1150, overflowY: 'auto' }}>
              
              <div className="flex justify-between items-center" style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <span className="t-caption">Menu Directory</span>
                <label htmlFor="menu-toggle" style={{ color: 'var(--text2)', fontSize: 28, cursor: 'pointer', lineHeight: 1 }}>&times;</label>
              </div>

              {/* Multi-Level Feature Route Nesting Tree */}
              <div className="flex flex-col" style={{ gap: 8 }}>
                <Link href="/features" className="t-h2" style={{ textDecoration: 'none', fontWeight: 700 }}>
                  Features
                </Link>
                <div className="flex flex-col" style={{ gap: 10, paddingLeft: 16, marginTop: 4, borderLeft: '1px solid var(--border)' }}>
                  {featureSubLinks.map((sub) => (
                    <Link key={sub.href} href={sub.href} className="t-body" style={{ textDecoration: 'none', fontSize: 13, color: 'var(--text2)' }}>
                      ↳ {sub.label}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Standard Directory Link Set */}
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} className="t-h2" style={{ textDecoration: 'none', fontWeight: 700, paddingTop: 8 }}>
                  {l.label}
                </Link>
              ))}

              {/* Separated Intent Action Button Group */}
              <div className="flex flex-col" style={{ gap: 12, marginTop: 'auto', paddingTop: 24 }}>
                <Link href="/app" className="cf-btn cf-btn-primary cf-btn-full" style={{ fontWeight: 800 }}>
                  Create Account (Sign Up)
                </Link>
                <Link href="/app" className="cf-btn cf-btn-ghost cf-btn-full" style={{ fontWeight: 600, border: '1px solid var(--border2)' }}>
                  Sign In
                </Link>
              </div>
            </div>
          </div>

        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="cf-content text-center animate-fade-up" style={{ padding: '80px 16px 48px' }}>
        <div className="cf-badge" style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-glow)', marginBottom: 24, padding: '6px 16px' }}>
          ⚡ Fast WhatsApp & Telegram tracking active
        </div>
        
        <h1 className="t-display" style={{ marginBottom: 24, lineHeight: 1.1 }}>
          Track every single rupee.
          <br />
          <span className="pro-shimmer">Keep 30% more of it.</span>
        </h1>
        
        <p className="t-body" style={{ fontSize: 17, marginBottom: 40, color: 'var(--text2)' }}>
          ChillarFlow automatically transforms plain text chat alerts into beautifully structured analytics. 
          Stop losing ground to untracked lifestyle leakage, separate business metrics easily, and align shared goals effortlessly.
        </p>

        <div className="flex items-center justify-between" style={{ gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/app" className="cf-btn cf-btn-primary cf-btn-lg" style={{ minWidth: 240 }}>
            Start tracking free
          </Link>
          <Link href="/pricing" className="cf-btn cf-btn-ghost cf-btn-lg" style={{ minWidth: 240, border: '1px solid var(--border2)' }}>
            See pricing plans
          </Link>
        </div>
        <p className="t-small t-muted" style={{ marginTop: 16 }}>30 automated transactions free monthly • Setup under 2 minutes</p>
      </section>

      {/* ── Immersive Unmissable WhatsApp Section Showcase ─────────────────── */}
      <section style={{ padding: '24px 16px 80px', position: 'relative' }}>
        <div className="pulse" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 280, height: 280, background: 'var(--accent-glow)', filter: 'blur(90px)', borderRadius: '50%', pointerEvents: 'none' }}></div>

        <div style={{ maxWidth: 440, margin: '0 auto', background: '#0b141a', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.05)', position: 'relative', zIndex: 5 }}>
          
          <div style={{ background: '#1f2c34', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2a3942' }}>
            <div className="flex items-center" style={{ gap: 12 }}>
              <div style={{ width: 38, height: 38, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CoinMark size={22} color="var(--accent)" />
              </div>
              <div>
                <div style={{ color: '#e9edef', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ChillarFlow Bot <span className="cf-badge" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--green)', fontSize: 9, padding: '2px 6px' }}>Verified</span>
                </div>
                <div style={{ color: '#8696a0', fontSize: 11 }}>online and parsing statements...</div>
              </div>
            </div>
            <div style={{ color: '#8696a0', fontSize: 18, cursor: 'default' }}>•••</div>
          </div>

          <div style={{ padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { from: 'user', text: '450 Zomato, 1200 Big Bazaar to settle, 400 Ola' },
              { from: 'bot',  text: '📝 **Parsed Successfully!**\n\n💰 **Amount:** ₹450\n🏷️ **Category:** Dine Out / Food\n👤 **Logged By:** Current Session\n🤝 **Split Rule:** Personal\n\n*Synced directly with your household vault dashboard.*' },
              { from: 'bot',  text: '📝 **Parsed Successfully!**\n\n💰 **Amount:** ₹1,200\n🏷️ **Category:** Groceries\n👤 **Logged By:** Current Session\n🤝 **Split Rule:** Shared (Joint Pool)\n\n*Reimbursement pipeline metrics recalculated.*' },
            ].map((m, i) => (
              <div key={i} className="flex" style={{ justifyContent: m.from === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  background: m.from === 'user' ? '#005c4b' : '#202c33',
                  color: '#e9edef',
                  padding: '12px 16px',
                  borderRadius: m.from === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                  maxWidth: '85%',
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  border: m.from === 'user' ? 'none' : '1px solid #2a3942'
                }}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="t-body text-center animate-fade-in" style={{ marginTop: 24, padding: '0 16px', fontWeight: 500 }}>
          🚀 No complex accounting configurations to monitor. One chat string securely manages records.
        </p>
      </section>

      {/* ── Products Mode Matrices ───────────────────────────────────────────── */}
      <section style={{ padding: '64px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 className="t-h1 text-center" style={{ marginBottom: 12, fontSize: 32 }}>Two modes. One uniform database.</h2>
          <p className="t-body text-center" style={{ marginBottom: 48 }}>Configured individually for your tracking structure.</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            {modes.map((m) => (
              <div key={m.name} className="cf-card" style={{ border: m.borderStyle, padding: '32px 28px', background: 'var(--surface)', position: 'relative' }}>
                {m.badge && (
                  <div className="cf-badge" style={{ position: 'absolute', top: 20, right: 20, background: 'var(--teal-bg)', color: 'var(--teal)' }}>
                    {m.badge}
                  </div>
                )}
                <div className="t-caption" style={{ marginBottom: 8, color: 'var(--text3)' }}>{m.tag}</div>
                <h3 className={`t-h1 ${m.accentClass}`} style={{ margin: '0 0 24px' }}>{m.name}</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {m.features.map((f) => (
                    <li key={f} className="t-body flex items-center" style={{ gap: 10 }}>
                      <span className={m.accentClass} style={{ fontWeight: 'bold' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature Grid ─────────────────────────────────────────────────────── */}
      <section className="cf-content" style={{ padding: '80px 16px', maxWidth: 1000 }}>
        <h2 className="t-h1 text-center" style={{ marginBottom: 56, fontSize: 32 }}>Engineered for absolute clarity.</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {features.map((f) => (
            <div key={f.title} className="cf-card" style={{ padding: '28px 24px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 32, marginBottom: 16 }}>{f.icon}</div>
              <h3 className="t-h2" style={{ marginBottom: 12 }}>{f.title}</h3>
              <p className="t-body" style={{ margin: 0, lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ────────────────────────────────────────────────────────── */}
      <section className="text-center" style={{ padding: '90px 24px', borderTop: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--bg) 0%, var(--surface) 100%)' }}>
        <div className="cf-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 className="t-display" style={{ marginBottom: 16, fontSize: 38 }}>Ready to watch your savings velocity accelerate?</h2>
          <p className="t-body" style={{ marginBottom: 40, fontSize: 16 }}>Try basic features fully free. Upgrade only when your operations expand.</p>
          
          <div className="w-full flex justify-between items-center" style={{ justifyContent: 'center', padding: '0 8px' }}>
            <Link href="/app" className="cf-btn cf-btn-primary cf-btn-lg" style={{ boxShadow: 'var(--shadow-accent)', whiteSpace: 'normal', height: 'auto', minHeight: 56, padding: '16px 32px', textAlign: 'center', lineHeight: 1.2, width: '100%', maxWidth: '340px' }}>
              Claim Your Secure Dashboard Access
            </Link>
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
