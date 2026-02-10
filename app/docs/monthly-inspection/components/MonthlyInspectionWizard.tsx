'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, ArrowLeft } from 'lucide-react';
import s from './MonthlyInspectionWizard.module.css';

import StepInspectionTasks from './steps/StepInspectionTasks';
import StepBuildChecklist from './steps/StepBuildChecklist';
import StepRunChecklist from './steps/StepRunChecklist';
import CompleteView from './ui/CompleteView'; 

// ✅ [추가] Navbar 컴포넌트 임포트
import Navbar from '@/app/docs/components/Navbar';

import { useUserStore } from '@/app/store/user';
import { useRiskWizardStore } from '@/app/store/docs'; 
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Docs', section: 'MonthlyInspection', area: 'Wizard' } as const;

export type ChecklistCategory = '사업장 점검 사항' | '노동안전 점검 사항' | '작업 및 공정별 점검 사항';
export type Sections = Record<ChecklistCategory, string[]>;
export type MonthlyInspectionPayload = { dateISO: string; detailTasks: string[]; sections: Sections; results: any[]; };
type StepId = 'tasks' | 'build' | 'run';

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit?: (payload: MonthlyInspectionPayload) => void | Promise<void>;
  onRequireLogin?: () => void;
};

const STEPS: { id: StepId; label: string }[] = [
  { id: 'tasks', label: '작업 파악' }, { id: 'build', label: '항목 구성' }, { id: 'run', label: '점검 실시' },
];

function todayISOClient() { return new Date().toISOString().split('T')[0]; }

function toItems(sections: Sections) {
  const uid = () => Math.random().toString(16).slice(2);
  return (Object.keys(sections) as ChecklistCategory[]).flatMap((cat) =>
    (sections[cat] ?? []).map((q) => ({ id: uid(), category: cat, question: q, rating: undefined, note: '' })),
  );
}

