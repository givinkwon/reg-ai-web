'use client';

import { useMemo } from 'react';
import s from './StepRunChecklist.module.css';
import type { ChecklistItem, Rating } from '../MonthlyInspectionCreateModal';

type Props = {
  detailTasks: string[];
  items: ChecklistItem[];
  onChangeItems: (next: ChecklistItem[]) => void;
  onBack: () => void;
  onFinish: () => void;
  finishDisabled?: boolean;
};

const RATINGS: { key: Rating; label: string }[] = [
  { key: 'O', label: '양호' },
  { key: '△', label: '미흡' },
  { key: 'X', label: '불량' },
];

export default function StepRunChecklist({ items, onChangeItems, onBack, onFinish, finishDisabled }: Props) {
  
  const grouped = useMemo(() => {
    const m = new Map<string, ChecklistItem[]>();
    items.forEach(it => {
      const list = m.get(it.category) || [];
      list.push(it);
      m.set(it.category, list);
    });
    return Array.from(m.entries());
  }, [items]);

  const updateItem = (id: string, patch: Partial<ChecklistItem>) => {
    onChangeItems(items.map(it => it.id === id ? { ...it, ...patch } : it));
  };

  const progress = useMemo(() => {
    const done = items.filter(it => !!it.rating).length;
    return { done, total: items.length };
  }, [items]);

  // ✅ CSS 클래스 매핑 함수
  const getRatingClass = (r: Rating) => {
    if (r === 'O') return s.rate_O;
    if (r === '△') return s.rate_Tri;
    if (r === 'X') return s.rate_X;
    return '';
  };

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <span className={s.progress}>
          진행률: {progress.done} / {progress.total}
        </span>
      </div>

      <div className={s.list}>
        {grouped.map(([cat, list]) => (
          <div key={cat} className={s.group}>
            <div className={s.catTitle}>{cat}</div>
            {list.map(it => (
              <div key={it.id} className={s.card}>
                <div className={s.question}>{it.question}</div>
                
                <div className={s.ratingRow}>
                  {RATINGS.map(r => {
                    // ✅ rating 비교 시 안전하게 처리 (it.rating이 undefined면 선택 안 됨)
                    const isActive = it.rating === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        className={`${s.rateBtn} ${isActive ? getRatingClass(r.key) : ''}`}
                        onClick={() => updateItem(it.id, { rating: r.key })}
                      >
                        <span className={s.mark}>{r.key}</span> {r.label}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  className={s.note}
                  placeholder="지적사항 및 조치계획 입력"
                  value={it.note || ''}
                  onChange={e => updateItem(it.id, { note: e.target.value })}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={s.footer}>
        <button className={s.backBtn} onClick={onBack}>이전</button>
        <button className={s.finishBtn} onClick={onFinish} disabled={finishDisabled}>
          점검 완료
        </button>
      </div>
    </div>
  );
}