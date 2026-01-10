'use client';

import { useEffect, useMemo, useRef } from 'react';
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
  { key: 'O', label: 'O : 이상 없음' },
  { key: '△', label: '△ : 미흡' },
  { key: 'X', label: 'X : 불량' },
];

export default function StepRunChecklist({
  detailTasks,
  items,
  onChangeItems,
  onBack,
  onFinish,
  finishDisabled,
}: Props) {
  // ✅ items 목록(IDs)이 바뀔 때마다 "자동 기본값 적용"을 다시 허용
  const lastIdsKeyRef = useRef<string>('');
  const didAutofillRef = useRef<boolean>(false);

  useEffect(() => {
    const idsKey = items.map((it) => it.id).join('|');

    if (lastIdsKeyRef.current !== idsKey) {
      lastIdsKeyRef.current = idsKey;
      didAutofillRef.current = false;
    }

    if (didAutofillRef.current) return;

    const hasMissing = items.some((it) => !it.rating);
    if (!hasMissing) return;

    didAutofillRef.current = true;

    const next = items.map((it) => (it.rating ? it : { ...it, rating: 'O' as Rating }));
    onChangeItems(next);
  }, [items, onChangeItems]);

  const grouped = useMemo(() => {
    const m = new Map<string, ChecklistItem[]>();
    items.forEach((it) => {
      const k = it.category;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    });
    return Array.from(m.entries());
  }, [items]);

  const setRating = (id: string, rating: Rating) => {
    onChangeItems(items.map((it) => (it.id === id ? { ...it, rating } : it)));
  };

  const setNote = (id: string, note: string) => {
    onChangeItems(items.map((it) => (it.id === id ? { ...it, note } : it)));
  };

  const completion = useMemo(() => {
    const total = items.length || 1;
    const done = items.filter((x) => !!x.rating).length;
    return { done, total };
  }, [items]);

  return (
    <div className={s.wrap}>
      <div className={s.footer}>
        <button className={s.ghost} type="button" onClick={onBack}>
          이전
        </button>
        <button className={s.primary} type="button" disabled={!!finishDisabled} onClick={onFinish}>
          점검 완료
        </button>
      </div>
      <div className={s.meta}>
        <div>
          <div className={s.metaTitle}>점검 사항 목록</div>
          <div className={s.metaSub}>
            선택됨 {completion.done}/{completion.total}
          </div>
        </div>
      </div>

      <div className={s.tagsRow}>
        {detailTasks.map((t) => (
          <span key={t} className={s.tagChip}>
            {t}
          </span>
        ))}
      </div>

      {grouped.map(([cat, list]) => (
        <div key={cat} className={s.group}>
          <div className={s.groupTitle}>{cat}</div>

          {list.map((it) => (
            <div key={it.id} className={s.card}>
              <div className={s.question}>{it.question}</div>

              <div className={s.ratingRow}>
                {RATINGS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={`${s.rateBtn} ${it.rating === r.key ? s.active : ''}`}
                    onClick={() => setRating(it.id, r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <textarea
                className={s.note}
                value={it.note ?? ''}
                placeholder="점검 결과 및 조치사항을 작성해주세요"
                onChange={(e) => setNote(it.id, e.target.value)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
