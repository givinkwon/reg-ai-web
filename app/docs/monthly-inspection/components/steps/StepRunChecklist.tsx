'use client';

import { useMemo, useEffect, useRef } from 'react';
import s from './StepRunChecklist.module.css';
import type { ChecklistItem, Rating } from '../MonthlyInspectionCreateModal'; // 타입 경로는 실제 경로에 맞게

// GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Docs', section: 'MonthlyInspection', area: 'StepRunChecklist' } as const;

type Props = {
  detailTasks: string[];
  items: ChecklistItem[];
  onChangeItems: (next: ChecklistItem[]) => void;
  onBack: () => void;
  onFinish: () => void;
  finishDisabled?: boolean;
  // ✅ [추가] 자동 주행 모드 여부
  isAutoRun?: boolean;
};

const RATINGS: { key: Rating; label: string }[] = [
  { key: 'O', label: '양호' },
  { key: '△', label: '미흡' },
  { key: 'X', label: '불량' },
];

export default function StepRunChecklist({ 
  items, onChangeItems, onBack, onFinish, finishDisabled, isAutoRun 
}: Props) {
  
  // 중복 호출 방지를 위한 Ref
  const finishTriggeredRef = useRef(false);

  // ✅ [핵심 로직] 자동 채우기 및 자동 완료 트리거
  useEffect(() => {
    // 1. 체크 안 된(rating이 없는) 항목이 있는지 확인
    const hasMissing = items.some(it => !it.rating);

    if (hasMissing) {
      // 2-A. 빈 값이 있으면 -> 자동으로 'O' 채우기
      const nextItems = items.map(it => ({
        ...it,
        rating: it.rating || ('O' as Rating)
      }));
      onChangeItems(nextItems);
    } else {
      // 2-B. 빈 값이 없고(다 채워졌고) + 자동 모드라면 -> 완료 실행
      if (isAutoRun && !finishDisabled && !finishTriggeredRef.current) {
        finishTriggeredRef.current = true; // 중복 실행 방지
        
        // 시각적 효과를 위해 0.8초 뒤 실행
        setTimeout(() => {
          onFinish();
        }, 800);
      }
    }
  }, [items, onChangeItems, isAutoRun, finishDisabled, onFinish]);


  // GA: View 이벤트
  useEffect(() => {
    const doneCount = items.filter(it => !!it.rating).length;
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      total_items: items.length,
      initial_done: doneCount,
    });
  }, []);

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
                    const isActive = it.rating === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        className={`${s.rateBtn} ${isActive ? getRatingClass(r.key) : ''}`}
                        onClick={() => {
                            if (isAutoRun) return; // 자동 모드 중엔 클릭 방지
                            track(gaEvent(GA_CTX, 'SelectRating'), {
                                ui_id: gaUiId(GA_CTX, 'SelectRating'),
                                rating: r.key,
                                category: cat
                            });
                            updateItem(it.id, { rating: r.key });
                        }}
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
                  disabled={isAutoRun} // 자동 모드 중엔 입력 방지
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}