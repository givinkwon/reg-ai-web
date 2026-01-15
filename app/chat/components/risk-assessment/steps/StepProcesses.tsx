// components/risk-assessment/steps/StepProcesses.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './StepProcesses.module.css';
import AddItemSheet from '../ui/AddItemSheet';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
  minorCategory?: string | null; // (선택) 있으면 정확도↑
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const norm = (v?: string | null) => (v ?? '').trim();
const minorScope = (v?: string | null) => (norm(v) ? norm(v) : 'ALL');

const SUGGEST_PROCESSES = ['절단/절삭', '가공(밀링/선반)', '세척/탈지', '조립/체결', '검사/측정', '포장/적재'];

// =========================
// ✅ localStorage cache (task.title 단위로 sub_process 목록 저장)
// =========================
const CACHE_PREFIX = 'regai:risk:stepProcesses:v2';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180;
const RETRY_COOLDOWN_MS = 1000 * 20;

type ProcessCache = {
  v: 2;
  ts: number;
  user: string;
  processName: string; // task.title
  minorCategory?: string | null;
  subProcesses: string[];
};

function cacheKey(userEmail: string | null | undefined, processName: string, minorCat?: string | null) {
  const u = norm(userEmail) || 'guest';
  const pn = norm(processName);
  const mc = minorScope(minorCat);
  return `${CACHE_PREFIX}:${encodeURIComponent(u)}:${encodeURIComponent(pn)}:${encodeURIComponent(mc)}`;
}

function safeReadCache(key: string): ProcessCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProcessCache;

    if (parsed?.v !== 2) return null;
    if (!parsed?.ts || !Array.isArray(parsed?.subProcesses)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;

    if (parsed.subProcesses.length === 0) return null;

    return parsed;
  } catch {
    return null;
  }
}

function safeWriteCache(key: string, payload: ProcessCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/** ✅ (옵션) minor=ALL일 때 같은 user+processName 중 최신 캐시 찾기 */
function findLatestCacheForUserAndProcess(userEmail: string | null | undefined, processName: string) {
  try {
    const u = norm(userEmail) || 'guest';
    const pn = norm(processName);
    if (!pn) return null;

    const prefix = `${CACHE_PREFIX}:${encodeURIComponent(u)}:${encodeURIComponent(pn)}:`;
    let best: ProcessCache | null = null;

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (!k.startsWith(prefix)) continue;

      const c = safeReadCache(k);
      if (!c) continue;
      if (!best || c.ts > best.ts) best = c;
    }
    return best;
  } catch {
    return null;
  }
}

/** ✅ 응답 정규화 */
function toText(x: any) {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    return (
      x._id ??
      x.title ??
      x.name ??
      x.sub_process ??
      x.subProcess ??
      x.process ??
      x.value ??
      ''
    );
  }
  return '';
}

function extractItems(payload: any): string[] {
  const arr =
    Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.sub_processes)
          ? payload.sub_processes
          : Array.isArray(payload?.subProcesses)
            ? payload.subProcesses
            : Array.isArray(payload?.rows)
              ? payload.rows
              : Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload?.value)
                  ? payload.value
                  : Array.isArray(payload?.value?.items)
                    ? payload.value.items
                    : Array.isArray(payload?.value?.sub_processes)
                      ? payload.value.sub_processes
                      : Array.isArray(payload?.value?.subProcesses)
                        ? payload.value.subProcesses
                        : Array.isArray(payload?.value?.rows)
                          ? payload.value.rows
                          : Array.isArray(payload?.value?.data)
                            ? payload.value.data
                            : [];

  return Array.from(new Set(arr.map(toText).map(norm).filter(Boolean)));
}

