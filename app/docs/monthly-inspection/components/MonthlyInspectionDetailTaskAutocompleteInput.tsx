'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import s from './MonthlyInspectionDetailTaskAutocompleteInput.module.css';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context
const GA_CTX = { page: 'Docs', section: 'MonthlyInspection', area: 'DetailTaskInput' } as const;

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
};

const norm = (v?: string | null) => (v ?? '').trim();

export default function MonthlyInspectionDetailTaskAutocompleteInput({
  value,
  onChange,
  placeholder = '작업 입력 (예: 용접)',
}: Props) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  
  const wrapperRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<Map<string, string[]>>(new Map()); // ✅ 클라이언트 캐시

  // 외부 클릭 닫기
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // API 검색 (Debounce + Caching + AbortController)
  useEffect(() => {
    const keyword = q.trim();
    if (!keyword) {
      setItems([]);
      setOpen(false); // 검색어 없으면 닫기
      return;
    }

    // 캐시 확인
    if (cacheRef.current.has(keyword)) {
      const cachedItems = cacheRef.current.get(keyword) || [];
      setItems(cachedItems.filter((x) => !value.includes(x)));
      setOpen(true);
      return;
    }

    setLoading(true);
    const ac = new AbortController();

    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/risk-assessment?endpoint=detail-tasks&q=${encodeURIComponent(keyword)}&limit=10`, 
          { signal: ac.signal }
        );
        
        if (res.ok) {
          const data = await res.json();
          const list = (data.items || []).map(norm).filter(Boolean);
          
          // 캐시 저장
          cacheRef.current.set(keyword, list);

          setItems(list.filter((x: string) => !value.includes(x)));
          setOpen(true);

          // ✅ GA: 검색 추적
          track(gaEvent(GA_CTX, 'Search'), {
            ui_id: gaUiId(GA_CTX, 'Search'),
            query: keyword,
            result_count: list.length
          });
        }
      } catch (e: any) {
        if (e.name !== 'AbortError') {
            console.error(e);
        }
      } finally {
        if (!ac.signal.aborted) {
            setLoading(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q, value]); // value가 바뀌면(이미 추가된 항목 제외 로직 위해) 재실행

  const add = (t: string) => {
    if (!value.includes(t)) {
        onChange([...value, t]);
        
        // ✅ GA: 작업 추가 추적
        track(gaEvent(GA_CTX, 'AddTask'), {
            ui_id: gaUiId(GA_CTX, 'AddTask'),
            task_title: t
        });
    }
    setQ('');
    setOpen(false);
  };

  const remove = (t: string) => {
    onChange(value.filter(x => x !== t));

    // ✅ GA: 작업 삭제 추적
    track(gaEvent(GA_CTX, 'RemoveTask'), {
        ui_id: gaUiId(GA_CTX, 'RemoveTask'),
        task_title: t
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (q.trim()) add(q.trim());
    }
  };

  return (
    <div className={s.wrap} ref={wrapperRef}>
      <div className={s.chipsRow}>
        {value.map(t => (
          <span key={t} className={s.chip}>
            {t}
            {/* ✅ GA: 삭제 버튼 식별 */}
            <button 
                className={s.chipX} 
                onClick={() => remove(t)}
                data-ga-event="RemoveTask"
                data-ga-id={gaUiId(GA_CTX, 'RemoveTask')}
                data-ga-label={t}
            >
                <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className={s.inputRow}>
        <Search size={16} className={s.searchIcon} />
        <input
          className={s.input}
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
              if (q.trim()) setOpen(true);
          }}
          placeholder={placeholder}
        />
        {loading && <Loader2 size={16} className={s.loader} />}
      </div>
      
      {open && items.length > 0 && (
        <div className={s.dropdown}>
          {items.map(it => (
            // ✅ GA: 드롭다운 아이템 선택 식별
            <button 
                key={it} 
                className={s.item} 
                onClick={() => add(it)}
                data-ga-event="AddTask"
                data-ga-id={gaUiId(GA_CTX, 'AddTask')}
                data-ga-label={it}
            >
                {it}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}