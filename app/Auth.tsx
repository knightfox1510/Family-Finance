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
};

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert('Success! Your account has been created. You are now logged in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: C.bg,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
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
          <h2
            style={{ color: C.textW, fontSize: 24, margin: 0, fontWeight: 800 }}
          >
            FamilyFinance
          </h2>
          <p style={{ color: C.text1, fontSize: 14, marginTop: 4 }}>
            {isSignUp
              ? 'Create a new household account'
              : 'Welcome back. Log in below.'}
          </p>
        </div>

        {error && (
          <div
            style={{
              background: C.red + '22',
              color: C.red,
              border: `1px solid ${C.red}44`,
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <form
          onSubmit={handleAuth}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <div>
            <label
              style={{
                display: 'block',
                color: C.text1,
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                color: C.textW,
                borderRadius: 8,
                padding: '10px 14px',
                width: '100%',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                color: C.text1,
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                color: C.textW,
                borderRadius: 8,
                padding: '10px 14px',
                width: '100%',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              background: `linear-gradient(135deg, ${C.amber}, #d97706)`,
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
            {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Log In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: C.text1,
              fontSize: 13,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
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
