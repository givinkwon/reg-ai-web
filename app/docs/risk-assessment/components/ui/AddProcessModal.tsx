'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import s from './AddDetailTaskModal.module.css'; 

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'SafetyDocs', section: 'RiskAssessment', area: 'SearchProcessModal' } as const;

type Props = {
  open: boolean;
  taskTitle: string;
  minorCategory?: string | null;
  onClose: () => void;
  onAdd: (title: string) => void;
};

const norm = (v?: string | null) => (v ?? '').trim();

export default function AddProcessModal({ open, taskTitle, minorCategory, onClose, onAdd }: Props) {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected.map(norm)), [selected]);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const cacheRef = useRef<Map<string, string[]>>(new Map());

  // 1. 초기화
  useEffect(() => {
    if (!open) return;
    
    track(gaEvent(GA_CTX, 'View'), {
        ui_id: gaUiId(GA_CTX, 'View'),
        task_title: taskTitle 
    });

    setQ('');
    setItems([]);
    setError(null);
    setSelected([]);
    cacheRef.current.clear(); 
  }, [open, taskTitle]);

  // 2. 검색 API 호출 (수정됨)
  useEffect(() => {
    if (!open) return;

    const keyword = norm(q);

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

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
        const fetchPromises: Promise<Response>[] = [];

        // 🟢 (1) 요청 1: 현재 작업(taskTitle)에 속한 공정 검색
        // 예: "프레스 임가공" 작업 내의 "검사" 공정 검색
        const qs1 = new URLSearchParams({ 
          endpoint: 'sub-processes',
          process_name: norm(taskTitle), // ✅ 현재 작업명 기준 필터링
          q: keyword, 
          limit: '50',
        });
        
        // 특정 카테고리가 있고, 그게 공통이 아니라면 필터 추가
        if (minorCategory && norm(minorCategory) !== '공통') {
            qs1.set('minor', minorCategory);
        }
        
        fetchPromises.push(fetch(`/api/risk-assessment?${qs1.toString()}`, { signal: ac.signal }));

        // 🟢 (2) 요청 2: "공통" 카테고리 전체 검색
        // 🔥 [핵심 수정] process_name을 넣지 않습니다.
        // 이유: 공통 공정은 '프레스 임가공' 같은 특정 작업명에 묶여있지 않을 수 있기 때문입니다.
        // 작업명 필터를 빼고 minor='공통'으로만 검색하면 DB의 모든 공통 공정을 가져옵니다.
        const qs2 = new URLSearchParams({ 
          endpoint: 'sub-processes',
          // process_name: norm(taskTitle), // ❌ 제거함! 공통 데이터는 작업명 무관하게 검색
          q: keyword, 
          limit: '50',
          minor: '공통' // ✅ 공통 카테고리 강제 지정
        });
        
        fetchPromises.push(fetch(`/api/risk-assessment?${qs2.toString()}`, { signal: ac.signal }));

        // 🟢 (3) 결과 병합
        const responses = await Promise.all(fetchPromises);
        const results = await Promise.all(responses.map(async res => {
            if (!res.ok) return [];
            const json = await res.json();
            return (json.items ?? []) as string[];
        }));

        // 중복 제거 및 정렬
        const mergedItems = Array.from(new Set(results.flat().map(norm).filter(Boolean))).sort();
        
        cacheRef.current.set(keyword, mergedItems);
        setItems(mergedItems);

        if (keyword) {
            track(gaEvent(GA_CTX, 'Search'), {
                ui_id: gaUiId(GA_CTX, 'Search'),
                query: keyword,
                result_count: mergedItems.length,
                task_title: taskTitle
            });
        }

      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error(e);
          setError('목록을 불러오는 중 오류가 발생했습니다.');
        }
      } finally {
        if (!ac.signal.aborted) {
             setLoading(false);
        }
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [q, open, taskTitle, minorCategory]);

  const toggleSelect = (title: string) => {
    const v = norm(title);
    if (!v) return;

    setSelected(prev => {
      const set = new Set(prev.map(norm));
      if (set.has(v)) return prev.filter(x => norm(x) !== v);
      
      track(gaEvent(GA_CTX, 'SelectItem'), {
        ui_id: gaUiId(GA_CTX, 'SelectItem'),
        item_title: v,
        task_title: taskTitle
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
        selected_count: uniq.length,
        task_title: taskTitle
    });

    uniq.forEach(t => onAdd(t));
    onClose();
  };

  const handleManualAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    track(gaEvent(GA_CTX, 'ClickManualAdd'), {
        ui_id: gaUiId(GA_CTX, 'ClickManualAdd'),
        query: q,
        task_title: taskTitle
    });
    onAdd(q);
    onClose();
  };

  if (!open) return null;

  return (
    <div className={s.overlay} onMouseDown={onClose} role="dialog">
      <div className={s.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <div className={s.titleGroup}>
            <div className={s.title}>공정 추가</div>
            <div className={s.subTitle}>
              <span className="text-purple-600 font-bold">{taskTitle}</span> 작업의 세부 공정을 선택하세요.
            </div>
          </div>
          <button 
            type="button" 
            className={s.closeBtn} 
            onClick={(e) => { 
                e.preventDefault();
                track(gaEvent(GA_CTX, 'Close'), { ui_id: gaUiId(GA_CTX, 'Close') });
                onClose(); 
            }} 
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className={s.searchBox}>
          <Search size={18} className={s.searchIcon} />
          <input
            className={s.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="추가로 검색할 키워드를 입력하세요..."
            autoFocus
          />
        </div>

        {selected.length > 0 && (
          <div className={s.selectedBar}>
            {selected.map(t => (
              <button 
                key={t} 
                type="button" 
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

        <div className={s.list}>
          {loading && (
             <div className={s.empty}>
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

          {!loading && !error && items.length === 0 && (
            <div className={s.empty}>
              {q ? (
                <>
                  검색 결과가 없습니다.<br/>
                  <button 
                    type="button"
                    className={s.createBtn}
                    onClick={handleManualAdd}
                  >
                    '{q}' 직접 추가하기
                  </button>
                </>
              ) : (
                '관련된 공정 데이터가 없습니다.'
              )}
            </div>
          )}
        </div>

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