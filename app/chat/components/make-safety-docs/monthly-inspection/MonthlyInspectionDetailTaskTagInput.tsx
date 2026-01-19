// components/monthly-inspection/MonthlyInspectionDetailTaskTagInput.tsx
'use client';

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import s from './MonthlyInspectionDetailTaskTagInput.module.css';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'MonthlyInspection' } as const;

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
};

const norm = (v?: string | null) => (v ?? '').trim();

export default function MonthlyInspectionDetailTaskTagInput({
  value,
  onChange,
  suggestions = [],
}: Props) {
  const [input, setInput] = useState('');

  const cleaned = useMemo(() => value.map(norm).filter(Boolean), [value]);

  const add = (raw: string, source: 'input' | 'suggestion') => {
    const v = norm(raw);
    if (!v) return;

    const next = Array.from(new Set([...cleaned, v]));
    const added = next.length !== cleaned.length;

    onChange(next);

    // ✅ GA
    track(gaEvent(GA_CTX, source === 'input' ? 'DetailTaskTagAddInput' : 'DetailTaskTagAddSuggestion'), {
      ui_id: gaUiId(GA_CTX, source === 'input' ? 'DetailTaskTagAddInput' : 'DetailTaskTagAddSuggestion'),
      added,
      selected_count: next.length,
      tag_len: v.length,
    });
  };

  const remove = (t: string) => {
    const v = norm(t);
    const next = cleaned.filter((x) => x !== v);
    onChange(next);

    // ✅ GA
    track(gaEvent(GA_CTX, 'DetailTaskTagRemove'), {
      ui_id: gaUiId(GA_CTX, 'DetailTaskTagRemove'),
      selected_count: next.length,
      tag_len: v.length,
    });
  };

  const submitInput = () => {
    const v = norm(input);
    if (!v) return;
    add(v, 'input');
    setInput('');
  };

  return (
    <div className={s.wrap}>
      <div className={s.inputRow}>
        <input
          className={s.input}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);

            // ✅ 너무 잦은 타이핑 이벤트는 최소화: 첫 글자 진입만 기록
            if (norm(e.target.value).length === 1) {
              track(gaEvent(GA_CTX, 'DetailTaskTagTypingStart'), {
                ui_id: gaUiId(GA_CTX, 'DetailTaskTagTypingStart'),
              });
            }
          }}
          placeholder="점검할 작업 태그를 입력해주세요 (예: 금형 제조)"
          onFocus={() => {
            track(gaEvent(GA_CTX, 'DetailTaskTagInputFocus'), {
              ui_id: gaUiId(GA_CTX, 'DetailTaskTagInputFocus'),
              selected_count: cleaned.length,
            });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              track(gaEvent(GA_CTX, 'DetailTaskTagEnter'), {
                ui_id: gaUiId(GA_CTX, 'DetailTaskTagEnter'),
              });
              submitInput();
            }
          }}
          data-ga-event={gaEvent(GA_CTX, 'DetailTaskTagInput')}
          data-ga-id={gaUiId(GA_CTX, 'DetailTaskTagInput')}
        />
        <button
          type="button"
          className={s.addBtn}
          onClick={() => {
            track(gaEvent(GA_CTX, 'DetailTaskTagAddClick'), {
              ui_id: gaUiId(GA_CTX, 'DetailTaskTagAddClick'),
            });
            submitInput();
          }}
          aria-label="추가"
          data-ga-event={gaEvent(GA_CTX, 'DetailTaskTagAddClick')}
          data-ga-id={gaUiId(GA_CTX, 'DetailTaskTagAddClick')}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className={s.chips}>
        {cleaned.length === 0 ? (
          <div className={s.empty}>선택된 작업 태그가 없습니다.</div>
        ) : (
          cleaned.map((t) => (
            <button
              key={t}
              type="button"
              className={s.chip}
              onClick={() => remove(t)}
              title="삭제"
              data-ga-event={gaEvent(GA_CTX, 'DetailTaskTagRemove')}
              data-ga-id={gaUiId(GA_CTX, 'DetailTaskTagRemove')}
            >
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
              <button
                key={t}
                type="button"
                className={s.suggestChip}
                onClick={() => add(t, 'suggestion')}
                data-ga-event={gaEvent(GA_CTX, 'DetailTaskTagAddSuggestion')}
                data-ga-id={gaUiId(GA_CTX, 'DetailTaskTagAddSuggestion')}
              >
                {t}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
