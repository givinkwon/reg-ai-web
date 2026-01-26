'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, X, AlertTriangle } from 'lucide-react';
import s from './StepHazards.module.css';
import AddHazardModal from '../ui/AddHazardModal';
import type { RiskAssessmentDraft, RiskLevel } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';
import { Button } from '@/app/components/ui/button';
import { useRiskWizardStore } from '@/app/store/docs'; 

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context 정의
const GA_CTX = { page: 'Docs', section: 'RiskAssessment', area: 'StepHazards' } as const;

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const norm = (v?: string | null) => (v ?? '').trim();

const DEFAULT_L: RiskLevel = 2;
const DEFAULT_S: RiskLevel = 2;

// =========================
// ✅ Cache Logic (기존 유지)
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
  user: string;
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
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    if (parsed.hazards.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function safeWriteCache(key: string, payload: HazardCache) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch { /* ignore */ }
}

function extractItems(payload: any): string[] {
  const arr = Array.isArray(payload) ? payload : (payload?.items ?? []);
  return Array.from(new Set(arr.map((x: any) => (typeof x === 'string' ? x : x?.title ?? x?.risk_situation ?? '')).map(norm).filter(Boolean)));
}

export default function StepHazards({ draft, setDraft }: Props) {
  const user = useUserStore((st) => st.user);
  
  // ✅ 전역 로딩 상태 함수
  const setIsAnalyzing = useRiskWizardStore((st) => st.setIsAnalyzing);

  const [modalOpen, setModalOpen] = useState(false);
  const [target, setTarget] = useState<{ taskId: string; processId: string } | null>(null);

  const completedRef = useRef<Set<string>>(new Set());
  const attemptRef = useRef<Map<string, number>>(new Map());
  const fetchSet = useRef<Set<string>>(new Set());

  const [autoLoadingIds, setAutoLoadingIds] = useState<Record<string, boolean>>({});

  const tasks = useMemo(() => (draft.tasks ?? []), [draft.tasks]);

  const procSig = useMemo(() => {
    return tasks.map(t => `${t.id}|${norm(t.title)}|` + (t.processes ?? []).map(p => `${p.id}:${norm(p.title)}`).join(',')).join('||');
  }, [tasks]);

  const targetTask = useMemo(() => tasks.find((t) => t.id === target?.taskId) ?? null, [tasks, target]);
  const targetProc = useMemo(() => (targetTask?.processes ?? []).find((p) => p.id === target?.processId) ?? null, [targetTask, target]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      tasks_len: tasks.length,
    });
  }, [tasks.length]);

  // ✅ GA: 모달 열기 핸들러
  const openModal = (taskId: string, processId: string, processTitle?: string) => {
    track(gaEvent(GA_CTX, 'OpenHazardModal'), {
        ui_id: gaUiId(GA_CTX, 'OpenHazardModal'),
        task_id: taskId,
        process_id: processId,
        process_title: processTitle
    });
    setTarget({ taskId, processId });
    setModalOpen(true);
  };

  // ✅ GA: 위험요인 추가 핸들러
  const addHazard = (title: string) => {
    const v = norm(title);
    if (!v || !target) return;

    track(gaEvent(GA_CTX, 'AddHazard'), {
        ui_id: gaUiId(GA_CTX, 'AddHazard'),
        task_id: target.taskId,
        process_id: target.processId,
        hazard_title: v
    });

    setDraft((prev) => ({
      ...prev,
      tasks: (prev.tasks ?? []).map((t) => {
        if (t.id !== target.taskId) return t;
        return {
          ...t,
          processes: (t.processes ?? []).map((p) => {
            if (p.id !== target.processId) return p;
            const exists = new Set((p.hazards ?? []).map((h: any) => norm(h.title)));
            if (exists.has(v)) return p;
            return {
              ...p,
              hazards: [...(p.hazards ?? []), { id: uid(), title: v, likelihood: DEFAULT_L, severity: DEFAULT_S, controls: '' }],
            };
          }),
        };
      }),
    }));
  };

  // ✅ GA: 위험요인 삭제 핸들러
  const removeChip = (taskId: string, processId: string, hazardId: string, hazardTitle: string) => {
    track(gaEvent(GA_CTX, 'RemoveHazard'), {
        ui_id: gaUiId(GA_CTX, 'RemoveHazard'),
        task_id: taskId,
        process_id: processId,
        hazard_title: hazardTitle
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

  // =======================================================
  // ✅ [로직 유지] 전역 로딩(setIsAnalyzing) 연동
  // =======================================================
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const activeScopeKeys: string[] = [];

    const runAutoFill = async () => {
      const targetsToFetch: Array<any> = [];
      const cacheUpdates: Record<string, HazardCacheItem[]> = {};

      for (const t of tasks) {
        const processName = norm(t.title);
        if (!processName) continue;

        for (const p of t.processes ?? []) {
          const subProcess = norm(p.title);
          if (!subProcess) continue;

          const uiKey = `${t.id}:${p.id}`;
          const ck = cacheKey(user?.email, processName, subProcess);
          const scopeKey = `${uiKey}|${ck}`;

          if ((p.hazards ?? []).length > 0) {
            completedRef.current.add(scopeKey);
            continue;
          }

          if (completedRef.current.has(scopeKey)) continue;
          if (fetchSet.current.has(scopeKey)) continue;

          const last = attemptRef.current.get(scopeKey);
          if (last && Date.now() - last < RETRY_COOLDOWN_MS) continue;

          let cached = safeReadCache(ck);
          if (!cached && user?.email) cached = safeReadCache(cacheKey(null, processName, subProcess));

          if (cached) {
            cacheUpdates[uiKey] = cached.hazards;
            completedRef.current.add(scopeKey);
          } else {
            targetsToFetch.push({ t, p, processName, subProcess, ck, scopeKey, uiKey });
          }
        }
      }

      // 1. 캐시 데이터 업데이트
      if (Object.keys(cacheUpdates).length > 0) {
        if (!signal.aborted) {
          setDraft((prev) => ({
            ...prev,
            tasks: prev.tasks.map((t) => ({
              ...t,
              processes: t.processes.map((p) => {
                const key = `${t.id}:${p.id}`;
                const items = cacheUpdates[key];
                if (!items) return p;
                const next = [...(p.hazards ?? [])];
                const exists = new Set(next.map(h => norm(h.title)));
                items.forEach(h => {
                  const title = norm(h.title);
                  if (!exists.has(title)) {
                    next.push({ id: uid(), title, likelihood: h.likelihood || DEFAULT_L, severity: h.severity || DEFAULT_S, controls: h.controls || '' });
                    exists.add(title);
                  }
                });
                return { ...p, hazards: next };
              })
            }))
          }));
        }
      }

      if (targetsToFetch.length === 0) {
        if (!signal.aborted) {
          setAutoLoadingIds({});
          setIsAnalyzing(false); 
        }
        return;
      }

      // 🚀 [중요] 분석 시작: 전역 로딩 ON
      setIsAnalyzing(true);

      // 2. 개별 로딩 상태 ON
      const loadingState: Record<string, boolean> = {};
      targetsToFetch.forEach(({ scopeKey, uiKey }) => {
        loadingState[uiKey] = true;
        fetchSet.current.add(scopeKey);
        activeScopeKeys.push(scopeKey);
        attemptRef.current.set(scopeKey, Date.now());
      });
      if (!signal.aborted) setAutoLoadingIds((prev) => ({ ...prev, ...loadingState }));

      try {
        // 3. API 호출
        await Promise.all(
          targetsToFetch.map(async ({ processName, subProcess, ck, scopeKey, uiKey }) => {
            if (signal.aborted) return;
            try {
              const qs = new URLSearchParams({ endpoint: 'risk-situations', process_name: processName, sub_process: subProcess, limit: '80' });
              const res = await fetch(`/api/risk-assessment?${qs.toString()}`, { cache: 'no-store', signal });
              
              if (!res.ok) throw new Error('API Error');
              const raw = await res.json();
              const items = extractItems(raw);

              if (items.length > 0) {
                if (!signal.aborted) {
                  setDraft((prev) => ({
                    ...prev,
                    tasks: prev.tasks.map((t) => ({
                      ...t,
                      processes: t.processes.map((p) => {
                        if (`${t.id}:${p.id}` !== uiKey) return p;
                        const next = [...(p.hazards ?? [])];
                        const exists = new Set(next.map(h => norm(h.title)));
                        items.forEach(title => {
                          if (!exists.has(title)) {
                            next.push({ id: uid(), title, likelihood: DEFAULT_L, severity: DEFAULT_S, controls: '' });
                            exists.add(title);
                          }
                        });
                        return { ...p, hazards: next };
                      })
                    }))
                  }));
                  // 개별 로딩 끄기
                  setAutoLoadingIds((prev) => {
                    const next = { ...prev };
                    delete next[uiKey];
                    return next;
                  });
                }
                completedRef.current.add(scopeKey);
                safeWriteCache(ck, {
                  v: 2, ts: Date.now(), user: norm(user?.email) || 'guest',
                  processName, subProcess,
                  hazards: items.map(title => ({ id: uid(), title, likelihood: DEFAULT_L, severity: DEFAULT_S, controls: '' }))
                });
              }
            } catch (e: any) {
              if (e.name !== 'AbortError') console.error(e);
            } finally {
              fetchSet.current.delete(scopeKey);
            }
          })
        );
      } finally {
        // 🏁 [중요] 모든 분석 종료: 전역 로딩 OFF
        setIsAnalyzing(false);
      }
    };

    runAutoFill();

    return () => {
      controller.abort();
      setIsAnalyzing(false); 
      activeScopeKeys.forEach(key => {
        fetchSet.current.delete(key);
        attemptRef.current.delete(key);
      });
    };
  }, [procSig, user?.email, setIsAnalyzing]);

  return (
    <div className={s.wrap}>
      <div className={s.topNote}>공정별로 유해·위험요인을 추가해 주세요. (DB/캐시에 있으면 자동으로 채워집니다)</div>

      {tasks.map((t) => (
        <div key={t.id} className={s.taskBlock}>
          <div className={s.taskTitle}>{t.title || '(작업명 미입력)'}</div>

          {(t.processes ?? []).length === 0 ? (
            <div className={s.empty}>공정이 없습니다. 이전 단계에서 공정을 먼저 추가해 주세요.</div>
          ) : (
            (t.processes ?? []).map((p) => {
              const uiKey = `${t.id}:${p.id}`;
              const hazards = Array.isArray(p.hazards) ? p.hazards : [];
              const isLoading = !!autoLoadingIds[uiKey];

              return (
                <div key={p.id} className={s.procBlock}>
                  <div className={s.procHead}>
                    <div className={s.procTitle}>{p.title}</div>
                    {/* ✅ GA: 위험요인 추가 모달 버튼 */}
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className={s.addBtn}
                      onClick={() => openModal(t.id, p.id, p.title)}
                      data-ga-event="OpenHazardModal"
                      data-ga-id={gaUiId(GA_CTX, 'OpenHazardModal')}
                      data-ga-label={p.title}
                    >
                      <Plus size={14} className="mr-1" /> 위험요인 추가
                    </Button>
                  </div>

                  <div className={s.chips}>
                    {isLoading && (
                      <div className={s.loadingBox}>
                        <RefreshCw size={14} className="animate-spin text-purple-500" />
                        <span>위험요인을 불러오는 중...</span>
                      </div>
                    )}

                    {!isLoading && hazards.length === 0 && (
                      <div className={s.emptyBox}>
                        아직 위험요인이 없습니다.
                      </div>
                    )}

                    {hazards.map((h: any) => (
                      <div key={h.id} className={s.chip}>
                        <AlertTriangle size={14} className="text-red-500 mr-1.5" />
                        {h.title}
                        {/* ✅ GA: 위험요인 삭제 버튼 */}
                        <button 
                          className={s.removeBtn}
                          onClick={() => removeChip(t.id, p.id, h.id, h.title)}
                          data-ga-event="RemoveHazard"
                          data-ga-id={gaUiId(GA_CTX, 'RemoveHazard')}
                          data-ga-label={h.title}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ))}

      <AddHazardModal
        open={modalOpen}
        taskTitle={targetTask?.title || ''}
        processTitle={targetProc?.title || ''}
        onClose={() => setModalOpen(false)}
        onAdd={(v) => addHazard(v)}
      />
    </div>
  );
}