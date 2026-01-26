'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import s from './AddHazardModal.module.css';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context: 위험요인 검색 모달
const GA_CTX = { page: 'Docs', section: 'RiskAssessment', area: 'SearchHazardModal' } as const;

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

  // ✅ 클라이언트 캐시 (키워드: 결과배열)
  const cacheRef = useRef<Map<string, string[]>>(new Map());

  // 1. 모달이 열릴 때 상태 초기화 & GA View
  useEffect(() => {
    if (!open) return;

    // ✅ GA: View 이벤트
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      task_title: taskTitle,
      process_title: processTitle
    });

    setQ('');
    setItems([]);
    setError(null);
    setSelected([]);

    // 작업이나 공정이 바뀌면 이전 캐시는 무효하므로 초기화
    cacheRef.current.clear();
  }, [open, taskTitle, processTitle]);

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

    // [2단계] 즉시 로딩
    setLoading(true);
    setError(null);

    // [3단계] Debounce API 호출
    debounceRef.current = window.setTimeout(async () => {
      
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const qs = new URLSearchParams({ 
          endpoint: 'risk-situations',
          process_name: norm(taskTitle),
          sub_process: norm(processTitle),
          q: keyword, 
          limit: '50' 
        });

        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
          method: 'GET',
          signal: ac.signal,
        });

        if (!res.ok) throw new Error('데이터 요청 실패');

        const data = await res.json();
        
        const next = Array.from<string>(
          new Set((data.items ?? []).map((x: any) => x.title || x).map(norm).filter(Boolean))
        );
        
        // [4단계] 캐시 저장
        cacheRef.current.set(keyword, next);
        
        setItems(next);

        // ✅ GA: 검색 결과 로드 추적
        if (keyword) {
            track(gaEvent(GA_CTX, 'Search'), {
                ui_id: gaUiId(GA_CTX, 'Search'),
                query: keyword,
                result_count: next.length,
                process_title: processTitle
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
  }, [q, open, taskTitle, processTitle]);

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
        process_title: processTitle
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
        process_title: processTitle
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
        process_title: processTitle
    });
    onAdd(q);
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

        {/* 결과 리스트 영역 */}
        <div className={s.list}>
          {loading && (
            <div className={s.empty}>
               <div className="animate-pulse">데이터를 불러오는 중...</div>
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

          {/* 결과 없음 처리 */}
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
            data-ga-event="ClickConfirm"
            data-ga-id={gaUiId(GA_CTX, 'ClickConfirm')}
          >
            확인 {selected.length > 0 && `(${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}