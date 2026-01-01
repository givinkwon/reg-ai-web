// components/risk-assessment/steps/StepProcesses.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './StepProcesses.module.css';
import AddItemSheet from '../ui/AddItemSheet';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
  minorCategory?: string | null; // 있으면 정확도↑ (선택)
  // (선택) minorCategory를 여기로도 내려줄 수 있으면 정확도↑
  // minorCategory?: string | null;
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const norm = (v?: string | null) => (v ?? '').trim();

const SUGGEST_PROCESSES = [
  '절단/절삭',
  '가공(밀링/선반)',
  '세척/탈지',
  '조립/체결',
  '검사/측정',
  '포장/적재',
];

export default function StepProcesses({ draft, setDraft, minorCategory }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [targetTaskId, setTargetTaskId] = useState<string | null>(null);

  // ✅ 자동 채우기 가드(한 번 채운 task는 다시 자동 채우지 않음)
  const autoFilledRef = useRef<Set<string>>(new Set()); // taskId set
  const [autoLoadingIds, setAutoLoadingIds] = useState<Record<string, boolean>>({});

  const tasks = useMemo(() => draft.tasks, [draft.tasks]);

  const targetTask = useMemo(
    () => tasks.find((t) => t.id === targetTaskId) ?? null,
    [tasks, targetTaskId]
  );

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

        // ✅ 중복 방지
        const exists = new Set(t.processes.map((p) => norm(p.title)));
        if (exists.has(v)) return t;

        return {
          ...t,
          processes: [...t.processes, { id: uid(), title: v, hazards: [] }],
        };
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
  // ✅ 핵심: process_name(task.title) -> sub_process 자동 추가
  // =========================
  useEffect(() => {
    const run = async () => {
      for (const t of tasks) {
        const processName = norm(t.title);
        if (!processName) continue;

        // 이미 자동 채운 task면 스킵
        if (autoFilledRef.current.has(t.id)) continue;

        // 이미 공정이 수동/이전 단계에서 들어있으면 "자동 채움 완료"로 간주하고 스킵
        if (t.processes && t.processes.length > 0) {
          autoFilledRef.current.add(t.id);
          continue;
        }

        // 로딩 표시
        setAutoLoadingIds((prev) => ({ ...prev, [t.id]: true }));

        try {
          const qs = new URLSearchParams();
          qs.set('endpoint', 'sub-processes');
          qs.set('process_name', processName);
          qs.set('limit', '50');

          // (선택) minor까지 좁히고 싶으면 아래 주석 해제 + Props로 minorCategory 내려주기
          // if (minorCategory) qs.set('minor', minorCategory);

          const res = await fetch(`/api/risk-assessment?${qs.toString()}`, { cache: 'no-store' });
          if (!res.ok) {
            // 실패해도 UX 막지 말고 그냥 넘어감 (수동 추가 가능)
            autoFilledRef.current.add(t.id);
            continue;
          }

          const data = (await res.json()) as { items: string[] };
          const items = (data.items ?? []).map(norm).filter(Boolean);

          // ✅ 자동 추가
          if (items.length > 0) {
            addProcessesBulk(t.id, items);
          }

          // 이 task는 자동 채움 완료로 처리
          autoFilledRef.current.add(t.id);
        } catch {
          autoFilledRef.current.add(t.id);
        } finally {
          setAutoLoadingIds((prev) => ({ ...prev, [t.id]: false }));
        }
      }
    };

    run();
    // tasks가 바뀔 때마다 "새 task"만 자동 적용됨 (autoFilledRef로 가드)
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={s.wrap}>
      <div className={s.topNote}>작업별로 공정을 추가해 주세요. (DB에 있으면 자동으로 채워집니다)</div>

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
        // ✅✅✅ 여기 추가가 핵심
        searchEndpoint="sub-processes"
        searchParams={{
          // task.title == process_name (DB의 process_name)
          // process_name: norm(targetTask?.title),
          // minor: norm(minorCategory),
        }}
        minChars={1}
        debounceMs={180}
        searchLimit={50}
      />
    </div>
  );
}