export default function MonthlyInspectionWizard({ open, onClose, onSubmit, onRequireLogin }: Props) {
  const [step, setStep] = useState<StepId>('tasks');
  const [detailTasks, setDetailTasks] = useState<string[]>([]);
  const [sections, setSections] = useState<Sections>({ '사업장 점검 사항': [], '노동안전 점검 사항': [], '작업 및 공정별 점검 사항': [] });
  const [items, setItems] = useState<any[]>([]); 
  const [dateISO] = useState(todayISOClient());

  const [autoSequence, setAutoSequence] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isPreparingRun, setIsPreparingRun] = useState(false);

  const isAnalyzing = useRiskWizardStore((st) => st.isAnalyzing);
  const setIsAnalyzing = useRiskWizardStore((st) => st.setIsAnalyzing);
  const user = useUserStore((st) => st.user);

  useEffect(() => { if (open) track(gaEvent(GA_CTX, 'View'), { ui_id: gaUiId(GA_CTX, 'View'), step }); }, [open, step]);

  // ✅ [수정됨] Auto Pilot Logic
  useEffect(() => {
    if (!autoSequence || isCompleted || isAnalyzing || isPreparingRun) return;

    const timer = setTimeout(() => {
      if (step === 'build') {
        goToRunStep();
      }
      // 🔴 삭제됨: else if (step === 'run') setAutoSequence(false); 
      // 이유: Run 단계에서도 자동 모드를 유지해야 자식 컴포넌트가 완료 처리를 할 수 있음
    }, 1200);

    return () => clearTimeout(timer);
  }, [autoSequence, step, isAnalyzing, isCompleted, isPreparingRun]);

  const goToRunStep = () => {
    setIsPreparingRun(true);
    setTimeout(() => {
      setStep('run');
      setIsPreparingRun(false);
    }, 1500);
  };

  const handleCreateChecklist = async (tasksOverride?: string[], isAutoMode: boolean = false) => {
    const tasksToUse = tasksOverride || detailTasks;
    setIsAnalyzing(true);
    if (isAutoMode) setAutoSequence(true); 
    
    try {
      const res = await fetch('/api/risk-assessment?endpoint=monthly-inspection-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detailTasks: tasksToUse, limitPerCategory: 10 }),
      });
      
      if (!res.ok) throw new Error('항목 생성 실패');
      const data = await res.json();
      const sec = data?.sections ?? {};
      const nextSections: Sections = {
        '사업장 점검 사항': sec['사업장 점검 사항'] || [],
        '노동안전 점검 사항': sec['노동안전 점검 사항'] || [],
        '작업 및 공정별 점검 사항': sec['작업 및 공정별 점검 사항'] || [],
      };
      setSections(nextSections);
      setItems(toItems(nextSections));
      setIsAnalyzing(false);
      setStep('build');
    } catch (e) {
      console.error(e);
      setIsAnalyzing(false);
      setAutoSequence(false);
      alert('항목을 생성하는 중 문제가 발생했습니다.');
    }
  };

  const handleFinish = async () => {
    if (!user?.email) {
      alert('로그인이 필요한 서비스입니다.');
      onRequireLogin?.();
      return;
    }
    setSubmitting(true);
    try {
      const payload = { dateISO, detailTasks, sections, results: items };
      if (onSubmit) await onSubmit(payload);
      
      const res = await fetch('/api/risk-assessment?endpoint=monthly-inspection-export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': user.email },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`API Error: ${res.status}`);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `월_순회점검표_${dateISO}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setIsCompleted(true);
      setAutoSequence(false); // ✅ 여기서 비로소 자동 모드 종료
    } catch (e) {
      console.error(e);
      alert('문서 생성 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // ✅ [추가] 완료 화면에도 Navbar 삽입
  if (isCompleted) {
    return (
      <div className={s.wrap}>
        <div style={{ position: 'relative', zIndex: 100 }}>
          <Navbar />
        </div>
        <CompleteView onClose={onClose} onBack={() => { setIsCompleted(false); setStep('run'); }} />
      </div>
    );
  }

  const currentIdx = STEPS.findIndex(s => s.id === step);
  const loadingMsg = isAnalyzing ? { title: '분석 중', desc: '데이터를 처리하고 있습니다.' } : null; // 간소화

  return (
    <div className={s.wrap}>
      
      {/* ✅ [추가] 메인 화면 최상단에 Navbar 삽입 */}
      <div style={{ position: 'relative', zIndex: 100 }}>
        <Navbar />
      </div>

      {(isAnalyzing || isPreparingRun || submitting) && (
        <div className={s.loadingOverlay}>
          <div className={s.loadingPopup}>
            <div className={s.spinnerWrapper}><RefreshCw size={36} className={s.spin} /><div className={s.aiBadge}><Sparkles size={14} fill="#fff" /> AI</div></div>
            <div className={s.loadingTexts}>
              <h3 className={s.loadingTitle}>
                {submitting ? '문서 저장 중' : isPreparingRun ? '점검표 생성 중' : '작업 분석 중'}
              </h3>
              <p className={s.loadingDesc}>
                {submitting ? '엑셀 파일을 생성하고 있습니다.' : 'AI가 최적의 점검 항목을 구성합니다.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={s.header}>
        <div className={s.headerLeft}>
          <button className={s.closeBtn} onClick={onClose} disabled={submitting || autoSequence}><ArrowLeft size={18} /> 나가기</button>
          <h2 className={s.title}>
            {autoSequence ? <span className="flex items-center gap-2 text-blue-600"><Sparkles size={18} className="animate-pulse" /> AI 자동 생성 중...</span> : '월 순회점검표 작성'}
          </h2>
        </div>
        <div className={s.progressText}>{currentIdx + 1} / 3 단계</div>
      </div>

      <div className={s.content}>
        <div className={s.container}>
          {step === 'tasks' && (
            <StepInspectionTasks 
              detailTasks={detailTasks} setDetailTasks={setDetailTasks}
              onAutoStart={(detectedTasks) => handleCreateChecklist(detectedTasks, true)}
            />
          )}
          {step === 'build' && (
            <StepBuildChecklist 
              detailTasks={detailTasks} initialSections={sections} 
              onNext={(updated) => { setSections(updated); setItems(toItems(updated)); goToRunStep(); }}
              onBack={() => setStep('tasks')}
            />
          )}
          {step === 'run' && (
            <StepRunChecklist
              detailTasks={detailTasks}
              items={items}
              onChangeItems={setItems}
              onBack={() => setStep('build')}
              onFinish={handleFinish}
              finishDisabled={submitting || isPreparingRun}
              // ✅ [핵심] 자동 모드 상태를 전달
              isAutoRun={autoSequence} 
            />
          )}
        </div>
      </div>

      <div className={s.footer}>
        <div className={s.footerMessage}>
          {autoSequence && !submitting && !isAnalyzing && !isPreparingRun && <span className={s.loadingText} style={{color:'#2563eb'}}>✨ 자동으로 작성하고 있습니다...</span>}
        </div>
        {!autoSequence && (
          <div className={s.footerBtns}>
            {step !== 'tasks' && <button className={s.navBtn} onClick={() => setStep(prev => STEPS[Math.max(0, currentIdx - 1)].id as StepId)} disabled={submitting}>이전</button>}
            {step === 'tasks' ? <button className={s.navBtnPrimary} onClick={() => handleCreateChecklist(undefined, false)} disabled={detailTasks.length === 0}>다음 단계</button>
            : step === 'build' ? <button className={s.navBtnPrimary} onClick={goToRunStep}>다음 단계</button>
            : <button className={s.submitBtn} onClick={handleFinish} disabled={submitting}>점검 완료</button>}
          </div>
        )}
      </div>
    </div>
  );
}