// components/risk-assessment/steps/StepProcesses.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, RefreshCw, X } from 'lucide-react';
import s from './StepProcesses.module.css';
import AddProcessModal from '../ui/AddProcessModal'; // ✅ AddItemSheet 대신 AddProcessModal 사용
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';
import { Button } from '@/app/components/ui/button';

// ✅ GA
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

// =========================
// ✅ Cache Logic
// =========================
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

// ✅ API 응답 정규화 함수
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
  const userEmail = (user?.email ?? '').trim();
  const mc = minorScope(minorCategory);

  const [modalOpen, setModalOpen] = useState(false);
  const [targetTaskId, setTargetTaskId] = useState<string | null>(null);

  // ✅ 로딩 상태 (taskId -> boolean)
  const [autoLoadingIds, setAutoLoadingIds] = useState<Record<string, boolean>>({});

  // ✅ 중복 실행 방지용 Refs
  const completedRef = useRef<Set<string>>(new Set());
  const attemptRef = useRef<Map<string, number>>(new Map());
  const fetchSet = useRef<Set<string>>(new Set()); // 현재 실행 중인 fetch 추적

  const tasks = useMemo(() => draft.tasks ?? [], [draft.tasks]);
  const targetTask = useMemo(() => tasks.find((t) => t.id === targetTaskId) ?? null, [tasks, targetTaskId]);

  // ✅ GA View
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
  // ✅ [수정된 핵심 로직] 자동 채움 (Batch Fetching)
  // =======================================================
  useEffect(() => {
    let isMounted = true;

    const runAutoFill = async () => {
      // 1. 데이터를 가져와야 할 Task 식별
      const tasksToFetch: Array<{ t: typeof tasks[0], ck: string, scopeKey: string }> = [];
      const cacheUpdates: Record<string, string[]> = {}; 

      for (const t of tasks) {
        const processName = norm(t.title);
        if (!processName) continue;

        // 이미 공정이 있으면 완료 처리
        if ((t.processes ?? []).length > 0) {
          const ck = cacheKey(user?.email, processName, mc);
          const scopeKey = `${t.id}|${ck}`;
          completedRef.current.add(scopeKey);
          continue;
        }

        const ck = cacheKey(user?.email, processName, mc);
        const scopeKey = `${t.id}|${ck}`;

        // 이미 완료했거나, 쿨다운 중이거나, 현재 Fetch 중이면 스킵
        if (completedRef.current.has(scopeKey)) continue;
        if (fetchSet.current.has(scopeKey)) continue; // ✅ 중복 Fetch 방지
        const last = attemptRef.current.get(scopeKey);
        if (last && Date.now() - last < RETRY_COOLDOWN_MS) continue;

        // 1-1. 캐시 확인
        let cached = safeReadCache(ck);
        if (!cached && user?.email) cached = safeReadCache(cacheKey(null, processName, mc));

        if (cached) {
          cacheUpdates[t.id] = cached.subProcesses;
          completedRef.current.add(scopeKey);
        } else {
          // 1-2. API 호출 대상 목록에 추가
          tasksToFetch.push({ t, ck, scopeKey });
        }
      }

      // 2. 캐시 데이터가 있으면 즉시 업데이트 (API 호출과 무관하게)
      if (Object.keys(cacheUpdates).length > 0) {
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

      if (tasksToFetch.length === 0) return;

      // 3. 로딩 상태 켜기
      const loadingState: Record<string, boolean> = {};
      tasksToFetch.forEach(({ t, scopeKey }) => {
        loadingState[t.id] = true;
        fetchSet.current.add(scopeKey); // ✅ Fetching 마킹
        attemptRef.current.set(scopeKey, Date.now());
      });
      
      if(isMounted) {
        setAutoLoadingIds((prev) => ({ ...prev, ...loadingState }));
      }

      // 4. 병렬 API 호출 (Promise.all)
      const fetchedResults: Record<string, string[]> = {};

      await Promise.all(
        tasksToFetch.map(async ({ t, ck, scopeKey }) => {
          if (!isMounted) return;
          try {
            const processName = norm(t.title);
            const qs = new URLSearchParams({
              endpoint: 'sub-processes',
              process_name: processName,
              limit: '50',
              ...(norm(minorCategory) ? { minor: norm(minorCategory) } : {}),
            });

            // ✅ API 호출
            const res = await fetch(`/api/risk-assessment?${qs.toString()}`, { cache: 'no-store' });
            
            if (!res.ok) throw new Error(`API Error ${res.status}`);

            const raw = await res.json();
            const items = extractItems(raw);

            if (items.length > 0) {
              fetchedResults[t.id] = items;
              completedRef.current.add(scopeKey);
              
              // 캐시 저장
              safeWriteCache(ck, {
                v: 2,
                ts: Date.now(),
                user: norm(user?.email) || 'guest',
                processName,
                minorCategory: mc,
                subProcesses: items,
              });
            }
          } catch (e) {
            console.error(`[StepProcesses] Error for ${t.title}:`, e);
          } finally {
             // FetchSet 해제는 마지막에 일괄적으로 하거나 여기서 해도 됨
             fetchSet.current.delete(scopeKey);
          }
        })
      );

      // 5. [API 결과 반영 (일괄 업데이트)]
      if (isMounted && Object.keys(fetchedResults).length > 0) {
        setDraft((prev) => {
          // 불변성 유지하며 새 객체 생성
          const newTasks = prev.tasks.map((t) => {
            const items = fetchedResults[t.id];
            if (!items) return t; // 변경 없는 Task는 그대로 반환

            const cur = t.processes ?? [];
            const exists = new Set(cur.map((p) => norm(p.title)));
            const next = [...cur]; // 기존 공정 복사

            // 중복 없이 새 공정 추가
            items.forEach((title) => {
              if (!exists.has(title)) {
                next.push({ id: uid(), title, hazards: [] });
                exists.add(title);
              }
            });

            // ✅ 프로세스가 변경된 새로운 Task 객체 반환
            return { ...t, processes: next };
          });

          return { ...prev, tasks: newTasks };
        });
      }

      // 6. [로딩 상태 끄기 (무조건 실행)]
      if (isMounted) {
        // 약간의 딜레이를 주어 상태 업데이트 충돌 방지 (선택 사항)
        setTimeout(() => {
            setAutoLoadingIds((prev) => {
            const next = { ...prev };
            tasksToFetch.forEach(({ t }) => delete next[t.id]);
            return next;
            });
        }, 0);
      }
    };

    runAutoFill();

    return () => { isMounted = false; };
  }, [tasks, user?.email, minorCategory, mc]); // ✅ tasks 전체를 deps로 (tasksSig 대신)

  return (
    <div className={s.container}>
      <div className={s.headerDesc}>
        작업별로 <b>세부 공정</b>을 정의합니다. (DB에 데이터가 있으면 자동으로 채워집니다)
      </div>

      <div className={s.taskList}>
        {tasks.map((t) => {
          const procs = Array.isArray(t.processes) ? t.processes : [];
          // ✅ boolean으로 명확히 변환
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
                {/* 로딩 중일 때 */}
                {isLoading && (
                  <div className={s.loadingBox}>
                    <RefreshCw size={14} className="animate-spin text-purple-500" />
                    <span>공정을 불러오는 중...</span>
                  </div>
                )}

                {/* 로딩 끝났는데 데이터가 없을 때 */}
                {!isLoading && procs.length === 0 && (
                  <div className={s.emptyBox}>
                    등록된 공정이 없습니다. '공정 추가' 버튼을 눌러주세요.
                  </div>
                )}

                {/* 데이터가 있을 때 (로딩 중이어도 기존 데이터가 있으면 보여줌) */}
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

      <AddProcessModal 
        open={modalOpen}
        taskTitle={targetTask?.title || ''}
        minorCategory={minorCategory}
        onClose={() => setModalOpen(false)}
        onAdd={(title) => {
          if (targetTaskId) addProcess(targetTaskId, title);
        }}
      />
    </div>
  );
}