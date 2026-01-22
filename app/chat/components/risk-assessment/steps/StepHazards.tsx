'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './StepHazards.module.css';
import AddItemSheet from '../ui/AddItemSheet';
import type { RiskAssessmentDraft, RiskLevel } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const norm = (v?: string | null) => (v ?? '').trim();

const SUGGEST_HAZARDS = [
  '끼임/협착 위험',
  '절단/베임 위험',
  '비산물(파편) 위험',
  '추락 위험',
  '전기 감전 위험',
  '유해물질 흡입/피부접촉',
  '화재/폭발 위험',
];

const DEFAULT_L: RiskLevel = 2;
const DEFAULT_S: RiskLevel = 2;

// =========================
// ✅ localStorage cache (process_name + sub_process 단위로 hazards 저장)
// =========================
const CACHE_PREFIX = 'regai:risk:stepHazards:v2';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180;
const RETRY_COOLDOWN_MS = 1000 * 20;

type HazardCacheItem = {
  id: string;
  title: string;
  likelihood: RiskLevel;
  severity: RiskLevel;
  controls: string;
};

type HazardCache = {
  v: 2;
  ts: number;
  user: string; // email or guest
  processName: string;
  subProcess: string;
  hazards: HazardCacheItem[];
};

function cacheKey(userEmail: string | null | undefined, processName: string, subProcess: string) {
  const u = norm(userEmail) || 'guest';
  const pn = norm(processName);
  const sp = norm(subProcess);
  return `${CACHE_PREFIX}:${encodeURIComponent(u)}:${encodeURIComponent(pn)}:${encodeURIComponent(sp)}`;
}

function safeReadCache(key: string): HazardCache | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HazardCache;

    if (parsed?.v !== 2) return null;
    if (!parsed?.ts || !Array.isArray(parsed?.hazards)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;

    // ✅ 빈 캐시는 MISS 처리
    if (parsed.hazards.length === 0) return null;

    return parsed;
  } catch {
    return null;
  }
}

