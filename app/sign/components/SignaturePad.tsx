'use client';

import { useEffect, useRef, useState } from 'react';
import s from '../page.module.css';

export default function SignaturePad({
  onChangeDataUrl,
  disabled,
}: {
  onChangeDataUrl?: (dataUrl: string | null) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const clearLocal = () => {
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      setHasInk(false);
      onChangeDataUrl?.(null);
    };

    const resize = () => {
      const parent = c.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;

      const cssW = parent.clientWidth;
      const cssH = 220;

      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;

      c.width = Math.floor(cssW * dpr);
      c.height = Math.floor(cssH * dpr);

      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#111';

      clearLocal();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPoint = (e: PointerEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const exportDataUrl = () => {
    const c = canvasRef.current;
    if (!c) return null;
    try {
      return c.toDataURL('image/png');
    } catch {
      return null;
    }
  };

  const clear = () => {
    if (disabled) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChangeDataUrl?.(null);
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const onDown = (e: PointerEvent) => {
      if (disabled) return;
      drawingRef.current = true;
      lastRef.current = getPoint(e);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (disabled) return;
      if (!drawingRef.current) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;

      const p = getPoint(e);
      const last = lastRef.current;
      if (!last) {
        lastRef.current = p;
        return;
      }

      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      lastRef.current = p;
      if (!hasInk) setHasInk(true);
    };

    const onUp = () => {
      if (disabled) return;
      drawingRef.current = false;
      lastRef.current = null;
      const url = exportDataUrl();
      onChangeDataUrl?.(url);
    };

    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('pointerleave', onUp);

    return () => {
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp);
      c.removeEventListener('pointercancel', onUp);
      c.removeEventListener('pointerleave', onUp);
    };
  }, [hasInk, onChangeDataUrl, disabled]);

  return (
    <div className={s.signBox} aria-disabled={disabled}>
      <div className={s.signTop}>
        <div className={s.signHint}>
          {disabled ? '이미 서명 완료된 건입니다.' : '아래 영역에 서명하세요'}
        </div>
        <button className={s.btnGhost} type="button" onClick={clear} disabled={disabled}>
          지우기
        </button>
      </div>

      <div className={s.canvasWrap}>
        <canvas ref={canvasRef} className={s.canvas} />
      </div>

      <div className={s.signMeta}>
        {disabled ? '서명이 잠겨 있습니다.' : hasInk ? '서명이 입력되었습니다.' : '아직 서명이 없습니다.'}
      </div>
    </div>
  );
}
