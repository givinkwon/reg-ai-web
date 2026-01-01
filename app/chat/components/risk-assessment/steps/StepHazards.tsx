// components/risk-assessment/steps/StepHazards.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './StepHazards.module.css';
import AddItemSheet from '../ui/AddItemSheet';
import type { RiskAssessmentDraft, RiskLevel } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';

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
const CACHE_PREFIX = 'regai:risk:stepHazards:v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180일

type HazardCacheItem = {
  id: string;
  title: string;
  likelihood: RiskLevel;
  severity: RiskLevel;
  controls: string;
};

type HazardCache = {
  v: 1;
  ts: number;
  user: string; // email or guest
  processName: string; // task.title
  subProcess: string; // process.title
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
    if (!parsed?.ts || !Array.isArray(parsed?.hazards)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteCache(key: string, payload: HazardCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // storage full/blocked면 무시
  }
}

export default function StepHazards({ draft, setDraft }: Props) {
  const user = useUserStore((st) => st.user);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<{ taskId: string; processId: string } | null>(null);

  // ✅ 자동 채움 가드 (taskId:processId)
  const autoFilledRef = useRef<Set<string>>(new Set());
  const [autoLoading, setAutoLoading] = useState<Record<string, boolean>>({}); // key => boolean

  const tasks = useMemo(() => draft.tasks, [draft.tasks]);

  const targetTask = useMemo(() => {
    if (!target) return null;
    return tasks.find((t) => t.id === target.taskId) ?? null;
  }, [target, tasks]);

  const targetProc = useMemo(() => {
    if (!targetTask || !target) return null;
    return targetTask.processes.find((p) => p.id === target.processId) ?? null;
  }, [targetTask, target]);

  const openSheet = (taskId: string, processId: string) => {
    setTarget({ taskId, processId });
    setSheetOpen(true);
  };

  const addHazard = (title: string) => {
    const v = norm(title);
    if (!v || !target) return;

    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== target.taskId) return t;
        return {
          ...t,
          processes: t.processes.map((p) => {
            if (p.id !== target.processId) return p;

            const exists = new Set((p.hazards ?? []).map((h) => norm(h.title)));
            if (exists.has(v)) return p;

            return {
              ...p,
              hazards: [
                ...(p.hazards ?? []),
                { id: uid(), title: v, likelihood: DEFAULT_L, severity: DEFAULT_S, controls: '' },
              ],
            };
          }),
        };
      }),
    }));
  };

  const addHazardsBulk = (taskId: string, processId: string, titles: string[]) => {
    const uniq = Array.from(new Set(titles.map(norm))).filter(Boolean);
    if (uniq.length === 0) return;

    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          processes: t.processes.map((p) => {
            if (p.id !== processId) return p;

            const exists = new Set((p.hazards ?? []).map((h) => norm(h.title)));
            const next = [...(p.hazards ?? [])];

            for (const title of uniq) {
              if (exists.has(title)) continue;
              next.push({ id: uid(), title, likelihood: DEFAULT_L, severity: DEFAULT_S, controls: '' });
              exists.add(title);
            }

            return { ...p, hazards: next };
          }),
        };
      }),
    }));
  };

  const removeChip = (taskId: string, processId: string, hazardId: string) => {
    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          processes: t.processes.map((p) => {
            if (p.id !== processId) return p;
            return { ...p, hazards: (p.hazards ?? []).filter((h) => h.id !== hazardId) };
          }),
        };
      }),
    }));
  };

  // =========================
  // ✅ 자동 채움: (process_name, sub_process) → risk_situation_result distinct → hazards 자동 추가
  //    캐시 우선 → 없으면 API 호출
  // =========================
  useEffect(() => {
    let cancelled = false;
    const controllers: AbortController[] = [];

    const run = async () => {
      for (const t of tasks) {
        if (cancelled) return;

        const processName = norm(t.title);
        if (!processName) continue;

        for (const p of t.processes) {
          if (cancelled) return;

          const subProcess = norm(p.title);
          if (!subProcess) continue;

          const key = `${t.id}:${p.id}`;

          // 이미 처리한 공정이면 스킵
          if (autoFilledRef.current.has(key)) continue;

          // 이미 위험요인이 있으면 "완료"로 처리하고 캐시 저장만
          if ((p.hazards ?? []).length > 0) {
            autoFilledRef.current.add(key);

            const ck = cacheKey(user?.email ?? null, processName, subProcess);
            safeWriteCache(ck, {
              v: 1,
              ts: Date.now(),
              user: norm(user?.email) || 'guest',
              processName,
              subProcess,
              hazards: (p.hazards ?? []).map((h) => ({
                id: h.id,
                title: norm(h.title),
                likelihood: h.likelihood ?? DEFAULT_L,
                severity: h.severity ?? DEFAULT_S,
                controls: h.controls ?? '',
              })),
            });

            continue;
          }

          // ✅ 1) 캐시 먼저
          const ck = cacheKey(user?.email ?? null, processName, subProcess);
          const cached = safeReadCache(ck);

          if (cached && cached.hazards.length > 0) {
            autoFilledRef.current.add(key);
            addHazardsBulk(t.id, p.id, cached.hazards.map((x) => x.title));
            continue;
          }

          // ✅ 2) 캐시 없으면 API 호출
          setAutoLoading((prev) => ({ ...prev, [key]: true }));

          const ac = new AbortController();
          controllers.push(ac);

          try {
            const qs = new URLSearchParams();
            qs.set('endpoint', 'risk-situations'); // ✅ 백엔드에 추가할 엔드포인트
            qs.set('process_name', processName);
            qs.set('sub_process', subProcess);
            qs.set('limit', '80');

            const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
              cache: 'no-store',
              signal: ac.signal,
            });

            if (!res.ok) {
              autoFilledRef.current.add(key);
              continue;
            }

            const data = (await res.json()) as { items?: string[] };
            const items = Array.from(new Set((data.items ?? []).map(norm).filter(Boolean)));

            if (items.length > 0) {
              addHazardsBulk(t.id, p.id, items);

              // ✅ API 결과 캐시
              safeWriteCache(ck, {
                v: 1,
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
            }

            autoFilledRef.current.add(key);
          } catch (e: any) {
            if (e?.name !== 'AbortError') autoFilledRef.current.add(key);
          } finally {
            setAutoLoading((prev) => ({ ...prev, [key]: false }));
          }
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, [tasks, user?.email, setDraft]);

  // =========================
  // ✅ 사용자가 수동 추가/삭제한 hazards도 캐시에 반영
  // =========================
  useEffect(() => {
    const u = user?.email ?? null;

    for (const t of tasks) {
      const processName = norm(t.title);
      if (!processName) continue;

      for (const p of t.processes) {
        const subProcess = norm(p.title);
        if (!subProcess) continue;

        const hazards = (p.hazards ?? []).map((h) => ({
          id: h.id,
          title: norm(h.title),
          likelihood: h.likelihood ?? DEFAULT_L,
          severity: h.severity ?? DEFAULT_S,
          controls: h.controls ?? '',
        })).filter((h) => h.title);

        if (hazards.length === 0) continue;

        const ck = cacheKey(u, processName, subProcess);
        safeWriteCache(ck, {
          v: 1,
          ts: Date.now(),
          user: norm(u) || 'guest',
          processName,
          subProcess,
          hazards,
        });
      }
    }
  }, [tasks, user?.email]);

  return (
    <div className={s.wrap}>
      <div className={s.topNote}>
        공정별로 유해·위험요인을 추가해 주세요. (DB/캐시에 있으면 자동으로 채워집니다)
      </div>

      {tasks.map((t) => (
        <div key={t.id} className={s.taskBlock}>
          <div className={s.taskTitle}>{t.title || '(작업명 미입력)'}</div>

          {t.processes.length === 0 ? (
            <div className={s.empty}>
              공정이 없어서 위험요인을 추가할 수 없습니다. 이전 단계에서 공정을 먼저 추가해 주세요.
            </div>
          ) : (
            t.processes.map((p) => {
              const k = `${t.id}:${p.id}`;

              return (
                <div key={p.id} className={s.procBlock}>
                  <div className={s.procHead}>
                    <div className={s.procTitle}>{p.title}</div>
                    <button className={s.addBtn} onClick={() => openSheet(t.id, p.id)}>
                      위험요인 추가
                    </button>
                  </div>

                  <div className={s.chips}>
                    {(p.hazards ?? []).length === 0 ? (
                      <div className={s.empty2}>
                        {autoLoading[k] ? '위험요인을 자동으로 불러오는 중…' : '아직 위험요인이 없습니다.'}
                      </div>
                    ) : (
                      (p.hazards ?? []).map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          className={s.chip}
                          onClick={() => removeChip(t.id, p.id, h.id)}
                          title="클릭하면 제거됩니다"
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
        onClose={() => setSheetOpen(false)}
        onAdd={(v) => addHazard(v)}
        // ✅ 검색도 DB에서 risk_situation_result 기준으로 추천되게
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
