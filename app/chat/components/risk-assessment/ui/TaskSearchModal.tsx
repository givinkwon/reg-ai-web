// components/risk-assessment/ui/TaskSearchModal.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './TaskSearchModal.module.css';

export type TaskOption = { id: string; title: string };

type Props = {
  open: boolean;
  title: string;
  placeholder?: string;
  minor?: string;
  onClose: () => void;
  onPick: (picked: TaskOption | { title: string }) => void;
};

function buildProxyUrl(endpoint: string, params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  sp.set('endpoint', endpoint);
  Object.entries(params).forEach(([k, v]) => {
    if (v && v.trim()) sp.set(k, v.trim());
  });
  return `/api/risk-assessment?${sp.toString()}`;
}

export default function TaskSearchModal({ open, title, placeholder, minor, onClose, onPick }: Props) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<TaskOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setItems([]);
    setErr(null);
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const keyword = q.trim();
    if (!keyword) {
      setItems([]);
      setErr(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setErr(null);

      try {
        const url = buildProxyUrl('detail-tasks', {
          q: keyword,
          minor: minor || undefined,
          limit: '100',
        });

        const res = await fetch(url, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`search failed: ${res.status}`);

        const data = (await res.json()) as { items?: string[] };
        const arr = Array.isArray(data.items) ? data.items : [];
        const mapped = arr
          .filter((v) => typeof v === 'string' && v.trim())
          .map((title) => ({ id: title, title }));

        setItems(mapped);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setErr(e?.message ?? '검색에 실패했습니다.');
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [q, minor, open]);

  const canAddDirectly = useMemo(() => q.trim().length > 0, [q]);

  const handlePick = (opt: TaskOption) => {
    onPick(opt);
    onClose();
  };

  const handleAddDirect = () => {
    const v = q.trim();
    if (!v) return;
    onPick({ title: v });
    onClose();
  };

  if (!open) return null;

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true">
      <div className={s.modal}>
        <div className={s.head}>
          <div className={s.title}>{title}</div>
          <button className={s.closeBtn} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className={s.body}>
          <input
            ref={inputRef}
            className={s.input}
            placeholder={placeholder ?? '검색어를 입력하세요'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && canAddDirectly) handleAddDirect();
            }}
          />

          {minor ? <div className={s.hint}>필터: 소분류(minor) = {minor}</div> : null}

          {loading ? <div className={s.state}>검색 중…</div> : null}
          {err ? <div className={s.error}>{err}</div> : null}

          {!loading && !err && q.trim() && items.length === 0 ? (
            <div className={s.state}>일치 항목이 없습니다. Enter로 “직접 추가”할 수 있어요.</div>
          ) : null}

          {items.length > 0 ? (
            <div className={s.list}>
              {items.map((opt) => (
                <button key={opt.id} className={s.item} onClick={() => handlePick(opt)} type="button">
                  {opt.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={s.footer}>
          <button className={s.secondaryBtn} onClick={onClose} type="button">
            취소
          </button>
          <button className={s.primaryBtn} onClick={handleAddDirect} type="button" disabled={!canAddDirectly}>
            직접 추가
          </button>
        </div>
      </div>
    </div>
  );
}
