'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './AddItemSheet.module.css';

type Props = {
  open: boolean;
  title: string;
  placeholder?: string;
  suggestions?: string[];

  searchEndpoint?: string;
  searchParams?: Record<string, string | undefined | null>;
  searchLimit?: number;
  minChars?: number;
  debounceMs?: number;

  onClose: () => void;
  onAdd: (value: string) => void;
};

const norm = (v?: string | null) => (v ?? '').trim();

export default function AddItemSheet({
  open,
  title,
  placeholder,
  suggestions = [],

  searchEndpoint,
  searchParams,
  searchLimit = 30,
  minChars = 1,
  debounceMs = 200,

  onClose,
  onAdd,
}: Props) {
  const [value, setValue] = useState('');
  const [remote, setRemote] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const q = norm(value);
  const canSearch = !!searchEndpoint && q.length >= minChars;

  const local = useMemo(() => {
    return Array.from(new Set(suggestions.map(norm).filter(Boolean)));
  }, [suggestions]);

  useEffect(() => {
    if (!open) return;
    setValue('');
    setRemote([]);
    setLoading(false);
    setRemoteError(null);
  }, [open]);

  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
  }, [open]);

  const submit = () => {
    const v = norm(value);
    if (!v) return;
    onAdd(v);
    setValue('');
    setRemote([]);
    onClose();
  };

  const pick = (v: string) => {
    const vv = norm(v);
    if (!vv) return;
    onAdd(vv);
    setValue('');
    setRemote([]);
    onClose();
  };

  useEffect(() => {
    if (!open) return;

    if (!canSearch) {
      setRemote([]);
      setLoading(false);
      setRemoteError(null);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      try {
        setLoading(true);
        setRemoteError(null);

        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        const qs = new URLSearchParams();
        qs.set('endpoint', searchEndpoint!);
        qs.set('q', q);
        qs.set('limit', String(searchLimit));

        if (searchParams) {
          for (const [k, v] of Object.entries(searchParams)) {
            const vv = norm(v as any);
            if (vv) qs.set(k, vv);
          }
        }

        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
          method: 'GET',
          signal: ac.signal,
          cache: 'no-store',
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`검색 실패 (${res.status}) ${txt.slice(0, 120)}`);
        }

        const data = (await res.json()) as { items?: string[] };
        const items = Array.from(new Set((data.items ?? []).map(norm).filter(Boolean)));
        setRemote(items);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setRemote([]);
        setRemoteError(e?.message ?? '검색 중 오류');
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [open, canSearch, q, debounceMs, searchEndpoint, searchLimit, JSON.stringify(searchParams ?? {})]);

  if (!open) return null;

  return (
    <div className={s.overlay} onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className={s.sheet} onMouseDown={(e) => e.stopPropagation()}>
        <div className={s.head}>
          <div className={s.title}>{title}</div>
          <button className={s.closeBtn} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className={s.body}>
          <div className={s.row}>
            <input
              className={s.input}
              placeholder={placeholder || '입력하세요'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') onClose();
              }}
              autoFocus
            />
            <button className={s.addBtn} onClick={submit}>
              추가하기
            </button>
          </div>

          {/* ✅ 검색 결과 섹션 */}
          {searchEndpoint && (
            <>
              <div className={s.suggTitle}>검색 결과</div>
              {q.length < minChars ? (
                <div className={s.hint}>{minChars}글자 이상 입력하면 검색됩니다.</div>
              ) : loading ? (
                <div className={s.hint}>검색 중…</div>
              ) : remoteError ? (
                <div className={s.error}>{remoteError}</div>
              ) : remote.length === 0 ? (
                <div className={s.hint}>검색 결과가 없습니다.</div>
              ) : (
                <div className={s.list}>
                  {remote.map((x) => (
                    <button key={x} type="button" className={s.item} onClick={() => pick(x)}>
                      <span className={s.itemText}>{x}</span>
                      <span className={s.pick}>추가</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ✅ 추천 섹션(항상 아래에) */}
          {/* {local.length > 0 && (
            <>
              <div className={s.suggTitle}>추천</div>
              <div className={s.list}>
                {local.map((x) => (
                  <button key={x} type="button" className={s.item} onClick={() => pick(x)}>
                    <span className={s.itemText}>{x}</span>
                    <span className={s.pick}>추가</span>
                  </button>
                ))}
              </div>
            </>
          )} */}
        </div>
      </div>
    </div>
  );
}
