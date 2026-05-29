// components/ui/Avatar.tsx
// Shared avatar component used across the app.
// Shows profile picture when available, falls back to coloured initial.
// Handles Supabase Storage URLs and arbitrary image URLs.

'use client';

import React, { useState } from 'react';

const COLORS = [
  '#f0b429', '#22c55e', '#a855f7', '#3b82f6', '#14b8a6', '#f97316',
  '#ec4899', '#ef4444', '#06b6d4', '#84cc16',
];

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

interface AvatarProps {
  /** Profile object or just the fields we need */
  profile?: {
    id?:          string;
    display_name?: string | null;
    ghost_name?:  string | null;
    avatar_url?:  string | null;
  } | null;
  /** Override name (used when profile object is unavailable) */
  name?:        string;
  /** Override color seed (falls back to profile.id or name) */
  colorSeed?:   string;
  /** Override image URL */
  src?:         string | null;
  size?:        number;
  /** Border highlight — pass a CSS color string */
  highlight?:   string;
  style?:       React.CSSProperties;
}

const ROLE_STRINGS = new Set(['Partner A', 'Partner B', 'partner_a', 'partner_b']);

function resolveName(profile: AvatarProps['profile'], nameProp?: string): string {
  if (nameProp) return nameProp;
  if (!profile) return '?';
  const dn = profile.display_name;
  if (dn && !ROLE_STRINGS.has(dn)) return dn;
  return profile.ghost_name || dn || '?';
}

export function Avatar({ profile, name, colorSeed, src, size = 36, highlight, style }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  const resolvedName  = resolveName(profile, name);
  const initial       = resolvedName.charAt(0).toUpperCase();
  const seed          = colorSeed || profile?.id || resolvedName;
  const bg            = colorForId(seed);
  const imageUrl      = (!imgError && (src ?? profile?.avatar_url)) || null;

  const base: React.CSSProperties = {
    width:          size,
    height:         size,
    borderRadius:   '50%',
    flexShrink:     0,
    overflow:       'hidden',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    border:         highlight ? '2px solid ' + highlight : undefined,
    boxSizing:      'border-box',
    ...style,
  };

  if (imageUrl) {
    return (
      <div style={{ ...base, background: bg }}>
        <img
          src={imageUrl}
          alt={resolvedName}
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div style={{ ...base, background: bg, color: '#0a0a0a', fontSize: size * 0.38, fontWeight: 800 }}>
      {initial}
    </div>
  );
}

// ── Avatar upload (used in Settings) ─────────────────────────────────────────
interface AvatarUploadProps {
  profile: {
    id:         string;
    display_name?: string | null;
    ghost_name?:   string | null;
    avatar_url?:   string | null;
  };
  onUploaded: (url: string) => void;
}

export function AvatarUpload({ profile, onUploaded }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview]     = useState<string | null>(profile.avatar_url ?? null);
  const [error, setError]         = useState<string | null>(null);
  const inputRef                  = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('image/')) { setError('Please select an image file.'); return; }
    if (file.size > 2 * 1024 * 1024)    { setError('Image must be under 2 MB.'); return; }
    setError(null);
    setUploading(true);

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      const { supabase } = await import('@/lib/supabaseClient');
      const ext      = file.name.split('.').pop() ?? 'jpg';
      const path     = 'avatars/' + profile.id + '.' + ext;

      const { error: upErr } = await supabase.storage
        .from('user-avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (upErr) { setError('Upload failed: ' + upErr.message); return; }

      const { data: urlData } = supabase.storage.from('user-avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl + '?t=' + Date.now(); // cache-bust

      // Save to profiles table
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id);
      setPreview(publicUrl);
      onUploaded(publicUrl);
    } catch (e: any) {
      setError(e.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {/* Clickable avatar */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        style={{ position: 'relative', cursor: uploading ? 'not-allowed' : 'pointer' }}
      >
        <Avatar profile={{ ...profile, avatar_url: preview }} size={80} />
        <div style={{
          position: 'absolute', bottom: 0, right: 0,
          width: 26, height: 26, borderRadius: '50%',
          background: '#f0b429', color: '#0a0a0a',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 800, border: '2px solid #0a0a0a',
        }}>
          {uploading ? '\u2026' : '\u270F'}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />

      <div style={{ fontSize: 11, color: '#888', textAlign: 'center', lineHeight: 1.5 }}>
        {uploading ? 'Uploading\u2026' : 'Tap to change photo \u00B7 max 2\u202FMB'}
      </div>

      {error && (
        <div style={{ fontSize: 12, color: '#ef4444', textAlign: 'center' }}>{error}</div>
      )}
    </div>
  );
}
