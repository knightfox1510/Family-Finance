
// app/about/page.tsx

import Link from 'next/link';

export const metadata = {
  title: 'About — ChillarFlow',
  description: 'Why we built ChillarFlow and who it\'s for.',
};

const C = {
  bg: '#0b0f1a', surface: '#131928', border: '#1e2840',
  amber: '#f59e0b', teal: '#06b6d4', textW: '#e8eeff',
  text2: '#6b82a8', muted: '#3d4f6e',
};

export default function AboutPage() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', color: C.textW }}>
      {/* Nav */}
      <nav style={{ borderBottom: `1px solid ${C.border}`, padding: '0 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 64 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 36, height: 36, background: C.amber, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: C.bg }}>C</div>
            <span style={{ fontWeight: 800, fontSize: 18, color: C.textW }}>ChillarFlow</span>
          </Link>
          <Link href="/app" style={{ background: C.amber, color: C.bg, padding: '8px 20px', borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>Sign In</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '80px 24px 100px' }}>
        <div style={{ fontSize: 13, color: C.amber, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Our story</div>
        <h1 style={{ fontSize: 42, fontWeight: 800, lineHeight: 1.15, margin: '0 0 32px' }}>
          Built because we were tired of fighting about money.
        </h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, color: C.text2, fontSize: 16, lineHeight: 1.8 }}>
          <p>
            Managing finances as a couple in India is weirdly hard. You have joint expenses — rent, groceries, electricity — and personal ones. You have SIPs running. Your parents need a transfer. Your partner booked a Swiggy order on their card.
          </p>
          <p>
            Every app we tried was either too simple (basic expense trackers with no partner concept) or too complex (accounting tools built for businesses). None of them understood how Indian households actually work — joint pools, UPI transfers, EMIs, "to settle" arrangements.
          </p>
          <p>
            So we built ChillarFlow. The core idea is simple: <strong style={{ color: C.textW }}>your phone is already in your hand, and WhatsApp is already open</strong>. Logging an expense should be as easy as texting your partner about it.
          </p>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '24px 22px', margin: '8px 0' }}>
            <div style={{ fontSize: 20, fontStyle: 'italic', lineHeight: 1.6, color: C.textW, marginBottom: 16 }}>
              "450 Zomato, 1200 Big Bazaar to settle, 400 Ola"
            </div>
            <div style={{ fontSize: 14, color: C.text2 }}>
              Three transactions. One message. ChillarFlow logs, categorises, and marks the grocery for joint reimbursement — automatically.
            </div>
          </div>

          <p>
            We're a small team. We use this app ourselves, every day. When something is broken or annoying, we feel it. That keeps us honest about what actually matters.
          </p>
          <p>
            ChillarFlow is free to start. We charge a small monthly fee for unlimited AI parses — that's how we keep the lights on and the AI bills paid. No ads, no data selling, no dark patterns.
          </p>
          <p>
            We're building a second product for solopreneurs — home bakers, freelancers, gym owners — who mix personal and business cash. More on that soon.
          </p>
        </div>

        <div style={{ marginTop: 60, padding: '32px 28px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 16 }}>Get in touch</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, color: C.text2 }}>
            <div>For support: <a href="mailto:team@chillarflow.com" style={{ color: C.amber }}>team@chillarflow.com</a></div>
            <div>For everything else: <a href="mailto:team@chillarflow.com" style={{ color: C.amber }}>team@chillarflow.com</a></div>
            <div style={{ marginTop: 8, fontSize: 13, color: C.muted }}>We're a small team. We respond personally within 24 hours.</div>
          </div>
        </div>
      </div>

      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ color: C.muted, fontSize: 13 }}>© 2026 ChillarFlow. Made with ♥ in India.</div>
      </footer>
    </div>
  );
}
