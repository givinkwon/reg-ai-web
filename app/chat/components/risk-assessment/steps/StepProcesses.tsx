// components/risk-assessment/steps/StepProcesses.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './StepProcesses.module.css';
import AddItemSheet from '../ui/AddItemSheet';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'RiskAssessmentProcesses' } as const;

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
    return x._id ?? x.title ?? x.name ?? x.sub_process ?? x.subProcess ?? x.process ?? x.value ?? '';
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
  const userEmail = (user?.email ?? '').trim();
  const mc = minorScope(minorCategory);

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

  // ✅ GA: 화면 진입
  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      minor: mc,
      has_user: !!userEmail,
      tasks_len: tasks.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSheet = (taskId: string) => {
    setTargetTaskId(taskId);
    setSheetOpen(true);

    const t = tasks.find((x) => x.id === taskId);
    track(gaEvent(GA_CTX, 'OpenAddSheet'), {
      ui_id: gaUiId(GA_CTX, 'OpenAddSheet'),
      task_id: taskId,
      task_title: norm(t?.title),
      minor: mc,
    });
  };

  const addProcess = (title: string) => {
    const v = norm(title);
    if (!v || !targetTaskId) return;

    track(gaEvent(GA_CTX, 'ProcessAdd'), {
      ui_id: gaUiId(GA_CTX, 'ProcessAdd'),
      task_id: targetTaskId,
      process_title: v,
      minor: mc,
      source: 'sheet_manual',
    });

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

  const addProcessesBulk = (taskId: string, titles: string[], source: 'cache' | 'api' | 'sheet_search' = 'api') => {
    const uniq = Array.from(new Set((titles ?? []).map(norm))).filter(Boolean);
    if (uniq.length === 0) return;

    track(gaEvent(GA_CTX, 'ProcessBulkAdd'), {
      ui_id: gaUiId(GA_CTX, 'ProcessBulkAdd'),
      task_id: taskId,
      count: uniq.length,
      minor: mc,
      source,
    });

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
    const t = tasks.find((x) => x.id === taskId);
    const p = (t?.processes ?? []).find((x) => x.id === processId);

    track(gaEvent(GA_CTX, 'ProcessRemove'), {
      ui_id: gaUiId(GA_CTX, 'ProcessRemove'),
      task_id: taskId,
      process_id: processId,
      process_title: norm(p?.title),
      minor: mc,
      source: 'chip',
    });

    setDraft((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).map((t2) => {
        if (t2.id !== taskId) return t2;
        const cur = Array.isArray(t2.processes) ? t2.processes : [];
        return { ...t2, processes: cur.filter((p2) => p2.id !== processId) };
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
          if (!cancelled) addProcessesBulk(t.id, cached.subProcesses, 'cache');
          completedRef.current.add(scopeKey);

          track(gaEvent(GA_CTX, 'AutoFillFromCache'), {
            ui_id: gaUiId(GA_CTX, 'AutoFillFromCache'),
            task_id: t.id,
            task_title: processName,
            count: cached.subProcesses.length,
            minor: mc,
          });

          continue;
        }

        // ✅ 2) API
        attemptRef.current.set(scopeKey, Date.now());
        setAutoLoadingIds((prev) => ({ ...prev, [uiKey]: true }));

        track(gaEvent(GA_CTX, 'AutoFillFetchStart'), {
          ui_id: gaUiId(GA_CTX, 'AutoFillFetchStart'),
          task_id: t.id,
          task_title: processName,
          minor: mc,
        });

        try {
          const qs = new URLSearchParams();
          qs.set('endpoint', 'sub-processes');
          qs.set('process_name', processName);
          qs.set('limit', '50');
          if (norm(minorCategory)) qs.set('minor', norm(minorCategory));

          try {
            const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
              cache: 'no-store',
            });
            if (!res.ok) {
              attemptRef.current.delete(scopeKey);
              track(gaEvent(GA_CTX, 'AutoFillFetchError'), {
                ui_id: gaUiId(GA_CTX, 'AutoFillFetchError'),
                task_id: t.id,
                task_title: processName,
                minor: mc,
                status: res.status,
              });
              continue;
            }

            const raw = await res.json();
            const items = extractItems(raw);

            if (items.length > 0) {
              if (!cancelled) addProcessesBulk(t.id, items, 'api');

              safeWriteCache(ck, {
                v: 2,
                ts: Date.now(),
                user: norm(user?.email) || 'guest',
                processName,
                minorCategory: mc,
                subProcesses: items,
              });

              completedRef.current.add(scopeKey);

              track(gaEvent(GA_CTX, 'AutoFillFetchSuccess'), {
                ui_id: gaUiId(GA_CTX, 'AutoFillFetchSuccess'),
                task_id: t.id,
                task_title: processName,
                minor: mc,
                count: items.length,
              });
            } else {
              track(gaEvent(GA_CTX, 'AutoFillFetchEmpty'), {
                ui_id: gaUiId(GA_CTX, 'AutoFillFetchEmpty'),
                task_id: t.id,
                task_title: processName,
                minor: mc,
              });
            }
          } catch (e: any) {
            console.log('[StepProcesses] fetch rejected', e?.name, e?.message);
            throw e;
          }
        } catch (e: any) {
          attemptRef.current.delete(scopeKey);
          track(gaEvent(GA_CTX, 'AutoFillFetchError'), {
            ui_id: gaUiId(GA_CTX, 'AutoFillFetchError'),
            task_id: t.id,
            task_title: processName,
            minor: mc,
            message: String(e?.message ?? e),
          });
        } finally {
          if (!cancelled) setAutoLoadingIds((prev) => ({ ...prev, [uiKey]: false }));
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [tasksSig, user?.email, minorCategory, mc]);

  // =========================
  // ✅ processes가 생기면 캐시에 저장
  // =========================
  useEffect(() => {
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

      // ✅ 너무 과도하면 제거 가능 (그래도 한번만 남기도록 가드)
      // 여기선 "해당 task에 processes가 생겼다는 사실"을 가볍게 남김
      track(gaEvent(GA_CTX, 'CacheWrite'), {
        ui_id: gaUiId(GA_CTX, 'CacheWrite'),
        task_id: t.id,
        task_title: processName,
        minor: mc,
        count: subProcesses.length,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processesSig, user?.email, minorCategory, mc]);

  return (
    <div className={s.wrap} data-ga-event={gaEvent(GA_CTX, 'View')} data-ga-id={gaUiId(GA_CTX, 'View')}>
      <div className={s.topNote}>작업별로 공정을 추가해 주세요. (DB/캐시에 있으면 자동으로 채워집니다)</div>

      {tasks.map((t) => {
        const procs = Array.isArray(t.processes) ? t.processes : [];

        return (
          <div key={t.id} className={s.block}>
            <div className={s.blockHead}>
              <div className={s.blockTitle}>{t.title || '(작업명 미입력)'}</div>
              <button
                className={s.addBtn}
                onClick={() => openSheet(t.id)}
                type="button"
                data-ga-event={gaEvent(GA_CTX, 'OpenAddSheet')}
                data-ga-id={gaUiId(GA_CTX, 'OpenAddSheet')}
                data-ga-text={t.title}
              >
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
                    data-ga-event={gaEvent(GA_CTX, 'ProcessRemove')}
                    data-ga-id={gaUiId(GA_CTX, 'ProcessRemove')}
                    data-ga-text={p.title}
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
        onClose={() => {
          track(gaEvent(GA_CTX, 'CloseAddSheet'), { ui_id: gaUiId(GA_CTX, 'CloseAddSheet'), minor: mc });
          setSheetOpen(false);
        }}
        onAdd={(v) => addProcess(v)}
        searchEndpoint="sub-processes"
        searchParams={{
          process_name: norm(targetTask?.title),
          ...(norm(minorCategory) ? { minor: norm(minorCategory) } : {}),
        }}
        minChars={1}
        debounceMs={180}
        searchLimit={50}
        // ✅ AddItemSheet 내부에서 검색/클릭 추적하고 싶으면
        // onSearchStart/onSearchSuccess/onPickSuggestion 같은 콜백을 AddItemSheet에 추가하는 걸 추천
      />
    </div>
  );
}
