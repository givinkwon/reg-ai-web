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

  // ✅ [추가] 클라이언트 캐시 (키워드: 결과배열)
  const cacheRef = useRef<Map<string, string[]>>(new Map());

  // 1. 모달이 열릴 때 상태 초기화
  useEffect(() => {
    if (!open) return;
    setQ('');
    setItems([]);
    setError(null);
    setSelected([]);

    // ✅ [중요] 작업(task)이나 공정(process)이 바뀌면 이전 캐시는 무효하므로 초기화
    cacheRef.current.clear();
  }, [open, taskTitle, processTitle]);

  // 2. 검색 API 호출 (캐싱 + 즉시 로딩 적용)
  useEffect(() => {
    if (!open) return;

    const keyword = norm(q);

    // 기존 타이머 클리어
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    // ✅ [1단계] 캐시 확인: 이미 검색한 키워드면 API 호출 없이 즉시 표시
    if (cacheRef.current.has(keyword)) {
      abortRef.current?.abort(); // 진행 중인 요청 취소
      setItems(cacheRef.current.get(keyword) || []);
      setLoading(false);
      setError(null);
      return;
    }

    // ✅ [2단계] 캐시에 없으면, 타이핑 즉시 로딩 상태로 전환 (반응성 향상)
    setLoading(true);
    setError(null);

    // ✅ [3단계] 실제 API 호출은 0.25초 뒤에 (Debounce)
    debounceRef.current = window.setTimeout(async () => {
      
      // 이전 요청 취소
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
          // cache: 'no-store', // 메모리 캐시로 대체
        });

        if (!res.ok) throw new Error('데이터 요청 실패');

        const data = await res.json();
        
        // 데이터 정규화 및 중복 제거
        const next = Array.from<string>(
          new Set((data.items ?? []).map((x: any) => x.title || x).map(norm).filter(Boolean))
        );
        
        // ✅ [4단계] 결과 캐시에 저장
        cacheRef.current.set(keyword, next);
        
        setItems(next);

      } catch (e: any) {
        if (e.name !== 'AbortError') {
          setError('목록을 불러오는 중 오류가 발생했습니다.');
        }
      } finally {
        // Abort가 아닌 정상 종료/에러 시에만 로딩 끔
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
        {/* 헤더 영역 */}
        <div className={s.header}>
          <div className={s.titleGroup}>
            <div className={s.title}>위험요인 추가</div>
            <div className={s.subTitle}>
              <span className="text-purple-600 font-bold">{processTitle}</span> 공정의 위험요인을 선택하세요.
            </div>
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
               {/* 부드러운 로딩 피드백 */}
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