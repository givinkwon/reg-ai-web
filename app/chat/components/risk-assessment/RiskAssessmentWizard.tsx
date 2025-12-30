'use client';

import React, { useEffect, useMemo, useState } from 'react';
import s from './RiskAssessmentWizard.module.css';

import StepTasks from './steps/StepTasks';
import StepProcesses from './steps/StepProcesses';
import StepHazards from './steps/StepHazards';
import StepControls from './steps/StepControls';

export type RiskLevel = 1 | 2 | 3 | 4 | 5;

export type HazardItem = {
  id: string;
  title: string;
  likelihood: RiskLevel;
  severity: RiskLevel;
  controls: string;
};

export type ProcessItem = {
  id: string;
  title: string;
  hazards: HazardItem[];
};

export type TaskItem = {
  id: string;
  title: string;
  processes: ProcessItem[];
};

export type RiskAssessmentDraft = {
  meta: {
    siteName: string;
    dateISO: string; // YYYY-MM-DD
  };
  tasks: TaskItem[];
};

type StepId = 'tasks' | 'processes' | 'hazards' | 'controls';

type Props = {
  onClose?: () => void;
  onSubmit: (draft: RiskAssessmentDraft) => void;
};

const INITIAL_DRAFT: RiskAssessmentDraft = {
  meta: { siteName: '', dateISO: '' },
  tasks: [], // ✅ 빈 배열 시작
};

const TAB_LABELS: { id: StepId; label: string; helper: string }[] = [
  { id: 'tasks', label: '작업 파악', helper: '작업 단위를 먼저 정리합니다.' },
  { id: 'processes', label: '공정 파악', helper: '작업별 공정을 세분화합니다.' },
  { id: 'hazards', label: '유해·위험요인', helper: '공정별 위험요인을 추가합니다.' },
  { id: 'controls', label: '판단·감소대책', helper: '가능성/중대성 및 대책을 작성합니다.' },
];

function todayISOClient() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

export function draftToPrompt(draft: RiskAssessmentDraft) {
  const lines: string[] = [];
  lines.push('[위험성 평가 요청]');
  lines.push(`- 현장/설비: ${draft.meta.siteName || '(미입력)'}`);
  lines.push(`- 평가일: ${draft.meta.dateISO || '(미입력)'}`);
  lines.push('');

  if (draft.tasks.length === 0) {
    lines.push('## 작업: (미선택)');
    lines.push('');
  }

  draft.tasks.forEach((t, ti) => {
    lines.push(`## 작업 ${ti + 1}. ${t.title || '(미입력)'}`);
    if (t.processes.length === 0) {
      lines.push('- 공정: (미입력)');
      lines.push('');
      return;
    }
    t.processes.forEach((p, pi) => {
      lines.push(`- 공정 ${ti + 1}.${pi + 1}: ${p.title || '(미입력)'}`);
      if (p.hazards.length === 0) {
        lines.push('  - 유해·위험요인: (미입력)');
      } else {
        p.hazards.forEach((h, hi) => {
          const score = h.likelihood * h.severity;
          lines.push(
            `  - 요인 ${hi + 1}: ${h.title} (가능성 ${h.likelihood}, 중대성 ${h.severity}, 점수 ${score})`,
          );
          if (h.controls?.trim()) lines.push(`    - 감소대책: ${h.controls.trim()}`);
        });
      }
    });
    lines.push('');
  });

  lines.push('요청: 위 정보를 기반으로 위험성 판단(등급화) 및 감소대책을 정리하고, 보고서 형식으로 작성해줘.');
  return lines.join('\n');
}

export default function RiskAssessmentWizard({ onClose, onSubmit }: Props) {
  const [step, setStep] = useState<StepId>('tasks');
  const [draft, setDraft] = useState<RiskAssessmentDraft>(INITIAL_DRAFT);

  // ✅ Wizard에서 소분류를 이미 알고 있다면 여기서 세팅해서 StepTasks로 내려주면 됨
  const [minor, setMinor] = useState<string>('');

  useEffect(() => {
    // 날짜 세팅 (hydration 안정)
    setDraft((prev) => {
      if (prev.meta.dateISO) return prev;
      return { ...prev, meta: { ...prev.meta, dateISO: todayISOClient() } };
    });

    // 예시: localStorage에서 소분류 가져오기(키는 프로젝트에 맞게 조정)
    try {
      const v = localStorage.getItem('risk_minor_category') || '';
      if (v.trim()) setMinor(v.trim());
    } catch {}
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const canGoNext = useMemo(() => {
    if (step === 'tasks') return draft.tasks.length > 0;
    if (step === 'processes') return draft.tasks.some((t) => t.processes.length > 0);
    if (step === 'hazards') return draft.tasks.some((t) => t.processes.some((p) => p.hazards.length > 0));
    return true;
  }, [draft, step]);

  const goNext = () => {
    const idx = TAB_LABELS.findIndex((t) => t.id === step);
    const next = TAB_LABELS[idx + 1]?.id;
    if (next) setStep(next);
  };

  const goPrev = () => {
    const idx = TAB_LABELS.findIndex((t) => t.id === step);
    const prev = TAB_LABELS[idx - 1]?.id;
    if (prev) setStep(prev);
  };

  return (
    <div className={s.wrap}>
      <div className={s.header}>
        <div className={s.headerText}>
          <div className={s.title}>REG AI가 위험성 평가를 도와드려요.</div>
          <div className={s.subTitle}>단계별로 평가 요소를 도와드릴게요</div>
        </div>

        {onClose ? (
          <button className={s.closeBtn} onClick={onClose} aria-label="닫기">
            ×
          </button>
        ) : null}
      </div>

      <div className={s.tabs}>
        {TAB_LABELS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`${s.tab} ${step === t.id ? s.tabActive : ''}`}
            onClick={() => setStep(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={s.helper}>{TAB_LABELS.find((t) => t.id === step)?.helper}</div>

      <div className={s.content}>
        {step === 'tasks' && <StepTasks draft={draft} setDraft={setDraft} minor={minor} />}
        {step === 'processes' && <StepProcesses draft={draft} setDraft={setDraft} />}
        {step === 'hazards' && <StepHazards draft={draft} setDraft={setDraft} />}
        {step === 'controls' && <StepControls draft={draft} setDraft={setDraft} />}
      </div>

      <div className={s.footer}>
        <div className={s.navRow}>
          <button className={s.navBtn} onClick={goPrev} disabled={step === 'tasks'}>
            이전
          </button>

          {step !== 'controls' ? (
            <button className={s.navBtnPrimary} onClick={goNext} disabled={!canGoNext}>
              다음
            </button>
          ) : (
            <button className={s.navBtnPrimary} onClick={() => onSubmit(draft)}>
              위험성 평가 보고서 생성
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
