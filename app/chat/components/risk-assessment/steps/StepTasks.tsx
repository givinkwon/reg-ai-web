// components/risk-assessment/steps/StepTasks.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './StepTasks.module.css';
import AddDetailTaskModal from '../ui/AddDetailTaskModal';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';

// ✅ 애니메이션 로딩 모달
import AnimatedLoadingModal from '../ui/AnimatedLoadingModal';

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

function cacheKey(userEmail: string | null | undefined, minorCategory: string | null | undefined) {
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

/**
 * ✅ minorCategory를 못 찾는 경우(=null)에도 새로고침 복구를 위해
 *    해당 유저(또는 guest)의 캐시 중 "가장 최신 ts"를 찾아 복원하는 폴백.
 */
function findLatestCacheForUser(userEmail: string | null | undefined): { key: string; cache: StepTasksCache } | null {
  try {
    const u = norm(userEmail) || 'guest';
    const prefix = `${CACHE_PREFIX}:${encodeURIComponent(u)}:`;

    let best: { key: string; cache: StepTasksCache } | null = null;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;

      const c = safeReadCache(k);
      if (!c) continue;

      if (!best || c.ts > best.cache.ts) best = { key: k, cache: c };
    }

    return best;
  } catch {
    return null;
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
  // ✅ 1) 캐시 우선 복원 (minor 없어도 ALL/최신캐시 폴백)
  // =========================
  useEffect(() => {
    const userEmail = user?.email ?? null;
    const userId = norm(userEmail) || 'guest';

    // ✅ minor가 없더라도 ALL로 스코프를 만든다 (새로고침 복구 핵심)
    let currentMinor = norm(minorCategory) || 'ALL';

    // minor 전환 체크
    const prevMinor = prevMinorRef.current;
    const isMinorSwitch = !!prevMinor && prevMinor !== currentMinor;
    prevMinorRef.current = currentMinor;

    // scope 전환 체크 (guest → user 등)
    const scope = `${userId}|${currentMinor}`;
    const prevScope = prevScopeRef.current;
    const isScopeSwitch = !!prevScope && prevScope !== scope;
    prevScopeRef.current = scope;

    // 같은 scope에서 중복 체크 방지
    if (cacheCheckedRef.current === scope) return;

    // scope가 바뀌면 화면 목록을 비워서(캐시 있으면 즉시 채움) UX 맞추기
    if (isMinorSwitch || isScopeSwitch) {
      setRecommended([]);
      setRecoError(null);
      setRecoLoading(false);
      autoAppliedRef.current = null;
    }

    cacheCheckedRef.current = scope;

    // ✅ 1) 1순위: 현재 user+minor(또는 ALL) 캐시
    let key = cacheKey(userEmail, currentMinor);
    let cached = safeReadCache(key);

    // ✅ 2) 2순위: 로그인 직후인데 유저 캐시가 없다면 guest 캐시에서 가져오기(마이그레이션)
    if (!cached && userEmail) {
      const guestKey = cacheKey(null, currentMinor);
      const guestCached = safeReadCache(guestKey);
      if (guestCached) {
        cached = guestCached;
        // (key는 그대로 두어도 됨. 곧 save effect에서 user키로 재저장됨)
      }
    }

    // ✅ 3) 3순위: minorCategory 자체가 없어서 ALL로 들어온 경우 → 최신 캐시를 찾아 복원
    if (!cached && (!norm(minorCategory) || currentMinor === 'ALL')) {
      const latestUser = findLatestCacheForUser(userEmail);
      const latestGuest = findLatestCacheForUser(null);
      const latest =
        latestUser && latestGuest
          ? (latestUser.cache.ts >= latestGuest.cache.ts ? latestUser : latestGuest)
          : (latestUser ?? latestGuest);

      if (latest?.cache) {
        cached = latest.cache;
        const cachedMinor = norm(cached.minor) || 'ALL';
        currentMinor = cachedMinor;

        // ✅ UI도 같이 복원: overrideMinor가 없고, 현재 minorCategory가 비어있다면 캐시 minor로 세팅
        if (!overrideMinor && !norm(minorCategory) && cachedMinor !== 'ALL') {
          setMinorCategory(cachedMinor);
        }
      }
    }

    if (!cached) return;

    const resolvedScope = `${userId}|${norm(cached.minor) || currentMinor || 'ALL'}`;

    // ✅ tasks 복원: (새로고침 복구 핵심) prev.tasks가 있어도 "빈 상태면" 덮어쓰기
    if (Array.isArray(cached.tasks) && cached.tasks.length > 0) {
      setDraft((prev) => {
        const prevLen = prev.tasks?.length ?? 0;
        const shouldOverwrite = isMinorSwitch || isScopeSwitch || prevLen === 0;
        if (!shouldOverwrite) return prev;
        return { ...prev, tasks: cached.tasks };
      });

      autoAppliedRef.current = resolvedScope;
    }

    // ✅ 목록 복원
    const cachedReco =
      Array.isArray(cached.recommended) && cached.recommended.length > 0
        ? cached.recommended
        : cached.tasks.map((t) => norm(t.title)).filter(Boolean);

    setRecommended(Array.from(new Set(cachedReco.map(norm).filter(Boolean))));
    setRecoError(null);
    setRecoLoading(false);
  }, [minorCategory, user?.email, overrideMinor, setDraft]);

  // =========================
  // ✅ 2) 캐시 없을 때만 API로 recommended 로드 (minor가 있을 때만)
  // =========================
  useEffect(() => {
    const currentMinor = norm(minorCategory);
    if (!currentMinor) return; // ✅ minor 없으면 API 호출 안함(대신 캐시/직접추가로 유지)
    if (currentMinor === 'ALL') return;

    const userEmail = user?.email ?? null;
    const key = cacheKey(userEmail, currentMinor);
    const scope = `${norm(userEmail) || 'guest'}|${currentMinor}`;

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
        if (e?.name === 'AbortError') {
          // ✅ AbortError면 쿨다운 남기지 않기(다음 렌더에서 재시도 가능)
          attemptRef.current.delete(scope);
          return;
        }
        attemptRef.current.delete(scope);
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
    const currentMinor = norm(minorCategory) || 'ALL';
    if (recoLoading || recoError) return;
    if (recommended.length === 0) return;

    const userEmail = user?.email ?? null;
    const scope = `${norm(userEmail) || 'guest'}|${currentMinor}`;

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
  //    - minor 없어도 ALL로 저장되게 변경 (새로고침 복구 핵심)
  // =========================
  useEffect(() => {
    const currentMinor = norm(minorCategory) || 'ALL';
    const userEmail = user?.email ?? null;
    const key = cacheKey(userEmail, currentMinor);
    const scope = `${norm(userEmail) || 'guest'}|${currentMinor}`;

    const tasksToSave = draft.tasks ?? [];
    const recoToSave =
      recommended.length > 0
        ? recommended
        : Array.from(new Set(tasksToSave.map((t) => norm(t.title)).filter(Boolean)));

    if (tasksToSave.length === 0 && recoToSave.length === 0) return;

    // ✅ recommended는 있는데 아직 auto-merge 전이면(=tasks 0 && autoAppliedRef !== scope) 저장 스킵
    if (recoToSave.length > 0 && tasksToSave.length === 0 && autoAppliedRef.current !== scope) return;

    const payload: StepTasksCache = {
      v: 2,
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

  // ✅ 로딩 모달: minor가 있고, 에러 없고, 표시할 목록이 없을 때
  const showLoadingModal = !!norm(minorCategory) && !recoError && displayList.length === 0;

  return (
    <div className={s.wrap}>
      <AnimatedLoadingModal
        open={showLoadingModal}
        title="작업 목록을 불러오는 중…"
        message="소분류 기준 세부작업을 불러와 자동으로 선택하고 있습니다."
      />

      <div className={s.sectionHead}>
        <div>
          <div className={s.sectionTitle}>사전 준비 - 작업 파악</div>
          <div className={s.sectionDesc}>
            {norm(minorCategory) ? (
              <>
                소분류 <b className={s.badge}>{minorCategory}</b> 기준 세부작업을 불러와 <b>자동 선택</b>합니다. 필요하면 클릭해서 해제하세요.
              </>
            ) : (
              <>소분류 정보를 찾지 못했습니다. “직접 추가”로 검색해서 선택할 수 있어요. (선택한 항목은 새로고침해도 유지됩니다)</>
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
