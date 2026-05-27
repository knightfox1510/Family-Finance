// app/reviews/page.tsx — ChillarFlow premium testimonials wall platform
import Link from 'next/link';
import { CoinMark } from '@/components/marketing/CoinMark';

// 🎯 Grouped strictly by specific platform toolsets
const featureSubLinks = [
  { href: '/features/tracking', label: 'Chat Log Automation' }, 
  { href: '/features/budgeting', label: 'Retention Metrics' },    
  { href: '/features/planning', label: 'Household Settlement' }, 
  { href: '/shortcuts',         label: 'Power User Guide' }, 
];

// 🧭 The high-level main directories remain clean, distinct, and conversion-focused
const navLinks = [
  { href: '/features', label: 'Capabilities' },
  { href: '/pricing',  label: 'Pricing' },
  { href: '/reviews',  label: 'Reviews' }, 
  { href: '/about',    label: 'About'   },
  { href: '/help',     label: 'Help'    },
];

export const metadata = {
  title: 'User Testimonials & Case Studies — ChillarFlow',
  description: 'See how real Indian couples and solo business creators utilize automated chat logging to cut tracking friction entirely.',
};

const userReviews = [
  {
    quote: "We spent three years trying to maintain a shared expense spreadsheet. It always fell apart because logging an entry felt like homework. With ChillarFlow, my husband texts the bot right from the supermarket billing counter. The automated split calculation keeps our joint pool numbers pristine.",
    author: "Karishma M.",
    location: "Mumbai",
    tag: "Household Mode: Joint",
    colorClass: "t-accent"
  },
  {
    quote: "As a freelance designer, tracking what belongs to my business ledger vs my personal pocket used to be a weekly nightmare. Now I text '3500 font license hustle' or '450 lunch personal' straight into WhatsApp. The multi-item database segregation handles the rest.",
    author: "Arjun K.",
    location: "Bangalore",
    tag: "Hustle Mode: Solopreneur",
    colorClass: "t-green"
  },
  {
    quote: "The running settlement tracking features are legendary. We don't merge our bank accounts, but we share major living line items. ChillarFlow clearly reflects exactly who owes whom down to the single rupee without annoying checkout friction.",
    author: "Pooja & Rohan",
    location: "Delhi",
    tag: "Household Mode: Separate",
    colorClass: "t-blue"
  }
];

export default function ReviewsPage() {
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
            {/* Desktop Navigation Links Container */}
            <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
              {navLinks.map((l) => (
                <Link 
                  key={l.href} 
                  href={l.href} 
                  className="t-body" 
                  style={{ 
                    textDecoration: 'none', 
                    fontWeight: l.href === '/reviews' ? 600 : 500,
                    color: l.href === '/reviews' ? 'var(--textW)' : undefined 
                  }}
                >
                  {l.label}
                </Link>
              ))}
            </div>

            {/* Action Trigger Access Command Node */}
            <Link href="/app" className="cf-btn cf-btn-primary cf-btn-sm" style={{ fontWeight: 800 }}>Sign In</Link>

            {/* Responsive Mobile Drawer Form Toggle Nodes */}
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
                  <Link href="/features" className="t-h1" style={{ textDecoration: 'none' }}>Capabilities</Link>
                  <div className="flex flex-col" style={{ gap: 14, paddingLeft: 12, borderLeft: '1.5px solid var(--border)' }}>
                    {featureSubLinks.map((sub) => (
                      <Link key={sub.href} href={sub.href} className="t-body" style={{ textDecoration: 'none', fontSize: 14 }}>{sub.label}</Link>
                    ))}
                  </div>
                </div>
                {navLinks.filter(l => l.href !== '/features').map((l) => (
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

      {/* ── Testimonials Hero ───────────────────────────────────────────────── */}
      <section className="cf-content text-center animate-fade-up" style={{ padding: '80px 16px 48px' }}>
        <h1 className="t-display" style={{ marginBottom: 20, lineHeight: 1.1 }}>
          Validated by active<br />household operations.
        </h1>
        <p className="t-body" style={{ fontSize: 18, maxWidth: 540, margin: '0 auto', color: 'var(--text2)' }}>
          See how teams of two and solo builders utilize immediate chat inputs to maintain zero tracking friction.
        </p>
      </section>

      {/* ── Reviews Grid Flow Matrix ────────────────────────────────────────── */}
      <section style={{ padding: '20px 16px 80px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
          {userReviews.map((r, idx) => (
            <div key={idx} className="cf-card" style={{ padding: '36px 28px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ color: 'var(--accent)', fontSize: 16, marginBottom: 18, letterSpacing: '2px' }}>⭐⭐⭐⭐⭐</div>
              <p className="t-body" style={{ fontSize: 14.5, lineHeight: 1.7, color: 'var(--textW)', fontStyle: 'italic', flex: 1, margin: '0 0 24px' }}>
                "{r.quote}"
              </p>
              <div className="cf-divider" style={{ marginBottom: 18, opacity: 0.3 }} />
              <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <span style={{ fontWeight: 700, color: 'var(--textW)', fontSize: 14, display: 'block' }}>{r.author}</span>
                  <span className="t-small t-muted" style={{ fontSize: 12 }}>{r.location}, IN</span>
                </div>
                <span className={`cf-badge ${r.colorClass}`} style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', fontSize: 11 }}>
                  {r.tag}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Bottom Section CTA ────────────────────────────────────────────────── */}
      <section className="text-center" style={{ padding: '100px 24px', borderTop: '1px solid var(--border)', background: 'linear-gradient(180deg, var(--bg) 0%, var(--surface) 100%)' }}>
        <div className="cf-content" style={{ maxWidth: 540 }}>
          <h2 className="t-display" style={{ fontSize: 36, marginBottom: 16 }}>Ready to align your shared metrics?</h2>
          <p className="t-body" style={{ marginBottom: 36 }}>Experience absolute coordination with zero manual data entry overhead.</p>
          <Link href="/app" className="cf-btn cf-btn-primary cf-btn-lg cf-btn-full" style={{ maxWidth: '340px', fontWeight: 800 }}>
            Initialize Your Household Vault
          </Link>
        </div>
      </section>
    </div>
  );
}
