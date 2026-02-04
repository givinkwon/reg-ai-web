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
  // ✅ GA 중복 전송 방지용 Ref (기능 로직에는 관여 안 함)
  const gaSentRef = useRef<boolean>(false);
  const viewedRef = useRef(false);
  
  // ✅ 리스트가 변경되었는지 감지하기 위한 Ref
  const lastIdsKeyRef = useRef<string>('');

  // 🐛 [디버깅] 렌더링 될 때마다 현재 아이템 상태 출력
  console.log('🔍 [StepRunChecklist] 렌더링됨. 현재 items 상태:', items);
  
  // rating이 없는 아이템이 있는지 확인
  const missingCount = items.filter(it => !it.rating).length;
  console.log(`🔍 [StepRunChecklist] 체크 안 된 항목 수: ${missingCount} / ${items.length}`);


  // ─────────────────────────────────────────────────────────────
  // 1️⃣ 통합 useEffect: 초기화 및 오토필 로직
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const idsKey = items.map((it) => it.id).join('|');

    // 1-1. 리스트가 아예 바뀌었으면(다른 점검표 진입) GA 플래그 초기화
    if (lastIdsKeyRef.current !== idsKey) {
      lastIdsKeyRef.current = idsKey;
      gaSentRef.current = false;
      viewedRef.current = false;
    }

    // 1-2. GA View 트래킹
    if (!viewedRef.current) {
      viewedRef.current = true;
      track(gaEvent(GA_CTX, 'View'), {
        ui_id: gaUiId(GA_CTX, 'View'),
        detail_tasks_count: detailTasks.length,
        items_count: items.length,
        ids_key_len: idsKey.length,
      });
    }

    // 1-3. 오토필 로직 (핵심 수정)
    const hasMissing = items.some((it) => !it.rating);

    console.log('🔍 [useEffect] 오토필 로직 진입. hasMissing:', hasMissing);

    if (hasMissing) {
      // (1) 빈 값 채워서 부모에게 업데이트 요청
      const next = items.map((it) => (it.rating ? it : { ...it, rating: 'O' as Rating }));
      
      console.log('⚡ [useEffect] onChangeItems 호출 시도! 보낼 데이터:', next);
      onChangeItems(next);

      // (2) GA는 딱 한 번만 보내기 위해 여기서만 Ref 체크
      if (!gaSentRef.current) {
        gaSentRef.current = true;
        track(gaEvent(GA_CTX, 'AutoFillDefaultRatings'), {
          ui_id: gaUiId(GA_CTX, 'AutoFillDefaultRatings'),
          items_count: items.length,
          missing_count: items.filter((it) => !it.rating).length,
          default_rating: 'O',
        });
      }
    } else {
        console.log('✅ [useEffect] 모든 항목에 rating이 있습니다. 업데이트 안 함.');
    }
  }, [items, detailTasks.length, onChangeItems]);

  // ─────────────────────────────────────────────────────────────
  // (아래부터는 기존과 동일)
  // ─────────────────────────────────────────────────────────────

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
    // 디버깅: 버튼 클릭 시 동작 확인
    console.log(`🖱 [setRating] 클릭됨 id: ${id}, rating: ${rating}`);
    
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
    const it = items.find((x) => x.id === id);
    const prevLen = (it?.note ?? '').length;
    const nextLen = note.length;

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
                {RATINGS.map((r) => {
                    // 디버깅: 각 버튼이 렌더링될 때 상태 확인 (필요시 주석 해제)
                    // if (it.id === items[0].id) console.log(`[Button Render] Item: ${it.rating}, Button: ${r.key}, Match: ${it.rating === r.key}`);
                    return (
                      <button
                        key={r.key}
                        type="button"
                        // 🔥 여기서 CSS가 제대로 적용되는지 확인이 필요함
                        className={`${s.rateBtn} ${it.rating === r.key ? s.active : ''}`}
                        onClick={() => setRating(it.id, r.key)}
                        data-ga-event={gaEvent(GA_CTX, 'SetRating')}
                        data-ga-id={gaUiId(GA_CTX, 'SetRating')}
                        data-ga-text={r.key}
                        data-ga-label="점검 평가 버튼"
                      >
                        {r.label}
                      </button>
                    )
                })}
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