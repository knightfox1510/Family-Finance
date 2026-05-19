'use client';

import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const C = {
  bg: '#0b0f1a',
  surface: '#131928',
  border: '#1e2840',
  text1: '#a8b8d4',
  textW: '#e8eeff',
  amber: '#f59e0b',
  red: '#ef4444',
  teal: '#06b6d4',
};

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── NEW ONBOARDING STATE STRATEGY ──────────────────────────────────────
  // 'create' means generate fresh household, 'join' means link to existing code
  const [onboardingChoice, setOnboardingChoice] = useState<'create' | 'join'>('create');
  const [inviteCode, setInviteCode] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        // Validation: If joining, code must be populated
        if (onboardingChoice === 'join' && !inviteCode.trim()) {
          throw new Error('Please enter a valid Household Invite Code to proceed.');
        }

        // 1. Sign up the user account inside Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({ 
          email, 
          password 
        });
        if (authError) throw authError;

        const userId = authData.user?.id;
        if (!userId) throw new Error('Authentication state failed to resolve user parameters.');

        // 2. Compute Target Onboarding Destination
        let targetHouseholdId = '';

        if (onboardingChoice === 'create') {
          // Generates a clean random UUID for creators
          const newHouseholdUuid = typeof window !== 'undefined' && window.crypto?.randomUUID 
            ? window.crypto.randomUUID() 
            : Math.random().toString(36).substring(2, 15);

          // Instantiate household configuration data slot
          const { error: settingsError } = await supabase
            .from('household_settings')
            .insert({
              household_id: newHouseholdUuid,
              settings_data: {
                partnerAName: 'Partner A',
                partnerBName: 'Partner B',
                expenseCategories: ['Groceries', 'Dining Out', 'Utilities', 'Miscellaneous'],
                incomeCategories: ['Salary', 'Freelance', 'Other Income'],
                budgets: {},
                currency: 'INR'
              }
            });
          if (settingsError) throw settingsError;

          targetHouseholdId = newHouseholdUuid;
        } else {
          // Validate if the invite code actually points to an active house before linking
          const { data: householdExists, error: verifyError } = await supabase
            .from('household_settings')
            .select('household_id')
            .eq('household_id', inviteCode.trim())
            .single();

          if (verifyError || !householdExists) {
            throw new Error('Invalid Household Code. Please verify the string from your partner.');
          }

          targetHouseholdId = inviteCode.trim();
        }

        // 3. 🎯 THE UPDATED PROFILE INSERTION PAYLOAD
        // Automatically flags creators as Partner A and joiners as Partner B
        const assignedRole = onboardingChoice === 'create' ? 'Partner A' : 'Partner B';

        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: userId,
            household_id: targetHouseholdId,
            email: email.toLowerCase().trim(), // Stores the email address cleanly
            display_name: assignedRole         // Stores their systemic household role
          });
        if (profileError) throw profileError;

        // Configure a temporary role fallback for their device local storage
        if (typeof window !== 'undefined') {
          localStorage.setItem('active_partner_role', assignedRole);
        }

        alert('Success! Your account and ledger maps are synced. Welcome aboard!');
      }

        alert('Success! Your account and ledger maps are synced. Welcome aboard!');
      } else {
        // Standard Log In Pipeline
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const choiceTabStyle = (active: boolean) => ({
    flex: 1,
    padding: '8px',
    fontSize: 12,
    fontWeight: 600,
    background: active ? C.teal + '22' : 'transparent',
    color: active ? C.teal : C.text1,
    border: active ? `1px solid ${C.teal}` : `1px solid ${C.border}`,
    borderRadius: 8,
    cursor: 'pointer',
    outline: 'none',
    transition: 'all 0.2s ease',
  });

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        fontFamily: 'system-ui, sans-serif'
      }}
    >
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: '32px 28px',
          width: '100%',
          maxWidth: 400,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💰</div>
          <h2 style={{ color: C.textW, fontSize: 24, margin: 0, fontWeight: 800 }}>
            FamilyFinance
          </h2>
          <p style={{ color: C.text1, fontSize: 14, marginTop: 4 }}>
            {isSignUp
              ? 'Onboard a generic multiplayer household ecosystem'
              : 'Welcome back. Log in below.'}
          </p>
        </div>

        {error && (
          <div style={{ background: C.red + '22', color: C.red, border: `1px solid ${C.red}44`, padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* ─── NEW CONDITIONAL USER ONBOARDING CHANNELS FORK ─── */}
          {isSignUp && (
            <div style={{ background: C.bg, padding: 12, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10, border: `1px solid ${C.border}` }}>
              <label style={{ display: 'block', color: C.textW, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Setup Setup Mode
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setOnboardingChoice('create')} style={choiceTabStyle(onboardingChoice === 'create') as any}>
                  ✨ Create New
                </button>
                <button type="button" onClick={() => setOnboardingChoice('join')} style={choiceTabStyle(onboardingChoice === 'join') as any}>
                  🔗 Join Partner
                </button>
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', color: C.text1, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 8, padding: '10px 14px', width: '100%', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: C.text1, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{ background: C.bg, border: `1px solid ${C.border}`, color: C.textW, borderRadius: 8, padding: '10px 14px', width: '100%', boxSizing: 'border-box', outline: 'none' }}
            />
          </div>

          {/* ─── CONDITIONAL SLOT: ENFORCE INVITATION KEY ENTRY UP FRONT ─── */}
          {isSignUp && onboardingChoice === 'join' && (
            <div style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
              <label style={{ display: 'block', color: C.teal, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                🔗 Partner Invite Code
              </label>
              <input
                type="text"
                placeholder="Paste household code here..."
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required={onboardingChoice === 'join'}
                style={{ background: C.bg, border: `1px solid ${C.teal}`, color: C.textW, borderRadius: 8, padding: '10px 14px', width: '100%', boxSizing: 'border-box', outline: 'none', fontFamily: 'monospace' }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: `linear-gradient(135deg, ${onboardingChoice === 'join' && isSignUp ? C.teal : C.amber}, #d97706)`,
              color: '#0b0f1a',
              border: 'none',
              borderRadius: 8,
              padding: '12px',
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: 8,
            }}
          >
            {loading ? 'Processing...' : isSignUp ? (onboardingChoice === 'join' ? 'Link & Sign Up' : 'Create & Sign Up') : 'Log In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            style={{ background: 'transparent', border: 'none', color: C.text1, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isSignUp
              ? 'Already have an account? Log in.'
              : 'Need an account? Sign up.'}
          </button>
        </div>
      </div>
    </div>
  );
}
