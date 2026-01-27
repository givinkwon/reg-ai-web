'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import s from './AddDetailTaskModal.module.css'; // CSS 모듈은 기존과 동일하게 사용한다고 가정

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context: 공정 검색 모달
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

  // ✅ 클라이언트 캐시 저장소
  const cacheRef = useRef<Map<string, string[]>>(new Map());

  // 1. 모달이 열릴 때 상태 초기화 및 GA View
  useEffect(() => {
    if (!open) return;
    
    // ✅ GA: View 이벤트 (어떤 작업에 대한 공정 추가인지 식별)
    track(gaEvent(GA_CTX, 'View'), {
        ui_id: gaUiId(GA_CTX, 'View'),
        task_title: taskTitle 
    });

    setQ('');
    setItems([]);
    setError(null);
    setSelected([]);
    
    // 다른 작업(taskTitle)을 위해 모달을 열었을 수 있으므로 캐시 초기화
    cacheRef.current.clear(); 
  }, [open, taskTitle]);

  // 2. 검색 API 호출 (캐싱 + 즉시 로딩 적용)
  useEffect(() => {
    if (!open) return;

    const keyword = norm(q);

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    // [1단계] 캐시 확인
    if (cacheRef.current.has(keyword)) {
      abortRef.current?.abort();
      setItems(cacheRef.current.get(keyword) || []);
      setLoading(false);
      setError(null);
      return;
    }

    // [2단계] 즉시 로딩 표시
    setLoading(true);
    setError(null);

    // [3단계] Debounce 호출
    debounceRef.current = window.setTimeout(async () => {
      
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const qs = new URLSearchParams({ 
          endpoint: 'sub-processes',
          process_name: norm(taskTitle),
          q: keyword, 
          limit: '50' 
        });
        
        if (minorCategory) qs.set('minor', minorCategory);

        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
          method: 'GET',
          signal: ac.signal,
        });

        if (!res.ok) throw new Error('데이터를 불러오지 못했습니다.');

        const data = await res.json();
        const next = Array.from<string>(new Set((data.items ?? []).map(norm).filter(Boolean)));
        
        // [4단계] 결과 캐시에 저장
        cacheRef.current.set(keyword, next);

        setItems(next);

        // ✅ GA: 검색 결과 로드 추적
        if (keyword) {
            track(gaEvent(GA_CTX, 'Search'), {
                ui_id: gaUiId(GA_CTX, 'Search'),
                query: keyword,
                result_count: next.length,
                task_title: taskTitle
            });
        }

      } catch (e: any) {
        if (e.name !== 'AbortError') {
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
      // 해제
      if (set.has(v)) return prev.filter(x => norm(x) !== v);
      
      // 선택
      // ✅ GA: 아이템 선택 추적
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

    // ✅ GA: 확인 버튼 추적
    track(gaEvent(GA_CTX, 'ClickConfirm'), {
        ui_id: gaUiId(GA_CTX, 'ClickConfirm'),
        selected_count: uniq.length,
        task_title: taskTitle
    });

    uniq.forEach(t => onAdd(t));
    onClose();
  };

  // ✅ GA: 직접 추가 핸들러
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
          {/* ✅ GA: 닫기 버튼 */}
          <button 
            type="button" 
            className={s.closeBtn} 
            onClick={(e) => { 
                e.preventDefault();
                track(gaEvent(GA_CTX, 'Close'), { ui_id: gaUiId(GA_CTX, 'Close') });
                onClose(); 
            }} 
            aria-label="닫기"
            data-ga-event="Close"
            data-ga-id={gaUiId(GA_CTX, 'Close')}
            data-ga-label="닫기 버튼"
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
                    data-ga-event={isSelected ? 'DeselectItem' : 'SelectItem'}
                    data-ga-id={gaUiId(GA_CTX, isSelected ? 'DeselectItem' : 'SelectItem')}
                    data-ga-label={v}
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
                    data-ga-event="ClickManualAdd"
                    data-ga-id={gaUiId(GA_CTX, 'ClickManualAdd')}
                    data-ga-label={`'{q}' 직접 추가하기 버튼`}
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
            data-ga-event="ClickConfirm"
            data-ga-id={gaUiId(GA_CTX, 'ClickConfirm')}
            data-ga-label="확인 버튼"
          >
            확인 {selected.length > 0 && `(${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}