'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import cs from './MonthlyInspectionDetailTaskAutocompleteInput.module.css';

const norm = (v?: string | null) => (v ?? '').trim();
const isString = (v: unknown): v is string => typeof v === 'string';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;

  fetcher?: (q: string, signal: AbortSignal) => Promise<string[]>;
  placeholder?: string;
  minQueryLength?: number;
};

type SuggestState = 'idle' | 'loading' | 'done' | 'error';

const DEFAULT_ENDPOINT = (q: string) =>
  `/api/risk-assessment?endpoint=detail-tasks&q=${encodeURIComponent(q)}`;

/** -----------------------
 * localStorage cache
 * ---------------------- */
// 1) 자동완성 결과 캐시 (q -> items)
type AutoCacheEntry = { t: number; items: string[] };
type AutoCacheStore = Record<string, AutoCacheEntry>;

const AUTO_CACHE_KEY = 'regai:monthlyInspection:detailTaskAutocomplete:v1';
const AUTO_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30일
const AUTO_CACHE_MAX_KEYS = 200;

// 2) 선택된 태그 캐시 (selected items)
type SelectedCache = { t: number; items: string[] };
const SELECTED_KEY = 'regai:monthlyInspection:selectedDetailTasks:v1';
const SELECTED_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180일

function safeJsonParse<T>(raw: string | null): T | null {
  try {
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeLoadAutoCache(): AutoCacheStore {
  if (typeof window === 'undefined') return {};
  const parsed = safeJsonParse<AutoCacheStore>(localStorage.getItem(AUTO_CACHE_KEY));
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed;
}

function safeSaveAutoCache(store: AutoCacheStore) {
  try {
    localStorage.setItem(AUTO_CACHE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

function pruneAutoCache(store: AutoCacheStore): AutoCacheStore {
  const now = Date.now();
  const entries = Object.entries(store)
    .filter(([, v]) => v && typeof v.t === 'number' && Array.isArray(v.items))
    .filter(([, v]) => now - v.t <= AUTO_CACHE_TTL_MS);

  entries.sort((a, b) => (b[1].t ?? 0) - (a[1].t ?? 0));
  return Object.fromEntries(entries.slice(0, AUTO_CACHE_MAX_KEYS));
}

function safeLoadSelected(): SelectedCache | null {
  if (typeof window === 'undefined') return null;
  const parsed = safeJsonParse<SelectedCache>(localStorage.getItem(SELECTED_KEY));
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.t !== 'number' || !Array.isArray(parsed.items)) return null;
  if (Date.now() - parsed.t > SELECTED_TTL_MS) return null;
  return parsed;
}

function safeSaveSelected(items: string[]) {
  try {
    const cleaned = Array.from(new Set(items.map(norm).filter(Boolean)));
    localStorage.setItem(SELECTED_KEY, JSON.stringify({ t: Date.now(), items: cleaned } satisfies SelectedCache));
  } catch {
    // ignore
  }
}

export default function MonthlyInspectionDetailTaskAutocompleteInput({
  value,
  onChange,
  fetcher,
  placeholder = '세부 작업을 입력하세요 (예: 플라스틱 사출 금형 제조)',
  minQueryLength = 1,
}: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SuggestState>('idle');
  const [items, setItems] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  // ✅ selectedSet은 ref로 (태그 변경이 fetch 트리거가 되지 않게)
  const selected = useMemo(() => value.map(norm).filter(Boolean), [value]);
  const selectedSetRef = useRef<Set<string>>(new Set(selected));
  useEffect(() => {
    selectedSetRef.current = new Set(selected);
  }, [selected]);

  /** -----------------------
   * 선택 태그(value) 캐시: 저장/복구
   * ---------------------- */
  const hydratedSelectedRef = useRef(false);

  // 1) 마운트 시: 부모 value가 비어 있으면 localStorage에서 복구해서 onChange로 주입
  useEffect(() => {
    if (hydratedSelectedRef.current) return;
    hydratedSelectedRef.current = true;

    const current = selected;
    if (current.length > 0) {
      // 이미 부모가 내려준 값이 있으면 그걸 저장해두기(서버/기본값 우선)
      safeSaveSelected(current);
      return;
    }

    const cached = safeLoadSelected();
    const cachedItems = (cached?.items ?? []).map(norm).filter(Boolean);
    if (cachedItems.length > 0) {
      onChange(cachedItems);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // onChange를 deps로 넣으면 부모 리렌더에 따라 반복될 수 있어 1회만

  // 2) value(=selected) 바뀔 때마다 localStorage에 저장
  useEffect(() => {
    // 빈 배열이어도 저장해두면 “지웠는데 다시 살아나는” 문제를 막을 수 있음
    safeSaveSelected(selected);
  }, [selected]);

  /** -----------------------
   * fetcher (ref)
   * ---------------------- */
  const defaultFetcher = async (query: string, signal: AbortSignal): Promise<string[]> => {
    const res = await fetch(DEFAULT_ENDPOINT(query), { method: 'GET', signal });
    if (!res.ok) throw new Error(`autocomplete fetch failed: ${res.status}`);

    const data: unknown = await res.json();
    if (Array.isArray(data)) return data.filter(isString).map(norm).filter(Boolean);
    if (typeof data === 'object' && data !== null) {
      const maybeItems = (data as any).items;
      if (Array.isArray(maybeItems)) return maybeItems.filter(isString).map(norm).filter(Boolean);
    }
    return [];
  };

  const fetcherRef = useRef<(q: string, signal: AbortSignal) => Promise<string[]>>(defaultFetcher);
  useEffect(() => {
    fetcherRef.current = fetcher ?? defaultFetcher;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher]);

  // ✅ “선택 직후 재검색”을 원천 차단하는 가드
  const ignoreFetchUntilRef = useRef<number>(0);

  // ✅ 자동완성 캐시 store (메모리) + 로컬스토리지 반영
  const autoCacheRef = useRef<AutoCacheStore>({});
  const saveDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    const loaded = pruneAutoCache(safeLoadAutoCache());
    autoCacheRef.current = loaded;
    safeSaveAutoCache(loaded);
  }, []);

  const scheduleSaveAutoCache = () => {
    if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = window.setTimeout(() => {
      const pruned = pruneAutoCache(autoCacheRef.current);
      autoCacheRef.current = pruned;
      safeSaveAutoCache(pruned);
    }, 250);
  };

  const cancelPending = () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const applyItems = (list: string[], openList: boolean) => {
    const latestSelected = selectedSetRef.current;
    const filtered = list.filter((x) => !latestSelected.has(x));

    setItems(filtered);
    setState('done');
    setActiveIdx(0);
    if (openList) setOpen(true);
  };

  const runFetch = (query: string) => {
    const now = Date.now();
    if (now < ignoreFetchUntilRef.current) return;

    const qq = norm(query);
    if (qq.length < minQueryLength) {
      cancelPending();
      setItems([]);
      setState('idle');
      setOpen(false);
      setActiveIdx(0);
      return;
    }

    // 1) 자동완성 캐시 hit면 네트워크 안 탐
    const cached = autoCacheRef.current[qq];
    if (cached && now - cached.t <= AUTO_CACHE_TTL_MS && Array.isArray(cached.items)) {
      applyItems(cached.items, true);
      return;
    }

    // 2) debounce 후 네트워크
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      const tnow = Date.now();
      if (tnow < ignoreFetchUntilRef.current) return;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setState('loading');
      setOpen(true);

      try {
        const raw = await fetcherRef.current(qq, ac.signal);

        const cleaned = raw.map(norm).filter(Boolean);
        const deduped = Array.from(new Set<string>(cleaned));

        autoCacheRef.current[qq] = { t: Date.now(), items: deduped };
        scheduleSaveAutoCache();

        applyItems(deduped, true);
      } catch (e) {
        if ((e as any)?.name === 'AbortError') return;
        setItems([]);
        setState('error');
      }
    }, 180);
  };

  useEffect(() => {
    runFetch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, minQueryLength]);

  useEffect(() => {
    return () => {
      cancelPending();
      if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTag = (tag: string) => {
    const t = norm(tag);
    if (!t) return;

    // ✅ 클릭/선택 직후 “재검색” 방지
    ignoreFetchUntilRef.current = Date.now() + 400;

    // ✅ 예약/진행중 fetch 완전 중단
    cancelPending();

    const latestSelected = selectedSetRef.current;
    if (latestSelected.has(t)) {
      setQ('');
      setItems([]);
      setOpen(false);
      setState('idle');
      setActiveIdx(0);
      return;
    }

    const next = [...selected, t];
    onChange(next);         // 부모 상태 갱신
    safeSaveSelected(next); // ✅ 즉시 로컬에도 저장(부모 저장 로직 없어도 유지)

    setQ('');
    setItems([]);
    setOpen(false);
    setState('idle');
    setActiveIdx(0);

    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const removeTag = (tag: string) => {
    const t = norm(tag);
    const next = selected.filter((x) => x !== t);
    onChange(next);
    safeSaveSelected(next); // ✅ 삭제도 즉시 반영
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const removeLastTag = () => {
    if (!selected.length) return;
    const next = selected.slice(0, -1);
    onChange(next);
    safeSaveSelected(next);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Backspace' && q.length === 0) {
      e.preventDefault();
      removeLastTag();
      return;
    }

    if (!open) {
      if (e.key === 'Enter') {
        const raw = norm(q);
        if (raw) addTag(raw);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((p) => Math.min(p + 1, Math.max(items.length - 1, 0)));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((p) => Math.max(p - 1, 0));
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (items.length > 0) addTag(items[Math.max(0, Math.min(activeIdx, items.length - 1))]);
      else {
        const raw = norm(q);
        if (raw) addTag(raw);
      }
    }
  };

  const showList = open && norm(q).length >= minQueryLength;

  return (
    <div className={cs.wrap}>
      <div className={cs.chipsRow}>
        {selected.map((t) => (
          <span key={t} className={cs.chip}>
            {t}
            <button type="button" className={cs.chipX} onClick={() => removeTag(t)} aria-label="태그 삭제">
              <X size={14} />
            </button>
          </span>
        ))}
      </div>

      <div className={cs.inputRow}>
        <Search size={16} className={cs.searchIcon} />
        <input
          ref={inputRef}
          className={cs.input}
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            const v = e.target.value;
            setQ(v);
            setOpen(true);
            setActiveIdx(0);
          }}
          onFocus={() => {
            if (norm(q).length >= minQueryLength) setOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {state === 'loading' && <Loader2 size={16} className={cs.loader} />}
      </div>

      {showList && (
        <div className={cs.list} role="listbox" aria-label="세부 작업 자동완성">
          {items.length > 0 ? (
            items.map((it, idx) => {
              const active = idx === activeIdx;
              return (
                <button
                  key={it}
                  type="button"
                  className={`${cs.item} ${active ? cs.itemActive : ''}`}
                  role="option"
                  aria-selected={active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addTag(it);
                  }}
                >
                  {it}
                </button>
              );
            })
          ) : (
            <div className={cs.empty}>
              {state === 'loading'
                ? '검색 중…'
                : state === 'error'
                  ? '검색 중 오류가 발생했습니다.'
                  : '검색 결과가 없습니다.'}
            </div>
          )}
        </div>
      )}

      <div className={cs.helper}>
        입력 후 <b>Enter</b>로 추가하거나, 자동완성 항목을 클릭해 태그를 추가할 수 있습니다.
      </div>
    </div>
  );
}
