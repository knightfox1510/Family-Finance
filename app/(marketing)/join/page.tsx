// app/(marketing)/join/page.tsx
// FIX 1: AvatarStack now fetches real member profiles so it shows actual initials
//         (not just A, B, C placeholders) and real avatar photos where available.
// FIX 2: invited_by name comes from the API which now resolves the real name.
'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { CoinMark } from '@/components/marketing/CoinMark';

interface InvitePreview {
  valid:        boolean;
  code:         string;
  group_id:     string;
  group_name:   string;
  description?: string;
  currency:     string;
  invited_by:   string;
  member_count: number;
  expires_at:   string;
}

interface MemberPreview {
  id:           string;
  display_name: string | null;
  ghost_name:   string | null;
  avatar_url:   string | null;
}

const AVATAR_COLORS = ['#f0b429', '#22c55e', '#818cf8', '#2dd4bf', '#f97316'];

// ── Avatar stack — shows real member initials / photos ───────────────────────
function AvatarStack({ members, total }: { members: MemberPreview[]; total: number }) {
  const shown = members.slice(0, 5);

  function initials(m: MemberPreview): string {
    const name = m.display_name || m.ghost_name || '?';
    return name.charAt(0).toUpperCase();
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {shown.map((m, i) => (
        <div
          key={m.id}
          title={m.display_name || m.ghost_name || undefined}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: m.avatar_url ? 'transparent' : AVATAR_COLORS[i % AVATAR_COLORS.length],
            border: '2px solid var(--bg, #0a0a0a)',
            marginLeft: i > 0 ? -10 : 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 800, color: '#0a0a0a',
            zIndex: shown.length - i,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {m.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={m.avatar_url}
              alt={m.display_name ?? ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
            />
          ) : (
            initials(m)
          )}
        </div>
      ))}
      {total > 5 && (
        <div style={{
          marginLeft: -10, zIndex: 0,
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--surface2, #242424)',
          border: '2px solid var(--bg, #0a0a0a)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, color: 'var(--text2, #999)',
          position: 'relative',
        }}>
          +{total - 5}
        </div>
      )}
    </div>
  );
}

// ── Skeleton loader ──────────────────────────────────────────────────────────
function JoinSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 420 }}>
      {[80, 40, 120, 56].map((h, i) => (
        <div
          key={i}
          style={{
            height: h, borderRadius: 14,
            background: 'var(--surface, #1a1a1a)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}

// ── Main join page content ───────────────────────────────────────────────────
function JoinPageContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const code         = searchParams.get('g');

  const [preview, setPreview]       = useState<InvitePreview | null>(null);
  const [members, setMembers]       = useState<MemberPreview[]>([]);
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [joining, setJoining]       = useState(false);
  const [session, setSession]       = useState<any>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // Validate invite and fetch member previews in parallel
  useEffect(() => {
    if (!code) {
      setError('No invite code found in this link.');
      setLoading(false);
      return;
    }

    fetch(`/api/groups/invite?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.valid) {
          setError(data.error || 'Invalid invite link.');
          return;
        }
        setPreview(data);

        // Fetch real member profiles for the avatar stack
        // Use the public members endpoint — it only returns id + display_name + ghost_name
        // We call it without auth so only non-sensitive fields are returned.
        // NOTE: if the endpoint requires auth, we skip gracefully.
        try {
          const mRes = await fetch(`/api/groups/invite/members?groupId=${data.group_id}`);
          if (mRes.ok) {
            const mData = await mRes.json();
            setMembers(mData.members ?? []);
          }
        } catch {
          // Non-fatal — fall back to count-only display
        }
      })
      .catch(() => setError('Could not verify this invite link. Please try again.'))
      .finally(() => setLoading(false));
  }, [code]);

  const handleJoin = async () => {
    if (!session || !code || !preview) return;
    setJoining(true);

    try {
      const res = await fetch('/api/groups/invite', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          code,
          newUserId:   session.user.id,
          displayName: session.user.email,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Could not join group.');
        return;
      }

      setJoinSuccess(true);
      setTimeout(() => {
        router.push(`/app?group=${preview.group_id}`);
      }, 1800);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg, #0a0a0a)',
      color: 'var(--textW, #f5f5f5)',
      fontFamily: "'Inter', -apple-system, sans-serif",
      display: 'flex',
      flexDirection: 'column',
    }}>
      <nav style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--border, #2e2e2e)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <CoinMark size={28} color="var(--accent, #f0b429)" />
          <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--textW, #f5f5f5)', letterSpacing: '-0.02em' }}>
            ChillarFlow
          </span>
        </Link>
        {!session && (
          <Link
            href="/auth"
            style={{
              fontSize: 13, fontWeight: 600, color: 'var(--accent, #f0b429)',
              textDecoration: 'none', padding: '6px 14px',
              border: '1px solid var(--accent, #f0b429)',
              borderRadius: 99,
            }}
          >
            Sign in
          </Link>
        )}
      </nav>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}>
        {children}
      </div>
    </div>
  );

  if (loading) return <Shell><JoinSkeleton /></Shell>;

  if (error) return (
    <Shell>
      <div style={{
        maxWidth: 420, width: '100%', textAlign: 'center',
        background: 'var(--surface, #1a1a1a)',
        border: '1px solid var(--border, #2e2e2e)',
        borderRadius: 20, padding: '40px 32px',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔗</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8, letterSpacing: '-0.02em' }}>
          Invite not found
        </h1>
        <p style={{ color: 'var(--text2, #999)', fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
          {error}
        </p>
        <Link href="/" style={{
          display: 'block', padding: '13px', borderRadius: 99,
          background: 'var(--accent, #f0b429)', color: '#0a0a0a',
          fontWeight: 800, fontSize: 14, textDecoration: 'none', textAlign: 'center',
        }}>
          Go to ChillarFlow
        </Link>
      </div>
    </Shell>
  );

  if (joinSuccess) return (
    <Shell>
      <div style={{
        maxWidth: 420, width: '100%', textAlign: 'center',
        padding: '40px 32px',
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'var(--green-bg, rgba(34,197,94,0.12))',
          border: '2px solid var(--green, #22c55e)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, margin: '0 auto 20px',
        }}>
          ✓
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 8, letterSpacing: '-0.02em', color: 'var(--green, #22c55e)' }}>
          You're in!
        </h1>
        <p style={{ color: 'var(--text2, #999)', fontSize: 14, marginBottom: 4 }}>
          You've joined <strong style={{ color: 'var(--textW)' }}>{preview?.group_name}</strong>
        </p>
        <p style={{ color: 'var(--text3, #666)', fontSize: 13 }}>Redirecting you to the group…</p>
      </div>
    </Shell>
  );

  // Show member avatars: prefer fetched profiles, fall back to count-only
  const displayMembers = members.length > 0 ? members : [];

  return (
    <Shell>
      <div style={{ maxWidth: 420, width: '100%' }}>

        <div style={{
          textAlign: 'center', marginBottom: 24,
          fontSize: 14, color: 'var(--text2, #999)',
        }}>
          <span style={{ color: 'var(--accent, #f0b429)', fontWeight: 700 }}>
            {preview!.invited_by}
          </span>{' '}
          invited you to split expenses
        </div>

        <div style={{
          background: 'var(--surface, #1a1a1a)',
          border: '1px solid var(--accent, #f0b429)',
          borderRadius: 24,
          padding: '28px 28px 24px',
          marginBottom: 20,
          boxShadow: '0 0 40px rgba(240,180,41,0.08)',
        }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--accent, #f0b429)',
              marginBottom: 6,
            }}>
              You're invited to
            </div>
            <h1 style={{
              fontSize: 28, fontWeight: 900, margin: 0,
              letterSpacing: '-0.03em', lineHeight: 1.1,
            }}>
              {preview!.group_name}
            </h1>
            {preview!.description && (
              <p style={{
                fontSize: 14, color: 'var(--text2, #999)',
                marginTop: 8, lineHeight: 1.5,
              }}>
                {preview!.description}
              </p>
            )}
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px',
            background: 'var(--surface2, #242424)',
            borderRadius: 14, marginBottom: 8,
          }}>
            {displayMembers.length > 0 ? (
              <AvatarStack members={displayMembers} total={preview!.member_count} />
            ) : (
              // Fallback: generic avatar circles when members couldn't be fetched
              <div style={{ display: 'flex', gap: 0 }}>
                {Array.from({ length: Math.min(preview!.member_count, 5) }).map((_, i) => (
                  <div key={i} style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                    border: '2px solid var(--surface2, #242424)',
                    marginLeft: i > 0 ? -10 : 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 800, color: '#0a0a0a',
                    position: 'relative', zIndex: 5 - i,
                  }}>
                    {String.fromCharCode(65 + i)}
                  </div>
                ))}
              </div>
            )}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>
                {preview!.member_count} member{preview!.member_count !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3, #666)', marginTop: 1 }}>
                already splitting in {preview!.currency}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text3, #666)', textAlign: 'center', marginTop: 12 }}>
            Invite expires{' '}
            {new Date(preview!.expires_at).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
          </div>
        </div>

        {session ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={handleJoin}
              disabled={joining}
              style={{
                width: '100%', padding: '15px',
                borderRadius: 99, border: 'none',
                background: joining ? 'var(--surface2, #242424)' : 'var(--accent, #f0b429)',
                color: joining ? 'var(--text3, #666)' : '#0a0a0a',
                fontSize: 15, fontWeight: 800,
                cursor: joining ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {joining ? 'Joining…' : `Join ${preview!.group_name}`}
            </button>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3, #666)' }}>
              Joining as <strong style={{ color: 'var(--text1)' }}>{session.user.email}</strong>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link
              href={`/auth?invite=${code}&mode=signup`}
              style={{
                display: 'block', padding: '15px', borderRadius: 99,
                background: 'var(--accent, #f0b429)', color: '#0a0a0a',
                fontSize: 15, fontWeight: 800, textDecoration: 'none', textAlign: 'center',
              }}
            >
              Create account & join
            </Link>
            <Link
              href={`/auth?invite=${code}&mode=signin`}
              style={{
                display: 'block', padding: '13px', borderRadius: 99,
                background: 'transparent',
                border: '1px solid var(--border2, #3a3a3a)',
                color: 'var(--text1, #ccc)',
                fontSize: 14, fontWeight: 600, textDecoration: 'none', textAlign: 'center',
              }}
            >
              Already have an account? Sign in
            </Link>
            <p style={{
              textAlign: 'center', fontSize: 11,
              color: 'var(--text3, #666)', lineHeight: 1.5, margin: 0,
            }}>
              Free to join. No credit card needed.
            </p>
          </div>
        )}
      </div>
    </Shell>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100dvh', background: '#0a0a0a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CoinMark size={36} color="#f0b429" />
      </div>
    }>
      <JoinPageContent />
    </Suspense>
  );
}
