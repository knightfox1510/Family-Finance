'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const C = {
  bg:      '#0b0f1a',
  surface: '#131928',
  border:  '#1e2840',
  text1:   '#a8b8d4',
  textW:   '#e8eeff',
  amber:   '#f59e0b',
  red:     '#ef4444',
  teal:    '#06b6d4',
};

const inputStyle: React.CSSProperties = {
  background: C.bg,
  border: `1px solid ${C.border}`,
  color: C.textW,
  borderRadius: 8,
  padding: '12px 14px',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
  fontSize: 16, // 16px prevents iOS auto-zoom on focus
  WebkitAppearance: 'none',
};

export default function Auth() {
  const [loading, setLoading]   = useState(false);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false); // default = sign in
  const [error, setError]       = useState<string | null>(null);
  const [onboardingChoice, setOnboardingChoice] = useState<'create' | 'join'>('create');
  const [inviteCode, setInviteCode] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        if (onboardingChoice === 'join' && !inviteCode.trim()) {
          throw new Error('Please enter a valid Household Invite Code to proceed.');
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;

        const userId = authData.user?.id;
        if (!userId) throw new Error('Authentication failed — please try again.');

        let targetHouseholdId = '';

        if (onboardingChoice === 'create') {
          const newHouseholdId = crypto.randomUUID();

          // Insert into households table (required for plan/usage tracking)
          const { error: householdError } = await supabase
            .from('households')
            .insert({ id: newHouseholdId });
          // Non-fatal if households table doesn't exist yet — log and continue
          if (householdError) console.warn('households insert skipped:', householdError.message);

          // Insert household settings
          const { error: settingsError } = await supabase
            .from('household_settings')
            .insert({
              household_id: newHouseholdId,
              settings_data: {
                partnerAName:      'Partner A',
                partnerBName:      'Partner B',
                householdMode:     'joint',
                expenseCategories: [
                  'Groceries', 'Dining Out', 'Online Food Orders', 'Online Groceries',
                  'Utilities', 'Housing', 'Personal Transportation', 'Cab Services',
                  'Online Shopping', 'Offline Shopping', 'Subscriptions', 'Entertainment',
                  'Healthcare', 'Personal Care', 'Health & Fitness', 'Investments',
                  'Insurance', 'Savings', 'Travel', 'Education', 'Gifting',
                  'Spouse Gifting', 'Family payments', 'Household Items',
                  'Technology', 'Alcohol', 'Hosting Day', 'Taxes', 'Miscellaneous',
                ],
                incomeCategories: ['Salary', 'Freelance', 'Business', 'Interest Earned', 'Other Income'],
                budgets:  {},
                currency: 'INR',
                setupComplete: false,
              },
            });
          if (settingsError) throw settingsError;

          targetHouseholdId = newHouseholdId;

        } else {
          // Joining an existing household
          const { data: existing, error: verifyError } = await supabase
            .from('household_settings')
            .select('household_id')
            .eq('household_id', inviteCode.trim())
            .single();

          if (verifyError || !existing) {
            throw new Error('Invalid Household Code. Please verify with your partner.');
          }
          targetHouseholdId = inviteCode.trim();
        }

        const assignedRole = onboardingChoice === 'create' ? 'Partner A' : 'Partner B';

        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id:           userId,
            household_id: targetHouseholdId,
            email:        email.toLowerCase().trim(),
            display_name: assignedRole,
          });
        if (profileError) throw profileError;

        if (typeof window !== 'undefined') {
          localStorage.setItem('cf_partner_role', assignedRole);
        }

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

  const choiceTabStyle = (active: boolean): React.CSSProperties => ({
    flex:       1,
    padding:    '8px',
    fontSize:   12,
    fontWeight: 600,
    background: active ? C.teal + '22' : 'transparent',
    color:      active ? C.teal : C.text1,
    border:     active ? `1px solid ${C.teal}` : `1px solid ${C.border}`,
    borderRadius: 8,
    cursor:     'pointer',
    outline:    'none',
    transition: 'all 0.2s ease',
    WebkitAppearance: 'none' as any,
    minHeight:  44,
  });

  return (
    <div style={{
      background: C.bg, minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 16, padding: '32px 28px', width: '100%', maxWidth: 400,
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💰</div>
          <h2 style={{ color: C.textW, fontSize: 24, margin: 0, fontWeight: 800 }}>ChillarFlow</h2>
          <p style={{ color: C.text1, fontSize: 14, marginTop: 4 }}>
            {isSignUp ? 'Create your household account' : 'Welcome back — sign in below'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: C.red + '22', color: C.red, border: `1px solid ${C.red}44`, padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Sign-up mode toggle */}
          {isSignUp && (
            <div style={{ background: C.bg, padding: 12, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10, border: `1px solid ${C.border}` }}>
              <label style={{ display: 'block', color: C.textW, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Setup mode
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setOnboardingChoice('create')} style={choiceTabStyle(onboardingChoice === 'create')}>
                  ✨ Create New
                </button>
                <button type="button" onClick={() => setOnboardingChoice('join')} style={choiceTabStyle(onboardingChoice === 'join')}>
                  🔗 Join Partner
                </button>
              </div>
            </div>
          )}

          {/* Email */}
          <div>
            <label htmlFor="email" style={{ display: 'block', color: C.text1, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" style={{ display: 'block', color: C.text1, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={inputStyle}
            />
          </div>

          {/* Invite code for join flow */}
          {isSignUp && onboardingChoice === 'join' && (
            <div>
              <label htmlFor="inviteCode" style={{ display: 'block', color: C.teal, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                🔗 Partner Invite Code
              </label>
              <input
                id="inviteCode"
                name="inviteCode"
                type="text"
                placeholder="Paste household ID from your partner's Settings"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required={onboardingChoice === 'join'}
                style={{ ...inputStyle, border: `1px solid ${C.teal}`, fontFamily: 'monospace', fontSize: 13 }}
              />
              <p style={{ color: C.text1, fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
                Your partner can find this in Settings → Household ID.
              </p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? C.border : `linear-gradient(135deg, ${C.amber}, #d97706)`,
              color: '#0b0f1a', border: 'none', borderRadius: 8,
              padding: '14px', fontSize: 15, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer', marginTop: 8,
              minHeight: 44, WebkitAppearance: 'none',
            }}
          >
            {loading
              ? 'Please wait…'
              : isSignUp
                ? onboardingChoice === 'join' ? 'Link & Sign Up' : 'Create & Sign Up'
                : 'Sign In'}
          </button>
        </form>

        {/* Toggle sign in / sign up */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
            style={{ background: 'transparent', border: 'none', color: C.text1, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isSignUp ? 'Already have an account? Sign in.' : 'Need an account? Sign up.'}
          </button>
        </div>
      </div>

      {/* Back to landing page */}
      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <a href="/" style={{ color: C.muted, fontSize: 13, textDecoration: 'none' }}>
          ← Back to chillarflow.com
        </a>
      </div>
    </div>
  );
}
