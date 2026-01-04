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
// ✅ localStorage cache (v2)
// =========================
const CACHE_PREFIX = 'regai:risk:stepTasks:v2';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180일
const RETRY_COOLDOWN_MS = 1000 * 20; // 20초

type StepTasksCache = {
  v: 2;
  ts: number;
  user: string; // email or 'guest'
  minor: string; // 'ALL' 포함
  recommended: string[];
  tasks: RiskAssessmentDraft['tasks'];
};

function cacheKey(userEmail: string | null | undefined, minorCategory: string | null) {
  const u = norm(userEmail) || 'guest';
  const m = norm(minorCategory) || 'ALL';
  return `${CACHE_PREFIX}:${encodeURIComponent(u)}:${encodeURIComponent(m)}`;
}

function safeReadCache(key: string): StepTasksCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StepTasksCache;

    if (parsed?.v !== 2) return null;
    if (!parsed?.ts) return null;
    if (!Array.isArray(parsed?.tasks) || !Array.isArray(parsed?.recommended)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;

    // ✅ 빈 캐시 방지
    const tLen = parsed.tasks.length;
    const rLen = parsed.recommended.length;
    if (tLen === 0 && rLen === 0) return null;

    return parsed;
  } catch {
    return null;
  }
}

function safeWriteCache(key: string, payload: StepTasksCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
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

  // ✅ 자동 선택: scope(user+minor)에서 1회만 적용
  const autoAppliedRef = useRef<string | null>(null);

  // ✅ 캐시 체크 가드: scope(user+minor) 단위로
  const cacheCheckedRef = useRef<string | null>(null);

  // ✅ minor 전환 체크
  const prevMinorRef = useRef<string | null>(null);

  // ✅ scope 전환 체크 (guest → user 같은 케이스)
  const prevScopeRef = useRef<string | null>(null);

  // ✅ API 연타 방지 (scope 단위로)
  const attemptRef = useRef<Map<string, number>>(new Map());

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

  // ✅ 소분류 폴백 (유저 계정에서 가져오기)
  useEffect(() => {
    if (overrideMinor) return;
    if (minorCategory) return;
    if (!user?.email) return;

    let cancelled = false;

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

        if (!cancelled && typeof minorFound === 'string' && norm(minorFound)) {
          setMinorCategory(norm(minorFound));
        }
      } catch {
        // silent
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.email, minorCategory, overrideMinor]);

  // =========================
  // ✅ 1) 캐시 우선 복원 (scope 단위)
  // =========================
  useEffect(() => {
    if (!minorCategory) {
      setRecommended([]);
      setRecoError(null);
      setRecoLoading(false);

      autoAppliedRef.current = null;
      cacheCheckedRef.current = null;
      prevMinorRef.current = null;
      prevScopeRef.current = null;
      return;
    }

    const currentMinor = norm(minorCategory);
    const userEmail = user?.email ?? null;
    const scope = `${norm(userEmail) || 'guest'}|${currentMinor || 'ALL'}`;

    // minor 전환 체크
    const prevMinor = prevMinorRef.current;
    const isMinorSwitch = !!prevMinor && prevMinor !== currentMinor;
    prevMinorRef.current = currentMinor;

    // scope 전환 체크 (guest → user 등)
    const prevScope = prevScopeRef.current;
    const isScopeSwitch = !!prevScope && prevScope !== scope;
    prevScopeRef.current = scope;

    // 같은 scope에서 중복 체크 방지
    if (cacheCheckedRef.current === scope) return;
    cacheCheckedRef.current = scope;

    const key = cacheKey(userEmail, currentMinor);
    const cached = safeReadCache(key);
    if (!cached) return; // 캐시 없으면 아래 API 로드로

    // ✅ 1) tasks 복원: scope가 바뀌었으면(guest→user) 기존 tasks가 있어도 덮어쓰는 게 맞음
    if (Array.isArray(cached.tasks) && cached.tasks.length > 0) {
      setDraft((prev) => {
        const prevLen = prev.tasks?.length ?? 0;
        const shouldOverwrite = isMinorSwitch || isScopeSwitch || prevLen === 0;
        if (!shouldOverwrite) return prev;
        return { ...prev, tasks: cached.tasks };
      });
    }

    // ✅ 2) 목록 복원
    const cachedReco =
      Array.isArray(cached.recommended) && cached.recommended.length > 0
        ? cached.recommended
        : cached.tasks.map((t) => norm(t.title)).filter(Boolean);

    setRecommended(Array.from(new Set(cachedReco.map(norm).filter(Boolean))));
    setRecoError(null);
    setRecoLoading(false);

    // ✅ 캐시가 존재하는 scope에서는 auto-merge 재실행 방지
    autoAppliedRef.current = scope;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minorCategory, user?.email, setDraft]);

  // =========================
  // ✅ 2) 캐시 없을 때만 API로 recommended 로드 (scope 단위 쿨다운)
  // =========================
  useEffect(() => {
    if (!minorCategory) return;

    const currentMinor = norm(minorCategory);
    const userEmail = user?.email ?? null;
    const key = cacheKey(userEmail, currentMinor);
    const scope = `${norm(userEmail) || 'guest'}|${currentMinor || 'ALL'}`;

    const cached = safeReadCache(key);
    if (cached) return; // 유효 캐시 있으면 API 호출 X

    // ✅ 쿨다운도 scope 기준
    const last = attemptRef.current.get(scope);
    if (last && Date.now() - last < RETRY_COOLDOWN_MS) return;
    attemptRef.current.set(scope, Date.now());

    const ac = new AbortController();

    (async () => {
      setRecoLoading(true);
      setRecoError(null);

      try {
        const qs = new URLSearchParams();
        qs.set('endpoint', 'detail-tasks');
        qs.set('minor', currentMinor);
        qs.set('limit', '50');

        const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
          cache: 'no-store',
          signal: ac.signal,
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(`목록 로드 실패 (${res.status}) ${txt.slice(0, 80)}`);
        }

        const data = (await res.json()) as { items?: string[] };
        const items = (data.items ?? []).map(norm).filter(Boolean);
        const uniq = Array.from(new Set(items));

        setRecommended(uniq);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setRecommended([]);
        setRecoError(e?.message ?? '목록 로드 중 오류');
      } finally {
        setRecoLoading(false);
      }
    })();

    return () => ac.abort();
  }, [minorCategory, user?.email]);

  // =========================
  // ✅ 3) recommended 로드되면 자동 선택(merge)
  //    - scope 단위로 1회만
  // =========================
  useEffect(() => {
    if (!minorCategory) return;
    if (recoLoading || recoError) return;
    if (recommended.length === 0) return;

    const currentMinor = norm(minorCategory);
    const userEmail = user?.email ?? null;
    const scope = `${norm(userEmail) || 'guest'}|${currentMinor || 'ALL'}`;

    if (autoAppliedRef.current === scope) return;

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

    autoAppliedRef.current = scope;
  }, [minorCategory, recommended, recoLoading, recoError, user?.email, setDraft]);

  // =========================
  // ✅ 4) 저장: tasks / recommended 바뀌면 캐시에 기록
  // =========================
  useEffect(() => {
    if (!minorCategory) return;

    const currentMinor = norm(minorCategory);
    const userEmail = user?.email ?? null;
    const key = cacheKey(userEmail, currentMinor);

    const tasksToSave = draft.tasks ?? [];
    const recoToSave =
      recommended.length > 0
        ? recommended
        : Array.from(new Set(tasksToSave.map((t) => norm(t.title)).filter(Boolean)));

    if (tasksToSave.length === 0 && recoToSave.length === 0) return;

    const payload = {
      v: 2 as const,
      ts: Date.now(),
      user: norm(userEmail) || 'guest',
      minor: currentMinor || 'ALL',
      recommended: recoToSave,
      tasks: tasksToSave,
    };

    safeWriteCache(key, payload);
  }, [minorCategory, user?.email, draft.tasks, recommended]);

  // ✅ 화면에 보여줄 목록: recommended가 비었으면 tasks로 대체
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
