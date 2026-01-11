'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './RiskAssessmentWizard.module.css';

import StepTasks from './steps/StepTasks';
import StepProcesses from './steps/StepProcesses';
import StepHazards from './steps/StepHazards';
import StepControls from './steps/StepControls';

// ✅ 추가: 진행률 모달
import ProgressDownloadModal from './ui/ProgressDownloadModal';
import { useUserStore } from '@/app/store/user';

export type RiskLevel = 1 | 2 | 3 | 4 | 5;
export type Judgement = '상' | '중' | '하';

export type Hazard = {
  id: string;
  title: string; // risk_situation_result

  likelihood: RiskLevel;
  severity: RiskLevel;

  controls?: string;

  judgement?: Judgement;

  current_controls_items?: string[];
  risk_judgement_reasons?: string[];

  current_control_text?: string; // 현재조치
  judgement_reason_text?: string; // 판단근거
};

export type ProcessItem = {
  id: string;
  title: string; // sub_process
  hazards: Hazard[];
};

export type TaskItem = {
  id: string;
  title: string; // process_name
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

  // ✅ 그대로 유지: 기존 호출부 안 깨짐
  // (하지만 아래에서 signal도 "있으면" 넘겨줌. 안받아도 무시됨)
  onSubmit: (draft: RiskAssessmentDraft) => void | Promise<void>;
};

