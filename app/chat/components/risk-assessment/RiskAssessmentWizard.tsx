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
  /** ✅ 부모에서 open으로 표시/숨김만 제어 (언마운트 방지 권장) */
  open?: boolean;

  /** ✅ “문서 생성 상태(=selectedTask null)”로 복귀시키는 용도 */
  onClose?: () => void;

  onSubmit: (
    draft: RiskAssessmentDraft,
    opts?: { signal?: AbortSignal; userEmail?: string },
  ) => void | Promise<void>;
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

type Theme = 'light' | 'dark';

function detectTheme(): Theme {
  // 1) 앱이 html/body에 data-theme를 주는 케이스 대응
  const html = document.documentElement;
  const body = document.body;

  const dtHtml = (html.getAttribute('data-theme') || '').toLowerCase();
  const dtBody = (body.getAttribute('data-theme') || '').toLowerCase();

  if (dtHtml === 'light' || dtBody === 'light') return 'light';
  if (dtHtml === 'dark' || dtBody === 'dark') return 'dark';

  // 2) class로 light/dark 주는 케이스 대응
  const clsHtml = html.classList;
  const clsBody = body.classList;
  if (clsHtml.contains('light') || clsBody.contains('light')) return 'light';
  if (clsHtml.contains('dark') || clsBody.contains('dark')) return 'dark';

  // 3) 최종: OS 설정
  return window.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark';
}

function makeInitialDraft(): RiskAssessmentDraft {
  return {
    meta: { siteName: '', dateISO: todayISOClient() },
    tasks: [],
  };
}

