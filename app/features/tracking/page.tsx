// app/features/tracking/page.tsx — Deep dive tracking capabilities
import Link from 'next/link';

export default function TrackingFeaturePage() {
  return (
    <div className="cf-page animate-fade-in" style={{ padding: '60px 16px 100px' }}>
      <div className="cf-content" style={{ maxWidth: 680 }}>
        <Link href="/features" className="t-accent" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: 24, fontWeight: 600 }}>
          ← Back to Features Overview
        </Link>
        
        <div className="t-caption t-accent" style={{ marginBottom: 12 }}>Pillar 01 // Input Methods</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(32px, 6vw, 44px)', marginBottom: 24, lineHeight: 1.15 }}>
          WhatsApp & Telegram Chat Integration.
        </h1>
        
        <p className="t-body" style={{ fontSize: 17, lineHeight: 1.7, marginBottom: 40 }}>
          You don't need another app sitting on your dock getting forgotten. ChillarFlow maps ledger entries directly to natural chat streams. By utilizing AI engine nodes, plain text logs convert to structured balances in real-time.
        </p>

        <h2 className="t-h1" style={{ marginBottom: 16 }}>How Natural Language Works</h2>
        <p className="t-body" style={{ marginBottom: 32 }}>
          Our AI parsing nodes interpret multi-item variables from one single text block. Typing <code style={{ color: 'var(--accent)' }}>"Got grocery for 1200, petrol 400, to settle"</code> instantly extracts separate ledger line entries, attributes them to your session profile, and recalculates joint reimbursement channels automatically.
        </p>

        <div className="cf-card-inset" style={{ padding: '28px 24px', border: '1px solid var(--border)', marginBottom: 40 }}>
          <h3 className="t-h2 t-accent" style={{ marginBottom: 8 }}>🔮 The Number Wizard (Always Free)</h3>
          <p className="t-body" style={{ fontSize: 14, margin: 0 }}>
            Worried about hitting your automated monthly AI processing ceiling? Simply text a raw digit like <code style={{ color: 'var(--textW)' }}>"750"</code> to the bot connection. The interactive Number Wizard activates immediately, prompting you for category flags step-by-step. This fallback is completely free, forever.
          </p>
        </div>

        <Link href="/app" className="cf-btn cf-btn-primary cf-btn-full" style={{ fontWeight: 800 }}>
          Connect Your WhatsApp Bot Node
        </Link>
      </div>
    </div>
  );
}
