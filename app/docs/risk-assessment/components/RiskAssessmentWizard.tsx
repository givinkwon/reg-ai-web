'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import s from './RiskAssessmentWizard.module.css';

import StepTasks from './steps/StepTasks';
import StepProcesses from './steps/StepProcesses';
import StepHazards from './steps/StepHazards';
import StepControls from './steps/StepControls';
import CompleteView from './ui/CompleteView'; // ✅ 모듈 분리

import CenteredAlertModal from './ui/AlertModal';
import { useUserStore } from '@/app/store/user';
import { useRiskWizardStore } from '@/app/store/docs'; 

// ✅ [수정] Navbar 컴포넌트 추가
import Navbar from '@/app/docs/components/Navbar';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';
import { Sparkles, RefreshCw } from 'lucide-react';

const GA_CTX = { page: 'Docs', section: 'RiskAssessment', area: 'Wizard' } as const;

// --- 타입 정의 ---
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

export type ProcessItem = { id: string; title: string; hazards: Hazard[]; };
export type TaskItem = { id: string; title: string; processes: ProcessItem[]; };

export type RiskAssessmentDraft = {
  meta: { siteName: string; dateISO: string };
  tasks: TaskItem[];
};

type StepId = 'tasks' | 'processes' | 'hazards' | 'controls';

type Props = {
  open?: boolean;
  onClose?: () => void;
  onSubmit: (draft: RiskAssessmentDraft, opts?: { signal?: AbortSignal; userEmail?: string }) => void | Promise<void>;
  onRequireLogin?: () => void;
};

const INITIAL_DRAFT: RiskAssessmentDraft = {
  meta: { siteName: '', dateISO: '' },
  tasks: [],
};

const TAB_LABELS: { id: StepId; label: string; helper: string }[] = [
  { id: 'tasks', label: '작업 파악', helper: '평가할 작업 단위를 먼저 정리합니다.' },
  { id: 'processes', label: '공정 파악', helper: '작업별 세부 공정을 정의합니다.' },
  { id: 'hazards', label: '위험요인', helper: '공정별 유해·위험요인을 찾습니다.' },
  { id: 'controls', label: '대책 수립', helper: '위험성을 판단하고 감소 대책을 수립합니다.' },
];

