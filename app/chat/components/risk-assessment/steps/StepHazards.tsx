// components/risk-assessment/steps/StepHazards.tsx
import React, { useMemo, useState } from 'react';
import s from './StepHazards.module.css';
import AddItemSheet from '../ui/AddItemSheet';
import type { RiskAssessmentDraft, RiskLevel } from '../RiskAssessmentWizard';

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

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

export default function StepHazards({ draft, setDraft }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<{ taskId: string; processId: string } | null>(null);

  const tasks = useMemo(() => draft.tasks, [draft.tasks]);

  const openSheet = (taskId: string, processId: string) => {
    setTarget({ taskId, processId });
    setSheetOpen(true);
  };

  const addHazard = (title: string) => {
    const v = title.trim();
    if (!v || !target) return;

    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== target.taskId) return t;
        return {
          ...t,
          processes: t.processes.map((p) => {
            if (p.id !== target.processId) return p;
            return {
              ...p,
              hazards: [
                ...p.hazards,
                { id: uid(), title: v, likelihood: DEFAULT_L, severity: DEFAULT_S, controls: '' },
              ],
            };
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
            return { ...p, hazards: p.hazards.filter((h) => h.id !== hazardId) };
          }),
        };
      }),
    }));
  };

  return (
    <div className={s.wrap}>
      <div className={s.topNote}>공정별로 유해·위험요인을 추가해 주세요.</div>

      {tasks.map((t) => (
        <div key={t.id} className={s.taskBlock}>
          <div className={s.taskTitle}>{t.title || '(작업명 미입력)'}</div>

          {t.processes.length === 0 ? (
            <div className={s.empty}>공정이 없어서 위험요인을 추가할 수 없습니다. 이전 단계에서 공정을 먼저 추가해 주세요.</div>
          ) : (
            t.processes.map((p) => (
              <div key={p.id} className={s.procBlock}>
                <div className={s.procHead}>
                  <div className={s.procTitle}>{p.title}</div>
                  <button className={s.addBtn} onClick={() => openSheet(t.id, p.id)}>
                    위험요인 추가
                  </button>
                </div>

                <div className={s.chips}>
                  {p.hazards.length === 0 ? (
                    <div className={s.empty2}>아직 위험요인이 없습니다.</div>
                  ) : (
                    p.hazards.map((h) => (
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
            ))
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
      />
    </div>
  );
}
