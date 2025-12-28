// components/risk-assessment/steps/StepControls.tsx
import React, { useMemo } from 'react';
import s from './StepControls.module.css';
import type { RiskAssessmentDraft, RiskLevel } from '../RiskAssessmentWizard';

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
};

const LEVELS: RiskLevel[] = [1, 2, 3, 4, 5];

function scoreBadge(score: number) {
  if (score >= 16) return '매우 높음';
  if (score >= 9) return '높음';
  if (score >= 4) return '보통';
  return '낮음';
}

export default function StepControls({ draft, setDraft }: Props) {
  const rows = useMemo(() => {
    const out: Array<{
      taskId: string;
      taskTitle: string;
      processId: string;
      processTitle: string;
      hazardId: string;
      hazardTitle: string;
      likelihood: RiskLevel;
      severity: RiskLevel;
      controls: string;
    }> = [];

    draft.tasks.forEach((t) => {
      t.processes.forEach((p) => {
        p.hazards.forEach((h) => {
          out.push({
            taskId: t.id,
            taskTitle: t.title,
            processId: p.id,
            processTitle: p.title,
            hazardId: h.id,
            hazardTitle: h.title,
            likelihood: h.likelihood,
            severity: h.severity,
            controls: h.controls,
          });
        });
      });
    });

    return out;
  }, [draft]);

  const updateHazard = (
    taskId: string,
    processId: string,
    hazardId: string,
    patch: Partial<{ likelihood: RiskLevel; severity: RiskLevel; controls: string }>,
  ) => {
    setDraft((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          processes: t.processes.map((p) => {
            if (p.id !== processId) return p;
            return {
              ...p,
              hazards: p.hazards.map((h) => {
                if (h.id !== hazardId) return h;
                return { ...h, ...patch };
              }),
            };
          }),
        };
      }),
    }));
  };

  return (
    <div className={s.wrap}>
      <div className={s.topNote}>
        위험요인별로 가능성/중대성을 선택하고, 감소대책을 작성해 주세요.
      </div>

      {rows.length === 0 ? (
        <div className={s.empty}>
          아직 위험요인이 없습니다. 이전 단계에서 유해·위험요인을 추가해 주세요.
        </div>
      ) : (
        rows.map((r, idx) => {
          const score = r.likelihood * r.severity;
          return (
            <div key={`${r.hazardId}-${idx}`} className={s.card}>
              <div className={s.head}>
                <div className={s.path}>
                  <span className={s.pathStrong}>{r.taskTitle || '(작업 미입력)'}</span>
                  <span className={s.pathSep}>›</span>
                  <span className={s.pathStrong}>{r.processTitle || '(공정 미입력)'}</span>
                </div>
                <div className={s.badge} data-level={scoreBadge(score)}>
                  점수 {score} · {scoreBadge(score)}
                </div>
              </div>

              <div className={s.hazardTitle}>• {r.hazardTitle}</div>

              <div className={s.grid}>
                <label className={s.field}>
                  <span className={s.label}>가능성</span>
                  <select
                    className={s.select}
                    value={r.likelihood}
                    onChange={(e) =>
                      updateHazard(r.taskId, r.processId, r.hazardId, {
                        likelihood: Number(e.target.value) as RiskLevel,
                      })
                    }
                  >
                    {LEVELS.map((v) => (
                      <option key={v} value={v}>
                        {v}점
                      </option>
                    ))}
                  </select>
                </label>

                <label className={s.field}>
                  <span className={s.label}>중대성</span>
                  <select
                    className={s.select}
                    value={r.severity}
                    onChange={(e) =>
                      updateHazard(r.taskId, r.processId, r.hazardId, {
                        severity: Number(e.target.value) as RiskLevel,
                      })
                    }
                  >
                    {LEVELS.map((v) => (
                      <option key={v} value={v}>
                        {v}점
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className={s.fieldFull}>
                <span className={s.label}>감소대책</span>
                <textarea
                  className={s.textarea}
                  placeholder="예: 가드 설치, 인터록, 작업표준서, PPE, 작업자 교육 등"
                  value={r.controls}
                  onChange={(e) =>
                    updateHazard(r.taskId, r.processId, r.hazardId, {
                      controls: e.target.value,
                    })
                  }
                />
              </label>
            </div>
          );
        })
      )}
    </div>
  );
}
