'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import s from './AddDetailTaskModal.module.css';

type Props = {
  open: boolean;
  minorCategory: string | null;
  onClose: () => void;
  onAdd: (title: string) => void;
};

const norm = (v?: string | null) => (v ?? '').trim();

export default function AddDetailTaskModal({ open, minorCategory, onClose, onAdd }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // 멀티 선택 상태
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected.map(norm)), [selected]);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const canSearch = useMemo(() => norm(q).length >= 1, [q]);

  // 초기화
  useEffect(() => {
    if (!open) return;
    setQ('');
    setItems([]);
    setError(null);
    setSelected([]);
  }, [open]);

  // API 검색 (Debounce 적용)
  useEffect(() => {
    if (!open) return;
    if (!canSearch) {
      setItems([]);
      setLoading(false);
      return;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const qs = new URLSearchParams({ endpoint: 'detail-tasks', q: norm(q), limit: '50' });
        // if (minorCategory) qs.set('minor', minorCategory); // 필요시 주석 해제

        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
          method: 'GET',
          signal: ac.signal,
          cache: 'no-store',
        });

        if (!res.ok) throw new Error('검색 실패');

        const data = await res.json();
        
        // ✅ [수정] 타입 명시: Array.from<string>(...)
        const next = Array.from<string>(new Set((data.items ?? []).map(norm).filter(Boolean)));
        setItems(next);
      } catch (e: any) {
        if (e.name !== 'AbortError') setError('검색 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    }, 250); // 250ms 딜레이

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, open, canSearch, minorCategory]);

  const toggleSelect = (title: string) => {
    const v = norm(title);
    if (!v) return;
    setSelected(prev => {
      const set = new Set(prev.map(norm));
      if (set.has(v)) return prev.filter(x => norm(x) !== v);
      return [...prev, v];
    });
  };

  const handleConfirm = () => {
    const uniq = Array.from(new Set(selected.map(norm).filter(Boolean)));
    if (uniq.length === 0) return;
    uniq.forEach(t => onAdd(t));
    onClose();
  };

  if (!open) return null;

  return (
    <div className={s.overlay} onMouseDown={onClose} role="dialog">
      <div className={s.modal} onMouseDown={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className={s.header}>
          <div className={s.titleGroup}>
            <div className={s.title}>세부작업 선택</div>
            <div className={s.subTitle}>키워드를 검색하여 작업을 선택하세요.</div>
          </div>
          <button className={s.closeBtn} onClick={onClose} aria-label="닫기">
            <X size={20} />
          </button>
        </div>

        {/* 검색창 */}
        <div className={s.searchBox}>
          <Search size={18} className={s.searchIcon} />
          <input
            className={s.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="예: 용접, 배관, 굴착..."
            autoFocus
          />
        </div>

        {/* 선택된 항목 (Chips) */}
        {selected.length > 0 && (
          <div className={s.selectedBar}>
            {selected.map(t => (
              <button key={t} className={s.selectedChip} onClick={() => toggleSelect(t)}>
                {t} <span className={s.selectedX}>×</span>
              </button>
            ))}
          </div>
        )}

        {/* 결과 리스트 */}
        <div className={s.list}>
          {loading && <div className={s.empty}>검색 중...</div>}
          {!loading && error && <div className={s.empty}>{error}</div>}
          
          {!loading && !error && items.length > 0 && (
            <>
              {items.map(t => {
                const v = norm(t);
                const isSelected = selectedSet.has(v);
                return (
                  <button
                    key={v}
                    className={`${s.item} ${isSelected ? s.itemSelected : ''}`}
                    onClick={() => toggleSelect(v)}
                  >
                    <span className={s.itemText}>{v}</span>
                    {isSelected && <span className={s.pick}>선택됨</span>}
                  </button>
                );
              })}
            </>
          )}

          {/* 결과 없음: 직접 추가 버튼 */}
          {!loading && !error && q && items.length === 0 && (
            <div className={s.empty}>
              검색 결과가 없습니다.<br/>
              <button 
                className={s.createBtn}
                onClick={() => { onAdd(q); onClose(); }}
              >
                '{q}' 직접 추가하기
              </button>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className={s.footer}>
          <button className={s.cancel} onClick={onClose}>취소</button>
          <button 
            className={s.confirm} 
            onClick={handleConfirm} 
            disabled={selected.length === 0}
          >
            확인 {selected.length > 0 && `(${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}