// app/auth/page.tsx — ChillarFlow premium unified authentication experience
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { CoinMark } from '@/components/CoinMark';

export default function AuthPage() {
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

          const { error: householdError } = await supabase
            .from('households')
            .insert({ id: newHouseholdId });
          if (householdError) console.warn('households insert skipped:', householdError.message);

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

  return (
    <div className="cf-page flex flex-col items-center justify-between" style={{ minHeight: '100dvh', padding: '40px 20px 24px' }}>
      
      {/* Structural Empty spacer to keep balance with central card */}
      <div style={{ height: 20 }} />

      {/* Main Container Core Auth Module Card */}
      <div className="cf-card animate-fade-up" style={{ width: '100%', maxWidth: 400, padding: '40px 32px', border: '1px solid var(--border)' }}>
        
        {/* Brand System Title Header Area */}
        <div className="text-center" style={{ marginBottom: 32 }}>
          <div className="flex justify-between items-center" style={{ justifyContent: 'center', marginBottom: 16 }}>
            <CoinMark size={48} color="var(--accent)" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--textW)', letterSpacing: '-0.03em', margin: 0 }}>ChillarFlow</h2>
          <p className="t-body" style={{ fontSize: 14, marginTop: 6, color: 'var(--text2)' }}>
            {isSignUp ? 'Create your secure household vault' : 'Welcome back — access your private dashboard'}
          </p>
        </div>

        {/* Runtime Operational Error Alert Feedback Block */}
        {error && (
          <div className="animate-fade-in" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(255,77,77,0.2)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 20, lineHeight: 1.4 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="flex flex-col" style={{ gap: 20 }}>

          {/* Interactive Dynamic Context Multi-Setup Toggle Block */}
          {isSignUp && (
            <div className="cf-card-inset flex flex-col" style={{ padding: 16, gap: 12, border: '1px solid var(--border)' }}>
              <label className="t-caption" style={{ color: 'var(--text3)' }}>
                Setup Operations Mode
              </label>
              <div className="flex" style={{ gap: 10 }}>
                <button type="button" onClick={() => setOnboardingChoice('create')} className={`cf-chip flex-1 justify-between ${onboardingChoice === 'create' ? 'active' : ''}`} style={{ textAlign: 'center', justifyContent: 'center', minHeight: 40 }}>
                  ✨ Create New
                </button>
                <button type="button" onClick={() => setOnboardingChoice('join')} className={`cf-chip flex-1 justify-between ${onboardingChoice === 'join' ? 'active' : ''}`} style={{ textAlign: 'center', justifyContent: 'center', minHeight: 40 }}>
                  🔗 Join Partner
                </button>
              </div>
            </div>
          )}

          {/* Email Form Field Block */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label htmlFor="email" className="t-caption" style={{ color: 'var(--text2)' }}>
              Account Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="cf-input"
            />
          </div>

          {/* Password Form Field Block */}
          <div className="flex flex-col" style={{ gap: 6 }}>
            <label htmlFor="password" className="t-caption" style={{ color: 'var(--text2)' }}>
              Secret Password Keys
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="cf-input"
            />
          </div>

          {/* Conditional Multi-tier Connection Invite Route Input Block */}
          {isSignUp && onboardingChoice === 'join' && (
            <div className="animate-fade-in flex flex-col" style={{ gap: 6 }}>
              <label htmlFor="inviteCode" className="t-caption" style={{ color: 'var(--teal)' }}>
                🔗 Partner Invite Code Token
              </label>
              <input
                id="inviteCode"
                name="inviteCode"
                type="text"
                placeholder="Paste partner household unique identifier..."
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required={onboardingChoice === 'join'}
                className="cf-input"
                style={{ borderColor: 'var(--teal)', fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.02em' }}
              />
              <p className="t-small t-muted" style={{ marginTop: 4, lineHeight: 1.5 }}>
                Your partner can locate this key on their main application dashboard inside Settings → Household ID.
              </p>
            </div>
          )}

          {/* Central Submission Execution Command Node Button */}
          <button
            type="submit"
            disabled={loading}
            className={`cf-btn cf-btn-full ${loading ? '' : 'cf-btn-primary'}`}
            style={{
              marginTop: 8,
              background: loading ? 'var(--border)' : undefined,
              color: loading ? 'var(--text3)' : undefined,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading
              ? 'Synchronizing Pipeline Vault…'
              : isSignUp
                ? onboardingChoice === 'join' ? 'Link Vault & Sign Up' : 'Initialize Vault & Sign Up'
                : 'Access Secure Account'}
          </button>
        </form>

        {/* Dynamic Context Entry Path Link Swapper */}
        <div className="text-center" style={{ marginTop: 24 }}>
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
            className="t-small t-muted"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontWeight: 500 }}
          >
            {isSignUp ? 'Already have an initialized ledger? Sign in.' : 'New to the platform? Initialize a free account.'}
          </button>
        </div>
      </div>

      {/* Return Vector Anchor Footer Link Elements */}
      <div className="text-center" style={{ marginTop: 32 }}>
        <Link href="/" className="t-small t-muted" style={{ textDecoration: 'none', fontWeight: 500 }}>
          ← Cancel and return to chillarflow.com
        </Link>
      </div>
    </div>
  );
}
