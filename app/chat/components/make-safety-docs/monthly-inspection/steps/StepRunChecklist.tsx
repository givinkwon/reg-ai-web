'use client';

import { useEffect, useMemo, useRef } from 'react';
import s from './StepRunChecklist.module.css';
import type { ChecklistItem, Rating } from '../MonthlyInspectionCreateModal';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

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

const GA_CTX = {
  page: 'Chat',
  section: 'SafetyDocs',
  area: 'MonthlyInspection',
  step: 'StepRunChecklist',
} as const;

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

  // ✅ GA: view 1회
  const viewedRef = useRef(false);

  useEffect(() => {
    const idsKey = items.map((it) => it.id).join('|');

    if (lastIdsKeyRef.current !== idsKey) {
      lastIdsKeyRef.current = idsKey;
      didAutofillRef.current = false;
    }

    // ✅ 첫 진입/리스트 변경 시 view 트래킹
    if (!viewedRef.current) {
      viewedRef.current = true;
      track(gaEvent(GA_CTX, 'View'), {
        ui_id: gaUiId(GA_CTX, 'View'),
        detail_tasks_count: detailTasks.length,
        items_count: items.length,
        ids_key_len: idsKey.length,
      });
    }
  }, [items, detailTasks.length]);

  useEffect(() => {
    if (didAutofillRef.current) return;

    const hasMissing = items.some((it) => !it.rating);
    if (!hasMissing) return;

    didAutofillRef.current = true;

    track(gaEvent(GA_CTX, 'AutoFillDefaultRatings'), {
      ui_id: gaUiId(GA_CTX, 'AutoFillDefaultRatings'),
      items_count: items.length,
      missing_count: items.filter((it) => !it.rating).length,
      default_rating: 'O',
    });

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
    const it = items.find((x) => x.id === id);
    track(gaEvent(GA_CTX, 'SetRating'), {
      ui_id: gaUiId(GA_CTX, 'SetRating'),
      item_id: id,
      category: it?.category ?? '',
      rating,
      question_len: (it?.question ?? '').length,
      prev_rating: (it?.rating ?? '') as any,
    });

    onChangeItems(items.map((x) => (x.id === id ? { ...x, rating } : x)));
  };

  const setNote = (id: string, note: string) => {
    // ✅ 타이핑마다 GA는 과도하므로 "blur"가 없어서 여기서는 쓰로틀/디바운스 없이
    //    최소 이벤트만: 길이가 특정 구간을 넘어설 때만 기록
    const it = items.find((x) => x.id === id);
    const prevLen = (it?.note ?? '').length;
    const nextLen = note.length;

    // 0->1, 20, 50, 100 이상 구간에서만 찍기
    const checkpoints = [1, 20, 50, 100];
    const crossed = checkpoints.find((cp) => prevLen < cp && nextLen >= cp);

    if (crossed) {
      track(gaEvent(GA_CTX, 'EditNote'), {
        ui_id: gaUiId(GA_CTX, 'EditNote'),
        item_id: id,
        category: it?.category ?? '',
        checkpoint: crossed,
        note_len: nextLen,
      });
    }

    onChangeItems(items.map((x) => (x.id === id ? { ...x, note } : x)));
  };

  const completion = useMemo(() => {
    const total = items.length || 1;
    const done = items.filter((x) => !!x.rating).length;
    return { done, total };
  }, [items]);

  const handleBack = () => {
    track(gaEvent(GA_CTX, 'ClickBack'), {
      ui_id: gaUiId(GA_CTX, 'ClickBack'),
      done: completion.done,
      total: completion.total,
    });
    onBack();
  };

  const handleFinish = () => {
    track(gaEvent(GA_CTX, 'ClickFinish'), {
      ui_id: gaUiId(GA_CTX, 'ClickFinish'),
      disabled: !!finishDisabled,
      done: completion.done,
      total: completion.total,
      rated_O: items.filter((x) => x.rating === 'O').length,
      rated_triangle: items.filter((x) => x.rating === '△').length,
      rated_X: items.filter((x) => x.rating === 'X').length,
      notes_filled: items.filter((x) => !!(x.note ?? '').trim()).length,
    });
    onFinish();
  };

  return (
    <div className={s.wrap}>
      <div className={s.footer}>
        <button
          className={s.ghost}
          type="button"
          onClick={handleBack}
          data-ga-event={gaEvent(GA_CTX, 'ClickBack')}
          data-ga-id={gaUiId(GA_CTX, 'ClickBack')}
          data-ga-label="이전 버튼"
        >
          이전
        </button>

        <button
          className={s.primary}
          type="button"
          disabled={!!finishDisabled}
          onClick={handleFinish}
          data-ga-event={gaEvent(GA_CTX, 'ClickFinish')}
          data-ga-id={gaUiId(GA_CTX, 'ClickFinish')}
          data-ga-label="점검 완료 버튼"
        >
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
                    data-ga-event={gaEvent(GA_CTX, 'SetRating')}
                    data-ga-id={gaUiId(GA_CTX, 'SetRating')}
                    data-ga-text={r.key}
                    data-ga-label="점검 평가 버튼"
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
                onFocus={() => {
                  track(gaEvent(GA_CTX, 'FocusNote'), {
                    ui_id: gaUiId(GA_CTX, 'FocusNote'),
                    item_id: it.id,
                    category: it.category,
                  });
                }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
