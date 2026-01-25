'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react'; // ✅ 로딩 아이콘 추가
import s from './TbmDetailTaskTagInput.module.css';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'TbmDetailTaskInput' } as const;

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  minorCategory?: string | null;
  endpoint?: string;
};

const norm = (v?: string | null) => (v ?? '').trim();

export default function TbmDetailTaskTagInput({ value, onChange, minorCategory, endpoint = 'detail-tasks' }: Props) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false); // ✅ 로딩 상태 추가
  
  // 포탈 위치 상태
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 위치 계산
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

  // ✅ 데이터 페칭 함수 분리
  const fetchSuggestions = useCallback(async (query: string, isInitial = false) => {
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
        
        // 검색어가 있거나, 결과가 있으면 오픈 (초기 진입 시에는 오픈하지 않고 데이터만 로드)
        if (!isInitial && (query || filtered.length > 0)) {
            setIsOpen(true);
        }

        // ✅ GA: 검색 결과 로드
        if (!isInitial && query) {
            track(gaEvent(GA_CTX, 'SearchTasks'), {
                ui_id: gaUiId(GA_CTX, 'SearchTasks'),
                query,
                count: filtered.length,
                minor: minorCategory || 'all'
            });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, minorCategory, value]);

  // ✅ [수정] 초기 진입 시 자동 검색 (빈 쿼리로 호출하여 추천 목록 확보)
  useEffect(() => {
    fetchSuggestions('', true); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minorCategory]); // 카테고리가 바뀌면 다시 로드

  // ✅ [수정] 입력어 변경 시 검색 (Debounce)
  useEffect(() => {
    // 입력어가 없으면(지웠으면) 기본 목록(빈 쿼리) 다시 로드
    if (!input.trim()) {
        if (isOpen) fetchSuggestions('', false);
        return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(input, false);
    }, 300); // 300ms 딜레이

    return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, fetchSuggestions, isOpen]);


  const addTag = (tag: string) => {
    if (!tag.trim()) return;
    if (!value.includes(tag)) {
      onChange([...value, tag]);
      
      // ✅ GA: 태그 추가
      track(gaEvent(GA_CTX, 'AddTag'), {
        ui_id: gaUiId(GA_CTX, 'AddTag'),
        tag_name: tag,
      });
    }
    setInput('');       
    // 태그 추가 후에는 다시 기본 추천 목록을 불러옴 (선택된 거 제외됨)
    fetchSuggestions('', false);
    
    // 포커스 유지
    inputRef.current?.focus(); 
  };

  const removeTag = (idx: number) => {
    const target = value[idx];
    onChange(value.filter((_, i) => i !== idx));

    // ✅ GA: 태그 삭제
    track(gaEvent(GA_CTX, 'RemoveTag'), {
        ui_id: gaUiId(GA_CTX, 'RemoveTag'),
        tag_name: target,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && suggestions.length > 0) addTag(suggestions[activeIndex]);
      else addTag(input);
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
    }, 150);
  };

  // ✅ 드롭다운 (Portal)
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
      onMouseDown={(e) => {
        e.preventDefault(); 
      }}
    >
      {/* ✅ 로딩 애니메이션 표시 */}
      {isLoading && (
        <div style={{ padding: '1rem', textAlign: 'center', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem' }}>
            <Loader2 size={16} className={s.spin} />
            검색 중...
        </div>
      )}

      {/* 목록 표시 (로딩 중이어도 이전 목록 보여주거나, 로딩 끝나면 보여줌) */}
      {!isLoading && suggestions.length === 0 && (
          <div style={{ padding: '0.8rem', textAlign: 'center', color: '#999', fontSize: '0.9rem' }}>
              검색 결과가 없습니다.
          </div>
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
          onClick={() => addTag(item)}
          onMouseEnter={() => setActiveIndex(i)}
        >
          {item}
        </button>
      ))}
    </div>
  );

  return (
    <div className={s.wrap} ref={wrapperRef}>
      <div 
        className={s.box} 
        onClick={() => {
          inputRef.current?.focus();
          // 클릭 시 추천 목록이 있거나 입력어가 있으면 엽니다.
          if (suggestions.length > 0 || input) setIsOpen(true);
          // 만약 비어있는데 닫혀있었다면 기본 목록 로드 시도
          if (suggestions.length === 0 && !input) fetchSuggestions('', false);
        }}
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
          onFocus={() => {
             // 포커스 시에도 목록이 있으면 엽니다.
             if (suggestions.length > 0) setIsOpen(true);
             else fetchSuggestions('', false);
          }}
          placeholder={value.length === 0 ? "작업을 입력하세요" : ""}
        />
      </div>

      {mounted && isOpen && createPortal(dropdownContent, document.body)}
    </div>
  );
}