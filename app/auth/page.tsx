// app/auth/page.tsx — ChillarFlow unified authentication
// Fixed: reads ?invite= URL param and joins the group after signup
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { CoinMark } from '@/components/marketing/CoinMark';

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read invite code and mode from URL (?invite=CF-XXXXXX&mode=signup)
  const urlInvite = searchParams.get('invite');
  const urlMode   = searchParams.get('mode'); // 'signup' | 'signin'

  const [loading, setLoading]       = useState(false);
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [isSignUp, setIsSignUp]     = useState(urlMode === 'signup');
  const [error, setError]           = useState<string | null>(null);
  const [mode, setMode]             = useState<'create' | 'join'>('create');
  const [inviteCode, setInviteCode] = useState('');

  // If arriving from a group invite link, auto-switch to signup
  useEffect(() => {
    if (urlInvite) setIsSignUp(true);
  }, [urlInvite]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        if (mode === 'join' && !inviteCode.trim()) {
          throw new Error('Please enter a valid Household Invite Code to proceed.');
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;

        const userId = authData.user?.id;
        if (!userId) throw new Error('Authentication failed — please try again.');

        let targetHouseholdId = '';

        if (mode === 'create') {
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
          // Joining existing household via household ID
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

        const assignedRole = mode === 'create' ? 'Partner A' : 'Partner B';

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

        // ── If arrived via a group invite link, consume it now ───────────
        // urlInvite is the group invite code (CF-XXXXXX) from ?invite= param
        if (urlInvite) {
          try {
            const joinRes = await fetch('/api/groups/invite', {
              method:  'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                code:        urlInvite,
                newUserId:   userId,
                displayName: email.toLowerCase().trim(),
              }),
            });
            const joinData = await joinRes.json();
            if (joinRes.ok && joinData.group_id) {
              // Redirect straight to the group they were invited to
              router.push(`/app?group=${joinData.group_id}`);
              return;
            }
          } catch {
            // Non-fatal — still redirect to app even if group join fails
          }
        }

        // Default redirect
        router.push('/app');

      } else {
        // Sign in
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;

        // If arriving from a group invite link while signing in, join the group
        if (urlInvite && data.user) {
          try {
            const joinRes = await fetch('/api/groups/invite', {
              method:  'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                code:      urlInvite,
                newUserId: data.user.id,
              }),
            });
            const joinData = await joinRes.json();
            if (joinRes.ok && joinData.group_id) {
              router.push(`/app?group=${joinData.group_id}`);
              return;
            }
          } catch {
            // Non-fatal
          }
        }

        router.push('/app');
      }

    } catch (err: any) {
      console.error('Auth error:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        minHeight: '100dvh', width: '100vw',
        padding: '24px 20px', boxSizing: 'border-box',
        background: 'var(--bg)',
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      }}
    >
      <div className="cf-card animate-fade-up" style={{ width: '100%', maxWidth: 400, padding: '44px 32px 40px', border: '1px solid var(--border)', position: 'relative' }}>

        <Link href="/"
          style={{ position: 'absolute', top: '20px', right: '20px', textDecoration: 'none', color: 'var(--text3)', fontSize: '24px', fontWeight: 300, lineHeight: 1, padding: '4px', transition: 'color 0.15s ease' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text1)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text3)'}
        >
          &times;
        </Link>

        <div className="text-center" style={{ marginBottom: 32 }}>
          <div className="flex justify-between items-center" style={{ justifyContent: 'center', marginBottom: 16 }}>
            <CoinMark size={48} color="var(--accent)" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--textW)', letterSpacing: '-0.03em', margin: 0 }}>ChillarFlow</h2>
          {urlInvite ? (
            <p className="t-body" style={{ fontSize: 14, marginTop: 6, color: 'var(--accent)' }}>
              Create an account to join the group
            </p>
          ) : (
            <p className="t-body" style={{ fontSize: 14, marginTop: 6, color: 'var(--text2)' }}>
              {isSignUp ? 'Create your secure household vault' : 'Welcome back — access your private dashboard'}
            </p>
          )}
        </div>

        {error && (
          <div className="animate-fade-in" style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(255,77,77,0.2)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: 13, marginBottom: 20, lineHeight: 1.4 }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleAuth} className="flex flex-col" style={{ gap: 20 }}>

          {/* Only show household mode picker if NOT arriving from a group invite */}
          {isSignUp && !urlInvite && (
            <div className="cf-card-inset flex flex-col" style={{ padding: 16, gap: 12, border: '1px solid var(--border)' }}>
              <label className="t-caption" style={{ color: 'var(--text3)' }}>Setup Operations Mode</label>
              <div className="flex" style={{ gap: 10 }}>
                <button type="button" onClick={() => setMode('create')} className={`cf-chip flex-1 justify-between ${mode === 'create' ? 'active' : ''}`} style={{ textAlign: 'center', justifyContent: 'center', minHeight: 40 }}>
                  ✨ Create New
                </button>
                <button type="button" onClick={() => setMode('join')} className={`cf-chip flex-1 justify-between ${mode === 'join' ? 'active' : ''}`} style={{ textAlign: 'center', justifyContent: 'center', minHeight: 40 }}>
                  🔗 Join Partner
                </button>
              </div>
            </div>
          )}

          {/* When arriving from group invite, show a context note */}
          {isSignUp && urlInvite && (
            <div style={{ padding: '10px 14px', background: 'var(--accent-bg)', border: '1px solid var(--accent)', borderRadius: 12, fontSize: 13, color: 'var(--accent)' }}>
              🎉 You'll be added to the group automatically after signing up.
            </div>
          )}

          <div className="flex flex-col" style={{ gap: 6 }}>
            <label htmlFor="email" className="t-caption" style={{ color: 'var(--text2)' }}>Account Email Address</label>
            <input
              id="email" name="email" type="email" autoComplete="email"
              placeholder="name@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
              required className="cf-input"
            />
          </div>

          <div className="flex flex-col" style={{ gap: 6 }}>
            <label htmlFor="password" className="t-caption" style={{ color: 'var(--text2)' }}>Password</label>
            <input
              id="password" name="password" type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)}
              required minLength={6} className="cf-input"
            />
          </div>

          {isSignUp && mode === 'join' && !urlInvite && (
            <div className="animate-fade-in flex flex-col" style={{ gap: 6 }}>
              <label htmlFor="inviteCode" className="t-caption" style={{ color: 'var(--teal)' }}>
                🔗 Partner Invite Code Token
              </label>
              <input
                id="inviteCode" name="inviteCode" type="text"
                placeholder="Paste partner household unique identifier..."
                value={inviteCode} onChange={(e) => setInviteCode(e.target.value)}
                required={mode === 'join'}
                className="cf-input"
                style={{ borderColor: 'var(--teal)', fontFamily: 'monospace', fontSize: 13, letterSpacing: '0.02em' }}
              />
              <p className="t-small t-muted" style={{ marginTop: 4, lineHeight: 1.5 }}>
                Your partner can locate this key on their main application dashboard inside Settings → Household ID.
              </p>
            </div>
          )}

          <button
            type="submit" disabled={loading}
            className={`cf-btn cf-btn-full ${loading ? '' : 'cf-btn-primary'}`}
            style={{ marginTop: 8, background: loading ? 'var(--border)' : undefined, color: loading ? 'var(--text3)' : undefined, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading
              ? 'Setting up your account…'
              : isSignUp
                ? urlInvite ? 'Create account & join group' : mode === 'join' ? 'Link Vault & Sign Up' : 'Initialize Vault & Sign Up'
                : 'Access Secure Account'}
          </button>
        </form>

        <div className="text-center" style={{ marginTop: 24 }}>
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
            className="t-small t-muted"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontWeight: 500 }}
          >
            {isSignUp ? 'Already have an account? Sign in.' : 'New to the platform? Create a free account.'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CoinMark size={36} color="var(--accent)" />
      </div>
    }>
      <AuthPageContent />
    </Suspense>
  );
}