function safeWriteCache(key: string, payload: HazardCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/** ✅ 응답이 string[] / {items:...} / {value:...} / 객체배열 등 무엇이든 "문자열 배열"로 정규화 */
function toText(x: any) {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    return (
      x._id ?? // ✅ Mongo group/distinct 결과 { _id: "..." } 지원
      x.title ??
      x.name ??
      x.risk_situation_result ??
      x.riskSituation ??
      x.risk_situation ??
      x.hazard ??
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
        : Array.isArray(payload?.rows)
          ? payload.rows
          : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.value)
              ? payload.value
              : Array.isArray(payload?.value?.items)
                ? payload.value.items
                : Array.isArray(payload?.value?.rows)
                  ? payload.value.rows
                  : Array.isArray(payload?.value?.data)
                    ? payload.value.data
                    : [];

  return Array.from(new Set(arr.map(toText).map(norm).filter(Boolean)));
}

const GA_CTX = {
  page: 'Chat',
  section: 'RiskAssessment',
  step: 'StepHazards',
} as const;

export default function StepHazards({ draft, setDraft }: Props) {
  const user = useUserStore((st) => st.user);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<{ taskId: string; processId: string } | null>(null);

  /**
   * ✅ IMPORTANT:
   * completed/attempt를 `${t.id}:${p.id}`만으로 관리하면
   * guest→user 전환/타이틀 변경 시에도 "이미 완료"로 판단해서 API/캐시 복원을 막아버림.
   *
   * 그래서 `${t.id}:${p.id}|${cacheKey(...)}`로 스코프를 포함해서 관리.
   */
  const completedRef = useRef<Set<string>>(new Set());
  const attemptRef = useRef<Map<string, number>>(new Map());

  // UI 로딩 표시용은 `${t.id}:${p.id}` 유지
  const [autoLoading, setAutoLoading] = useState<Record<string, boolean>>({});

  const tasks = useMemo(() => (draft.tasks ?? []), [draft.tasks]);

  // ✅ 자동채움 effect deps: 작업/공정 목록 변할 때만 (hazards 변화로는 재시작 X)
  const procSig = useMemo(() => {
    return tasks
      .map(
        (t) =>
          `${t.id}|${norm(t.title)}|` +
          (t.processes ?? []).map((p) => `${p.id}:${norm(p.title)}`).join(','),
      )
      .join('||');
  }, [tasks]);

  // ✅ 캐시 저장 deps: hazards까지 포함 (수동 추가/삭제 반영)
  const hazardsSig = useMemo(() => {
    return tasks
      .map((t) => {
        const procs = (t.processes ?? []).map((p) => {
          const hs = (p.hazards ?? [])
            .map((h: any) => `${norm(h.title)}:${h.likelihood ?? ''}:${h.severity ?? ''}:${norm(h.controls ?? '')}`)
            .join(',');
          return `${p.id}:${norm(p.title)}[${hs}]`;
        });
        return `${t.id}|${norm(t.title)}|${procs.join(';')}`;
      })
      .join('||');
  }, [tasks]);

  const targetTask = useMemo(() => {
    if (!target) return null;
    return tasks.find((t) => t.id === target.taskId) ?? null;
  }, [target, tasks]);

  const targetProc = useMemo(() => {
    if (!targetTask || !target) return null;
    return (targetTask.processes ?? []).find((p) => p.id === target.processId) ?? null;
  }, [targetTask, target]);

  // ✅ GA: view 1회
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;

    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      user_type: user?.email ? 'user' : 'guest',
      tasks_count: tasks.length,
      processes_count: tasks.reduce((acc, t) => acc + (t.processes?.length ?? 0), 0),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSheet = (taskId: string, processId: string) => {
    setTarget({ taskId, processId });
    setSheetOpen(true);

    const t = tasks.find((x) => x.id === taskId);
    const p = (t?.processes ?? []).find((x) => x.id === processId);

    track(gaEvent(GA_CTX, 'OpenAddSheet'), {
      ui_id: gaUiId(GA_CTX, 'OpenAddSheet'),
      task_id: taskId,
      process_id: processId,
      process_name_len: norm(t?.title).length,
      sub_process_len: norm(p?.title).length,
    });
  };

  const addHazard = (title: string) => {
    const v = norm(title);
    if (!v || !target) return;

    const t = tasks.find((x) => x.id === target.taskId);
    const p = (t?.processes ?? []).find((x) => x.id === target.processId);
    const existingCount = (p?.hazards ?? []).length;

    track(gaEvent(GA_CTX, 'AddHazardManual'), {
      ui_id: gaUiId(GA_CTX, 'AddHazardManual'),
      task_id: target.taskId,
      process_id: target.processId,
      hazard_title: v,
      hazard_title_len: v.length,
      existing_count: existingCount,
      process_name: norm(t?.title),
      sub_process: norm(p?.title),
    });

    setDraft((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).map((tt) => {
        if (tt.id !== target.taskId) return tt;
        return {
          ...tt,
          processes: (tt.processes ?? []).map((pp) => {
            if (pp.id !== target.processId) return pp;

            const exists = new Set((pp.hazards ?? []).map((h: any) => norm(h.title)));
            if (exists.has(v)) {
              track(gaEvent(GA_CTX, 'AddHazardManualDuplicate'), {
                ui_id: gaUiId(GA_CTX, 'AddHazardManualDuplicate'),
                task_id: target.taskId,
                process_id: target.processId,
                hazard_title: v,
              });
              return pp;
            }

            return {
              ...pp,
              hazards: [
                ...(pp.hazards ?? []),
                { id: uid(), title: v, likelihood: DEFAULT_L, severity: DEFAULT_S, controls: '' },
              ],
            };
          }),
        };
      }),
    }));
  };

  // ✅ 캐시/DB에서 가져온 hazard를 "타이틀 중복 방지"로 병합 + L/S/controls 복원
  const addHazardsBulkFromCache = (taskId: string, processId: string, hazards: HazardCacheItem[]) => {
    const items = (hazards ?? [])
      .map((h) => ({
        title: norm(h.title),
        likelihood: (h.likelihood ?? DEFAULT_L) as RiskLevel,
        severity: (h.severity ?? DEFAULT_S) as RiskLevel,
        controls: h.controls ?? '',
      }))
      .filter((h) => h.title);

    if (items.length === 0) return;

    track(gaEvent(GA_CTX, 'RestoreFromCache'), {
      ui_id: gaUiId(GA_CTX, 'RestoreFromCache'),
      task_id: taskId,
      process_id: processId,
      hazards_count: items.length,
    });

    setDraft((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          processes: (t.processes ?? []).map((p) => {
            if (p.id !== processId) return p;

            const exists = new Set((p.hazards ?? []).map((hh: any) => norm(hh.title)));
            const next = [...(p.hazards ?? [])];

            let added = 0;
            for (const h of items) {
              if (exists.has(h.title)) continue;
              next.push({
                id: uid(),
                title: h.title,
                likelihood: h.likelihood,
                severity: h.severity,
                controls: h.controls,
              });
              exists.add(h.title);
              added += 1;
            }

            if (added > 0) {
              track(gaEvent(GA_CTX, 'RestoreFromCacheMerged'), {
                ui_id: gaUiId(GA_CTX, 'RestoreFromCacheMerged'),
                task_id: taskId,
                process_id: processId,
                added,
                kept_existing: next.length - added,
              });
            }

            return { ...p, hazards: next };
          }),
        };
      }),
    }));
  };

  // ✅ API에서 받은 title 리스트만 넣는 버전
  const addHazardsBulk = (taskId: string, processId: string, titles: string[]) => {
    const uniq = Array.from(new Set((titles ?? []).map(norm))).filter(Boolean);
    if (uniq.length === 0) return;

    track(gaEvent(GA_CTX, 'AddHazardsFromApi'), {
      ui_id: gaUiId(GA_CTX, 'AddHazardsFromApi'),
      task_id: taskId,
      process_id: processId,
      titles_count: uniq.length,
    });

    setDraft((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          processes: (t.processes ?? []).map((p) => {
            if (p.id !== processId) return p;

            const exists = new Set((p.hazards ?? []).map((h: any) => norm(h.title)));
            const next = [...(p.hazards ?? [])];

            let added = 0;
            for (const title of uniq) {
              if (exists.has(title)) continue;
              next.push({ id: uid(), title, likelihood: DEFAULT_L, severity: DEFAULT_S, controls: '' });
              exists.add(title);
              added += 1;
            }

            track(gaEvent(GA_CTX, 'AddHazardsFromApiMerged'), {
              ui_id: gaUiId(GA_CTX, 'AddHazardsFromApiMerged'),
              task_id: taskId,
              process_id: processId,
              added,
              skipped_duplicates: uniq.length - added,
            });

            return { ...p, hazards: next };
          }),
        };
      }),
    }));
  };

  const removeChip = (taskId: string, processId: string, hazardId: string) => {
    const t = tasks.find((x) => x.id === taskId);
    const p = (t?.processes ?? []).find((x) => x.id === processId);
    const h = (p?.hazards ?? []).find((x: any) => x.id === hazardId);

    track(gaEvent(GA_CTX, 'RemoveHazard'), {
      ui_id: gaUiId(GA_CTX, 'RemoveHazard'),
      task_id: taskId,
      process_id: processId,
      hazard_id: hazardId,
      hazard_title: norm(h?.title),
      source: 'chip_click',
    });

    setDraft((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          processes: (t.processes ?? []).map((p) => {
            if (p.id !== processId) return p;
            return { ...p, hazards: (p.hazards ?? []).filter((h: any) => h.id !== hazardId) };
          }),
        };
      }),
    }));
  };

  // =========================
  // ✅ 자동 채움 (AbortController 제거 버전)
  // - 캐시 우선 → 없으면 API 호출
  // - hazards를 다 지우면 completed 마킹 해제해서 재로딩 가능
  // =========================
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      for (const t of tasks) {
        if (cancelled) return;

        const processName = norm(t.title);
        if (!processName) continue;

        for (const p of t.processes ?? []) {
          if (cancelled) return;

          const subProcess = norm(p.title);
          if (!subProcess) continue;

          const uiKey = `${t.id}:${p.id}`; // 로딩 표시용
          const ck = cacheKey(user?.email ?? null, processName, subProcess);
          const scopeKey = `${uiKey}|${ck}`;

          const curHazards = Array.isArray(p.hazards) ? p.hazards : [];

          // ✅ 사용자가 위험요인을 다 지운 경우: 완료 마킹이 남아있으면 풀어줘야 재로딩 가능
          if (completedRef.current.has(scopeKey) && curHazards.length === 0) {
            completedRef.current.delete(scopeKey);
          }

          // ✅ 이미 완료 + 지금도 hazards 있으면 스킵
          if (completedRef.current.has(scopeKey) && curHazards.length > 0) continue;

          // ✅ 이미 hazards가 있으면: 완료 처리 + 캐시 저장
          if (curHazards.length > 0) {
            completedRef.current.add(scopeKey);

            safeWriteCache(ck, {
              v: 2,
              ts: Date.now(),
              user: norm(user?.email) || 'guest',
              processName,
              subProcess,
              hazards: curHazards
                .map((h: any) => ({
                  id: h.id,
                  title: norm(h.title),
                  likelihood: (h.likelihood ?? DEFAULT_L) as RiskLevel,
                  severity: (h.severity ?? DEFAULT_S) as RiskLevel,
                  controls: h.controls ?? '',
                }))
                .filter((h: any) => h.title),
            });

            continue;
          }

          // ✅ 쿨다운
          const last = attemptRef.current.get(scopeKey);
          if (last && Date.now() - last < RETRY_COOLDOWN_MS) continue;

          // ✅ 1) 캐시 (정확키)
          let cached = safeReadCache(ck);

          // ✅ 2) user 캐시 없으면 guest 폴백(로그인 전 선택 → 로그인 후 복원)
          if (!cached && user?.email) {
            const guestCk = cacheKey(null, processName, subProcess);
            cached = safeReadCache(guestCk);
          }

          if (cached) {
            if (!cancelled) addHazardsBulkFromCache(t.id, p.id, cached.hazards);
            completedRef.current.add(scopeKey);
            continue;
          }

          // ✅ 2) API 호출
          attemptRef.current.set(scopeKey, Date.now());
          setAutoLoading((prev) => ({ ...prev, [uiKey]: true }));

          track(gaEvent(GA_CTX, 'AutoFillFetchStart'), {
            ui_id: gaUiId(GA_CTX, 'AutoFillFetchStart'),
            task_id: t.id,
            process_id: p.id,
            process_name: processName,
            sub_process: subProcess,
            user_type: user?.email ? 'user' : 'guest',
          });

          try {
            const qs = new URLSearchParams();
            qs.set('endpoint', 'risk-situations');
            qs.set('process_name', processName);
            qs.set('sub_process', subProcess);
            qs.set('limit', '80');

            try {
              // ✅ signal 제거 (AbortError 방지)
              const startedAt = performance.now();
              const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
                cache: 'no-store',
              });
              const ms = Math.round(performance.now() - startedAt);

              if (!res.ok) {
                attemptRef.current.delete(scopeKey);
                track(gaEvent(GA_CTX, 'AutoFillFetchFail'), {
                  ui_id: gaUiId(GA_CTX, 'AutoFillFetchFail'),
                  task_id: t.id,
                  process_id: p.id,
                  status: res.status,
                  ms,
                });
                continue;
              }

              const raw = await res.json();
              const items = extractItems(raw);

              track(gaEvent(GA_CTX, 'AutoFillFetchSuccess'), {
                ui_id: gaUiId(GA_CTX, 'AutoFillFetchSuccess'),
                task_id: t.id,
                process_id: p.id,
                ms,
                items_count: items.length,
              });

              if (items.length > 0) {
                if (!cancelled) addHazardsBulk(t.id, p.id, items);

                safeWriteCache(ck, {
                  v: 2,
                  ts: Date.now(),
                  user: norm(user?.email) || 'guest',
                  processName,
                  subProcess,
                  hazards: items.map((title) => ({
                    id: uid(),
                    title,
                    likelihood: DEFAULT_L,
                    severity: DEFAULT_S,
                    controls: '',
                  })),
                });

                completedRef.current.add(scopeKey);
              } else {
                // ✅ 빈 결과면 완료 처리 X, 다음 run에서 재시도 가능하게 attempt 삭제
                attemptRef.current.delete(scopeKey);
              }
            } catch (e: any) {
              track(gaEvent(GA_CTX, 'AutoFillFetchError'), {
                ui_id: gaUiId(GA_CTX, 'AutoFillFetchError'),
                task_id: t.id,
                process_id: p.id,
                name: e?.name ?? '',
                message: e?.message ?? '',
              });
              console.log('[StepHazards] fetch rejected', e?.name, e?.message);
              throw e;
            }
          } catch (e: any) {
            attemptRef.current.delete(scopeKey);
          } finally {
            if (!cancelled) setAutoLoading((prev) => ({ ...prev, [uiKey]: false }));
          }
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [procSig, user?.email]);

  // =========================
  // ✅ 수동 추가/삭제한 hazards도 캐시에 반영 (빈 캐시 저장 금지)
  // =========================
  useEffect(() => {
    const u = user?.email ?? null;

    for (const t of tasks) {
      const processName = norm(t.title);
      if (!processName) continue;

      for (const p of t.processes ?? []) {
        const subProcess = norm(p.title);
        if (!subProcess) continue;

        const hazards = (p.hazards ?? [])
          .map((h: any) => ({
            id: h.id,
            title: norm(h.title),
            likelihood: (h.likelihood ?? DEFAULT_L) as RiskLevel,
            severity: (h.severity ?? DEFAULT_S) as RiskLevel,
            controls: h.controls ?? '',
          }))
          .filter((h: any) => h.title);

        if (hazards.length === 0) continue;

        const ck = cacheKey(u, processName, subProcess);
        safeWriteCache(ck, {
          v: 2,
          ts: Date.now(),
          user: norm(u) || 'guest',
          processName,
          subProcess,
          hazards,
        });
      }
    }
  }, [hazardsSig, user?.email]);

  return (
    <div className={s.wrap}>
      <div className={s.topNote}>공정별로 유해·위험요인을 추가해 주세요. (DB/캐시에 있으면 자동으로 채워집니다)</div>

      {tasks.map((t) => (
        <div key={t.id} className={s.taskBlock}>
          <div className={s.taskTitle}>{t.title || '(작업명 미입력)'}</div>

          {(t.processes ?? []).length === 0 ? (
            <div className={s.empty}>공정이 없어서 위험요인을 추가할 수 없습니다. 이전 단계에서 공정을 먼저 추가해 주세요.</div>
          ) : (
            (t.processes ?? []).map((p) => {
              const uiKey = `${t.id}:${p.id}`;
              const hazards = Array.isArray(p.hazards) ? p.hazards : [];

              return (
                <div key={p.id} className={s.procBlock}>
                  <div className={s.procHead}>
                    <div className={s.procTitle}>{p.title}</div>
                    <button
                      className={s.addBtn}
                      onClick={() => openSheet(t.id, p.id)}
                      type="button"
                      data-ga-event={gaEvent(GA_CTX, 'OpenAddSheet')}
                      data-ga-id={gaUiId(GA_CTX, 'OpenAddSheet')}
                    >
                      위험요인 추가
                    </button>
                  </div>

                  <div className={s.chips}>
                    {hazards.length === 0 ? (
                      <div className={s.empty2}>
                        {autoLoading[uiKey] ? '위험요인을 자동으로 불러오는 중…' : '아직 위험요인이 없습니다.'}
                      </div>
                    ) : (
                      hazards.map((h: any) => (
                        <button
                          key={h.id}
                          type="button"
                          className={s.chip}
                          onClick={() => removeChip(t.id, p.id, h.id)}
                          title="클릭하면 제거됩니다"
                          data-ga-event={gaEvent(GA_CTX, 'RemoveHazard')}
                          data-ga-id={gaUiId(GA_CTX, 'RemoveHazard')}
                          data-ga-text={norm(h.title)}
                        >
                          {h.title} <span className={s.chipX}>×</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ))}

      <AddItemSheet
        open={sheetOpen}
        title="유해·위험요인 추가"
        placeholder="추가할 위험요인을 입력하세요"
        suggestions={SUGGEST_HAZARDS}
        onClose={() => {
          track(gaEvent(GA_CTX, 'CloseAddSheet'), { ui_id: gaUiId(GA_CTX, 'CloseAddSheet') });
          setSheetOpen(false);
        }}
        onAdd={(v) => addHazard(v)}
        searchEndpoint="risk-situations"
        searchParams={{
          process_name: norm(targetTask?.title),
          sub_process: norm(targetProc?.title),
        }}
        minChars={1}
        debounceMs={180}
        searchLimit={80}
      />
    </div>
  );
}
