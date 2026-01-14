// components/risk-assessment/RiskAssessmentWizard.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './RiskAssessmentWizard.module.css';

import StepTasks from './steps/StepTasks';
import StepProcesses from './steps/StepProcesses';
import StepHazards from './steps/StepHazards';
import StepControls from './steps/StepControls';

import CenteredAlertModal from './ui/AlertModal';
import { useUserStore } from '@/app/store/user';

export type RiskLevel = 1 | 2 | 3 | 4 | 5;
export type Judgement = '상' | '중' | '하';

export type Hazard = {
  id: string;
  title: string;

  likelihood: RiskLevel;
  severity: RiskLevel;

  controls?: string;
  judgement?: Judgement;

  current_controls_items?: string[];
  risk_judgement_reasons?: string[];

  current_control_text?: string;
  judgement_reason_text?: string;

  mitigation_items?: string[];
  mitigation_text?: string;
};

export type ProcessItem = {
  id: string;
  title: string;
  hazards: Hazard[];
};

export type TaskItem = {
  id: string;
  title: string;
  processes: ProcessItem[];
};

export type RiskAssessmentDraft = {
  meta: {
    siteName: string;
    dateISO: string;
  };
  tasks: TaskItem[];
};

type StepId = 'tasks' | 'processes' | 'hazards' | 'controls';

