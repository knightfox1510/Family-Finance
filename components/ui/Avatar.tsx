// components/ui/Avatar.tsx
// Shared avatar component used across the app.
// Shows profile picture when available, falls back to coloured initial.
// Handles Supabase Storage URLs and arbitrary image URLs.
//
// AvatarUpload now shows a canvas-based crop/zoom modal before uploading.
// No external libraries — pure canvas API + pointer events.

'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

// ── Colour helpers ────────────────────────────────────────────────────────────

const COLORS = [
  '#f0b429', '#22c55e', '#a855f7', '#3b82f6', '#14b8a6', '#f97316',
  '#ec4899', '#ef4444', '#06b6d4', '#84cc16',
];

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

// ── Avatar (display only) ─────────────────────────────────────────────────────

interface AvatarProps {
  profile?: {
    id?:           string;
    display_name?: string | null;
    ghost_name?:   string | null;
    avatar_url?:   string | null;
  } | null;
  name?:      string;
  colorSeed?: string;
  src?:       string | null;
  size?:      number;
  highlight?: string;
  style?:     React.CSSProperties;
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

  const resolvedName = resolveName(profile, name);
  const initial      = resolvedName.charAt(0).toUpperCase();
  const seed         = colorSeed || profile?.id || resolvedName;
  const bg           = colorForId(seed);
  const imageUrl     = (!imgError && (src ?? profile?.avatar_url)) || null;

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

// ── Cropper ───────────────────────────────────────────────────────────────────
// Canvas-based circular crop modal. Drag to reposition, scroll/slider to zoom.
// Outputs a JPEG blob at CROP_SIZE × CROP_SIZE pixels.

const CROP_SIZE = 320; // output resolution in px

interface CropperProps {
  file:     File;
  onCrop:   (blob: Blob) => void;
  onCancel: () => void;
}

function clampOffset(
  x: number, y: number,
  scale: number,
  imgW: number, imgH: number,
): { x: number; y: number } {
  if (!imgW || !imgH) return { x, y };
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const maxX  = Math.max(0, drawW / 2 - CROP_SIZE / 2);
  const maxY  = Math.max(0, drawH / 2 - CROP_SIZE / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
}

function AvatarCropper({ file, onCrop, onCancel }: CropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement | null>(null);
  const dragging  = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const [imgSrc,    setImgSrc]    = useState('');
  const [scale,     setScale]     = useState(1);
  const [offset,    setOffset]    = useState({ x: 0, y: 0 });
  const [imgSize,   setImgSize]   = useState({ w: 0, h: 0 });
  const [exporting, setExporting] = useState(false);

  // Load file → object URL → Image element
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Default scale: image fills the crop circle
      const minDim   = Math.min(img.naturalWidth, img.naturalHeight);
      const baseScale = CROP_SIZE / minDim;
      setScale(baseScale);
      setOffset({ x: 0, y: 0 });
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Redraw whenever scale/offset changes
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d')!;
    canvas.width  = CROP_SIZE;
    canvas.height = CROP_SIZE;
    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);

    // Clip to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    // Draw image centered with pan + zoom
    const drawW = img.naturalWidth  * scale;
    const drawH = img.naturalHeight * scale;
    const x     = CROP_SIZE / 2 - drawW / 2 + offset.x;
    const y     = CROP_SIZE / 2 - drawH / 2 + offset.y;
    ctx.drawImage(img, x, y, drawW, drawH);
    ctx.restore();

    // Subtle inner ring
    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth   = 2;
    ctx.stroke();
  }, [scale, offset]);

  useEffect(() => { draw(); }, [draw]);

  // Pointer drag handlers
  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const raw = {
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    };
    setOffset(clampOffset(raw.x, raw.y, scale, imgSize.w, imgSize.h));
  };

  const onPointerUp = () => { dragging.current = false; };

  // Scroll to zoom
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.93 : 1.07;
    setScale((prev) => {
      const minScale = imgSize.w > 0 ? CROP_SIZE / Math.min(imgSize.w, imgSize.h) : 1;
      const next     = Math.min(6, Math.max(minScale, prev * factor));
      setOffset((o) => clampOffset(o.x, o.y, next, imgSize.w, imgSize.h));
      return next;
    });
  };

  // Slider zoom
  const onSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseFloat(e.target.value);
    setScale(next);
    setOffset((o) => clampOffset(o.x, o.y, next, imgSize.w, imgSize.h));
  };

  // Export cropped blob
  const handleCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExporting(true);
    canvas.toBlob(
      (blob) => { if (blob) onCrop(blob); setExporting(false); },
      'image/jpeg',
      0.92,
    );
  };

  const minScale = imgSize.w > 0 ? CROP_SIZE / Math.min(imgSize.w, imgSize.h) : 1;

  return (
    // Backdrop
    <div
      onClick={onCancel}
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(0,0,0,0.88)',
        zIndex:          99999,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        padding:         20,
      }}
    >
      {/* Modal card — stop click propagation so backdrop click doesn't fire */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:    'var(--surface, #1a1f2e)',
          borderRadius:  24,
          padding:       '24px 22px 22px',
          width:         CROP_SIZE + 44,
          maxWidth:      '100%',
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          gap:           16,
          boxShadow:     '0 24px 80px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div style={{ width: '100%' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--textW, #fff)', marginBottom: 4 }}>
            Crop your photo
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3, #888)', lineHeight: 1.5 }}>
            Drag to reposition · scroll or use the slider to zoom
          </div>
        </div>

        {/* Canvas with outside-circle overlay */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {/* Dark overlay outside the circle — purely cosmetic */}
          <div
            style={{
              position:      'absolute',
              inset:         0,
              borderRadius:  '50%',
              // box-shadow spread trick: fill everything outside the circle
              boxShadow:     '0 0 0 9999px rgba(0,0,0,0.52)',
              pointerEvents: 'none',
              zIndex:        2,
            }}
          />
          <canvas
            ref={canvasRef}
            width={CROP_SIZE}
            height={CROP_SIZE}
            style={{
              borderRadius: '50%',
              display:      'block',
              cursor:       dragging.current ? 'grabbing' : 'grab',
              touchAction:  'none',
              userSelect:   'none',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          />
        </div>

        {/* Zoom slider */}
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text3, #888)', flexShrink: 0 }}>Zoom</span>
          <input
            type="range"
            min={minScale}
            max={minScale * 4}
            step={0.005}
            value={scale}
            onChange={onSlider}
            style={{ flex: 1, accentColor: '#f0b429', cursor: 'pointer' }}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button
            onClick={onCancel}
            style={{
              flex:       1,
              padding:    '12px',
              borderRadius: 99,
              border:     '1px solid rgba(255,255,255,0.15)',
              background: 'transparent',
              color:      'var(--text2, #aaa)',
              fontSize:   14,
              fontWeight: 600,
              cursor:     'pointer',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCrop}
            disabled={exporting || !imgSrc}
            style={{
              flex:         2,
              padding:      '12px',
              borderRadius: 99,
              border:       'none',
              background:   exporting || !imgSrc ? 'rgba(255,255,255,0.08)' : '#f0b429',
              color:        exporting || !imgSrc ? 'var(--text3, #888)' : '#0a0a0a',
              fontSize:     14,
              fontWeight:   800,
              cursor:       exporting || !imgSrc ? 'not-allowed' : 'pointer',
              fontFamily:   'inherit',
              transition:   'background 0.15s',
            }}
          >
            {exporting ? 'Processing…' : 'Use this crop'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Avatar upload (used in Settings) ─────────────────────────────────────────

interface AvatarUploadProps {
  profile: {
    id:            string;
    display_name?: string | null;
    ghost_name?:   string | null;
    avatar_url?:   string | null;
  };
  onUploaded: (url: string) => void;
}

export function AvatarUpload({ profile, onUploaded }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview,   setPreview]   = useState<string | null>(profile.avatar_url ?? null);
  const [error,     setError]     = useState<string | null>(null);
  // cropFile being non-null means the cropper modal is open
  const [cropFile,  setCropFile]  = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Step 1: user picks a file → open cropper
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset so the same file can be re-selected

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB.');
      return;
    }
    setError(null);
    setCropFile(file);
  };

  // Step 2: cropper returns a blob → upload it
  const handleCropDone = async (blob: Blob) => {
    setCropFile(null);
    setError(null);
    setUploading(true);

    // Show optimistic preview immediately from the blob
    const localUrl = URL.createObjectURL(blob);
    setPreview(localUrl);

    try {
      const { supabase } = await import('@/lib/supabaseClient');

      // Always store as .jpg — the blob is always JPEG from the cropper
      const path = 'avatars/' + profile.id + '.jpg';

      const { error: upErr } = await supabase.storage
        .from('user-avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });

      if (upErr) {
        setError('Upload failed: ' + upErr.message);
        setPreview(profile.avatar_url ?? null); // revert
        return;
      }

      const { data: urlData } = supabase.storage
        .from('user-avatars')
        .getPublicUrl(path);

      // Append cache-buster so the browser fetches the new image
      const publicUrl = urlData.publicUrl + '?t=' + Date.now();

      await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);

      // Revoke the temporary blob URL now that we have the real one
      URL.revokeObjectURL(localUrl);
      setPreview(publicUrl);
      onUploaded(publicUrl);
    } catch (e: any) {
      setError(e.message ?? 'Upload failed');
      setPreview(profile.avatar_url ?? null);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* Cropper modal — rendered outside the normal flow so it covers everything */}
      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCrop={handleCropDone}
          onCancel={() => { setCropFile(null); setError(null); }}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        {/* Clickable avatar circle */}
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          style={{ position: 'relative', cursor: uploading ? 'not-allowed' : 'pointer' }}
        >
          <Avatar
            profile={{ ...profile, avatar_url: preview }}
            size={80}
            style={{ opacity: uploading ? 0.6 : 1, transition: 'opacity 0.2s' }}
          />
          {/* Edit badge */}
          <div style={{
            position:        'absolute',
            bottom:          0,
            right:           0,
            width:           26,
            height:          26,
            borderRadius:    '50%',
            background:      uploading ? '#888' : '#f0b429',
            color:           '#0a0a0a',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            fontSize:        13,
            fontWeight:      800,
            border:          '2px solid var(--bg, #0b0f1a)',
            transition:      'background 0.2s',
          }}>
            {uploading ? '…' : '✏'}
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        <div style={{ fontSize: 11, color: '#888', textAlign: 'center', lineHeight: 1.5 }}>
          {uploading ? 'Uploading…' : 'Tap to change photo · max 10 MB'}
        </div>

        {error && (
          <div style={{ fontSize: 12, color: '#ef4444', textAlign: 'center' }}>
            {error}
          </div>
        )}
      </div>
    </>
  );
}