const LOADING_MESSAGES: Record<StepId, { title: string; desc: string }> = {
  tasks: { title: '작업 분석 중', desc: '표준 공정을 매칭하고 있습니다.' },
  processes: { title: '공정 데이터 생성 중', desc: '선택된 작업의 표준 공정 흐름을\nAI가 분석하고 있습니다.' },
  hazards: { title: '위험요인 도출 중', desc: '각 공정별 잠재된 유해·위험요인을\n데이터베이스에서 찾고 있습니다.' },
  controls: { title: '안전대책 수립 중', desc: '위험성 수준을 판단하고\n최적의 감소 대책을 제안합니다.' },
};

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
  
  // ✅ 오토파일럿 및 완료 상태
  const [autoSequence, setAutoSequence] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false); 

  const isAnalyzing = useRiskWizardStore((state) => state.isAnalyzing);

  const abortRef = useRef<AbortController | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('안내');
  const [alertLines, setAlertLines] = useState<string[]>([]);
  const [alertConfirmText, setAlertConfirmText] = useState('확인');
  const [alertShowClose, setAlertShowClose] = useState(false);
  const alertOnConfirmRef = useRef<null | (() => void)>(null);
  const alertOnCloseRef = useRef<null | (() => void)>(null);

  const user = useUserStore((st) => st.user);
  const userEmail = (user?.email || '').trim();

  useEffect(() => {
    if (open) {
        track(gaEvent(GA_CTX, 'View'), {
            ui_id: gaUiId(GA_CTX, 'View'),
            step: step,
            is_logged_in: !!userEmail,
        });
    }
  }, [open]);

  useEffect(() => {
    setDraft((prev) => (prev.meta.dateISO ? prev : { ...prev, meta: { ...prev.meta, dateISO: todayISOClient() } }));
    const v = localStorage.getItem('risk_minor_category') || '';
    if (v.trim()) setMinor(v.trim());
  }, []);

  const openAlert = (opts: any) => {
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

  // =================================================================
  // 🚀 [핵심] 오토파일럿 시퀀서
  // =================================================================
  useEffect(() => {
    if (!autoSequence || isCompleted) return;
    if (isAnalyzing) return; 

    let timer: NodeJS.Timeout;
    const STEP_DELAY = 1500; 

    const advance = () => {
      if (step === 'tasks') {
        setStep('processes'); 
      } else if (step === 'processes') {
        setStep('hazards');
      } else if (step === 'hazards') {
        setStep('controls');
      } else if (step === 'controls') {
        handleSubmit();
        setAutoSequence(false); 
      }
    };

    timer = setTimeout(advance, STEP_DELAY);
    return () => clearTimeout(timer);
  }, [autoSequence, step, isAnalyzing, isCompleted]);

  const handleAutoStart = () => {
    setAutoSequence(true);
    setStep('processes');
  };

  // ✅ 완료 화면에서 "다시 보기" 클릭 시 핸들러
  const handleBackFromComplete = () => {
    setIsCompleted(false);
    setAutoSequence(false); // 자동 모드는 확실히 끔
    // 마지막 단계로 돌아가서 내용을 확인하게 함 (원하면 'tasks'로 변경 가능)
    setStep('controls'); 
  };

  const canGoNext = useMemo(() => {
    if (isAnalyzing) return false;
    if (step === 'tasks') return draft.tasks.length > 0;
    if (step === 'processes') return draft.tasks.some((t) => t.processes.length > 0);
    if (step === 'hazards') return draft.tasks.some((t) => t.processes.some((p) => p.hazards.length > 0));
    return true;
  }, [draft, step, isAnalyzing]);

  const handleSubmit = async () => {
    if (submitting || (isAnalyzing && !autoSequence)) return; 
    if (!userEmail) {
      openAlert({
        title: '로그인이 필요합니다',
        lines: ['위험성 평가 보고서를 생성하려면 로그인이 필요합니다.'],
        confirmText: '확인',
        onConfirm: () => onRequireLogin?.(),
      });
      return;
    }

    track(gaEvent(GA_CTX, 'ClickSubmit'), {
        ui_id: gaUiId(GA_CTX, 'ClickSubmit'),
        task_count: draft.tasks.length,
        is_logged_in: true,
    });

    setSubmitting(true);
    await nextFrame();
    
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      await onSubmit(draft, { signal: ac.signal, userEmail });
      setIsCompleted(true); // ✅ 성공 시 완료 화면으로 전환
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('[Wizard Submit Error]', e);
      openAlert({
        title: '생성 실패',
        lines: ['보고서 생성 중 오류가 발생했습니다.', e?.message || '다시 시도해주세요.'],
        confirmText: '확인',
      });
    } finally {
      abortRef.current = null;
      setSubmitting(false);
    }
  };

  const handleTabClick = (targetStep: StepId) => {
    if (submitting || isAnalyzing || autoSequence || isCompleted) return; 
    setStep(targetStep);
    track(gaEvent(GA_CTX, 'ClickTab'), {
        ui_id: gaUiId(GA_CTX, 'ClickTab'),
        target_step: targetStep,
        current_step: step,
    });
  };

  const handlePrev = () => {
    if (autoSequence || isCompleted) return;
    const prevStep = TAB_LABELS[currentIdx - 1]?.id;
    if (prevStep) {
        setStep(prevStep);
        track(gaEvent(GA_CTX, 'ClickPrev'), { ui_id: gaUiId(GA_CTX, 'ClickPrev'), from: step, to: prevStep });
    }
  };

  const handleNext = () => {
    if (autoSequence || isCompleted) return;
    const nextStep = TAB_LABELS[currentIdx + 1]?.id;
    if (nextStep) {
        setStep(nextStep);
        track(gaEvent(GA_CTX, 'ClickNext'), { ui_id: gaUiId(GA_CTX, 'ClickNext'), from: step, to: nextStep });
    }
  };

  if (!open && !alertOpen) return null;

  // ✅ 완료된 상태라면 CompleteView 렌더링
  if (isCompleted) {
    return (
      <div className={s.wrap}>
        {/* ✅ [수정] 완료 화면에서도 Navbar가 필요하면 여기에 추가 가능 */}
        <Navbar />
        <CompleteView 
          onClose={() => onClose && onClose()} 
          onBack={handleBackFromComplete} 
        />
      </div>
    );
  }

  const currentIdx = TAB_LABELS.findIndex(t => t.id === step);
  const currentLoadingMsg = LOADING_MESSAGES[step];

  return (
    <>
      {open && (
        <div className={s.wrap}>
          {/* ✅ [수정] Navbar를 Wizard 내부 최상단에 추가 */}
          {/* s.wrap이 전체 화면을 덮으므로, Navbar를 여기에 넣어야 보입니다. */}
          <div style={{ position: 'relative', zIndex: 100 }}>
             <Navbar />
          </div>

          {/* 중앙 통제형 AI 로딩 오버레이 */}
          {(isAnalyzing && step !== 'tasks') && (
            <div className={s.loadingOverlay}>
              <div className={s.loadingPopup}>
                <div className={s.spinnerWrapper}>
                  <RefreshCw size={36} className={s.spin} />
                  <div className={s.aiBadge}>
                    <Sparkles size={14} fill="#fff" /> AI
                  </div>
                </div>
                <div className={s.loadingTexts}>
                  <h3 className={s.loadingTitle}>{currentLoadingMsg.title}</h3>
                  <p className={s.loadingDesc} style={{ whiteSpace: 'pre-wrap' }}>
                    {currentLoadingMsg.desc}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className={s.header}>
            <div className={s.headerLeft}>
              {onClose && (
                <button 
                    className={s.closeBtn} 
                    onClick={() => { onClose(); }} 
                    disabled={submitting || autoSequence} 
                >
                  ← 나가기
                </button>
              )}
              <h2 className={s.title}>
                {autoSequence ? (
                  <span className="flex items-center gap-2 text-blue-600">
                    <Sparkles size={20} className="animate-pulse" /> AI 자동 생성 중...
                  </span>
                ) : '위험성평가 작성'}
              </h2>
            </div>
            <div className={s.progressText}>{currentIdx + 1} / 4 단계</div>
          </div>

          <div className={s.tabs}>
            {TAB_LABELS.map((t, i) => {
              const isActive = step === t.id;
              const isPast = currentIdx > i;
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`${s.tab} ${isActive ? s.tabActive : ''} ${isPast ? s.tabPast : ''}`}
                  onClick={() => handleTabClick(t.id)}
                  disabled={autoSequence} 
                >
                  <span className={s.stepNum}>{i + 1}</span>
                  <span className={s.tabLabel}>{t.label}</span>
                </button>
              );
            })}
          </div>

           <div className={s.footer}>
            <div className={s.footerMessage}>
              {isAnalyzing && <span className={s.loadingText}>⚙️ 데이터를 분석하고 있습니다...</span>}
              {autoSequence && !isAnalyzing && <span className={s.loadingText} style={{color:'#2563eb'}}>✨ 다음 단계로 이동합니다...</span>}
            </div>
            <div className={s.footerBtns}>
              {!autoSequence && (
                <>
                  <button className={s.navBtn} onClick={handlePrev} disabled={step === 'tasks' || submitting}>이전</button>
                  {step !== 'controls' ? (
                    <button className={s.navBtnPrimary} onClick={handleNext} disabled={!canGoNext || submitting}>다음 단계</button>
                  ) : (
                    <button className={s.submitBtn} onClick={handleSubmit} disabled={submitting || isAnalyzing || !canGoNext}>
                      {submitting ? '요청 중...' : '보고서 생성 완료'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className={s.content}>
            {step === 'tasks' && <StepTasks draft={draft} setDraft={setDraft} minor={minor} onAutoStart={handleAutoStart} />}
            {step === 'processes' && <StepProcesses draft={draft} setDraft={setDraft} />}
            {step === 'hazards' && <StepHazards draft={draft} setDraft={setDraft} />}
            {step === 'controls' && <StepControls draft={draft} setDraft={setDraft} />}
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
        onClose={closeAlert}
      />
    </>
  );
}