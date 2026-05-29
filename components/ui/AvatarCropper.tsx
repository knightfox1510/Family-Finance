// components/ui/AvatarCropper.tsx
// Canvas-based circular crop modal — no external libraries.
// Drop this file alongside Avatar.tsx and update AvatarUpload to use it.

'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';

interface CropperProps {
  /** The raw File selected by the user */
  file: File;
  /** Called with a canvas-cropped Blob ready for upload */
  onCrop: (blob: Blob) => void;
  onCancel: () => void;
}

const SIZE = 280; // canvas output size in px

export function AvatarCropper({ file, onCrop, onCancel }: CropperProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const imgRef     = useRef<HTMLImageElement | null>(null);
  const dragging   = useRef(false);
  const dragStart  = useRef({ x: 0, y: 0 });

  const [imgSrc, setImgSrc]     = useState('');
  const [scale, setScale]       = useState(1);
  const [offset, setOffset]     = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize]   = useState({ w: 0, h: 0 });
  const [exporting, setExporting] = useState(false);

  // ── Load file as image ──────────────────────────────────────────────────
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Default scale so the image fills the crop circle
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      const baseScale = SIZE / minDim;
      setScale(baseScale);
      setOffset({ x: 0, y: 0 });
      setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Draw preview canvas ─────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width  = SIZE;
    canvas.height = SIZE;

    // Clip to circle
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    // Draw image centered with offset + scale
    const drawW = img.naturalWidth  * scale;
    const drawH = img.naturalHeight * scale;
    const x     = SIZE / 2 - drawW / 2 + offset.x;
    const y     = SIZE / 2 - drawH / 2 + offset.y;
    ctx.drawImage(img, x, y, drawW, drawH);
    ctx.restore();

    // Soft border ring
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth   = 2;
    ctx.stroke();
  }, [scale, offset]);

  useEffect(() => { draw(); }, [draw]);

  // ── Mouse / touch drag ──────────────────────────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const newX = e.clientX - dragStart.current.x;
    const newY = e.clientY - dragStart.current.y;
    setOffset(clampOffset(newX, newY, scale, imgSize));
  };

  const onPointerUp = () => { dragging.current = false; };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setScale((s) => {
      const minScale = SIZE / Math.min(imgSize.w, imgSize.h);
      const next = Math.min(5, Math.max(minScale, s * delta));
      setOffset((o) => clampOffset(o.x, o.y, next, imgSize));
      return next;
    });
  };

  // ── Export cropped blob ─────────────────────────────────────────────────
  const handleCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExporting(true);
    canvas.toBlob((blob) => {
      if (blob) onCrop(blob);
      setExporting(false);
    }, 'image/jpeg', 0.92);
  };

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseFloat(e.target.value);
    setScale(next);
    setOffset((o) => clampOffset(o.x, o.y, next, imgSize));
  };

  const minScale = imgSize.w > 0 ? SIZE / Math.min(imgSize.w, imgSize.h) : 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div style={{
        background: 'var(--surface, #1a1f2e)', borderRadius: 24, padding: '28px 24px 24px',
        width: 340, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }} onClick={(e) => e.stopPropagation()}>

        {/* Title */}
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--textW, #fff)', alignSelf: 'flex-start' }}>
          Crop your photo
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3, #888)', alignSelf: 'flex-start', marginTop: -12 }}>
          Drag to reposition · scroll or slider to zoom
        </div>

        {/* Canvas preview */}
        <div style={{ position: 'relative', cursor: 'grab', userSelect: 'none' }}>
          {/* Shadow overlay for outside-circle area — purely visual */}
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: '50%',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            pointerEvents: 'none', zIndex: 2,
          }} />
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            style={{ borderRadius: '50%', display: 'block', touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          />
        </div>

        {/* Zoom slider */}
        <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text3, #888)' }}>Zoom</span>
          <input
            type="range"
            min={minScale}
            max={minScale * 4}
            step={0.01}
            value={scale}
            onChange={handleSlider}
            style={{ flex: 1, accentColor: 'var(--accent, #f0b429)' }}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px', borderRadius: 99,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'transparent', color: 'var(--text2, #aaa)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Cancel
          </button>
          <button onClick={handleCrop} disabled={exporting || !imgSrc} style={{
            flex: 2, padding: '12px', borderRadius: 99, border: 'none',
            background: exporting ? 'rgba(255,255,255,0.1)' : 'var(--accent, #f0b429)',
            color: exporting ? 'var(--text3, #888)' : '#0a0a0a',
            fontSize: 14, fontWeight: 800, cursor: exporting ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}>
            {exporting ? 'Processing…' : 'Use this crop'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helper: clamp offset so image never reveals empty space ─────────────────
function clampOffset(
  x: number, y: number,
  scale: number,
  imgSize: { w: number; h: number },
): { x: number; y: number } {
  if (!imgSize.w || !imgSize.h) return { x, y };
  const drawW   = imgSize.w * scale;
  const drawH   = imgSize.h * scale;
  const halfW   = SIZE / 2;
  const halfH   = SIZE / 2;
  const maxX    = Math.max(0, drawW / 2 - halfW);
  const maxY    = Math.max(0, drawH / 2 - halfH);
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  };
}
