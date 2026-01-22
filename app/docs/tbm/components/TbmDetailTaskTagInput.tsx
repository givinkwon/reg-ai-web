'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { X } from 'lucide-react';
import s from './TbmDetailTaskTagInput.module.css'; // ✅ CSS 모듈 분리

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
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // API 검색
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
          setSuggestions(items.filter((item: string) => !value.includes(item)));
          setIsOpen(true);
          setActiveIndex(0);
        }
      } catch (e) {
        console.error(e);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [input, minorCategory, endpoint, value]);

  const addTag = (tag: string) => {
    if (!tag.trim()) return;
    if (!value.includes(tag)) {
      onChange([...value, tag]);
    }
    setInput('');
    setIsOpen(false);
  };

  const removeTag = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && suggestions.length > 0) {
        addTag(suggestions[activeIndex]);
      } else {
        addTag(input);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  return (
    <div className={s.wrap} ref={wrapperRef}>
      <div className={s.box} onClick={() => setIsOpen(true)}>
        {value.map((tag, i) => (
          <span key={i} className={s.tag}>
            {tag}
            <button type="button" className={s.tagX} onClick={(e) => { e.stopPropagation(); removeTag(i); }}>
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          className={s.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? "작업을 입력하세요 (예: 용접, 배관)" : ""}
        />
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className={s.dropdown}>
          {suggestions.map((item, i) => (
            <button
              key={item}
              type="button"
              className={`${s.option} ${i === activeIndex ? s.optionActive : ''}`}
              onClick={() => addTag(item)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}