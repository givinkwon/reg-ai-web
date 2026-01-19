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

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'RiskAssessment' } as const;

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
  /** ✅ 부모에서 open으로 표시/숨김만 제어 (언마운트 방지) */
  open?: boolean;

  /** ✅ “문서 생성 상태(=selectedTask null)”로 복귀시키는 용도 */
  onClose?: () => void;

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

  // ✅ “요청 전송 중” 중복 클릭 방지용
  const [submitting, setSubmitting] = useState(false);

  // ✅ Cancel UI는 없지만, signal 전달 호환성은 유지
  const abortRef = useRef<AbortController | null>(null);

  // ✅ AlertModal 상태 (TBM/월점검표 동일 패턴)
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('안내');
  const [alertLines, setAlertLines] = useState<string[]>([]);
  const [alertConfirmText, setAlertConfirmText] = useState('확인');
  const [alertShowClose, setAlertShowClose] = useState(false);
  const alertOnConfirmRef = useRef<null | (() => void)>(null);
  const alertOnCloseRef = useRef<null | (() => void)>(null);

  // ✅ 로그인 유저(아이디=email)
  const user = useUserStore((st) => st.user);
  const userEmail = (user?.email || '').trim();

  const countMeta = useMemo(() => {
    const tasks = draft.tasks.length;
    const processes = draft.tasks.reduce((acc, t) => acc + (t.processes?.length ?? 0), 0);
    const hazards = draft.tasks.reduce(
      (acc, t) => acc + (t.processes ?? []).reduce((a, p) => a + (p.hazards?.length ?? 0), 0),
      0,
    );
    return { tasks, processes, hazards };
  }, [draft.tasks]);

  const openAlert = (opts: {
    title?: string;
    lines: string[];
    confirmText?: string;
    showClose?: boolean;
    onConfirm?: () => void;
    onClose?: () => void;
  }) => {
    const title = opts.title ?? '안내';

    // ✅ GA: AlertOpen
    track(gaEvent(GA_CTX, 'AlertOpen'), {
      ui_id: gaUiId(GA_CTX, 'AlertOpen'),
      title,
      step,
      has_user: !!userEmail,
    });

    setAlertTitle(title);
    setAlertLines(opts.lines);
    setAlertConfirmText(opts.confirmText ?? '확인');
    setAlertShowClose(!!opts.showClose);
    alertOnConfirmRef.current = opts.onConfirm ?? null;
    alertOnCloseRef.current = opts.onClose ?? null;
    setAlertOpen(true);
  };

  const closeAlert = () => {
    // ✅ GA: AlertClose
    track(gaEvent(GA_CTX, 'AlertClose'), {
      ui_id: gaUiId(GA_CTX, 'AlertClose'),
      step,
    });

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

  // ✅ GA: open/close (초기 오픈 포함)
  const didTrackInitialOpenRef = useRef(false);
  const prevOpenRef = useRef<boolean>(open);
  useEffect(() => {
    const prev = prevOpenRef.current;

    if (!didTrackInitialOpenRef.current && open) {
      didTrackInitialOpenRef.current = true;
      track(gaEvent(GA_CTX, 'Open'), {
        ui_id: gaUiId(GA_CTX, 'Open'),
        step,
        has_user: !!userEmail,
        minor: minor || null,
      });
    } else {
      if (!prev && open) {
        track(gaEvent(GA_CTX, 'Open'), {
          ui_id: gaUiId(GA_CTX, 'Open'),
          step,
          has_user: !!userEmail,
          minor: minor || null,
        });
      }
      if (prev && !open) {
        track(gaEvent(GA_CTX, 'Close'), {
          ui_id: gaUiId(GA_CTX, 'Close'),
          step,
        });
      }
    }

    prevOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, userEmail, minor]);

  // ✅ Escape 닫기(요청 중엔 방지)
  useEffect(() => {
    if (!onClose) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (submitting) return;

      track(gaEvent(GA_CTX, 'CloseEsc'), {
        ui_id: gaUiId(GA_CTX, 'CloseEsc'),
        step,
      });

      onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting, step]);

  // ✅ body scroll lock: open 또는 alertOpen이면 잠금
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
    if (!next) return;

    track(gaEvent(GA_CTX, 'Next'), {
      ui_id: gaUiId(GA_CTX, 'Next'),
      from: step,
      to: next,
      ...countMeta,
    });

    setStep(next);
  };

  const goPrev = () => {
    const idx = TAB_LABELS.findIndex((t) => t.id === step);
    const prev = TAB_LABELS[idx - 1]?.id;
    if (!prev) return;

    track(gaEvent(GA_CTX, 'Prev'), {
      ui_id: gaUiId(GA_CTX, 'Prev'),
      from: step,
      to: prev,
      ...countMeta,
    });

    setStep(prev);
  };

  const closeOnly = () => {
    if (!onClose) return;
    if (submitting) return;

    track(gaEvent(GA_CTX, 'CloseBtn'), {
      ui_id: gaUiId(GA_CTX, 'CloseBtn'),
      step,
    });

    onClose();
  };

  /**
   * ✅ 요구사항:
   * - Progress 없음
   * - 생성 버튼 누르면 즉시 “요청 접수” Alert
   * - 위험성평가는 팝업이 아니므로, 버튼 누른 즉시 “문서 생성 상태”로 복귀(onClose 호출)
   * - 서버 요청은 계속 진행
   */
  const handleSubmit = async () => {
    if (submitting) return;

    track(gaEvent(GA_CTX, 'SubmitClick'), {
      ui_id: gaUiId(GA_CTX, 'SubmitClick'),
      step,
      ...countMeta,
      has_user: !!userEmail,
      minor: minor || null,
    });

    if (!userEmail) {
      track(gaEvent(GA_CTX, 'SubmitBlockedNoLogin'), {
        ui_id: gaUiId(GA_CTX, 'SubmitBlockedNoLogin'),
        step,
      });

      openAlert({
        title: '로그인이 필요합니다',
        lines: ['위험성 평가 보고서를 생성하려면 로그인이 필요합니다.', '로그인 후 다시 시도해주세요.'],
        confirmText: '확인',
      });
      return;
    }

    // ✅ 1) 요청 접수 Alert 즉시
    openAlert({
      title: '위험성 평가 생성 요청',
      lines: [
        '위험성 평가 보고서 생성이 요청되었어요!',
        '서버에서 문서를 생성 중이며, 완료되면 이메일/파일함에서 확인할 수 있습니다.',
      ],
      confirmText: '확인',
    });

    // ✅ GA: RequestAccepted
    track(gaEvent(GA_CTX, 'RequestAccepted'), {
      ui_id: gaUiId(GA_CTX, 'RequestAccepted'),
      step,
      ...countMeta,
      userEmail,
    });

    // ✅ 2) Alert가 먼저 그려지도록 프레임 양보 + 버튼 잠금
    setSubmitting(true);
    await nextFrame();

    // ✅ 3) “문서 생성 상태”로 즉시 복귀 (부모: setSelectedTask(null))
    // - 단, 부모는 Wizard를 언마운트하지 말고 open으로 숨겨야 Alert가 유지됩니다.
    onClose?.();

    // ✅ 4) 서버 요청 계속 진행
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await onSubmit(draft, { signal: ac.signal, userEmail });

      track(gaEvent(GA_CTX, 'SubmitSuccess'), {
        ui_id: gaUiId(GA_CTX, 'SubmitSuccess'),
        ...countMeta,
        minor: minor || null,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;

      console.error(e);

      track(gaEvent(GA_CTX, 'SubmitError'), {
        ui_id: gaUiId(GA_CTX, 'SubmitError'),
        message: String(e?.message ?? e),
        ...countMeta,
      });

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

  // ✅ 핵심: open=false여도 alertOpen이면 Alert는 렌더 유지
  if (!open && !alertOpen) return null;

  return (
    <>
      {/* ✅ 본체는 open일 때만 표시 */}
      {open && (
        <div className={s.wrap} data-ga-event={gaEvent(GA_CTX, 'View')} data-ga-id={gaUiId(GA_CTX, 'View')}>
          <div className={s.header}>
            <div className={s.headerText}>
              <div className={s.title}>REG AI가 위험성 평가를 도와드려요.</div>
              <div className={s.subTitle}>단계별로 평가 요소를 도와드릴게요</div>
            </div>

            {onClose ? (
              <button
                className={s.closeBtn}
                onClick={closeOnly}
                aria-label="닫기"
                disabled={submitting}
                data-ga-event={gaEvent(GA_CTX, 'CloseBtn')}
                data-ga-id={gaUiId(GA_CTX, 'CloseBtn')}
              >
                ×
              </button>
            ) : null}
          </div>

          <div className={s.tabs} data-ga-event={gaEvent(GA_CTX, 'Tabs')} data-ga-id={gaUiId(GA_CTX, 'Tabs')}>
            {TAB_LABELS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`${s.tab} ${step === t.id ? s.tabActive : ''}`}
                onClick={() => {
                  if (submitting) return;
                  if (t.id === step) return;

                  track(gaEvent(GA_CTX, 'TabChange'), {
                    ui_id: gaUiId(GA_CTX, 'TabChange'),
                    from: step,
                    to: t.id,
                    ...countMeta,
                  });

                  setStep(t.id);
                }}
                disabled={submitting}
                data-ga-event={gaEvent(GA_CTX, `Tab${t.id}`)}
                data-ga-id={gaUiId(GA_CTX, `Tab${t.id}`)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={s.helper} data-ga-event={gaEvent(GA_CTX, 'Helper')} data-ga-id={gaUiId(GA_CTX, 'Helper')}>
            {TAB_LABELS.find((t) => t.id === step)?.helper}
          </div>

          <div className={s.footer}>
            <div className={s.navRow}>
              <button
                className={s.navBtn}
                onClick={goPrev}
                disabled={step === 'tasks' || submitting}
                data-ga-event={gaEvent(GA_CTX, 'Prev')}
                data-ga-id={gaUiId(GA_CTX, 'Prev')}
              >
                이전
              </button>

              {step !== 'controls' ? (
                <button
                  className={s.navBtnPrimary}
                  onClick={() => {
                    if (!canGoNext || submitting) return;

                    // ✅ GA: Next (goNext 내부에서도 트랙하지만, 버튼 클릭 맥락도 남기고 싶으면 유지)
                    track(gaEvent(GA_CTX, 'NextClick'), {
                      ui_id: gaUiId(GA_CTX, 'NextClick'),
                      step,
                      ...countMeta,
                    });

                    goNext();
                  }}
                  disabled={!canGoNext || submitting}
                  data-ga-event={gaEvent(GA_CTX, 'Next')}
                  data-ga-id={gaUiId(GA_CTX, 'Next')}
                >
                  다음
                </button>
              ) : (
                <button
                  className={s.navBtnPrimary}
                  onClick={handleSubmit}
                  disabled={submitting}
                  data-ga-event={gaEvent(GA_CTX, 'Submit')}
                  data-ga-id={gaUiId(GA_CTX, 'Submit')}
                >
                  {submitting ? '요청 중…' : '위험성 평가 보고서 생성'}
                </button>
              )}
            </div>
          </div>

          <div className={s.content} data-ga-event={gaEvent(GA_CTX, 'Content')} data-ga-id={gaUiId(GA_CTX, 'Content')}>
            {step === 'tasks' && <StepTasks draft={draft} setDraft={setDraft} minor={minor} />}
            {step === 'processes' && <StepProcesses draft={draft} setDraft={setDraft} />}
            {step === 'hazards' && <StepHazards draft={draft} setDraft={setDraft} />}
            {step === 'controls' && <StepControls draft={draft} setDraft={setDraft} />}
          </div>
        </div>
      )}

      {/* ✅ Alert Modal: open=false여도 alertOpen이면 유지 */}
      <CenteredAlertModal
        open={alertOpen}
        title={alertTitle}
        lines={alertLines}
        confirmText={alertConfirmText}
        onConfirm={() => {
          // ✅ GA: AlertConfirm
          track(gaEvent(GA_CTX, 'AlertConfirm'), {
            ui_id: gaUiId(GA_CTX, 'AlertConfirm'),
            title: alertTitle,
            step,
          });

          const fn = alertOnConfirmRef.current;
          closeAlert();
          fn?.();
        }}
        showClose={alertShowClose}
        onClose={() => {
          // ✅ GA: AlertCloseBtn
          track(gaEvent(GA_CTX, 'AlertCloseBtn'), {
            ui_id: gaUiId(GA_CTX, 'AlertCloseBtn'),
            title: alertTitle,
            step,
          });

          const fn = alertOnCloseRef.current;
          closeAlert();
          fn?.();
        }}
      />
    </>
  );
}
