'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import s from './AddHazardModal.module.css';

type Props = {
  open: boolean;
  taskTitle: string;
  processTitle: string;
  onClose: () => void;
  onAdd: (title: string) => void;
};

const norm = (v?: string | null) => (v ?? '').trim();

export default function AddHazardModal({ open, taskTitle, processTitle, onClose, onAdd }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected.map(norm)), [selected]);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  // 1. 모달이 열릴 때 상태 초기화
  useEffect(() => {
    if (!open) return;
    setQ('');
    setItems([]);
    setError(null);
    setSelected([]);
  }, [open]);

  // 2. 검색 API 호출 (진입 시 즉시 호출 + 검색어 변경 시 호출)
  useEffect(() => {
    if (!open) return;

    // ✅ canSearch 체크를 제거하여 q가 빈 문자열일 때도 진입 즉시 검색을 시작합니다.
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      
      // 이전 요청이 있다면 취소하여 레이스 컨디션 방지
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const qs = new URLSearchParams({ 
          endpoint: 'risk-situations',
          process_name: norm(taskTitle),
          sub_process: norm(processTitle),
          q: norm(q), 
          limit: '50' 
        });

        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
          method: 'GET',
          signal: ac.signal,
          cache: 'no-store',
        });

        if (!res.ok) throw new Error('데이터 요청 실패');

        const data = await res.json();
        
        // 데이터 정규화 및 중복 제거
        const next = Array.from<string>(
          new Set((data.items ?? []).map((x: any) => x.title || x).map(norm).filter(Boolean))
        );
        setItems(next);

      } catch (e: any) {
        if (e.name !== 'AbortError') {
          setError('목록을 불러오는 중 오류가 발생했습니다.');
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, open, taskTitle, processTitle]);

  const toggleSelect = (title: string) => {
    const v = norm(title);
    if (!v) return;

    setSelected(prev => {
      const set = new Set(prev.map(norm));
      if (set.has(v)) return prev.filter(x => norm(x) !== v);
      return [...prev, v];
    });
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault(); // ✅ 폼 제출 방지
    const uniq = Array.from(new Set(selected.map(norm).filter(Boolean)));
    if (uniq.length === 0) return;
    uniq.forEach(t => onAdd(t));
    onClose();
  };

  if (!open) return null;

  return (
    <div className={s.overlay} onMouseDown={onClose} role="dialog">
      <div className={s.modal} onMouseDown={(e) => e.stopPropagation()}>
        {/* 헤더 영역 */}
        <div className={s.header}>
          <div className={s.titleGroup}>
            <div className={s.title}>위험요인 추가</div>
            <div className={s.subTitle}>
              <span className="text-purple-600 font-bold">{processTitle}</span> 공정의 위험요인을 선택하세요.
            </div>
          </div>
          <button 
            type="button" // ✅ 폼 제출 방지
            className={s.closeBtn} 
            onClick={(e) => { e.preventDefault(); onClose(); }} 
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        {/* 검색창 영역 */}
        <div className={s.searchBox}>
          <Search size={18} className={s.searchIcon} />
          <input
            className={s.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="추가로 검색할 위험요인을 입력하세요..."
            autoFocus
          />
        </div>

        {/* 선택된 항목 (칩셋) */}
        {selected.length > 0 && (
          <div className={s.selectedBar}>
            {selected.map(t => (
              <button 
                key={t} 
                type="button" // ✅ 폼 제출 방지
                className={s.selectedChip} 
                onClick={(e) => {
                  e.preventDefault();
                  toggleSelect(t);
                }}
              >
                {t} <span className={s.selectedX}>×</span>
              </button>
            ))}
          </div>
        )}

        {/* 결과 리스트 영역 */}
        <div className={s.list}>
          {loading && <div className={s.empty}>데이터를 불러오는 중...</div>}
          {!loading && error && <div className={s.empty}>{error}</div>}
          
          {!loading && !error && items.length > 0 && (
            <>
              {items.map(t => {
                const v = norm(t);
                const isSelected = selectedSet.has(v);
                return (
                  <button
                    key={v}
                    type="button" // ✅ 클릭 시 깜빡임(Submit) 방지
                    className={`${s.item} ${isSelected ? s.itemSelected : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        toggleSelect(v);
                    }}
                  >
                    <span className={s.itemText}>{v}</span>
                    {isSelected && <span className={s.pick}>선택됨</span>}
                  </button>
                );
              })}
            </>
          )}

          {/* 결과 없음 처리 */}
          {!loading && !error && items.length === 0 && (
            <div className={s.empty}>
              {q ? (
                <>
                  검색 결과가 없습니다.<br/>
                  <button 
                    type="button"
                    className={s.createBtn}
                    onClick={(e) => { 
                        e.preventDefault();
                        onAdd(q); 
                        onClose(); 
                    }}
                  >
                    '{q}' 직접 추가하기
                  </button>
                </>
              ) : (
                '해당 공정에 등록된 추천 위험요인이 없습니다.'
              )}
            </div>
          )}
        </div>

        {/* 푸터 영역 */}
        <div className={s.footer}>
          <button 
            type="button" 
            className={s.cancel} 
            onClick={(e) => { e.preventDefault(); onClose(); }}
          >
            취소
          </button>
          <button 
            type="button"
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