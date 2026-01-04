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

function cacheKey(userEmail: string | null | undefined, processName: string, minorCategory?: string | null) {
  const u = norm(userEmail) || 'guest';
  const pn = norm(processName);
  const mc = norm(minorCategory);
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

    // ✅ 빈 캐시는 MISS 처리(= 다시 API 타게)
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

/** ✅ 응답이 string[] / {items:...} / {value:...} / 객체배열 등 무엇이든 "문자열 배열"로 정규화 */
function toText(x: any) {
  if (typeof x === 'string') return x;
  if (x && typeof x === 'object') {
    return x.title ?? x.name ?? x.sub_process ?? x.subProcess ?? x.process ?? '';
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
                          : [];

  return Array.from(new Set(arr.map(toText).map(norm).filter(Boolean)));
}

export default function StepProcesses({ draft, setDraft, minorCategory }: Props) {
  const user = useUserStore((st) => st.user);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [targetTaskId, setTargetTaskId] = useState<string | null>(null);

  // ✅ “성공적으로 채운 task”만 완료 처리
  const completedRef = useRef<Set<string>>(new Set());
  // ✅ 실패/빈 응답이어도 연타 방지
  const attemptRef = useRef<Map<string, number>>(new Map());
  const [autoLoadingIds, setAutoLoadingIds] = useState<Record<string, boolean>>({});

  const tasks = useMemo(() => draft.tasks, [draft.tasks]);

  // ✅ effect deps용 시그니처: title 변화/작업 추가삭제만 감지 (processes 변화 제외)
  const tasksSig = useMemo(() => {
    return tasks.map((t) => `${t.id}|${norm(t.title)}`).join('||');
  }, [tasks]);

  // ✅ 캐시 저장용 시그니처: processes 변화까지 감지
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
      tasks: prev.tasks.map((t) => {
        if (t.id !== targetTaskId) return t;

        const exists = new Set(t.processes.map((p) => norm(p.title)));
        if (exists.has(v)) return t;

        return { ...t, processes: [...t.processes, { id: uid(), title: v, hazards: [] }] };
      }),
    }));
  };

  const addProcessesBulk = (taskId: string, titles: string[]) => {
    const uniq = Array.from(new Set(titles.map(norm))).filter(Boolean);
    if (uniq.length === 0) return;

    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;

        const exists = new Set(t.processes.map((p) => norm(p.title)));
        const next = [...t.processes];

        for (const title of uniq) {
          if (exists.has(title)) continue;
          next.push({ id: uid(), title, hazards: [] });
          exists.add(title);
        }

        return { ...t, processes: next };
      }),
    }));
  };

  const removeChip = (taskId: string, processId: string) => {
    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        return { ...t, processes: t.processes.filter((p) => p.id !== processId) };
      }),
    }));
  };

  // =========================
  // ✅ 자동 채움: task.title -> sub_process(distinct)
  // ✅ deps를 tasksSig로(= processes 추가로 effect 재시작/abort 안됨)
  // =========================
  useEffect(() => {
    let cancelled = false;
    const controllers: AbortController[] = [];

    const run = async () => {
      for (const t of tasks) {
        if (cancelled) return;

        const processName = norm(t.title);
        if (!processName) continue;

        // ✅ 이미 성공적으로 채운 task면 스킵
        if (completedRef.current.has(t.id)) continue;

        // ✅ 이미 공정이 들어있으면: 완료로 처리 + 캐시 저장
        if (t.processes && t.processes.length > 0) {
          completedRef.current.add(t.id);
          const ck = cacheKey(user?.email, processName, minorCategory);
          safeWriteCache(ck, {
            v: 2,
            ts: Date.now(),
            user: norm(user?.email) || 'guest',
            processName,
            minorCategory: minorCategory ?? null,
            subProcesses: t.processes.map((p) => norm(p.title)).filter(Boolean),
          });
          continue;
        }

        // ✅ 쿨다운
        const last = attemptRef.current.get(t.id);
        if (last && Date.now() - last < RETRY_COOLDOWN_MS) continue;

        // ✅ 1) 캐시
        const ck = cacheKey(user?.email, processName, minorCategory);
        const cached = safeReadCache(ck);
        if (cached) {
          addProcessesBulk(t.id, cached.subProcesses);
          completedRef.current.add(t.id);
          continue;
        }

        // ✅ 2) API
        attemptRef.current.set(t.id, Date.now());
        setAutoLoadingIds((prev) => ({ ...prev, [t.id]: true }));

        const ac = new AbortController();
        controllers.push(ac);

        try {
          const qs = new URLSearchParams();
          qs.set('endpoint', 'sub-processes');
          qs.set('process_name', processName);
          qs.set('limit', '50');
          if (norm(minorCategory)) qs.set('minor', norm(minorCategory));

          const res = await fetch(`/api/risk-assessment?${qs.toString()}`, {
            cache: 'no-store',
            signal: ac.signal,
          });

          if (!res.ok) continue;

          const raw = await res.json();

          // 🔎 개발 중이면 실제 응답 형태를 꼭 확인
          if (process.env.NODE_ENV !== 'production') {
            console.log('[StepProcesses] sub-processes raw:', raw, 'isArray?', Array.isArray(raw));
          }

          const items = extractItems(raw);

          if (items.length > 0) {
            addProcessesBulk(t.id, items);

            safeWriteCache(ck, {
              v: 2,
              ts: Date.now(),
              user: norm(user?.email) || 'guest',
              processName,
              minorCategory: minorCategory ?? null,
              subProcesses: items,
            });

            completedRef.current.add(t.id);
          }
          // items=0이면 completed 처리 X → 재시도 가능(쿨다운)
        } catch (e: any) {
          if (e?.name === 'AbortError') continue;
        } finally {
          setAutoLoadingIds((prev) => ({ ...prev, [t.id]: false }));
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      controllers.forEach((c) => c.abort());
    };
  }, [tasksSig, user?.email, minorCategory]);

  // =========================
  // ✅ 수동 추가/삭제도 캐시에 반영(0개면 저장 안함)
  //    (processesSig로 바꿔서 실제로 반응하게)
  // =========================
  useEffect(() => {
    for (const t of tasks) {
      const processName = norm(t.title);
      if (!processName) continue;

      const subProcesses = (t.processes ?? []).map((p) => norm(p.title)).filter(Boolean);
      if (subProcesses.length === 0) continue;

      const ck = cacheKey(user?.email, processName, minorCategory);
      safeWriteCache(ck, {
        v: 2,
        ts: Date.now(),
        user: norm(user?.email) || 'guest',
        processName,
        minorCategory: minorCategory ?? null,
        subProcesses,
      });
    }
  }, [processesSig, user?.email, minorCategory]);

  return (
    <div className={s.wrap}>
      <div className={s.topNote}>작업별로 공정을 추가해 주세요. (DB/캐시에 있으면 자동으로 채워집니다)</div>

      {tasks.map((t) => (
        <div key={t.id} className={s.block}>
          <div className={s.blockHead}>
            <div className={s.blockTitle}>{t.title || '(작업명 미입력)'}</div>
            <button className={s.addBtn} onClick={() => openSheet(t.id)}>
              공정 추가
            </button>
          </div>

          <div className={s.chips}>
            {t.processes.length === 0 ? (
              <div className={s.empty}>
                {autoLoadingIds[t.id] ? '공정을 자동으로 불러오는 중…' : '아직 공정이 없습니다. “공정 추가”를 눌러 주세요.'}
              </div>
            ) : (
              t.processes.map((p) => (
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
      ))}

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
