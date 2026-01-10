'use client';

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import s from './MonthlyInspectionDetailTaskTagInput.module.css';

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
};

const norm = (v?: string | null) => (v ?? '').trim();

export default function MonthlyInspectionDetailTaskTagInput({ value, onChange, suggestions = [] }: Props) {
  const [input, setInput] = useState('');

  const cleaned = useMemo(() => value.map(norm).filter(Boolean), [value]);

  const add = (raw: string) => {
    const v = norm(raw);
    if (!v) return;
    onChange(Array.from(new Set([...cleaned, v])));
  };

  const remove = (t: string) => {
    onChange(cleaned.filter((x) => x !== t));
  };

  const submitInput = () => {
    if (!norm(input)) return;
    add(input);
    setInput('');
  };

  return (
    <div className={s.wrap}>
      <div className={s.inputRow}>
        <input
          className={s.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="점검할 작업 태그를 입력해주세요 (예: 금형 제조)"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitInput();
            }
          }}
        />
        <button type="button" className={s.addBtn} onClick={submitInput} aria-label="추가">
          <Plus size={16} />
        </button>
      </div>

      <div className={s.chips}>
        {cleaned.length === 0 ? (
          <div className={s.empty}>선택된 작업 태그가 없습니다.</div>
        ) : (
          cleaned.map((t) => (
            <button key={t} type="button" className={s.chip} onClick={() => remove(t)} title="삭제">
              {t}
              <X size={14} />
            </button>
          ))
        )}
      </div>

      {suggestions.length > 0 && (
        <>
          <div className={s.suggestHeader}>
            <span className={s.suggestTitle}>작업 태그를 선택하기</span>
            <span className={s.suggestHint}>태그 검색</span>
          </div>

          <div className={s.suggestRow}>
            {suggestions.map((t) => (
              <button key={t} type="button" className={s.suggestChip} onClick={() => add(t)}>
                {t}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
