// components/risk-assessment/steps/StepProcesses.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import s from './StepProcesses.module.css';
import AddProcessModal from '../ui/AddProcessModal';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';
import { Button } from '@/app/components/ui/button';
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'RiskAssessmentProcesses' } as const;

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
  minorCategory?: string | null;
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const norm = (v?: string | null) => (v ?? '').trim();
const minorScope = (v?: string | null) => (norm(v) ? norm(v) : 'ALL');

const CACHE_PREFIX = 'regai:risk:stepProcesses:v2';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180;
const RETRY_COOLDOWN_MS = 1000 * 20;

type ProcessCache = {
  v: 2;
  ts: number;
  user: string;
  processName: string;
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
  } catch { /* ignore */ }
}

function extractItems(payload: any): string[] {
  const arr =
    Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.items)
        ? payload.items
        : Array.isArray(payload?.sub_processes)
          ? payload.sub_processes
          : [];

  return Array.from(new Set(arr.map((x: any) => (typeof x === 'string' ? x : x?.title ?? x?.name ?? '')).map(norm).filter(Boolean)));
}

export default function StepProcesses({ draft, setDraft, minorCategory }: Props) {
  const user = useUserStore((st) => st.user);
  const mc = minorScope(minorCategory);

  const [modalOpen, setModalOpen] = useState(false);
  const [targetTaskId, setTargetTaskId] = useState<string | null>(null);
  const [autoLoadingIds, setAutoLoadingIds] = useState<Record<string, boolean>>({});

  const completedRef = useRef<Set<string>>(new Set());
  const attemptRef = useRef<Map<string, number>>(new Map());
  const fetchSet = useRef<Set<string>>(new Set());

  const tasks = useMemo(() => draft.tasks ?? [], [draft.tasks]);
  const targetTask = useMemo(() => tasks.find((t) => t.id === targetTaskId) ?? null, [tasks, targetTaskId]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      minor: mc,
      tasks_len: tasks.length,
    });
  }, []);

  const openSheet = (taskId: string) => {
    setTargetTaskId(taskId);
    setModalOpen(true);
  };

  const addProcess = (taskId: string, title: string) => {
    const v = norm(title);
    if (!v) return;
    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const cur = t.processes ?? [];
        if (cur.some(p => norm(p.title) === v)) return t;
        return { ...t, processes: [...cur, { id: uid(), title: v, hazards: [] }] };
      }),
    }));
  };

  const removeProcess = (taskId: string, processId: string) => {
    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        return { ...t, processes: (t.processes ?? []).filter(p => p.id !== processId) };
      }),
    }));
  };

  // =======================================================
  // ✅ [최종 수정] 쿨다운 초기화 포함 로직
  // =======================================================
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    
    // 현재 이펙트에서 건드린 키들을 추적 (Cleanup 때 쓰기 위함)
    const activeScopeKeys: string[] = [];
    const effectId = Math.random().toString(36).slice(2, 6); // 로그 식별용

    const runAutoFill = async () => {
      const tasksToFetch: Array<{ t: typeof tasks[0], ck: string, scopeKey: string }> = [];
      const cacheUpdates: Record<string, string[]> = {}; 

      console.log(`[${effectId}] Run AutoFill Start. Tasks: ${tasks.length}`);

      for (const t of tasks) {
        const processName = norm(t.title);
        if (!processName) continue;

        if ((t.processes ?? []).length > 0) {
          const ck = cacheKey(user?.email, processName, mc);
          completedRef.current.add(`${t.id}|${ck}`);
          continue;
        }

        const ck = cacheKey(user?.email, processName, mc);
        const scopeKey = `${t.id}|${ck}`;

        if (completedRef.current.has(scopeKey)) continue;
        if (fetchSet.current.has(scopeKey)) continue;
        
        // 쿨다운 체크
        const last = attemptRef.current.get(scopeKey);
        if (last && Date.now() - last < RETRY_COOLDOWN_MS) {
          console.log(`[${effectId}] Skip Cooldown: ${t.title}`);
          continue;
        }

        let cached = safeReadCache(ck);
        if (!cached && user?.email) cached = safeReadCache(cacheKey(null, processName, mc));

        if (cached) {
          cacheUpdates[t.id] = cached.subProcesses;
          completedRef.current.add(scopeKey);
        } else {
          tasksToFetch.push({ t, ck, scopeKey });
        }
      }

      // 캐시 업데이트
      if (Object.keys(cacheUpdates).length > 0) {
        if (signal.aborted) return;
        console.log(`[${effectId}] Apply Cache:`, Object.keys(cacheUpdates));
        setDraft((prev) => ({
          ...prev,
          tasks: prev.tasks.map((t) => {
            const items = cacheUpdates[t.id];
            if (!items) return t;
            const cur = t.processes ?? [];
            const exists = new Set(cur.map((p) => norm(p.title)));
            const next = [...cur];
            items.forEach((title) => {
              if (!exists.has(title)) {
                next.push({ id: uid(), title, hazards: [] });
                exists.add(title);
              }
            });
            return { ...t, processes: next };
          }),
        }));
      }

      if (tasksToFetch.length === 0) {
        console.log(`[${effectId}] Nothing to fetch.`);
        // ★ 중요: 할 게 없으면 로딩이 켜져있을 수도 있으니(이전 렌더에서 넘어온 state) 확실히 끔
        if (!signal.aborted) {
           setAutoLoadingIds((prev) => {
             // 혹시 켜져있는게 있다면 끔
             if (Object.keys(prev).length === 0) return prev;
             return {}; 
           });
        }
        return;
      }

      // 로딩 켜기
      const loadingState: Record<string, boolean> = {};
      tasksToFetch.forEach(({ t, scopeKey }) => {
        loadingState[t.id] = true;
        fetchSet.current.add(scopeKey);
        attemptRef.current.set(scopeKey, Date.now()); // 쿨다운 기록
        activeScopeKeys.push(scopeKey); // 추적
      });
      
      if (!signal.aborted) {
        console.log(`[${effectId}] Loading ON`, loadingState);
        setAutoLoadingIds((prev) => ({ ...prev, ...loadingState }));
      }

      const fetchedResults: Record<string, string[]> = {};

      await Promise.all(
        tasksToFetch.map(async ({ t, ck, scopeKey }) => {
          if (signal.aborted) return;
          try {
            console.log(`[${effectId}] Fetching API... ${t.title}`);
            const processName = norm(t.title);
            const qs = new URLSearchParams({
              endpoint: 'sub-processes',
              process_name: processName,
              limit: '50',
              ...(norm(minorCategory) ? { minor: norm(minorCategory) } : {}),
            });

            const res = await fetch(`/api/risk-assessment?${qs.toString()}`, { 
                cache: 'no-store',
                signal 
            });
            
            if (!res.ok) throw new Error(`API Error ${res.status}`);

            const raw = await res.json();
            const items = extractItems(raw);

            if (items.length > 0) {
              fetchedResults[t.id] = items;
              completedRef.current.add(scopeKey);
              safeWriteCache(ck, {
                v: 2,
                ts: Date.now(),
                user: norm(user?.email) || 'guest',
                processName,
                minorCategory: mc,
                subProcesses: items,
              });
            }
          } catch (e: any) {
            if (e.name !== 'AbortError') {
                console.error(`[${effectId}] Error:`, e);
            }
          } finally {
             fetchSet.current.delete(scopeKey);
          }
        })
      );

      if (signal.aborted) return;

      // 로딩 끄기 (setDraft보다 먼저!)
      console.log(`[${effectId}] Loading OFF`);
      setAutoLoadingIds((prev) => {
        const next = { ...prev };
        tasksToFetch.forEach(({ t }) => delete next[t.id]);
        return next;
      });

      // 데이터 반영
      if (Object.keys(fetchedResults).length > 0) {
        setDraft((prev) => {
          const newTasks = prev.tasks.map((t) => {
            const items = fetchedResults[t.id];
            if (!items) return t;
            const cur = t.processes ?? [];
            const exists = new Set(cur.map((p) => norm(p.title)));
            const next = [...cur];
            items.forEach((title) => {
              if (!exists.has(title)) {
                next.push({ id: uid(), title, hazards: [] });
                exists.add(title);
              }
            });
            return { ...t, processes: next };
          });
          return { ...prev, tasks: newTasks };
        });
      }
    };

    runAutoFill();

    // 3. Cleanup: 리렌더링/언마운트 시 실행
    return () => {
        console.log(`[${effectId}] Cleanup (Abort & Clear)`);
        controller.abort();
        
        // ★ 핵심: 취소된 요청들의 '실행중 깃발(fetchSet)'과 '쿨다운 기록(attemptRef)'을 모두 삭제
        activeScopeKeys.forEach(key => {
            fetchSet.current.delete(key);
            attemptRef.current.delete(key); // 이게 없으면 재시도시 쿨다운에 걸림!
        });
    };
  }, [tasks, user?.email, minorCategory, mc]);

  return (
    <div className={s.container}>
      <div className={s.headerDesc}>
        작업별로 <b>세부 공정</b>을 정의합니다. (DB에 데이터가 있으면 자동으로 채워집니다)
      </div>

      <div className={s.taskList}>
        {tasks.map((t) => {
          const procs = Array.isArray(t.processes) ? t.processes : [];
          const isLoading = !!autoLoadingIds[t.id]; 

          return (
            <div key={t.id} className={s.taskBlock}>
              <div className={s.taskHeader}>
                <span className={s.taskTitle}>{t.title}</span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className={s.addBtn}
                  onClick={() => openSheet(t.id)}
                >
                  <Plus size={14} className="mr-1" /> 공정 추가
                </Button>
              </div>

              <div className={s.procList}>
                {isLoading && (
                  <div className={s.loadingBox}>
                    <RefreshCw size={14} className="animate-spin text-purple-500" />
                    <span>공정을 불러오는 중...</span>
                  </div>
                )}

                {!isLoading && procs.length === 0 && (
                  <div className={s.emptyBox}>
                    등록된 공정이 없습니다. '공정 추가' 버튼을 눌러주세요.
                  </div>
                )}

                {procs.map((p) => (
                  <div key={p.id} className={s.chip}>
                    {p.title}
                    <button 
                      className={s.removeBtn}
                      onClick={() => removeProcess(t.id, p.id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <AddProcessModal 
          open={true} // 항상 true 전달
          taskTitle={targetTask?.title || ''}
          minorCategory={minorCategory}
          onClose={() => setModalOpen(false)}
          onAdd={(title) => {
            if (targetTaskId) addProcess(targetTaskId, title);
          }}
        />
      )}
    </div>
  );
}