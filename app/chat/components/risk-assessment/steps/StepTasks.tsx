// components/risk-assessment/steps/StepTasks.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
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

// =========================
// ✅ localStorage cache
// =========================
const CACHE_PREFIX = 'regai:risk:stepTasks:v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180일

type StepTasksCache = {
  v: 1;
  ts: number;
  user: string;          // email or 'guest'
  minor: string;         // 'ALL' 포함
  recommended: string[]; // 추천 리스트(화면 목록용)
  tasks: RiskAssessmentDraft['tasks']; // 선택된 작업(칩) 전체
};

function cacheKey(userEmail: string | null | undefined, minorCategory: string | null) {
  const u = norm(userEmail) || 'guest';
  const m = norm(minorCategory) || 'ALL';
  return `${CACHE_PREFIX}:${u}:${m}`;
}

function safeReadCache(key: string): StepTasksCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StepTasksCache;
    if (!parsed?.ts || !Array.isArray(parsed?.tasks)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteCache(key: string, payload: StepTasksCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // storage full/blocked면 무시
  }
}

export default function StepTasks({ draft, setDraft, minor }: Props) {
  const user = useUserStore((st) => st.user);

  const overrideMinor = norm(minor);
  const [minorCategory, setMinorCategory] = useState<string | null>(overrideMinor ? overrideMinor : null);

  const [recoLoading, setRecoLoading] = useState(false);
  const [recoError, setRecoError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  // ✅ 자동 선택: 같은 소분류에서 한 번만 실행되게 가드
  const autoAppliedRef = useRef<string | null>(null);

  // ✅ 캐시를 이번 minor에서 이미 확인했는지 가드
  const cacheCheckedRef = useRef<string | null>(null);

  // ✅ minor가 바뀐 “전환”인지 체크용
  const prevMinorRef = useRef<string | null>(null);

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

  // =========================
  // ✅ 1) 캐시 우선 복원
  // =========================
  useEffect(() => {
    if (!minorCategory) {
      setRecommended([]);
      setRecoError(null);
      setRecoLoading(false);
      autoAppliedRef.current = null;
      cacheCheckedRef.current = null;
      prevMinorRef.current = null;
      return;
    }

    const currentMinor = norm(minorCategory);
    const userEmail = user?.email ?? null;

    // minor 전환 체크
    const prevMinor = prevMinorRef.current;
    const isMinorSwitch = !!prevMinor && prevMinor !== currentMinor;
    prevMinorRef.current = currentMinor;

    // 같은 minor에서 중복 체크 방지
    if (cacheCheckedRef.current === currentMinor) return;
    cacheCheckedRef.current = currentMinor;

    const key = cacheKey(userEmail, currentMinor);
    const cached = safeReadCache(key);

    if (cached && Array.isArray(cached.tasks) && cached.tasks.length > 0) {
      // ✅ 덮어쓰기 조건:
      // - minor가 바뀌는 순간(전환)
      // - 또는 현재 tasks가 비어있는 경우(새로고침/재접속)
      // (초기 minor가 늦게 잡혔는데 이미 사용자가 수동으로 tasks 만든 경우를 보호)
      const shouldOverwrite = isMinorSwitch || draft.tasks.length === 0;

      if (shouldOverwrite) {
        setDraft((prev) => ({
          ...prev,
          tasks: cached.tasks,
        }));
      }

      // 화면 목록(추천 리스트)도 캐시 우선
      const cachedReco =
        Array.isArray(cached.recommended) && cached.recommended.length > 0
          ? cached.recommended
          : cached.tasks.map((t) => norm(t.title)).filter(Boolean);

      setRecommended(Array.from(new Set(cachedReco.map(norm).filter(Boolean))));
      setRecoError(null);
      setRecoLoading(false);

      // ✅ 캐시 복원된 minor에서는 자동선택(merge) 다시 하지 않게 막기
      autoAppliedRef.current = currentMinor;
    }
    // 캐시 없으면 → 아래 "API 로드" effect가 수행됨
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minorCategory, user?.email]);

  // =========================
  // ✅ 2) 캐시가 없을 때만 API로 recommended 로드
  // =========================
  useEffect(() => {
    if (!minorCategory) return;

    const currentMinor = norm(minorCategory);
    const userEmail = user?.email ?? null;

    // 캐시가 있으면 API를 건드리지 않는다.
    const key = cacheKey(userEmail, currentMinor);
    const cached = safeReadCache(key);
    if (cached && Array.isArray(cached.tasks) && cached.tasks.length > 0) {
      return;
    }

    (async () => {
      setRecoLoading(true);
      setRecoError(null);
      try {
        const qs = new URLSearchParams();
        qs.set('endpoint', 'detail-tasks');
        qs.set('minor', currentMinor);
        qs.set('limit', '50');

        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, { cache: 'no-store' });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`목록 로드 실패 (${res.status}) ${txt.slice(0, 80)}`);
        }

        const data = (await res.json()) as { items: string[] };
        const items = (data.items ?? []).map(norm).filter(Boolean);
        const uniq = Array.from(new Set(items));

        setRecommended(uniq);

        // ✅ (선택) 최초 로드면 자동 선택: 기존 로직 유지(merge)
        //   - 만약 "덮어쓰기"가 더 좋으면, 아래 setDraft를 prev.tasks 대신 uniq로 바꾸면 됨.
      } catch (e: any) {
        setRecommended([]);
        setRecoError(e?.message ?? '목록 로드 중 오류');
      } finally {
        setRecoLoading(false);
      }
    })();
  }, [minorCategory, user?.email]);

  // ✅ 3) recommended 로드되면 자동 선택(기존 로직 유지)
  useEffect(() => {
    if (!minorCategory) return;
    if (recoLoading || recoError) return;
    if (recommended.length === 0) return;

    const currentMinor = norm(minorCategory);

    // 같은 소분류에서는 1번만 자동 적용
    if (autoAppliedRef.current === currentMinor) return;

    setDraft((prev) => {
      const exist = new Set(prev.tasks.map((t) => norm(t.title)));
      const merged = [...prev.tasks];

      for (const raw of recommended) {
        const v = norm(raw);
        if (!v) continue;
        if (exist.has(v)) continue;
        merged.push({ id: uid(), title: v, processes: [] });
        exist.add(v);
      }

      return { ...prev, tasks: merged };
    });

    autoAppliedRef.current = currentMinor;
  }, [minorCategory, recommended, recoLoading, recoError, setDraft]);

  // =========================
  // ✅ 4) 저장: tasks / recommended 바뀌면 캐시에 기록
  // =========================
  useEffect(() => {
    if (!minorCategory) return;

    const currentMinor = norm(minorCategory);
    const userEmail = user?.email ?? null;
    const key = cacheKey(userEmail, currentMinor);

    // recommended가 비어도, 화면 목록이 없으면 UX가 안 좋으니 tasks로 대체해서 저장
    const recoToSave =
      recommended.length > 0
        ? recommended
        : Array.from(new Set(draft.tasks.map((t) => norm(t.title)).filter(Boolean)));

    const payload: StepTasksCache = {
      v: 1,
      ts: Date.now(),
      user: norm(userEmail) || 'guest',
      minor: currentMinor || 'ALL',
      recommended: recoToSave,
      tasks: draft.tasks ?? [],
    };

    safeWriteCache(key, payload);
  }, [minorCategory, user?.email, draft.tasks, recommended]);

  // ✅ 화면에 보여줄 목록: recommended가 비었으면(캐시엔 tasks만 있는 경우 등) tasks로 대체
  const displayList = useMemo(() => {
    if (recommended.length > 0) return recommended;
    return Array.from(new Set(draft.tasks.map((t) => norm(t.title)).filter(Boolean)));
  }, [recommended, draft.tasks]);

  return (
    <div className={s.wrap}>
      <div className={s.sectionHead}>
        <div>
          <div className={s.sectionTitle}>사전 준비 - 작업 파악</div>
          <div className={s.sectionDesc}>
            {minorCategory ? (
              <>
                소분류 <b className={s.badge}>{minorCategory}</b> 기준 세부작업을 불러와 <b>자동 선택</b>합니다. 필요하면 클릭해서 해제하세요.
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

        {/* ✅ 선택된 작업(칩) */}
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

        {recoLoading && <div className={s.hint}>작업 목록을 불러오는 중…</div>}
        {!recoLoading && recoError && <div className={s.error}>{recoError}</div>}

        {!recoLoading && !recoError && displayList.length > 0 ? (
          <div className={s.taskList} role="list">
            {displayList.map((raw) => {
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
                </button>
              );
            })}
          </div>
        ) : null}

        {!recoLoading && !recoError && displayList.length === 0 ? (
          <div className={s.hint}>목록이 없습니다. “직접 추가”로 검색해 추가해 주세요.</div>
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
