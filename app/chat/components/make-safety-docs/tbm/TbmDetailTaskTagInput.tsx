'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import s from './TbmDetailTaskTagInput.module.css';

const norm = (v?: string | null) => (v ?? '').trim();

/** =========================
 * ✅ localStorage cache (options)
 * ========================= */
const OPTIONS_CACHE_PREFIX = 'regai:tbm:detailTaskOptions:v1';
const OPTIONS_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30일

type OptionsCache = {
  v: 1;
  ts: number;
  endpoint: string;
  minor: string; // '' 허용 (전체)
  limit: number;
  items: string[];
};

function optionsCacheKey(endpoint: string, minor: string, limit: number) {
  const ep = norm(endpoint) || 'detail-tasks';
  const m = norm(minor); // 전체면 ''
  return `${OPTIONS_CACHE_PREFIX}:${encodeURIComponent(ep)}:${encodeURIComponent(m)}:${limit}`;
}

function safeReadOptionsCache(key: string): OptionsCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OptionsCache;

    if (parsed?.v !== 1) return null;
    if (!parsed?.ts) return null;
    if (!Array.isArray(parsed?.items)) return null;
    if (Date.now() - parsed.ts > OPTIONS_CACHE_TTL_MS) return null;

    // 빈 옵션은 캐시로 채택 안 함 (깨진 캐시 방지)
    if (parsed.items.length === 0) return null;

    return parsed;
  } catch {
    return null;
  }
}

function safeWriteOptionsCache(key: string, payload: OptionsCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

type Props = {
  value: string[];
  onChange: (next: string[]) => void;

  minorCategory?: string | null;
  placeholder?: string;

  endpoint?: string; // default: 'detail-tasks'
  limit?: number; // ✅ 백엔드 제약 대응 (<=200)
};

export default function TbmDetailTaskTagInput({
  value,
  onChange,
  minorCategory,
  placeholder = '세부 작업을 입력하고 Enter (예: 지게차 운전, 용접 작업)',
  endpoint = 'detail-tasks',
  limit = 200, // ✅ 기본 200
}: Props) {
  const [input, setInput] = useState('');
  const [allOptions, setAllOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selectedSet = useMemo(
    () => new Set(value.map((v) => norm(v).toLowerCase())),
    [value],
  );

  // ✅ 백엔드: limit <= 200 강제
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit || 200)));

  // ✅ 0) 캐시 먼저 복원 → 있으면 즉시 표시
  useEffect(() => {
    const m = norm(minorCategory); // 전체면 ''
    const key = optionsCacheKey(endpoint, m, safeLimit);
    const cached = safeReadOptionsCache(key);
    if (cached?.items?.length) {
      setAllOptions(Array.from(new Set(cached.items.map(norm).filter(Boolean))));
      setErr(null);
      setLoading(false);
    }
  }, [minorCategory, endpoint, safeLimit]);

  // ✅ 1) 캐시가 없거나 만료면 API fetch
  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    const m = norm(minorCategory); // 전체면 '' (중요: minor=ALL 같은 값 쓰지 않음)
    const key = optionsCacheKey(endpoint, m, safeLimit);
    const cached = safeReadOptionsCache(key);
    if (cached) return; // ✅ 유효 캐시 있으면 fetch 스킵

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const qs = new URLSearchParams();
        qs.set('endpoint', endpoint);

        // ✅ minorCategory 있을 때만 전송 (없으면 전체)
        if (m) qs.set('minor', m);

        qs.set('limit', String(safeLimit)); // ✅ 200 이하만

        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
          cache: 'no-store',
          signal: ac.signal,
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`세부작업 로드 실패 (${res.status}) ${txt.slice(0, 120)}`);
        }

        const data = (await res.json()) as { items?: string[] };
        const items = (data.items ?? []).map(norm).filter(Boolean);
        const uniq = Array.from(new Set(items));

        if (cancelled) return;
        setAllOptions(uniq);

        // ✅ 성공 시 캐시에 저장
        safeWriteOptionsCache(key, {
          v: 1,
          ts: Date.now(),
          endpoint: norm(endpoint) || 'detail-tasks',
          minor: m, // '' 가능
          limit: safeLimit,
          items: uniq,
        });
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (cancelled) return;
        setAllOptions([]);
        setErr(e?.message ?? '세부작업 로드 중 오류');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [minorCategory, endpoint, safeLimit]);

  const optionsToShow = useMemo(() => {
    const q = norm(input).toLowerCase();
    const base = allOptions.filter((opt) => !selectedSet.has(opt.toLowerCase()));

    if (!q) return base.slice(0, 8);
    return base.filter((opt) => opt.toLowerCase().includes(q)).slice(0, 8);
  }, [input, allOptions, selectedSet]);

  const addTag = (raw: string) => {
    const v = norm(raw);
    if (!v) return;

    const key = v.toLowerCase();
    if (selectedSet.has(key)) {
      setInput('');
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    onChange([...value, v]);
    setInput('');
    setOpen(false);
    setActiveIndex(-1);
  };

  const removeTag = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && activeIndex >= 0 && optionsToShow[activeIndex]) {
        addTag(optionsToShow[activeIndex]);
      } else {
        addTag(input);
      }
      return;
    }

    if (e.key === 'Backspace') {
      if (!input && value.length > 0) removeTag(value.length - 1);
      return;
    }

    if (e.key === 'ArrowDown') {
      if (!open) setOpen(true);
      setActiveIndex((prev) => {
        const next = prev + 1;
        return next >= optionsToShow.length ? 0 : next;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      if (!open) setOpen(true);
      setActiveIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? Math.max(optionsToShow.length - 1, 0) : next;
      });
      return;
    }

    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className={s.wrap} ref={wrapRef}>
      <div
        className={s.box}
        onClick={() => {
          setOpen(true);
          if (optionsToShow.length > 0) setActiveIndex(0);
        }}
      >
        {value.map((t, idx) => (
          <span key={`${t}-${idx}`} className={s.tag}>
            {t}
            <button
              type="button"
              className={s.tagX}
              onClick={() => removeTag(idx)}
              aria-label="태그 삭제"
            >
              <X size={14} />
            </button>
          </span>
        ))}

        <input
          className={s.input}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => {
            setOpen(true);
            if (optionsToShow.length > 0) setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
        />
      </div>

      <div className={s.hintRow}>
        {loading ? (
          <span className={s.hint}>세부 작업을 불러오는 중…</span>
        ) : err ? (
          <span className={s.hint}>자동완성 불러오기 실패: {err}</span>
        ) : (
          <span className={s.hint}>Enter로 태그 추가 · ↑↓ 선택</span>
        )}
      </div>

      {open && optionsToShow.length > 0 && (
        <div className={s.dropdown} role="listbox">
          {optionsToShow.map((opt, i) => (
            <button
              key={opt}
              type="button"
              className={`${s.option} ${i === activeIndex ? s.optionActive : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => addTag(opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
