// components/risk-assessment/steps/StepTasks.tsx
import React, { useMemo, useState } from 'react';
import s from './StepTasks.module.css';
import AddItemSheet from '../ui/AddItemSheet';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

const SUGGEST_TASKS = [
  'CNC 가공 작업',
  '용접/절단 작업',
  '지게차 상·하차 작업',
  '고소작업대 작업',
  '크레인 양중 작업',
];

export default function StepTasks({ draft, setDraft }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const rows = useMemo(() => draft.tasks, [draft.tasks]);

  const setTitle = (id: string, title: string) => {
    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  };

  const addEmpty = () => {
    setDraft((prev) => ({
      ...prev,
      tasks: [...prev.tasks, { id: uid(), title: '', processes: [] }],
    }));
  };

  const remove = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.filter((t) => t.id !== id),
    }));
  };

  const addTask = (title: string) => {
    const v = title.trim();
    if (!v) return;
    setDraft((prev) => ({
      ...prev,
      tasks: [...prev.tasks, { id: uid(), title: v, processes: [] }],
    }));
  };

  return (
    <div className={s.wrap}>
      <div className={s.sectionHead}>
        <div className={s.sectionTitle}>사전 준비 - 작업 파악</div>
        <button className={s.addBtn} onClick={() => setSheetOpen(true)}>
          작업 추가
        </button>
      </div>

      <div className={s.card}>
        {rows.map((t, idx) => (
          <div key={t.id} className={s.row}>
            <div className={s.no}>#{idx + 1}</div>
            <input
              className={s.input}
              placeholder="예: CNC 가공 작업"
              value={t.title}
              onChange={(e) => setTitle(t.id, e.target.value)}
            />
            <button className={s.delBtn} onClick={() => remove(t.id)} aria-label="삭제">
              ×
            </button>
          </div>
        ))}

        <button className={s.inlineAdd} onClick={addEmpty}>
          + 행 추가
        </button>
      </div>

      <AddItemSheet
        open={sheetOpen}
        title="작업 추가"
        placeholder="추가할 작업명을 입력하세요"
        suggestions={SUGGEST_TASKS}
        onClose={() => setSheetOpen(false)}
        onAdd={(v) => addTask(v)}
      />
    </div>
  );
}
