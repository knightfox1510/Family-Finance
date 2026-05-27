// app/features/tracking/page.tsx — Deep dive tracking capabilities with chat simulation mockup
import Link from 'next/link';
import { CoinMark } from '@/components/CoinMark';

export const metadata = {
  title: 'WhatsApp & Telegram Integration — ChillarFlow',
  description: 'See how ChillarFlow transforms plain text messaging into structured financial ledger logs instantly.',
};

export default function TrackingFeaturePage() {
  return (
    <div className="cf-page animate-fade-in" style={{ padding: '60px 16px 100px' }}>
      <div className="cf-content" style={{ maxWidth: 680 }}>
        
        {/* Navigation Return Vector */}
        <Link href="/features" className="t-accent" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: 24, fontWeight: 600 }}>
          ← Back to Features Overview
        </Link>
        
        <div className="t-caption t-accent" style={{ marginBottom: 12, letterSpacing: '0.08em' }}>Pillar 01 // Input Methods</div>
        <h1 className="t-display" style={{ fontSize: 'clamp(32px, 6vw, 44px)', marginBottom: 24, lineHeight: 1.15 }}>
          WhatsApp & Telegram Chat Integration.
        </h1>
        
        <p className="t-body" style={{ fontSize: 17, lineHeight: 1.7, marginBottom: 40 }}>
          You don't need another heavy application sitting on your dock getting forgotten. ChillarFlow maps ledger entries directly to natural chat streams. By utilizing AI engine nodes, plain text logs convert to structured balances in real-time.
        </p>

        {/* ── Immersive Interactive Chat App Visual Demo Block ─────────────────── */}
        <div style={{ margin: '40px 0 48px', position: 'relative' }}>
          <div className="pulse" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 260, height: 260, background: 'var(--accent-glow)', filter: 'blur(80px)', borderRadius: '50%', pointerEvents: 'none' }}></div>

          <div style={{ maxWidth: 440, margin: '0 auto', background: '#0b141a', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.05)', position: 'relative', zIndex: 5 }}>
            
            <div style={{ background: '#1f2c34', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #2a3942' }}>
              <div className="flex items-center" style={{ gap: 12 }}>
                <div style={{ width: 38, height: 38, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CoinMark size={22} color="var(--accent)" />
                </div>
                <div>
                  <div style={{ color: '#e9edef', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    ChillarFlow Engine <span className="cf-badge" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--green)', fontSize: 9, padding: '2px 6px' }}>Active</span>
                  </div>
                  <div style={{ color: '#8696a0', fontSize: 11 }}>parsing incoming statements...</div>
                </div>
              </div>
              <div style={{ color: '#8696a0', fontSize: 18, cursor: 'default' }}>•••</div>
            </div>

            <div style={{ padding: '20px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="flex" style={{ justifyContent: 'flex-end' }}>
                <div style={{ background: '#005c4b', color: '#e9edef', padding: '12px 16px', borderRadius: '16px 16px 2px 16px', maxWidth: '85%', fontSize: 13, boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                  grocery 1200, petrol 400 to settle, rent 15000 from joint
                </div>
              </div>

              <div className="flex" style={{ justifyContent: 'flex-start' }}>
                <div style={{ background: '#202c33', color: '#e9edef', padding: '14px 16px', borderRadius: '16px 16px 16px 2px', maxWidth: '85%', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-line', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', border: '1px solid #2a3942' }}>
                  {`📝 **Ecosystem Batch Log complete:**

                  🛒 **Groceries:** ₹1,200
                  ↳ *Pool: Household shared balance*

                  ⛽ **Fuel & Transport:** ₹400
                  ↳ *Pipeline: Personal (Marked for settlement)*

                  🏠 **Rent & Utilities:** ₹15,000
                  ↳ *Account: Primary Joint Pool Account*

                  📊 *Household retention velocity projections updated.*`}
                </div>
              </div>
            </div>
          </div>
          <p className="t-small t-muted text-center" style={{ marginTop: 16, fontStyle: 'italic' }}>
            Example: A single running chat text handles complex categorical ledger sorting automatically.
          </p>
        </div>

        <h2 className="t-h1" style={{ marginBottom: 16, fontSize: 24 }}>How Natural Language Works</h2>
        <p className="t-body" style={{ marginBottom: 32, fontSize: 15, lineHeight: 1.65 }}>
          Our parsing engine evaluates plain sentences, extracting numeric values and text labels simultaneously. You don't have to follow strict formatting guidelines. Type conversational short-hand blocks as you handle transactions throughout your day—the system processes, maps, and logs rows instantly.
        </p>

        <div className="cf-card-inset" style={{ padding: '28px 24px', border: '1px solid var(--border)', marginBottom: 40 }}>
          <h3 className="t-h2 t-accent" style={{ marginBottom: 8, fontSize: 16 }}>🔮 The Number Wizard (Always Free)</h3>
          <p className="t-body" style={{ fontSize: 14, margin: 0, lineHeight: 1.6 }}>
            Worried about hitting your automated monthly AI processing ceiling? Simply text a raw digit like <code style={{ color: 'var(--textW)' }}>"750"</code> to the bot connection. The interactive Number Wizard activates immediately, prompting you for category flags step-by-step. This manual flow is completely free, forever.
          </p>
        </div>

        <div className="w-full flex" style={{ justifyContent: 'center' }}>
          <Link href="/app" className="cf-btn cf-btn-primary cf-btn-lg cf-btn-full" style={{ maxWidth: '360px', fontWeight: 800, boxShadow: 'var(--shadow-accent)' }}>
            Connect Your WhatsApp Bot Node
          </Link>
        </div>
      </div>
    </div>
  );
}
