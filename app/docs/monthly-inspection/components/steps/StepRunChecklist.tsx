'use client';

import { useMemo, useEffect } from 'react';
import s from './StepRunChecklist.module.css';
import type { ChecklistItem, Rating } from '../MonthlyInspectionCreateModal';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context: 점검 실시 단계
const GA_CTX = { page: 'Docs', section: 'MonthlyInspection', area: 'StepRunChecklist' } as const;

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
  
  // 🔥 [핵심 수정] 진입 시(또는 아이템 변경 시) 빈 값이 있으면 무조건 'O'로 자동 체크
  useEffect(() => {
    // 1. 체크 안 된(rating이 없는) 항목이 있는지 확인
    const hasMissing = items.some(it => !it.rating);

    if (hasMissing) {
      // 2. 빈 항목들만 'O'로 채운 새로운 배열 생성
      const nextItems = items.map(it => ({
        ...it,
        rating: it.rating || ('O' as Rating) // 기존 값이 있으면 유지, 없으면 'O'
      }));

      // 3. 부모 상태 업데이트 (화면 갱신)
      onChangeItems(nextItems);
    }
  }, [items, onChangeItems]);


  // ✅ GA: View 이벤트 (진입 시 진행 상황 추적)
  useEffect(() => {
    const doneCount = items.filter(it => !!it.rating).length;
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      total_items: items.length,
      initial_done: doneCount,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 1회만

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
                    const isActive = it.rating === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        className={`${s.rateBtn} ${isActive ? getRatingClass(r.key) : ''}`}
                        onClick={() => {
                            // ✅ GA: 등급 선택 추적
                            track(gaEvent(GA_CTX, 'SelectRating'), {
                                ui_id: gaUiId(GA_CTX, 'SelectRating'),
                                rating: r.key,
                                category: cat
                            });
                            updateItem(it.id, { rating: r.key });
                        }}
                        data-ga-event="SelectRating"
                        data-ga-id={gaUiId(GA_CTX, 'SelectRating')}
                        data-ga-label={r.label}
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
      
      {/* 주석 처리된 푸터 (원래 코드 유지) */}
      {/* <div className={s.footer}>
        <button className={s.backBtn} onClick={onBack}>이전</button>
        <button className={s.finishBtn} onClick={onFinish} disabled={finishDisabled}>
          점검 완료
        </button>
      </div> 
      */}
    </div>
  );
}