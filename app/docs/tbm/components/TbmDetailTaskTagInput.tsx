'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Hash, Plus } from 'lucide-react';
import s from './TbmDetailTaskTagInput.module.css';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Docs', section: 'TBM', area: 'TaskInput' } as const;

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  minorCategory?: string | null;
  endpoint?: string;
};

const norm = (v?: string | null) => (v ?? '').trim();

// ✅ 자주 쓰는 작업 태그 (항상 노출)
const RECOMMENDED_TAGS = [
  '지게차', '크레인', '용접', '고소작업', '비계',
  '사다리', '굴착', '전기설비', '밀폐공간', '그라인더',
  '화물차', '배관', '프레스', '거푸집', '신호수'
];

export default function TbmDetailTaskTagInput({ value, onChange, minorCategory, endpoint = 'detail-tasks' }: Props) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  // 포탈 위치 상태
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 위치 계산 (검색 결과 드롭다운용)
  useEffect(() => {
    if (isOpen && wrapperRef.current) {
        const updateCoords = () => {
            if (!wrapperRef.current) return;
            const rect = wrapperRef.current.getBoundingClientRect();
            setCoords({
                top: rect.bottom + 4, 
                left: rect.left,
                width: rect.width
            });
        };
        updateCoords();
        window.addEventListener('resize', updateCoords);
        window.addEventListener('scroll', updateCoords, true);
        return () => {
            window.removeEventListener('resize', updateCoords);
            window.removeEventListener('scroll', updateCoords, true);
        };
    }
  }, [isOpen]);

  // ✅ 데이터 페칭 (검색어 입력 시)
  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query.trim()) {
        setSuggestions([]);
        return;
    }
    
    setIsLoading(true);
    try {
      const qs = new URLSearchParams({
        endpoint,
        q: query,
        limit: '10',
        ...(minorCategory ? { minor: minorCategory } : {}),
      });

      const res = await fetch(`/api/risk-assessment?${qs.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const items = (data.items || []).map(norm).filter(Boolean);
        // 이미 선택된 태그 제외
        const filtered = items.filter((item: string) => !value.includes(item));
        
        setSuggestions(filtered);
        
        // 검색 결과가 있거나 검색 중이면 오픈
        if (query) setIsOpen(true);

        // ✅ GA: 검색 추적
        track(gaEvent(GA_CTX, 'SearchTasks'), {
            ui_id: gaUiId(GA_CTX, 'SearchTasks'),
            query,
            result_count: filtered.length,
            minor: minorCategory || 'all'
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, minorCategory, value]);


  // 입력어 변경 시 검색 (Debounce)
  useEffect(() => {
    if (!input.trim()) {
        setIsOpen(false);
        return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(input);
    }, 250);

    return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, fetchSuggestions]);

  // ✅ 태그 추가 (소스 구분: manual, search, recommend)
  const addTag = (tag: string, source: 'manual' | 'search' | 'recommend') => {
    const v = norm(tag);
    if (!v) return;
    
    if (!value.includes(v)) {
      onChange([...value, v]);
      
      track(gaEvent(GA_CTX, 'AddTag'), {
        ui_id: gaUiId(GA_CTX, 'AddTag'),
        tag_name: v,
        source: source
      });
    }

    setInput('');       
    setIsOpen(false);
    inputRef.current?.focus(); 
  };

  const removeTag = (idx: number) => {
    const target = value[idx];
    onChange(value.filter((_, i) => i !== idx));

    track(gaEvent(GA_CTX, 'RemoveTag'), {
        ui_id: gaUiId(GA_CTX, 'RemoveTag'),
        tag_name: target,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      // 검색 결과 중 활성화된 항목이 있으면 그것을 추가, 없으면 입력값 추가
      if (isOpen && suggestions.length > 0) {
          addTag(suggestions[activeIndex], 'search');
      } else {
          addTag(input, 'manual');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value.length - 1);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
        setIsOpen(false);
    }, 200);
  };

  // ✅ 검색 결과 드롭다운 (Portal)
  const dropdownContent = (
    <div
      style={{
        position: 'fixed', 
        top: coords.top,
        left: coords.left,
        width: coords.width,
        backgroundColor: '#fff',
        border: '1px solid #ddd',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 99999, 
        maxHeight: '240px',
        overflowY: 'auto',
      }}
      onMouseDown={(e) => e.preventDefault()} // 포커스 잃지 않게
    >
      {isLoading && (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem' }}>
            <Loader2 size={16} className={s.spin} />
            검색 중...
        </div>
      )}

      {!isLoading && suggestions.length === 0 && input && (
          <button 
            className={s.option}
            style={{ width: '100%', textAlign: 'left', padding: '0.8rem', color: '#2388FF', cursor: 'pointer', background: 'none', border: 'none', fontSize: '0.95rem' }}
            onClick={() => addTag(input, 'manual')}
          >
             <Plus size={14} style={{ display: 'inline', marginRight: 4 }}/> 
             '{input}' 직접 추가하기
          </button>
      )}

      {!isLoading && suggestions.map((item, i) => (
        <button
          key={item}
          type="button"
          className={s.option}
          style={{
             display: 'block',
             width: '100%',
             textAlign: 'left',
             padding: '0.6rem 1rem',
             border: 'none',
             background: i === activeIndex ? '#f3f4f6' : '#fff',
             color: i === activeIndex ? '#2388FF' : '#000',
             cursor: 'pointer',
             fontSize: '0.95rem'
          }}
          onClick={() => addTag(item, 'search')}
          onMouseEnter={() => setActiveIndex(i)}
        >
          {item}
        </button>
      ))}
    </div>
  );

  return (
    <div className={s.wrap} ref={wrapperRef}>
      {/* 1. 입력창 영역 */}
      <div 
        className={s.box} 
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <span key={i} className={s.tag}>
            {tag}
            <button 
              type="button" 
              className={s.tagX} 
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => { 
                e.stopPropagation();
                removeTag(i); 
              }}
            >
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className={s.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={value.length === 0 ? "작업명 입력 (예: 용접, 지게차)" : ""}
        />
      </div>

      {/* 2. 검색 결과 포탈 */}
      {mounted && isOpen && input && createPortal(dropdownContent, document.body)}

      {/* 3. ✅ 추천 태그 영역 (항상 노출, 클릭 시 즉시 추가) */}
      <div className={s.recommendSection}>
        <div className={s.recommendLabel}>🔥 자주 하는 작업 (클릭하여 추가)</div>
        <div className={s.recommendGrid}>
          {RECOMMENDED_TAGS.map(tag => {
            const isActive = value.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                className={`${s.recommendChip} ${isActive ? s.activeChip : ''}`}
                // 이미 선택된건 비활성화 or 삭제 기능
                onClick={(e) => {
                    e.preventDefault();
                    if (!isActive) addTag(tag, 'recommend');
                    else {
                        // 선택된걸 다시 누르면 삭제 기능 (선택사항)
                        const idx = value.indexOf(tag);
                        if (idx > -1) removeTag(idx);
                    }
                }}
              >
                <Hash size={11} className="mr-1 opacity-50"/> {tag}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}