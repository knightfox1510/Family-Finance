// app/shortcuts/page.tsx — ChillarFlow premium Power User Guide platform
import Link from 'next/link';
import { CoinMark } from '@/components/marketing/CoinMark';

export const metadata = {
  title: 'Power User Guide — ChillarFlow',
  description: 'Master ChillarFlow macro mechanics, advanced text-parsing syntax, and smartphone OS automation pipelines.',
};

const chatMacros = [
  { trigger: 'to settle', usage: 'Instructs the parsing engine to isolate the line item for future peer-to-peer balance netting updates.', example: '450 Zomato to settle' },
  { trigger: 'joint', usage: 'Forcibly attributes the cash outflow directly against your shared household pool allocations.', example: '1200 Groceries joint' },
  { trigger: 'edit', usage: 'Reply to any bot transaction confirmation with this keyword within 5 minutes to instantly unlock field overrides.', example: 'edit' },
  { trigger: 'undo', usage: 'A structural kill-switch. Text this to immediately strike out and purge the last logged entry from your database node entirely.', example: 'undo' },
];

export default function PowerUserGuidePage() {
  return (
    <div className="cf-page animate-fade-in" style={{ paddingBottom: 0 }}>
      
      <nav className="cf-header" style={{ position: 'relative', height: 64, padding: '0 24px', zIndex: 1100 }}>
        <div className="w-full flex justify-between items-center" style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Link href="/" className="flex items-center" style={{ gap: 10, textDecoration: 'none' }}>
            <CoinMark size={36} color="var(--accent)" />
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--textW)', letterSpacing: '-0.02em' }}>ChillarFlow</span>
          </Link>
          <Link href="/features" className="cf-btn cf-btn-ghost cf-btn-sm" style={{ fontWeight: 600 }}>
            ← Features Overview
          </Link>
        </div>
      </nav>

      <section className="cf-content text-center animate-fade-up" style={{ padding: '80px 16px 40px' }}>
        <div className="cf-badge" style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid var(--accent-glow)', marginBottom: 24, padding: '6px 16px' }}>
          ⚡ CHILLARFLOW ADVANCED CAPABILITY DIRECTORY
        </div>
        <h1 className="t-display" style={{ marginBottom: 24, lineHeight: 1.1 }}>
          The Power User Guide.
        </h1>
        <p className="t-body" style={{ fontSize: 17, maxWidth: 560, margin: '0 auto', color: 'var(--text2)' }}>
          Unlock maximum operational velocity. Control categories, balance adjustments, and ledger adjustments directly from your chat stream using precision syntax.
        </p>
      </section>

      <section className="cf-content" style={{ padding: '20px 16px 60px', maxWidth: 760 }}>
        <h2 className="cf-section-title neo-section-title">Precision Engine Syntax</h2>
        <div className="flex flex-col animate-fade-up" style={{ gap: 14 }}>
          {chatMacros.map((m) => (
            <div key={m.trigger} className="cf-card-inset flex items-center justify-between" style={{ padding: '20px 24px', border: '1px solid var(--border)', flexWrap: 'wrap', gap: 16 }}>
              <div style={{ flex: '1', minWidth: '240px' }}>
                <span className="cf-chip active" style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, padding: '4px 12px' }}>
                  {m.trigger}
                </span>
                <p className="t-body" style={{ marginTop: 10, fontSize: 14, color: 'var(--text2)', margin: '10px 0 0' }}>{m.usage}</p>
              </div>
              <div style={{ background: 'var(--bg)', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <code style={{ color: 'var(--accent)', fontSize: 13, fontFamily: 'monospace' }}>"{m.example}"</code>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ padding: '64px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg2)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 className="t-h1 text-center" style={{ marginBottom: 12, fontSize: 28 }}>Ecosystem Automation: Bank SMS Bridging</h2>
          <p className="t-body text-center" style={{ marginBottom: 40, color: 'var(--text2)' }}>
            Achieve zero-touch logging. Configure your mobile hardware workflows to forward incoming bank alert tokens to your vault automatically.
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            <div className="cf-card" style={{ padding: '28px 24px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <span className="t-caption t-accent" style={{ display: 'block', marginBottom: 12 }}>Apple Shortcuts Pipeline (iOS)</span>
              <ul style={{ paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }} className="t-body">
                <li>Launch the system native **Shortcuts** application on iOS.</li>
                <li>Tap into the **Automation** console and initialize a new trigger context (+).</li>
                <li>Select **Create Personal Automation** → **On Transaction / Message Receipt**.</li>
                <li>Define background string matching logic for specific bank sender handles.</li>
                <li>Bind the execution task: **Forward Message Data via WhatsApp** straight to your active ChillarFlow bot link node.</li>
              </ul>
            </div>

            <div className="cf-card" style={{ padding: '28px 24px', border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <span className="t-caption t-green" style={{ display: 'block', marginBottom: 12 }}>MacroDroid Automation (Android)</span>
              <ul style={{ paddingLeft: 16, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }} className="t-body">
                <li>Install the lightweight execution manager **MacroDroid** from the Google Play store.</li>
                <li>Add a systemic background **Trigger** listening for *Notification Received* contexts.</li>
                <li>Apply string constraint qualifiers matching transactional metadata strings (e.g., "debited", "UPI link spent").</li>
                <li>Configure the automated pipeline **Action** to handle downstream text transfers.</li>
                <li>Direct the output array parameters to dispatch straight into your secure household bot destination address.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '40px 24px', background: 'var(--bg)', textAlign: 'center' }}>
        <div className="t-small t-muted">
          Want to deploy custom API integration endpoints or write bulk webhooks? Connect with our technical operators at{' '}
          <a href="mailto:team@chillarflow.com" className="t-accent" style={{ textDecoration: 'none', fontWeight: 600 }}>team@chillarflow.com</a>
        </div>
      </footer>
    </div>
  );
}
