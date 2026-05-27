// app/feedback/page.tsx — ChillarFlow premium client feedback loop entry
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CoinMark } from '@/components/marketing/CoinMark';

export default function FeedbackPage() {
  const [feedbackType, setFeedbackType] = useState<'feature' | 'bug' | 'other'>('feature');
  const [message, setMessage] = useState('');
  const [householdId, setHouseholdId] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="cf-page flex flex-col items-center justify-center" style={{ minHeight: '100dvh', padding: '40px 20px' }}>
      
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 64, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" className="flex items-center" style={{ gap: 10, textDecoration: 'none' }}>
          <CoinMark size={32} color="var(--accent)" />
          <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--textW)', letterSpacing: '-0.02em' }}>ChillarFlow</span>
        </Link>
        <Link href="/" className="t-small t-muted" style={{ textDecoration: 'none' }}>✕ Close</Link>
      </div>

      {submitted ? (
        <div className="cf-card text-center animate-fade-up" style={{ width: '100%', maxWidth: 460, padding: '48px 32px', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
          <h2 className="t-h1" style={{ marginBottom: 12 }}>Transmission Logged</h2>
          <p className="t-body" style={{ marginBottom: 32, fontSize: 14.5 }}>
            Thank you for optimizing our core metrics. We cross-reference operational requests every single afternoon and apply updates directly to the cloud nodes.
          </p>
          <button onClick={() => setSubmitted(false)} className="cf-btn cf-btn-ghost cf-btn-full" style={{ fontWeight: 600 }}>
            Submit Another Entry
          </button>
        </div>
      ) : (
        <div className="cf-card animate-fade-up" style={{ width: '100%', maxWidth: 480, padding: '40px 32px', border: '1px solid var(--border)', marginTop: 40 }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--textW)', letterSpacing: '-0.03em', margin: '0 0 6px' }}>
              Submit Feedback Loop
            </h1>
            <p className="t-body" style={{ fontSize: 13.5, margin: 0 }}>
              Help us refine the automation algorithms. Tell us what capability matrices your household needs next.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: 20 }}>
            <div className="cf-card-inset flex flex-col" style={{ padding: 16, gap: 10, border: '1px solid var(--border)' }}>
              <label className="t-caption" style={{ color: 'var(--text3)' }}>Operational Classification</label>
              <div className="flex" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setFeedbackType('feature')} className={`cf-chip ${feedbackType === 'feature' ? 'active' : ''}`}>
                  ✨ Feature Request
                </button>
                <button type="button" onClick={() => setFeedbackType('bug')} className={`cf-chip ${feedbackType === 'bug' ? 'active' : ''}`}>
                  🛠️ Bug Report
                </button>
                <button type="button" onClick={() => setFeedbackType('other')} className={`cf-chip ${feedbackType === 'other' ? 'active' : ''}`}>
                  💬 General Idea
                </button>
              </div>
            </div>

            <div className="flex flex-col" style={{ gap: 6 }}>
              <label htmlFor="message" className="t-caption" style={{ color: 'var(--text2)' }}>Detailed Description</label>
              <textarea
                id="message"
                required
                rows={4}
                placeholder="Describe your tracking scenario, custom category ideas, or missing command syntax parameters..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="cf-input"
                style={{ height: 'auto', resize: 'vertical', padding: '14px 16px', lineHeight: 1.5 }}
              />
            </div>

            <div className="flex flex-col" style={{ gap: 6 }}>
              <label htmlFor="householdId" className="t-caption" style={{ color: 'var(--text2)' }}>
                Household ID Key <span style={{ color: 'var(--text3)', fontWeight: 400 }}>(Optional)</span>
              </label>
              <input
                id="householdId"
                type="text"
                placeholder="Located in Settings → About Vault"
                value={householdId}
                onChange={(e) => setHouseholdId(e.target.value)}
                className="cf-input"
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
            </div>

            <button type="submit" className="cf-btn cf-btn-primary cf-btn-full" style={{ fontWeight: 800, marginTop: 8 }}>
              Transmit Feedback Core Node
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
