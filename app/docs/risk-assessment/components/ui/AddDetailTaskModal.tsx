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
  
  // ✅ [추가] 클라이언트 캐시 (키워드: 결과배열)
  const cacheRef = useRef<Map<string, string[]>>(new Map());

  // API 검색 (Debounce + Caching + Immediate Loading 적용)
  useEffect(() => {
    if (!open) return;

    const keyword = norm(q);

    // 기존 타이머 클리어
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    // 1. 캐시 확인: 이미 검색한 키워드라면 서버 요청 없이 즉시 보여줌
    if (cacheRef.current.has(keyword)) {
      // 진행 중이던 요청이 있다면 취소 (레이스 컨디션 방지)
      abortRef.current?.abort();
      
      setItems(cacheRef.current.get(keyword) || []);
      setLoading(false);
      setError(null);
      return; 
    }

    // 2. 캐시에 없으면 '즉시' 로딩 상태로 전환 (사용자에게 반응성 제공)
    setLoading(true);
    setError(null);

    // 3. 실제 API 호출은 0.25초 뒤에 수행 (Debounce)
    debounceRef.current = window.setTimeout(async () => {
      // 이전 요청 취소
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const qs = new URLSearchParams({ endpoint: 'detail-tasks', q: keyword, limit: '50' });
        // if (minorCategory) qs.set('minor', minorCategory); 

        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
          method: 'GET',
          signal: ac.signal,
          // cache: 'no-store', // 브라우저 캐시 정책은 유지하되, 위에서 메모리 캐시로 먼저 방어함
        });

        if (!res.ok) throw new Error('검색 실패');

        const data = await res.json();
        const next = Array.from<string>(new Set((data.items ?? []).map(norm).filter(Boolean)));
        
        // ✅ [추가] 성공한 결과는 캐시에 저장
        cacheRef.current.set(keyword, next);

        setItems(next);
      } catch (e: any) {
        if (e.name !== 'AbortError') setError('검색 중 오류가 발생했습니다.');
      } finally {
        // 성공하든 실패하든 로딩 종료 (단, AbortError는 무시)
        if (!ac.signal.aborted) {
             setLoading(false);
        }
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, open, minorCategory]);

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
    e.preventDefault();
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
            <div className={s.title}>작업 선택</div>
            <div className={s.subTitle}>키워드를 검색하여 작업을 선택하세요.</div>
          </div>
          <button 
            type="button" 
            className={s.closeBtn} 
            onClick={(e) => { e.preventDefault(); onClose(); }} 
            aria-label="닫기"
          >
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
              <button 
                key={t} 
                type="button" 
                className={s.selectedChip} 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleSelect(t);
                }}
              >
                {t} <span className={s.selectedX}>×</span>
              </button>
            ))}
          </div>
        )}

        {/* 결과 리스트 */}
        <div className={s.list}>
          {loading && (
            <div className={s.empty}>
              {/* 로딩 스피너나 텍스트를 좀 더 부드럽게 표현 가능 */}
              <div className="animate-pulse">목록을 불러오는 중...</div>
            </div>
          )}
          
          {!loading && error && <div className={s.empty}>{error}</div>}
          
          {!loading && !error && items.length > 0 && (
            <>
              {items.map(t => {
                const v = norm(t);
                const isSelected = selectedSet.has(v);
                return (
                  <button
                    key={v}
                    type="button"
                    className={`${s.item} ${isSelected ? s.itemSelected : ''}`}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
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

          {/* 결과 없음: 직접 추가 버튼 */}
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
                <>데이터가 없습니다.</>
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
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