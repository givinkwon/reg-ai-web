'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './RiskAssessmentWizard.module.css';

import StepTasks from './steps/StepTasks';
import StepProcesses from './steps/StepProcesses';
import StepHazards from './steps/StepHazards';
import StepControls from './steps/StepControls';

import CenteredAlertModal from './ui/AlertModal';
import { useUserStore } from '@/app/store/user';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'RiskAssessment' } as const;

// ... (타입 정의들은 기존과 동일, 생략 없이 유지) ...
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
  current_control_text?: string;
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
  meta: { siteName: string; dateISO: string };
  tasks: TaskItem[];
};

type StepId = 'tasks' | 'processes' | 'hazards' | 'controls';

type Props = {
  open?: boolean;
  onClose?: () => void;
  onSubmit: (draft: RiskAssessmentDraft, opts?: { signal?: AbortSignal; userEmail?: string }) => void | Promise<void>;
  
  // ✅ [추가] 로그인이 필요할 때 부모에게 알림
  onRequireLogin?: () => void;
};

const INITIAL_DRAFT: RiskAssessmentDraft = {
  meta: { siteName: '', dateISO: '' },
  tasks: [],
};

const TAB_LABELS: { id: StepId; label: string; helper: string }[] = [
  { id: 'tasks', label: '1. 작업 파악', helper: '평가할 작업 단위를 먼저 정리합니다.' },
  { id: 'processes', label: '2. 공정 파악', helper: '작업별 세부 공정을 정의합니다.' },
  { id: 'hazards', label: '3. 위험요인', helper: '공정별 유해·위험요인을 찾습니다.' },
  { id: 'controls', label: '4. 대책 수립', helper: '위험성을 판단하고 감소 대책을 수립합니다.' },
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

export default function RiskAssessmentWizard({ open = true, onClose, onSubmit, onRequireLogin }: Props) {
  const [step, setStep] = useState<StepId>('tasks');
  const [draft, setDraft] = useState<RiskAssessmentDraft>(INITIAL_DRAFT);
  const [minor, setMinor] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Alert 상태
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('안내');
  const [alertLines, setAlertLines] = useState<string[]>([]);
  const [alertConfirmText, setAlertConfirmText] = useState('확인');
  const [alertShowClose, setAlertShowClose] = useState(false);
  const alertOnConfirmRef = useRef<null | (() => void)>(null);
  const alertOnCloseRef = useRef<null | (() => void)>(null);

  const user = useUserStore((st) => st.user);
  const userEmail = (user?.email || '').trim();

  // 메타데이터 계산
  const countMeta = useMemo(() => {
    const tasks = draft.tasks.length;
    const processes = draft.tasks.reduce((acc, t) => acc + (t.processes?.length ?? 0), 0);
    const hazards = draft.tasks.reduce(
      (acc, t) => acc + (t.processes ?? []).reduce((a, p) => a + (p.hazards?.length ?? 0), 0),
      0,
    );
    return { tasks, processes, hazards };
  }, [draft.tasks]);

  const openAlert = (opts: { title?: string; lines: string[]; confirmText?: string; showClose?: boolean; onConfirm?: () => void; onClose?: () => void }) => {
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

  // GA View
  useEffect(() => {
    if (open) {
      track(gaEvent(GA_CTX, 'Open'), { ui_id: gaUiId(GA_CTX, 'Open'), step, minor });
    }
  }, [open, step, minor]);

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

  const handleSubmit = async () => {
    if (submitting) return;

    if (!userEmail) {
      // ✅ [수정] 로그인 안내 및 로그인 모달 트리거
      openAlert({
        title: '로그인이 필요합니다',
        lines: ['위험성 평가 보고서를 생성하려면 로그인이 필요합니다.', '로그인 후 다시 시도해주세요.'],
        confirmText: '로그인하기',
        showClose: true,
        onConfirm: () => {
          onRequireLogin?.(); // 부모의 로그인 모달 함수 호출
        }
      });
      return;
    }

    // 1. 요청 완료 알림 즉시 표시
    openAlert({
      title: '위험성 평가 생성 요청',
      lines: [
        '보고서 생성이 요청되었습니다!',
        '완료되면 이메일 또는 문서함에서 확인할 수 있습니다.',
      ],
      confirmText: '확인',
    });

    setSubmitting(true);
    await nextFrame();

    onClose?.();

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await onSubmit(draft, { signal: ac.signal, userEmail });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error(e);
      openAlert({
        title: '생성 실패',
        lines: ['보고서 생성 중 오류가 발생했습니다.', '잠시 후 다시 시도해주세요.'],
        confirmText: '확인',
      });
    } finally {
      abortRef.current = null;
      setSubmitting(false);
    }
  };

  if (!open && !alertOpen) return null;

  return (
    <>
      {open && (
        <div className={s.wrap} data-ga-event={gaEvent(GA_CTX, 'View')} data-ga-id={gaUiId(GA_CTX, 'View')}>
          <div className={s.header}>
            <div className={s.headerLeft}>
              {onClose && (
                <button className={s.closeBtn} onClick={onClose} disabled={submitting}>
                  ← 나가기
                </button>
              )}
              <h2 className={s.title}>위험성평가 작성</h2>
            </div>
            <div className={s.progressText}>
              {TAB_LABELS.findIndex(t => t.id === step) + 1} / 4 단계
            </div>
          </div>

          <div className={s.tabs}>
            {TAB_LABELS.map((t, i) => {
              const currentIdx = TAB_LABELS.findIndex(x => x.id === step);
              const isActive = t.id === step;
              const isPast = i < currentIdx;
              return (
                <div
                  key={t.id}
                  className={`${s.tab} ${isActive ? s.tabActive : ''} ${isPast ? s.tabPast : ''}`}
                  onClick={() => !submitting && setStep(t.id)}
                >
                  <div className={s.stepNum}>{i + 1}</div>
                  <span className={s.stepLabel}>{t.label}</span>
                </div>
              );
            })}
          </div>

          <div className={s.helperBox}>
            <span className={s.helperIcon}>💡</span>
            {TAB_LABELS.find((t) => t.id === step)?.helper}
          </div>

          <div className={s.content}>
            {step === 'tasks' && <StepTasks draft={draft} setDraft={setDraft} minor={minor} />}
            {step === 'processes' && <StepProcesses draft={draft} setDraft={setDraft} />}
            {step === 'hazards' && <StepHazards draft={draft} setDraft={setDraft} />}
            {step === 'controls' && <StepControls draft={draft} setDraft={setDraft} />}
          </div>

          <div className={s.footer}>
            <button className={s.navBtn} onClick={goPrev} disabled={step === 'tasks' || submitting}>
              이전
            </button>
            
            {step !== 'controls' ? (
              <button className={s.navBtnPrimary} onClick={goNext} disabled={!canGoNext || submitting}>
                다음 단계
              </button>
            ) : (
              <button className={s.submitBtn} onClick={handleSubmit} disabled={submitting}>
                {submitting ? '요청 중...' : '보고서 생성 완료'}
              </button>
            )}
          </div>
        </div>
      )}

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