type Props = {
  /**
   * ✅ (추가) 월점검표와 동일하게, open=false여도 alertOpen이면 Alert는 떠야 해서 optional로 지원
   * - 기존 호출부는 open을 안 넘겨도 됨(=true로 처리)
   */
  open?: boolean;

  onClose?: () => void;

  /**
   * ✅ 기존 호출부 유지
   * - 서버 생성 로직은 onSubmit 내부에서 수행
   * - UI는 Progress 제거 + “요청 접수 Alert” 패턴
   */
  onSubmit: (
    draft: RiskAssessmentDraft,
    opts?: { signal?: AbortSignal; userEmail?: string },
  ) => void | Promise<void>;
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

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export default function RiskAssessmentWizard({ open = true, onClose, onSubmit }: Props) {
  const [step, setStep] = useState<StepId>('tasks');
  const [draft, setDraft] = useState<RiskAssessmentDraft>(INITIAL_DRAFT);
  const [minor, setMinor] = useState<string>('');

  // ✅ “요청 전송 중” 중복 클릭 방지용 (Progress UI 없음)
  const [submitting, setSubmitting] = useState(false);

  // ✅ Cancel UI는 없지만, 기존 onSubmit이 signal을 받을 수 있으니 유지(자동 abort는 안 함)
  const abortRef = useRef<AbortController | null>(null);

  // ✅ AlertModal 상태 (TBM/월점검표 동일 패턴)
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('안내');
  const [alertLines, setAlertLines] = useState<string[]>([]);
  const [alertConfirmText, setAlertConfirmText] = useState('확인');
  const [alertShowClose, setAlertShowClose] = useState(false);
  const alertOnConfirmRef = useRef<null | (() => void)>(null);
  const alertOnCloseRef = useRef<null | (() => void)>(null);

  const openAlert = (opts: {
    title?: string;
    lines: string[];
    confirmText?: string;
    showClose?: boolean;
    onConfirm?: () => void;
    onClose?: () => void;
  }) => {
    setAlertTitle(opts.title ?? '안내');
    setAlertLines(opts.lines);
    setAlertConfirmText(opts.confirmText ?? '확인');
    setAlertShowClose(!!opts.showClose);
    alertOnConfirmRef.current = opts.onConfirm ?? null;
    alertOnCloseRef.current = opts.onClose ?? null;
    setAlertOpen(true);
  };

  const closeAlert = () => {
    setAlertOpen(false);
    alertOnConfirmRef.current = null;
    alertOnCloseRef.current = null;
  };

  // ✅ 로그인 유저(아이디=email)
  const user = useUserStore((st) => st.user);

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

  // ✅ Escape 닫기 (요청 중엔 방지)
  useEffect(() => {
    if (!onClose) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (submitting) return;
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  // ✅ body scroll lock (열림/Alert 떠있으면)
  useEffect(() => {
    if (!open && !alertOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, alertOpen]);

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

  const closeOnly = () => {
    if (!onClose) return;
    if (submitting) return;
    onClose();
  };

  /**
   * ✅ 요구사항:
   * - Progress 없음
   * - 생성 버튼 누르면 즉시 “요청 접수” Alert
   * - 서버 요청은 계속 진행(사용자는 Alert 확인 후 닫아도 됨)
   */
  const handleSubmit = async () => {
    if (submitting) return;

    const userEmail = (user?.email || '').trim();
    if (!userEmail) {
      openAlert({
        title: '로그인이 필요합니다',
        lines: ['위험성 평가 보고서를 생성하려면 로그인이 필요합니다.', '로그인 후 다시 시도해주세요.'],
        confirmText: '확인',
      });
      return;
    }

    // ✅ 1) 요청 접수 Alert을 즉시 띄움
    openAlert({
      title: '위험성 평가 생성 요청',
      lines: [
        '위험성 평가 보고서 생성이 요청되었어요!',
        '서버에서 문서를 생성 중이며, 완료되면 이메일/파일함에서 확인할 수 있습니다.',
      ],
      confirmText: '확인',
    });

    // ✅ 2) UI가 Alert을 먼저 그릴 수 있도록 한 프레임 양보
    setSubmitting(true);
    await nextFrame();

    // ✅ 3) 서버 요청 진행 (취소 UI 없으므로 자동 abort 없음)
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await onSubmit(draft, { signal: ac.signal, userEmail });
      // ✅ 완료 Alert은 “사용자가 이미 닫았을 수 있음 + 서버에서 알림/파일함 안내” 패턴이면 불필요한 경우가 많아 기본으로는 안 띄움
    } catch (e: any) {
      if (e?.name === 'AbortError') return;

      console.error(e);
      openAlert({
        title: '생성 실패',
        lines: [
          '보고서 생성에 실패했습니다.',
          e?.message ? String(e.message).slice(0, 180) : '잠시 후 다시 시도해주세요.',
        ],
        confirmText: '확인',
      });
    } finally {
      abortRef.current = null;
      setSubmitting(false);
    }
  };

  /**
   * ✅ 핵심: open=false여도 alertOpen이면 Alert는 렌더 유지
   * - 부모에서 Wizard를 “조건부 렌더링”으로 아예 제거하면(=컴포넌트 언마운트) Alert 유지 불가
   * - 그 케이스까지 보장하려면, 부모에서 open prop으로 제어하는 방식으로 바꾸는 게 정석
   */
  if (!open && !alertOpen) return null;

  return (
    <>
      {/* ✅ 본체는 open일 때만 */}
      {open && (
        <div className={s.wrap}>
          <div className={s.header}>
            <div className={s.headerText}>
              <div className={s.title}>REG AI가 위험성 평가를 도와드려요.</div>
              <div className={s.subTitle}>단계별로 평가 요소를 도와드릴게요</div>
            </div>

            {onClose ? (
              <button className={s.closeBtn} onClick={closeOnly} aria-label="닫기" disabled={submitting}>
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
                  {submitting ? '요청 중…' : '위험성 평가 보고서 생성'}
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
        </div>
      )}

      {/* ✅ Alert Modal: open이 false여도 alertOpen이면 렌더 */}
      <CenteredAlertModal
        open={alertOpen}
        title={alertTitle}
        lines={alertLines}
        confirmText={alertConfirmText}
        onConfirm={() => {
          const fn = alertOnConfirmRef.current;
          closeAlert();
          fn?.();
        }}
        showClose={alertShowClose}
        onClose={() => {
          const fn = alertOnCloseRef.current;
          closeAlert();
          fn?.();
        }}
      />
    </>
  );
}