const INITIAL_DRAFT: RiskAssessmentDraft = {
  meta: { siteName: '', dateISO: '' },
  tasks: [],
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

// ✅ 진행률 easing (부드럽게)
function easeInOutCubic(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
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
          const l = h.likelihood ?? 1;
          const sv = h.severity ?? 1;
          const score = l * sv;

          lines.push(`  - 요인 ${hi + 1}: ${h.title} (가능성 ${l}, 중대성 ${sv}, 점수 ${score})`);

          if (h.controls?.trim()) lines.push(`    - 감소대책: ${h.controls.trim()}`);
          if (h.judgement) lines.push(`    - 판단(상/중/하): ${h.judgement}`);
          if (h.current_control_text?.trim()) lines.push(`    - 현재조치: ${h.current_control_text.trim()}`);
          if (h.judgement_reason_text?.trim()) lines.push(`    - 판단근거: ${h.judgement_reason_text.trim()}`);
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
  const [minor, setMinor] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // =========================
  // ✅ 생성 진행 모달 상태
  // =========================
  const [genOpen, setGenOpen] = useState(false);
  const [genPercent, setGenPercent] = useState(0);
  const [genErrorText, setGenErrorText] = useState<string | null>(null);

  const genTimerRef = useRef<number | null>(null);
  const genAbortRef = useRef<AbortController | null>(null);
  const genStartAtRef = useRef<number>(0);

  const stopGenTimer = () => {
    if (genTimerRef.current) {
      window.clearInterval(genTimerRef.current);
      genTimerRef.current = null;
    }
  };

  const startFakeProgress = () => {
    stopGenTimer();
    setGenErrorText(null);
    setGenOpen(true);

    const PLAN = [
      { to: 25, ms: 60_000 },
      { to: 50, ms: 90_000 },
      { to: 75, ms: 90_000 },
      { to: 95, ms: 60_000 },
    ] as const;

    genStartAtRef.current = Date.now();
    setGenPercent(0);

    const totalMs = PLAN.reduce((sum, x) => sum + x.ms, 0);

    genTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - genStartAtRef.current;

      let from = 0;
      let acc = 0;
      let target = 95;

      for (const seg of PLAN) {
        const segStart = acc;
        const segEnd = acc + seg.ms;

        if (elapsed < segEnd) {
          const raw = (elapsed - segStart) / seg.ms;
          const t = easeInOutCubic(Math.max(0, Math.min(1, raw)));
          target = from + (seg.to - from) * t;
          break;
        }

        acc = segEnd;
        from = seg.to;
        target = seg.to;
      }

      if (elapsed >= totalMs) target = 95;

      setGenPercent((prev) => {
        const next = Math.max(prev, Math.round(target * 10) / 10);
        return Math.min(95, next);
      });
    }, 200);
  };

  const finishAndClose = async () => {
    stopGenTimer();
    setGenPercent(100);
    await new Promise((r) => setTimeout(r, 450));
    setGenOpen(false);
    setGenPercent(0);
    setGenErrorText(null);
  };

  const cancelGeneration = () => {
    genAbortRef.current?.abort();
    genAbortRef.current = null;

    stopGenTimer();
    setGenOpen(false);
    setGenPercent(0);
    setGenErrorText(null);

    setSubmitting(false);
  };

  useEffect(() => {
    return () => {
      genAbortRef.current?.abort();
      stopGenTimer();
    };
  }, []);

  const genMessage = useMemo(() => {
    if (genPercent < 25) return '사업장 정보를 분석하고 있어요';
    if (genPercent < 50) return '세부 공정 데이터를 분석하고 있어요';
    if (genPercent < 75) return '위험 요인 데이터를 취합하여 위험성평가를 진행하고 있어요';
    return 'RegAI가 사업장에 적합한 최적의 개선 대책을 준비하고 있어요!';
  }, [genPercent]);

  useEffect(() => {
    setDraft((prev) => {
      if (prev.meta.dateISO) return prev;
      return { ...prev, meta: { ...prev.meta, dateISO: todayISOClient() } };
    });

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

  const user = useUserStore((st) => st.user);
  // =========================
  // ✅ 로그인 체크 + 생성 진행
  // =========================
  const handleSubmit = async () => {
    if (submitting) return;

    const userEmail = user?.email

    // ✅ 0) 로그인 필수: 생성 버튼 누를 때 막고 로그인 유도
    if (!userEmail) {
      alert('위험성 평가 보고서를 생성하려면 로그인이 필요합니다.');
      return;
    }

    const ac = new AbortController();
    genAbortRef.current = ac;

    try {
      setSubmitting(true);
      startFakeProgress();

      // ✅ 핵심: userEmail + signal 전달 (TBM과 동일한 패턴)
      await (onSubmit as any)(draft, { signal: ac.signal, userEmail });

      setGenPercent((p) => Math.max(p, 92));
      await finishAndClose();
    } catch (e: any) {
      if (e?.name === 'AbortError') return;

      console.error(e);

      stopGenTimer();
      setGenErrorText('보고서 생성에 실패했습니다.');
      await new Promise((r) => setTimeout(r, 1200));
      setGenOpen(false);
      setGenPercent(0);

      alert(e?.message || '보고서 생성에 실패했습니다.');
    } finally {
      genAbortRef.current = null;
      setSubmitting(false);
      stopGenTimer();
    }
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
            disabled={submitting}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={s.helper}>{TAB_LABELS.find((t) => t.id === step)?.helper}</div>

      <div className={s.footer}>
        <div className={s.navRow}>
          <button className={s.navBtn} onClick={goPrev} disabled={step === 'tasks' || submitting}>
            이전
          </button>

          {step !== 'controls' ? (
            <button className={s.navBtnPrimary} onClick={goNext} disabled={!canGoNext || submitting}>
              다음
            </button>
          ) : (
            <button className={s.navBtnPrimary} onClick={handleSubmit} disabled={submitting}>
              {submitting ? '생성 중…' : '위험성 평가 보고서 생성'}
            </button>
          )}
        </div>
      </div>

      <div className={s.content}>
        {step === 'tasks' && <StepTasks draft={draft} setDraft={setDraft} minor={minor} />}
        {step === 'processes' && <StepProcesses draft={draft} setDraft={setDraft} />}
        {step === 'hazards' && <StepHazards draft={draft} setDraft={setDraft} />}
        {step === 'controls' && <StepControls draft={draft} setDraft={setDraft} />}
      </div>

      <ProgressDownloadModal
        open={genOpen}
        percent={genPercent}
        title={genMessage}
        onCancel={cancelGeneration}
        errorText={genErrorText}
      />
    </div>
  );
}
