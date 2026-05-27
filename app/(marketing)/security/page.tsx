// app/security/page.tsx — ChillarFlow premium security & privacy hub
import Link from 'next/link';
import { CoinMark } from '@/components/CoinMark';

export const metadata = {
  title: 'Security & Data Privacy — ChillarFlow',
  description: 'Learn how ChillarFlow isolates your household financial logs inside a secure, encrypted data vault container.',
};

const navLinks = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/about',   label: 'About'   },
  { href: '/help',    label: 'Help'    },
];

const securityProtocols = [
  {
    icon: '🔏',
    title: 'Isolated Ledger Vaults',
    desc: 'Your financial logs do not live in a shared, messy pool. Every single household gets a completely isolated database sandbox container. Your data is mathematically partitioned and walled off from everyone else.',
  },
  {
    icon: '♻️',
    title: 'Instant Message Shredding',
    desc: 'When you text "450 Zomato" to our bot node, the plain text string is processed on the fly. The AI extracts the category and amount, passes the metrics to your vault, and immediately shreds the raw text. We store logs, not chat histories.',
  },
  {
    icon: '🚫',
    title: 'Zero Third-Party Scraping',
    desc: 'Traditional apps connect to your bank accounts using scraping APIs that constantly break or sell your spending habits for targeted ads. ChillarFlow relies entirely on your manual or auto-forwarded text commands. We never sell data, serve ads, or cross-reference your lifestyle patterns.',
  },
  {
    icon: '🔑',
    title: 'Dual-Key Profile Sync',
    desc: 'To link your partner to your household tracking feed, they must supply an explicit unique Household Invite Code directly generated inside your settings console. No one can spy on or join your data streams without explicit, hardware-verified approval.',
  },
];

export default function SecurityHubPage() {
  return (
    <div className="cf-page animate-fade-in" style={{ paddingBottom: 0 }}>
      
      <nav className="cf-header" style={{ position: 'relative', height: 64, padding: '0 24px', zIndex: 1100 }}>
        <div className="w-full flex justify-between items-center" style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/" className="flex items-center" style={{ gap: 10, textDecoration: 'none' }}>
            <CoinMark size={36} color="var(--accent)" />
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--textW)', letterSpacing: '-0.02em' }}>ChillarFlow</span>
          </Link>
          <div className="flex items-center" style={{ gap: 16 }}>
            <div className="nav-links-desktop" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
              <Link href="/features" className="t-body" style={{ textDecoration: 'none', fontWeight: 500 }}>Features</Link>
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} className="t-body" style={{ textDecoration: 'none', fontWeight: 500 }}>{l.label}</Link>
              ))}
            </div>
            <Link href="/app" className="cf-btn cf-btn-primary cf-btn-sm" style={{ fontWeight: 800 }}>Sign In</Link>
          </div>
        </div>
      </nav>

      <section className="cf-content text-center animate-fade-up" style={{ padding: '80px 16px 48px' }}>
        <div className="cf-badge" style={{ background: 'rgba(34,197,94,0.12)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.2)', marginBottom: 24, padding: '6px 16px' }}>
          🔒 Non-Custodial Financial Logging Infrastructure
        </div>
        <h1 className="t-display" style={{ marginBottom: 24, lineHeight: 1.1 }}>
          Your household assets.<br />Locked in a private vault.
        </h1>
        {/* ⚡ CORE MAXWIDTH RECOMPILATION FIX APPLIED HERE */}
        <p className="t-body" style={{ fontSize: 17, maxWidth: 560, margin: '0 auto', color: 'var(--text2)' }}>
          We treat your household financial operations with absolute confidentiality. Discover the strict defensive parameters protecting your data footprints.
        </p>
      </section>

      <section className="cf-content" style={{ padding: '40px 16px 80px', maxWidth: 900 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
          {securityProtocols.map((p) => (
            <div key={p.title} className="cf-card" style={{ padding: '32px 28px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>{p.icon}</div>
              <h2 className="t-h2" style={{ marginBottom: 12, color: 'var(--textW)' }}>{p.title}</h2>
              <p className="t-body" style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text2)' }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '64px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h2 className="t-h1 text-center" style={{ marginBottom: 32 }}>Our Structural Guarantees</h2>
          <div className="flex flex-col" style={{ gap: 20 }}>
            <div className="cf-card-inset" style={{ padding: '20px 24px', border: '1px solid var(--border)' }}>
              <span className="t-caption t-accent" style={{ display: 'block', marginBottom: 6 }}>Data Demolition Controls</span>
              <p className="t-body" style={{ margin: 0, fontSize: 13.5 }}>If you choose to leave ChillarFlow, navigating to Settings → Data → Delete completely flushes your ledger nodes permanently. We do not keep cold-storage backups of closed accounts.</p>
            </div>
            <div className="cf-card-inset" style={{ padding: '20px 24px', border: '1px solid var(--border)' }}>
              <span className="t-caption t-green" style={{ display: 'block', marginBottom: 6 }}>No Read Access Outside Bot Chats</span>
              <p className="t-body" style={{ margin: 0, fontSize: 13.5 }}>Our integration logic has absolutely zero systemic capacity to read your other personal WhatsApp or Telegram chats. The system only wakes up when a message is explicitly processed by hitting the verified bot address directly.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="text-center" style={{ padding: '100px 24px', borderTop: '1px solid var(--border)' }}>
        <div className="cf-content" style={{ maxWidth: 540 }}>
          <h2 className="t-h1" style={{ fontSize: 32, marginBottom: 16 }}>Deploy your isolated vault today</h2>
          <p className="t-body" style={{ marginBottom: 36 }}>Take control of your household tracking operations with absolute digital alignment.</p>
          <Link href="/app" className="cf-btn cf-btn-primary cf-btn-lg cf-btn-full" style={{ maxWidth: '340px', fontWeight: 800 }}>
            Initialize Free Secure Vault
          </Link>
        </div>
      </section>
    </div>
  );
}
