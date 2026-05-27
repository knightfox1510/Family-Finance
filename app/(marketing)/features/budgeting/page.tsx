// app/features/budgeting/page.tsx — Deep dive metric capabilities
import Link from 'next/link';

export default function BudgetingFeaturePage() {
  return (
    <div className="cf-page animate-fade-in" style={{ padding: '60px 16px 100px' }}>
      <div className="cf-content" style={{ maxWidth: 680 }}>
        <Link href="/features" className="t-green" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: 24, fontWeight: 600 }}>
          ← Back to Features Overview
        </Link>
        
        <div className="t-caption t-green" style={{ marginBottom: 12 }}>Pillar 02 // Financial Clarity</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(32px, 6vw, 44px)', marginBottom: 24, lineHeight: 1.15 }}>
          Plugging Unallocated Income Leakage.
        </h1>
        
        <p className="t-body" style={{ fontSize: 17, lineHeight: 1.7, marginBottom: 40 }}>
          Standard budgeting trackers tell you where your money went after it is already spent. ChillarFlow uses real-time retention algorithms to track data trends and keep you running efficiently before drains accumulate.
        </p>

        <h2 className="t-h1" style={{ marginBottom: 16 }}>Understanding Wealth Retention Velocity</h2>
        <p className="t-body" style={{ marginBottom: 32 }}>
          Your financial health isn't defined by how much you make; it is defined by your retention metrics. Our algorithmic engine evaluates recurring subscription flags and ghost transactions to show you exactly what percentage of incoming liquidity safely makes it into long-term savings structures each month.
        </p>

        <div className="cf-card" style={{ padding: '28px 24px', border: '1px solid rgba(34,197,94,0.2)', background: 'var(--surface)', marginBottom: 40 }}>
          <h3 className="t-h2 t-green" style={{ marginBottom: 8 }}>📉 Catching Unconscious Subscriptions</h3>
          <p className="t-body" style={{ fontSize: 14, margin: 0 }}>
            Because ChillarFlow logs alerts straight as transactions are completed, it cross-references automated payment cycles. If a streaming subscription or membership fees spike silently in the background, your household dashboard flags the anomaly immediately.
          </p>
        </div>

        <Link href="/app" className="cf-btn cf-btn-primary cf-btn-full" style={{ background: 'var(--green)', color: '#0a0a0a', fontWeight: 800 }}>
          Analyze Your Household Velocity Now
        </Link>
      </div>
    </div>
  );
}
