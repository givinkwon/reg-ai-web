'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Hash } from 'lucide-react'; // ✅ Hash 아이콘 추가
import s from './AddDetailTaskModal.module.css';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Docs', section: 'RiskAssessment', area: 'SearchModal' } as const;

type Props = {
  open: boolean;
  minorCategory: string | null;
  onClose: () => void;
  onAdd: (title: string) => void;
};

const norm = (v?: string | null) => (v ?? '').trim();

// ✅ 자주 찾는 작업 태그 목록 정의
const RECOMMENDED_TAGS = [
  '용접', '프레스', '도장', '화물', '정비', 
  '굴착', '밀폐공간', '비계', '전기', '배관'
];

export default function AddDetailTaskModal({ open, minorCategory, onClose, onAdd }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected.map(norm)), [selected]);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const cacheRef = useRef<Map<string, string[]>>(new Map());

  // ✅ GA: 모달 View
  useEffect(() => {
    if (open) {
        track(gaEvent(GA_CTX, 'View'), { ui_id: gaUiId(GA_CTX, 'View') });
    }
  }, [open]);

  // API 검색 로직 (기존과 동일, q가 변경되면 자동 실행됨)
  useEffect(() => {
    if (!open) return;
    const keyword = norm(q);

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    // ✅ 검색어가 없으면 초기화하고 리턴 (태그 목록을 보여주기 위함)
    if (!keyword) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (cacheRef.current.has(keyword)) {
      abortRef.current?.abort();
      setItems(cacheRef.current.get(keyword) || []);
      setLoading(false);
      setError(null);
      return; 
    }

    setLoading(true);
    setError(null);

    debounceRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const qs = new URLSearchParams({ endpoint: 'detail-tasks', q: keyword, limit: '50' });
        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
          method: 'GET',
          signal: ac.signal,
        });

        if (!res.ok) throw new Error('검색 실패');

        const data = await res.json();
        const next = Array.from<string>(new Set((data.items ?? []).map(norm).filter(Boolean)));
        
        cacheRef.current.set(keyword, next);
        setItems(next);
        
        if (keyword) {
            track(gaEvent(GA_CTX, 'Search'), {
                ui_id: gaUiId(GA_CTX, 'Search'),
                query: keyword,
                result_count: next.length
            });
        }

      } catch (e: any) {
        if (e.name !== 'AbortError') setError('검색 중 오류가 발생했습니다.');
      } finally {
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
      
      track(gaEvent(GA_CTX, 'SelectItem'), {
        ui_id: gaUiId(GA_CTX, 'SelectItem'),
        item_title: v
      });
      return [...prev, v];
    });
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    const uniq = Array.from(new Set(selected.map(norm).filter(Boolean)));
    if (uniq.length === 0) return;
    
    track(gaEvent(GA_CTX, 'ClickConfirm'), {
        ui_id: gaUiId(GA_CTX, 'ClickConfirm'),
        selected_count: uniq.length
    });

    uniq.forEach(t => onAdd(t));
    onClose();
  };

  const handleManualAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    track(gaEvent(GA_CTX, 'ClickManualAdd'), { ui_id: gaUiId(GA_CTX, 'ClickManualAdd'), query: q });
    onAdd(q); 
    onClose(); 
  };

  // ✅ 태그 클릭 핸들러 (검색어 자동 입력)
  const handleTagClick = (tag: string) => {
    track(gaEvent(GA_CTX, 'ClickRecommendTag'), {
      ui_id: gaUiId(GA_CTX, 'ClickRecommendTag'),
      tag_name: tag
    });
    setQ(tag); // 상태 변경 -> useEffect 트리거 -> 검색 실행
  };

  if (!open) return null;

  return (
    <div className={s.overlay} onMouseDown={onClose} role="dialog">
      <div className={s.modal} onMouseDown={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className={s.header}>
          <div className={s.titleGroup}>
            <div className={s.title}>작업 선택</div>
            <div className={s.subTitle}>키워드를 검색하거나 아래 태그를 선택하세요.</div>
          </div>
          <button 
            type="button" 
            className={s.closeBtn} 
            onClick={(e) => { 
                e.preventDefault(); 
                track(gaEvent(GA_CTX, 'Close'), { ui_id: gaUiId(GA_CTX, 'Close') });
                onClose(); 
            }} 
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
            placeholder="직접 검색어 입력..."
            autoFocus
          />
          {/* 입력값 초기화 버튼 */}
          {q && (
            <button className={s.clearBtn} onClick={() => setQ('')}>
               <X size={14} />
            </button>
          )}
        </div>

        {/* 선택된 항목 (Chips) */}
        {selected.length > 0 && (
          <div className={s.selectedBar}>
            {selected.map(t => (
              <button 
                key={t} 
                type="button" 
                className={s.selectedChip} 
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(t); }}
              >
                {t} <span className={s.selectedX}>×</span>
              </button>
            ))}
          </div>
        )}

        {/* ✅ 리스트 영역: 검색어가 없을 땐 태그, 있을 땐 결과 */}
        <div className={s.list}>
          
          {/* Case 1: 검색어가 없을 때 -> 추천 태그 노출 */}
          {!q && (
            <div className={s.tagSection}>
              <div className={s.tagLabel}>🔥 자주 찾는 작업</div>
              <div className={s.tagGrid}>
                {RECOMMENDED_TAGS.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    className={s.tagChip}
                    onClick={() => handleTagClick(tag)}
                  >
                    <Hash size={12} className="mr-1 opacity-50"/> {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Case 2: 검색 중 */}
          {q && loading && (
            <div className={s.empty}>
              <div className="animate-pulse">🔍 '{q}' 검색 중...</div>
            </div>
          )}
          
          {/* Case 3: 에러 */}
          {q && !loading && error && <div className={s.empty}>{error}</div>}
          
          {/* Case 4: 검색 결과 있음 */}
          {q && !loading && !error && items.length > 0 && (
            <>
              {items.map(t => {
                const v = norm(t);
                const isSelected = selectedSet.has(v);
                return (
                  <button
                    key={v}
                    type="button"
                    className={`${s.item} ${isSelected ? s.itemSelected : ''}`}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleSelect(v); }}
                  >
                    <span className={s.itemText}>{v}</span>
                    {isSelected && <span className={s.pick}>선택됨</span>}
                  </button>
                );
              })}
            </>
          )}

          {/* Case 5: 검색 결과 없음 -> 직접 추가 유도 */}
          {q && !loading && !error && items.length === 0 && (
            <div className={s.empty}>
              검색 결과가 없습니다.<br/>
              <button 
                type="button"
                className={s.createBtn}
                onClick={handleManualAdd}
              >
                '{q}' 직접 추가하기
              </button>
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