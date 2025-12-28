// components/risk-assessment/steps/StepProcesses.tsx
import React, { useMemo, useState } from 'react';
import s from './StepProcesses.module.css';
import AddItemSheet from '../ui/AddItemSheet';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

const SUGGEST_PROCESSES = [
  '절단/절삭',
  '가공(밀링/선반)',
  '세척/탈지',
  '조립/체결',
  '검사/측정',
  '포장/적재',
];

export default function StepProcesses({ draft, setDraft }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [targetTaskId, setTargetTaskId] = useState<string | null>(null);

  const tasks = useMemo(() => draft.tasks, [draft.tasks]);

  const openSheet = (taskId: string) => {
    setTargetTaskId(taskId);
    setSheetOpen(true);
  };

  const addProcess = (title: string) => {
    const v = title.trim();
    if (!v || !targetTaskId) return;

    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== targetTaskId) return t;
        return {
          ...t,
          processes: [...t.processes, { id: uid(), title: v, hazards: [] }],
        };
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

  return (
    <div className={s.wrap}>
      <div className={s.topNote}>작업별로 공정을 추가해 주세요.</div>

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
              <div className={s.empty}>아직 공정이 없습니다. “공정 추가”를 눌러 주세요.</div>
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
      />
    </div>
  );
}
