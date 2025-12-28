// components/risk-assessment/ui/AddItemSheet.tsx
import React, { useMemo, useState } from 'react';
import s from './AddItemSheet.module.css';

type Props = {
  open: boolean;
  title: string;
  placeholder?: string;
  suggestions?: string[];
  onClose: () => void;
  onAdd: (value: string) => void;
};

export default function AddItemSheet({
  open,
  title,
  placeholder,
  suggestions = [],
  onClose,
  onAdd,
}: Props) {
  const [value, setValue] = useState('');

  const deduped = useMemo(() => {
    const set = new Set<string>();
    suggestions.forEach((x) => set.add(x));
    return Array.from(set);
  }, [suggestions]);

  if (!open) return null;

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue('');
    onClose();
  };

  const pick = (v: string) => {
    onAdd(v);
    onClose();
  };

  return (
    <div className={s.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={s.handle} />
        <div className={s.head}>
          <div className={s.title}>{title}</div>
          <button className={s.closeBtn} onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className={s.body}>
          <div className={s.row}>
            <input
              className={s.input}
              placeholder={placeholder || '입력하세요'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
            <button className={s.addBtn} onClick={submit}>
              추가하기
            </button>
          </div>

          {deduped.length > 0 && (
            <>
              <div className={s.suggTitle}>추천</div>
              <div className={s.chips}>
                {deduped.map((x) => (
                  <button key={x} className={s.chip} onClick={() => pick(x)}>
                    {x}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