export default function RiskAssessmentWizard({ open = true, onClose, onSubmit }: Props) {
  const [step, setStep] = useState<StepId>('tasks');
  const [draft, setDraft] = useState<RiskAssessmentDraft>(makeInitialDraft());
  const [minor, setMinor] = useState<string>('');

  // ✅ “요청 전송 중” UI 잠금 (모바일 재신청 이슈 방지 위해 오래 유지하지 않음)
  const [submitting, setSubmitting] = useState(false);

  // ✅ 요청 중복 탭 방지 (state flush 타이밍 이슈 대비)
  const submitLockRef = useRef(false);

  // ✅ Cancel signal 호환
  const abortRef = useRef<AbortController | null>(null);

  // ✅ theme을 wrap에만 로컬로 반영 (CSS Module에서 data-theme로 처리)
  const [theme, setTheme] = useState<Theme>('dark');

  // ✅ AlertModal 상태
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

  // ✅ theme 감지/동기화 (global selector 없이, wrap의 data-theme만 제어)
  useEffect(() => {
    const update = () => {
      try {
        setTheme(detectTheme());
      } catch {
        // ignore
      }
    };

    update();

    const mql = window.matchMedia?.('(prefers-color-scheme: light)');
    const onMqlChange = () => update();

    // safari 호환: addEventListener 없을 수도 있어 분기
    if (mql?.addEventListener) mql.addEventListener('change', onMqlChange);
    else if (mql?.addListener) mql.addListener(onMqlChange);

    const mo = new MutationObserver(() => update());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme'] });

    return () => {
      if (mql?.removeEventListener) mql.removeEventListener('change', onMqlChange);
      else if (mql?.removeListener) mql.removeListener(onMqlChange);
      mo.disconnect();
    };
  }, []);

  // ✅ minor read
  useEffect(() => {
    try {
      const v = localStorage.getItem('risk_minor_category') || '';
      if (v.trim()) setMinor(v.trim());
    } catch {}
  }, []);

  // ✅ open이 다시 true가 되는 순간(재오픈)에 상태 리셋 (모바일 “재신청 버튼 비활성” 방지)
  const prevOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;

    if (open && !wasOpen) {
      // 새 세션 시작
      submitLockRef.current = false;
      setSubmitting(false);
      setStep('tasks');
      setDraft(makeInitialDraft());

      // 혹시 남아있을 수 있는 alert 정리(원하면 유지해도 됨)
      setAlertOpen(false);
      alertOnConfirmRef.current = null;
      alertOnCloseRef.current = null;
    }
  }, [open]);

  // ✅ Escape 닫기(요청중엔 방지)
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

  // ✅ body scroll lock: open 또는 alertOpen이면 잠금
  useEffect(() => {
    if (!open && !alertOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, alertOpen]);

  // ✅ unmount 시 진행 중 요청 abort
  useEffect(() => {
    return () => {
      try {
        abortRef.current?.abort();
      } catch {}
    };
  }, []);

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
   * - 버튼 클릭 후 UI는 즉시 풀려서(모바일 포함) 다시 신청 가능해야 함
   * - 서버 요청은 계속 진행 (await로 UI를 묶지 않음)
   */
  const handleSubmit = async () => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    const userEmail = (user?.email || '').trim();
    if (!userEmail) {
      openAlert({
        title: '로그인이 필요합니다',
        lines: ['위험성 평가 보고서를 생성하려면 로그인이 필요합니다.', '로그인 후 다시 시도해주세요.'],
        confirmText: '확인',
      });
      submitLockRef.current = false;
      return;
    }

    // UI 잠금은 "알림이 뜨는 1프레임" 정도만 사용
    setSubmitting(true);

    // 1) 요청 접수 Alert 즉시
    openAlert({
      title: '위험성 평가 생성 요청',
      lines: [
        '위험성 평가 보고서 생성이 요청되었어요!',
        '서버에서 문서를 생성 중이며, 완료되면 이메일/파일함에서 확인할 수 있습니다.',
      ],
      confirmText: '확인',
    });

    // 2) Alert가 먼저 그려지도록 프레임 양보
    await nextFrame();

    // 3) “문서 생성 상태”로 즉시 복귀
    onClose?.();

    // 4) 서버 요청은 백그라운드로 계속 진행 (UI를 await로 묶지 않음)
    const ac = new AbortController();
    abortRef.current = ac;

    const snapshotDraft = draft; // 제출 시점의 draft 고정

    Promise.resolve(onSubmit(snapshotDraft, { signal: ac.signal, userEmail }))
      .catch((e: any) => {
        if (e?.name === 'AbortError') return;
        console.error(e);
        openAlert({
          title: '생성 실패',
          lines: [
            '보고서 생성 요청 처리 중 오류가 발생했습니다.',
            e?.message ? String(e.message).slice(0, 180) : '잠시 후 다시 시도해주세요.',
          ],
          confirmText: '확인',
        });
      })
      .finally(() => {
        if (abortRef.current === ac) abortRef.current = null;
      });

    // ✅ 핵심: 여기서 바로 UI 잠금 해제 → 모바일 재신청 가능
    setSubmitting(false);
    submitLockRef.current = false;
  };

  // ✅ open=false여도 alertOpen이면 Alert는 렌더 유지
  if (!open && !alertOpen) return null;

  return (
    <>
      {/* ✅ 본체는 open일 때만 표시 */}
      {open && (
        <div className={s.wrap} data-theme={theme}>
          <div className={s.header}>
            <div className={s.headerText}>
              <div className={s.title}>REG AI가 위험성 평가를 도와드려요.</div>
              <div className={s.subTitle}>단계별로 평가 요소를 도와드릴게요</div>
            </div>

            {onClose ? (
              <button
                type="button"
                className={s.closeBtn}
                onClick={closeOnly}
                aria-label="닫기"
                disabled={submitting}
              >
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
              <button type="button" className={s.navBtn} onClick={goPrev} disabled={step === 'tasks' || submitting}>
                이전
              </button>

              {step !== 'controls' ? (
                <button
                  type="button"
                  className={s.navBtnPrimary}
                  onClick={goNext}
                  disabled={!canGoNext || submitting}
                >
                  다음
                </button>
              ) : (
                <button type="button" className={s.navBtnPrimary} onClick={handleSubmit} disabled={submitting}>
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

      {/* ✅ Alert Modal: open=false여도 alertOpen이면 유지 */}
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
