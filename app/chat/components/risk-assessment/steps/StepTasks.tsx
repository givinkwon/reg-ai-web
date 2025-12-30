// components/risk-assessment/steps/StepTasks.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import s from './StepTasks.module.css';
import AddDetailTaskModal from '../ui/AddDetailTaskModal';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
  minor?: string;
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const norm = (v?: string | null) => (v ?? '').trim();

export default function StepTasks({ draft, setDraft, minor }: Props) {
  const user = useUserStore((st) => st.user);

  const overrideMinor = norm(minor);
  const [minorCategory, setMinorCategory] = useState<string | null>(overrideMinor ? overrideMinor : null);

  const [recoLoading, setRecoLoading] = useState(false);
  const [recoError, setRecoError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const v = norm(minor);
    if (v) setMinorCategory(v);
  }, [minor]);

  // ✅ draft.tasks = 선택된 작업 (trim 기준)
  const selectedTitles = useMemo(() => new Set(draft.tasks.map((t) => norm(t.title))), [draft.tasks]);

  const toggleSelect = (title: string) => {
    const v = norm(title);
    if (!v) return;

    setDraft((prev) => {
      const exists = prev.tasks.some((t) => norm(t.title) === v);
      if (exists) return { ...prev, tasks: prev.tasks.filter((t) => norm(t.title) !== v) };
      return { ...prev, tasks: [...prev.tasks, { id: uid(), title: v, processes: [] }] };
    });
  };

  const addTask = (title: string) => {
    const v = norm(title);
    if (!v) return;

    setDraft((prev) => {
      if (prev.tasks.some((t) => norm(t.title) === v)) return prev;
      return { ...prev, tasks: [...prev.tasks, { id: uid(), title: v, processes: [] }] };
    });
  };

  // ✅ 소분류 폴백
  useEffect(() => {
    if (overrideMinor) return;
    if (minorCategory) return;
    if (!user?.email) return;

    (async () => {
      try {
        const res = await fetch('/api/accounts/find-by-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });
        if (!res.ok) return;

        const acc = await res.json().catch(() => null);
        const minorFound =
          acc?.secondary_info?.subcategory?.name ??
          acc?.secondary_info?.subcategory_name ??
          acc?.subcategory?.name ??
          null;

        if (typeof minorFound === 'string' && norm(minorFound)) {
          setMinorCategory(norm(minorFound));
        }
      } catch {
        // silent
      }
    })();
  }, [user?.email, minorCategory, overrideMinor]);

  // ✅ 소분류 기반 추천 세부작업 로드
  useEffect(() => {
    if (!minorCategory) {
      setRecommended([]);
      setRecoError(null);
      return;
    }

    (async () => {
      setRecoLoading(true);
      setRecoError(null);
      try {
        const qs = new URLSearchParams();
        qs.set('endpoint', 'detail-tasks');
        qs.set('minor', minorCategory);
        qs.set('limit', '50');

        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, { cache: 'no-store' });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`추천 목록 로드 실패 (${res.status}) ${txt.slice(0, 80)}`);
        }

        const data = (await res.json()) as { items: string[] };
        const items = (data.items ?? []).map(norm).filter(Boolean);
        // ✅ 중복 제거
        setRecommended(Array.from(new Set(items)));
      } catch (e: any) {
        setRecommended([]);
        setRecoError(e?.message ?? '추천 목록 로드 중 오류');
      } finally {
        setRecoLoading(false);
      }
    })();
  }, [minorCategory]);

  return (
    <div className={s.wrap}>
      <div className={s.sectionHead}>
        <div>
          <div className={s.sectionTitle}>사전 준비 - 작업 파악</div>
          <div className={s.sectionDesc}>
            {minorCategory ? (
              <>
                소분류 <b className={s.badge}>{minorCategory}</b> 기준으로 세부작업을 추천합니다. 클릭해서 선택하세요.
              </>
            ) : (
              <>소분류 정보를 찾지 못했습니다. “직접 추가”로 검색해서 선택할 수 있어요.</>
            )}
          </div>
        </div>

        <button className={s.addBtn} onClick={() => setAddOpen(true)}>
          직접 추가
        </button>
      </div>

      <div className={s.card}>
        <div className={s.listHead}>
          <div className={s.listTitle}>작업 목록</div>
          <div className={s.count}>
            선택됨 <b>{draft.tasks.length}</b>
          </div>
        </div>

        {/* ✅ (핵심) 선택된 작업은 추천 목록이 비어도 항상 보여주기 */}
        {draft.tasks.length > 0 && (
          <div className={s.selectedList} aria-label="선택된 작업">
            {draft.tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                className={s.selectedChip}
                onClick={() => toggleSelect(t.title)}
                title="클릭하면 선택 해제"
              >
                <span className={s.selectedText}>{t.title}</span>
                <span className={s.selectedX} aria-hidden>
                  ×
                </span>
              </button>
            ))}
          </div>
        )}

        {recoLoading && <div className={s.hint}>추천 작업을 불러오는 중…</div>}
        {!recoLoading && recoError && <div className={s.error}>{recoError}</div>}

        {!recoLoading && !recoError && recommended.length > 0 ? (
          <div className={s.taskList} role="list">
            {recommended.map((raw) => {
              const title = norm(raw);
              const selected = selectedTitles.has(title);

              return (
                <button
                  key={title}
                  type="button"
                  aria-pressed={selected}
                  className={`${s.taskItem} ${selected ? s.taskItemSelected : ''}`}
                  onClick={() => toggleSelect(title)}
                >
                  <span className={s.taskText}>{title}</span>
                  {selected ? <span className={s.pill}>선택됨</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {!recoLoading && !recoError && recommended.length === 0 ? (
          <div className={s.hint}>추천 목록이 없습니다. “직접 추가”로 검색해 추가해 주세요.</div>
        ) : null}
      </div>

      <AddDetailTaskModal
        open={addOpen}
        minorCategory={minorCategory}
        onClose={() => setAddOpen(false)}
        onAdd={(title) => addTask(title)}
      />
    </div>
  );
}
