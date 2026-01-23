'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import s from './MonthlyInspectionDetailTaskAutocompleteInput.module.css';

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

  // API 검색 (Debounce)
  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/risk-assessment?endpoint=detail-tasks&q=${encodeURIComponent(q)}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          const list = (data.items || []).map(norm).filter(Boolean);
          setItems(list.filter((x: string) => !value.includes(x)));
          setOpen(true);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, value]);

  const add = (t: string) => {
    if (!value.includes(t)) onChange([...value, t]);
    setQ('');
    setOpen(false);
  };

  const remove = (t: string) => {
    onChange(value.filter(x => x !== t));
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
            <button className={s.chipX} onClick={() => remove(t)}><X size={12} /></button>
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
          onFocus={() => q.trim() && setOpen(true)}
          placeholder={placeholder}
        />
        {loading && <Loader2 size={16} className={s.loader} />}
      </div>
      {open && items.length > 0 && (
        <div className={s.dropdown}>
          {items.map(it => (
            <button key={it} className={s.item} onClick={() => add(it)}>{it}</button>
          ))}
        </div>
      )}
    </div>
  );
}