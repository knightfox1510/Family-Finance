// app/features/planning/page.tsx — Deep dive planning capabilities
import Link from 'next/link';

export default function PlanningFeaturePage() {
  return (
    <div className="cf-page animate-fade-in" style={{ padding: '60px 16px 100px' }}>
      <div className="cf-content" style={{ maxWidth: 680 }}>
        <Link href="/features" className="t-accent" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: 24, fontWeight: 600 }}>
          ← Back to Features Overview
        </Link>
        
        <div className="t-caption t-accent" style={{ marginBottom: 12 }}>Pillar 03 // Core Operations</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(32px, 6vw, 44px)', marginBottom: 24, lineHeight: 1.15 }}>
          Joint Pools & Partner Settlements.
        </h1>
        
        <p className="t-body" style={{ fontSize: 17, lineHeight: 1.7, marginBottom: 40 }}>
          Indian homes handle finances fluidly across multiple channels. ChillarFlow maps to this exact dynamic via auto-calculated shared pool parameters and simple, one-tap balance settlement logs.
        </p>

        <h2 className="t-h1" style={{ marginBottom: 16 }}>Unified Dashboard, Two Separate Feeds</h2>
        <p className="t-body" style={{ marginBottom: 32 }}>
          You do not need to share a banking card or password to align budgets. Each partner links their personal chat app configuration profile independently. ChillarFlow maintains a single running settlement timeline that calculates who covered what, highlighting exact balance amounts without manual sheet tallying.
        </p>

        <div className="cf-card-inset" style={{ padding: '28px 24px', border: '1px solid var(--border)', marginBottom: 40 }}>
          <h3 className="t-h2" style={{ marginBottom: 8, color: 'var(--textW)' }}>🏠 The Joint Contribution Rule</h3>
          <p className="t-body" style={{ fontSize: 14, margin: 0 }}>
            Set custom structural pool weights (e.g., 50/50 split or proportional to individual income levels). When shared milestones like rent, utility items, or groceries are logged via chat, the system automatically applies the rule and tracks remaining balances cleanly.
          </p>
        </div>

        <Link href="/app" className="cf-btn cf-btn-primary cf-btn-full" style={{ fontWeight: 800 }}>
          Build Your Shared Household Vault
        </Link>
      </div>
    </div>
  );
}
