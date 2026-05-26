'use client';
// ─── Auth.tsx ─────────────────────────────────────────────────────────────────
// ChillarFlow NeoPOP sign-in / sign-up screen.
// Sharp corners, hard shadows, Inter font, physical button press animation.

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Local colour vars (Auth has no session yet so C tokens may not be loaded)
const bg      = 'var(--bg, #09090b)';
const surface = 'var(--surface, #18181b)';
const border  = 'var(--border, #3f3f46)';
const border2 = 'var(--border2, #52525b)';
const textW   = 'var(--textW, #fafafa)';
const text1   = 'var(--text1, #d4d4d8)';
const text2   = 'var(--text2, #a1a1aa)';
const text3   = 'var(--text3, #71717a)';
const accent  = 'var(--accent, #f59e0b)';
const teal    = 'var(--teal, #14b8a6)';
const red     = 'var(--red, #ef4444)';

export default function Auth() {
  const [loading, setLoading]   = useState(false);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [mode, setMode]         = useState<'create' | 'join'>('create');
  const [inviteCode, setInviteCode] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isSignUp) {
        if (mode === 'join' && !inviteCode.trim()) throw new Error('Enter a valid Household Invite Code.');

        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        const userId = authData.user?.id;
        if (!userId) throw new Error('Authentication failed — please try again.');

        let targetHouseholdId = '';

        if (mode === 'create') {
          const newId = crypto.randomUUID();
          const { error: householdErr } = await supabase.from('households').insert({ id: newId });
          if (householdErr) console.warn('households insert skipped:', householdErr.message);
          const { error: settingsError } = await supabase.from('household_settings').insert({
            household_id: newId,
            settings_data: {
              partnerAName: 'Partner A', partnerBName: 'Partner B',
              householdMode: 'joint',
              expenseCategories: [
                'Groceries','Dining Out','Online Food Orders','Online Groceries',
                'Utilities','Housing','Personal Transportation','Cab Services',
                'Online Shopping','Offline Shopping','Subscriptions','Entertainment',
                'Healthcare','Personal Care','Health & Fitness','Investments',
                'Insurance','Savings','Travel','Education','Gifting',
                'Spouse Gifting','Family payments','Household Items',
                'Technology','Alcohol','Hosting Day','Taxes','Miscellaneous',
              ],
              incomeCategories: ['Salary','Freelance','Business','Interest Earned','Other Income'],
              budgets: {}, currency: 'INR', setupComplete: false,
            },
          });
          if (settingsError) throw settingsError;
          targetHouseholdId = newId;
        } else {
          const { data: existing, error: verifyError } = await supabase
            .from('household_settings').select('household_id')
            .eq('household_id', inviteCode.trim()).single();
          if (verifyError || !existing) throw new Error('Invalid Household Code. Verify with your partner.');
          targetHouseholdId = inviteCode.trim();
        }

        const assignedRole = mode === 'create' ? 'Partner A' : 'Partner B';
        const { error: profileError } = await supabase.from('profiles').insert({
          id: userId, household_id: targetHouseholdId,
          email: email.toLowerCase().trim(), display_name: assignedRole,
        });
        if (profileError) throw profileError;
        if (typeof window !== 'undefined') localStorage.setItem('cf_partner_role', assignedRole);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* Logo mark */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, background: accent, border: `2px solid #000`, boxShadow: '0 8px 40px rgba(0,0,0,0.5)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: '#09090b', letterSpacing: '-0.05em' }}>CF</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', color: textW }}>ChillarFlow</div>
        <div style={{ fontSize: 12, color: text3, marginTop: 4, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {isSignUp ? 'Create your household' : 'Welcome back'}
        </div>
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 400, background: surface, borderRadius: 24, border: `1px solid ${border}`, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>

        {/* Sign-up mode tabs */}
        {isSignUp && (
          <div style={{ display: 'flex', borderBottom: `1px solid ${border}`, borderRadius: '20px 20px 0 0', overflow: 'hidden' }}>
            {(['create', 'join'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                style={{ flex: 1, padding: '14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: 'transparent', border: 'none', cursor: 'pointer', borderBottom: mode === m ? `2px solid ${accent}` : '2px solid transparent', color: mode === m ? accent : text3, transition: 'color 0.15s', WebkitAppearance: 'none' }}>
                {m === 'create' ? '✦ Create New' : '⊕ Join Partner'}
              </button>
            ))}
          </div>
        )}

        <div style={{ padding: '28px 24px' }}>
          {/* Error */}
          {error && (
            <div style={{ background: `rgba(239,68,68,0.1)`, border: `1px solid ${red}`, padding: '10px 14px', fontSize: 13, color: red, marginBottom: 20 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Email */}
            <div>
              <label htmlFor="email" style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: text3, marginBottom: 8 }}>
                Email
              </label>
              <input id="email" name="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', background: 'var(--bg2, #0c0c0f)', border: `1px solid ${border2}`, borderRadius: 12, color: textW, padding: '14px 16px', fontSize: 16, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none' }}
                onFocus={(e) => e.target.style.borderColor = accent}
                onBlur={(e) => e.target.style.borderColor = border2}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: text3, marginBottom: 8 }}>
                Password
              </label>
              <input id="password" name="password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} required minLength={6} value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', background: 'var(--bg2, #0c0c0f)', border: `1px solid ${border2}`, borderRadius: 12, color: textW, padding: '14px 16px', fontSize: 16, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none' }}
                onFocus={(e) => e.target.style.borderColor = accent}
                onBlur={(e) => e.target.style.borderColor = border2}
              />
            </div>

            {/* Invite code (join mode) */}
            {isSignUp && mode === 'join' && (
              <div>
                <label htmlFor="inviteCode" style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: teal, marginBottom: 8 }}>
                  Household invite code
                </label>
                <input id="inviteCode" name="inviteCode" type="text" value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="Paste code from your partner's Settings"
                  required={mode === 'join'}
                  style={{ width: '100%', background: 'var(--bg2, #0c0c0f)', border: `1px solid ${teal}`, boxShadow: '0 2px 8px rgba(0,0,0,0.3)', color: textW, padding: '12px 14px', fontSize: 14, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none' }}
                />
                <div style={{ fontSize: 11, color: text3, marginTop: 6 }}>Find this in your partner's Settings → Your Household ID</div>
              </div>
            )}

            {/* Submit — NeoPOP press effect */}
            <button type="submit" disabled={loading}
              style={{ width: '100%', background: loading ? '#52525b' : accent, color: '#09090b', border: 'none', borderRadius: 99, boxShadow: loading ? 'none' : '0 4px 20px rgba(240,180,41,0.3)', padding: '14px', fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', WebkitAppearance: 'none', transition: 'transform 0.08s, box-shadow 0.08s', marginTop: 4 }}
              onMouseDown={(e) => { if (!loading) { (e.target as HTMLElement).style.transform = 'scale(0.97)'; (e.target as HTMLElement).style.boxShadow = 'none'; } }}
              onMouseUp={(e) => { (e.target as HTMLElement).style.transform = ''; (e.target as HTMLElement).style.boxShadow = '0 4px 20px rgba(240,180,41,0.3)'; }}
            >
              {loading ? '— Please wait —'
                : isSignUp
                  ? mode === 'join' ? 'Join Household' : 'Create Household'
                  : 'Sign In'}
            </button>
          </form>

          {/* Toggle */}
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${border}`, textAlign: 'center' }}>
            <button onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
              style={{ background: 'transparent', border: 'none', color: text2, fontSize: 13, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
              {isSignUp ? 'Already have an account? Sign in.' : 'Need an account? Sign up.'}
            </button>
          </div>
        </div>
      </div>

      {/* Back to site */}
      <a href="/" style={{ marginTop: 24, color: text3, fontSize: 12, textDecoration: 'none', letterSpacing: '0.04em' }}>
        ← Back to chillarflow.com
      </a>
    </div>
  );
}