export default function StepProcesses({ draft, setDraft, minorCategory }: Props) {
  const user = useUserStore((st) => st.user);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [targetTaskId, setTargetTaskId] = useState<string | null>(null);

  // ✅ scopeKey(ck 포함)로 완료/시도 관리
  const completedRef = useRef<Set<string>>(new Set());
  const attemptRef = useRef<Map<string, number>>(new Map());

  const [autoLoadingIds, setAutoLoadingIds] = useState<Record<string, boolean>>({});

  const tasks = useMemo(() => draft.tasks ?? [], [draft.tasks]);

  // ✅ processes 변화로 자동 로딩 effect가 재실행되지 않게
  const tasksSig = useMemo(() => tasks.map((t) => `${t.id}|${norm(t.title)}`).join('||'), [tasks]);

  // ✅ 수동/자동으로 processes가 바뀔 때 캐시 저장 트리거
  const processesSig = useMemo(() => {
    return tasks
      .map((t) => `${t.id}|${norm(t.title)}|${(t.processes ?? []).map((p) => norm(p.title)).join(',')}`)
      .join('||');
  }, [tasks]);

  const targetTask = useMemo(() => tasks.find((t) => t.id === targetTaskId) ?? null, [tasks, targetTaskId]);

  const openSheet = (taskId: string) => {
    setTargetTaskId(taskId);
    setSheetOpen(true);
  };

  const addProcess = (title: string) => {
    const v = norm(title);
    if (!v || !targetTaskId) return;

    setDraft((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).map((t) => {
        if (t.id !== targetTaskId) return t;

        const cur = Array.isArray(t.processes) ? t.processes : [];
        const exists = new Set(cur.map((p) => norm(p.title)));
        if (exists.has(v)) return { ...t, processes: cur };

        return { ...t, processes: [...cur, { id: uid(), title: v, hazards: [] }] };
      }),
    }));
  };

  const addProcessesBulk = (taskId: string, titles: string[]) => {
    const uniq = Array.from(new Set((titles ?? []).map(norm))).filter(Boolean);
    if (uniq.length === 0) return;

    setDraft((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).map((t) => {
        if (t.id !== taskId) return t;

        const cur = Array.isArray(t.processes) ? t.processes : [];
        const exists = new Set(cur.map((p) => norm(p.title)));
        const next = [...cur];

        let changed = false;
        for (const title of uniq) {
          if (exists.has(title)) continue;
          next.push({ id: uid(), title, hazards: [] });
          exists.add(title);
          changed = true;
        }

        return changed ? { ...t, processes: next } : { ...t, processes: cur };
      }),
    }));
  };

  const removeChip = (taskId: string, processId: string) => {
    setDraft((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).map((t) => {
        if (t.id !== taskId) return t;
        const cur = Array.isArray(t.processes) ? t.processes : [];
        return { ...t, processes: cur.filter((p) => p.id !== processId) };
      }),
    }));
  };

  // =========================
  // ✅ 자동 채움 (AbortController 제거 버전)
  // =========================
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      for (const t of tasks) {
        if (cancelled) return;

        const processName = norm(t.title);
        if (!processName) continue;

        const uiKey = t.id;
        const mc = minorScope(minorCategory);
        const ck = cacheKey(user?.email ?? null, processName, mc);
        const scopeKey = `${t.id}|${ck}`;

        const curProcs = Array.isArray(t.processes) ? t.processes : [];

        // ✅ 공정을 다 지운 경우 완료 마킹 해제
        if (completedRef.current.has(scopeKey) && curProcs.length === 0) {
          completedRef.current.delete(scopeKey);
        }

        // ✅ 완료+현재도 공정이 있으면 스킵
        if (completedRef.current.has(scopeKey) && curProcs.length > 0) continue;

        // ✅ 이미 공정이 있으면 완료 처리 + 캐시 저장
        if (curProcs.length > 0) {
          completedRef.current.add(scopeKey);
          safeWriteCache(ck, {
            v: 2,
            ts: Date.now(),
            user: norm(user?.email) || 'guest',
            processName,
            minorCategory: mc,
            subProcesses: curProcs.map((p) => norm(p.title)).filter(Boolean),
          });
          continue;
        }

        // ✅ 쿨다운 (scope 기준)
        const last = attemptRef.current.get(scopeKey);
        if (last && Date.now() - last < RETRY_COOLDOWN_MS) continue;

        // ✅ 1) 캐시 (정확키)
        let cached = safeReadCache(ck);

        // ✅ 2) user 캐시 없으면 guest 폴백
        if (!cached && user?.email) {
          const guestCk = cacheKey(null, processName, mc);
          cached = safeReadCache(guestCk);
        }

        // ✅ 3) minor=ALL이면 최신 캐시 폴백
        if (!cached && mc === 'ALL') {
          const latestUser = findLatestCacheForUserAndProcess(user?.email ?? null, processName);
          const latestGuest = findLatestCacheForUserAndProcess(null, processName);
          const latest =
            latestUser && latestGuest
              ? latestUser.ts >= latestGuest.ts
                ? latestUser
                : latestGuest
              : latestUser ?? latestGuest;

          if (latest) cached = latest;
        }

        if (cached) {
          if (!cancelled) addProcessesBulk(t.id, cached.subProcesses);
          completedRef.current.add(scopeKey);
          continue;
        }

        // ✅ 2) API
        attemptRef.current.set(scopeKey, Date.now());
        setAutoLoadingIds((prev) => ({ ...prev, [uiKey]: true }));

        try {
          const qs = new URLSearchParams();
          qs.set('endpoint', 'sub-processes');
          qs.set('process_name', processName);
          qs.set('limit', '50');
          if (norm(minorCategory)) qs.set('minor', norm(minorCategory)) 
          try {
            const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
              cache: 'no-store',
            });
            if (!res.ok) {
              attemptRef.current.delete(scopeKey); // ✅ 실패면 바로 재시도 가능하게
              continue;
            }

            const raw = await res.json();
            const items = extractItems(raw);

            if (items.length > 0) {
              if (!cancelled) addProcessesBulk(t.id, items);

              safeWriteCache(ck, {
                v: 2,
                ts: Date.now(),
                user: norm(user?.email) || 'guest',
                processName,
                minorCategory: mc,
                subProcesses: items,
              });

              completedRef.current.add(scopeKey);
            } else {
              // ✅ 빈 응답이면 완료 처리 X (쿨다운 후 재시도)
            }
          } catch (e: any) {
            console.log('[StepProcesses] fetch rejected', e?.name, e?.message);
            throw e;
          }

        } catch (e: any) {
          attemptRef.current.delete(scopeKey); // ✅ 네트워크 오류도 바로 재시도 가능
        } finally {
          if (!cancelled) setAutoLoadingIds((prev) => ({ ...prev, [uiKey]: false }));
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [tasksSig, user?.email, minorCategory]);

  // =========================
  // ✅ processes가 생기면 캐시에 저장
  // =========================
  useEffect(() => {
    const mc = minorScope(minorCategory);

    for (const t of tasks) {
      const processName = norm(t.title);
      if (!processName) continue;

      const cur = Array.isArray(t.processes) ? t.processes : [];
      const subProcesses = cur.map((p) => norm(p.title)).filter(Boolean);
      if (subProcesses.length === 0) continue;

      const ck = cacheKey(user?.email, processName, mc);
      safeWriteCache(ck, {
        v: 2,
        ts: Date.now(),
        user: norm(user?.email) || 'guest',
        processName,
        minorCategory: mc,
        subProcesses,
      });
    }
  }, [processesSig, user?.email, minorCategory]);

  return (
    <div className={s.wrap}>
      <div className={s.topNote}>작업별로 공정을 추가해 주세요. (DB/캐시에 있으면 자동으로 채워집니다)</div>

      {tasks.map((t) => {
        const procs = Array.isArray(t.processes) ? t.processes : [];

        return (
          <div key={t.id} className={s.block}>
            <div className={s.blockHead}>
              <div className={s.blockTitle}>{t.title || '(작업명 미입력)'}</div>
              <button className={s.addBtn} onClick={() => openSheet(t.id)}>
                공정 추가
              </button>
            </div>

            <div className={s.chips}>
              {procs.length === 0 ? (
                <div className={s.empty}>
                  {autoLoadingIds[t.id] ? '공정을 자동으로 불러오는 중…' : '아직 공정이 없습니다. “공정 추가”를 눌러 주세요.'}
                </div>
              ) : (
                procs.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={s.chip}
                    onClick={() => removeChip(t.id, p.id)}
                    title="클릭하면 제거됩니다"
                  >
                    {p.title} <span className={s.chipX}>×</span>
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}

      <AddItemSheet
        open={sheetOpen}
        title="공정 추가"
        placeholder="추가할 공정을 입력하세요"
        suggestions={SUGGEST_PROCESSES}
        onClose={() => setSheetOpen(false)}
        onAdd={(v) => addProcess(v)}
        searchEndpoint="sub-processes"
        searchParams={{
          process_name: norm(targetTask?.title),
          ...(norm(minorCategory) ? { minor: norm(minorCategory) } : {}),
        }}
        minChars={1}
        debounceMs={180}
        searchLimit={50}
      />
    </div>
  );
}
