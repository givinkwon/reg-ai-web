'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import s from './TbmDetailTaskTagInput.module.css';

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
  
  // 포탈 위치 상태
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ✅ [중요 변경] 복잡한 외부 클릭 감지(document listener) 제거!
  // 대신 onBlur로 처리합니다.

  // 위치 계산 (Fixed Position)
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

  // 검색 API
  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({
          endpoint,
          q: input,
          limit: '10',
          ...(minorCategory ? { minor: minorCategory } : {}),
        });
        const res = await fetch(`/api/risk-assessment?${qs.toString()}`);
        if (res.ok) {
          const data = await res.json();
          const items = (data.items || []).map(norm).filter(Boolean);
          const filtered = items.filter((item: string) => !value.includes(item));
          setSuggestions(filtered);
          if (filtered.length > 0) setIsOpen(true);
          setActiveIndex(0);
        }
      } catch (e) { console.error(e); }
    }, 200);
    return () => clearTimeout(timer);
  }, [input, minorCategory, endpoint, value]);

  const addTag = (tag: string) => {
    if (!tag.trim()) return;
    if (!value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput('');       
    setSuggestions([]); 
    setIsOpen(false);   
    
    // 포커스 유지
    inputRef.current?.focus(); 
  };

  const removeTag = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
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

  // ✅ [핵심 1] 입력창에서 포커스가 빠져나가면 닫는다.
  const handleBlur = () => {
    // 잠깐 딜레이를 주어 클릭 이벤트가 먼저 처리될 수 있는 여유를 줌 (안전장치)
    // 하지만 아래 onMouseDown preventDefault가 있으면 이 딜레이 없이도 안전함
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
      // 🚨 [핵심 2] 여기가 제일 중요합니다!
      // 드롭다운 영역을 누를 때 "포커스 잃음(Blur)" 이벤트를 아예 발생시키지 않도록 막습니다.
      // 이렇게 하면 목록을 클릭해도 Input은 여전히 포커스를 가지고 있다고 착각합니다.
      onMouseDown={(e) => {
        e.preventDefault(); 
      }}
    >
      {suggestions.map((item, i) => (
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
          // ✅ 이제 마음 편하게 클릭 이벤트만 쓰면 됩니다.
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
          // 이미 내용이 있으면 다시 열기
          if (suggestions.length > 0) setIsOpen(true);
        }}
      >
        {value.map((tag, i) => (
          <span key={i} className={s.tag}>
            {tag}
            <button 
              type="button" 
              className={s.tagX} 
              onMouseDown={(e) => e.preventDefault()} // 삭제 버튼 눌러도 포커스 유지
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
          // ✅ 여기서 포커스 잃음을 감지
          onBlur={handleBlur}
          onFocus={() => {
             if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={value.length === 0 ? "작업을 입력하세요" : ""}
        />
      </div>

      {mounted && isOpen && suggestions.length > 0 && createPortal(dropdownContent, document.body)}
    </div>
  );
}