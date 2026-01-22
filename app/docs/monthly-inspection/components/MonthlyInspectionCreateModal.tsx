'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, FileText, Loader2, ArrowLeft } from 'lucide-react';
import s from './MonthlyInspectionCreateModal.module.css';

import MonthlyInspectionDetailTaskAutocompleteInput from './MonthlyInspectionDetailTaskAutocompleteInput';
import StepBuildChecklist from './steps/StepBuildChecklist';
import StepRunChecklist from './steps/StepRunChecklist';
import CenteredAlertModal from './ui/AlertModal';

import { useUserStore } from '@/app/store/user';
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

export type Rating = 'O' | '△' | 'X';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'MonthlyInspection' } as const;

export type ChecklistCategory =
  | '사업장 점검 사항'
  | '노동안전 점검 사항'
  | '세부 작업 및 공정별 점검 사항';

export type ChecklistItem = {
  id: string;
  category: ChecklistCategory;
  question: string;
  rating?: Rating;
  note?: string;
};

export type Sections = Record<ChecklistCategory, string[]>;

export type MonthlyInspectionPayload = {
  dateISO: string;
  detailTasks: string[];
  sections: Sections;
  results: ChecklistItem[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  minorCategory?: string | null;
  onSubmit?: (payload: MonthlyInspectionPayload) => void | Promise<void>;
  defaultValue?: Partial<MonthlyInspectionPayload>;
  onRequireLogin?: () => void;
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const norm = (v?: string | null) => (v ?? '').trim();

function formatKoreanWeekLabel(d: Date) {
  const day = d.getDate();
  const week = Math.ceil(day / 7);
  const yyyy = d.getFullYear();
  const mm = d.getMonth() + 1;
  return `${yyyy}년 ${mm}월 ${week}주차`;
}

function toItems(sections: Sections): ChecklistItem[] {
  return (Object.keys(sections) as ChecklistCategory[]).flatMap((cat) =>
    (sections[cat] ?? []).map((q) => ({
      id: uid(),
      category: cat,
      question: q,
      rating: undefined,
      note: '',
    })),
  );
}

function cleanSections(nextSections: Sections): Sections {
  return {
    '사업장 점검 사항': Array.from(new Set((nextSections['사업장 점검 사항'] ?? []).map(norm).filter(Boolean))),
    '노동안전 점검 사항': Array.from(new Set((nextSections['노동안전 점검 사항'] ?? []).map(norm).filter(Boolean))),
    '세부 작업 및 공정별 점검 사항': Array.from(
      new Set((nextSections['세부 작업 및 공정별 점검 사항'] ?? []).map(norm).filter(Boolean)),
    ),
  };
}

export default function MonthlyInspectionCreateModal({
  open,
  onClose,
  onSubmit,
  defaultValue,
  minorCategory,
  onRequireLogin,
}: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [detailTasks, setDetailTasks] = useState<string[]>(defaultValue?.detailTasks ?? []);
  const [sections, setSections] = useState<Sections>(
    defaultValue?.sections ?? {
      '사업장 점검 사항': [],
      '노동안전 점검 사항': [],
      '세부 작업 및 공정별 점검 사항': [],
    },
  );
  const [items, setItems] = useState<ChecklistItem[]>(defaultValue?.results ?? []);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string>('');
  const [exportLoading, setExportLoading] = useState(false);

  // Alert State
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', lines: [] as string[], confirmText: '확인', showClose: false });
  const alertOnConfirmRef = useRef<(() => void) | null>(null);

  const user = useUserStore((st) => st.user);
  const userEmail = (user?.email || '').trim();

  const today = useMemo(() => new Date(), []);
  const weekLabel = useMemo(() => formatKoreanWeekLabel(today), [today]);
  const dateISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const openAlert = (cfg: typeof alertConfig, onConfirm?: () => void) => {
    setAlertConfig(cfg);
    alertOnConfirmRef.current = onConfirm || null;
    setAlertOpen(true);
  };

  const closeAlert = () => {
    setAlertOpen(false);
    alertOnConfirmRef.current = null;
  };

  // Reset or Restore on Open
  useEffect(() => {
    if (!open) {
      setGenLoading(false);
      setExportLoading(false);
      return;
    }
    // (Optional: Load from localStorage draft here if needed)
  }, [open]);

  if (!open && !alertOpen) return null;

  // --- Actions ---

  const handleCreateChecklist = async () => {
    setGenError('');
    setGenLoading(true);

    const tasks = detailTasks.map(norm).filter(Boolean);

    try {
      const res = await fetch('/api/risk-assessment?endpoint=monthly-inspection-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minorCategory: minorCategory ?? undefined,
          detailTasks: tasks,
          limitPerCategory: 10,
        }),
      });

      if (!res.ok) throw new Error('점검 항목 생성에 실패했습니다.');

      const data = await res.json();
      const sec = data?.sections ?? {};
      const next: Sections = {
        '사업장 점검 사항': (sec['사업장 점검 사항'] ?? []).map(String),
        '노동안전 점검 사항': (sec['노동안전 점검 사항'] ?? []).map(String),
        '세부 작업 및 공정별 점검 사항': (sec['세부 작업 및 공정별 점검 사항'] ?? []).map(String),
      };

      const cleaned = cleanSections(next);
      setSections(cleaned);
      setItems(toItems(cleaned));
      setStep(1);
    } catch (e: any) {
      setGenError(e.message || '오류가 발생했습니다.');
    } finally {
      setGenLoading(false);
    }
  };

  const handleConfirmChecklist = (nextSections: Sections) => {
    const cleaned = cleanSections(nextSections);
    setSections(cleaned);
    setItems(toItems(cleaned));
    setStep(2);
  };

  const handleFinish = async () => {
    if (!userEmail) {
      openAlert({
        title: '로그인이 필요합니다',
        lines: ['점검표를 저장하려면 로그인이 필요합니다.'],
        confirmText: '로그인하기',
        showClose: true,
      }, () => onRequireLogin?.());
      return;
    }

    if (exportLoading) return;

    const payload: MonthlyInspectionPayload = {
      dateISO,
      detailTasks: detailTasks.map(norm).filter(Boolean),
      sections,
      results: items,
    };

    openAlert({
      title: '점검표 생성 요청',
      lines: ['서버에서 문서를 생성 중입니다.', '잠시만 기다려주세요.'],
      confirmText: '확인',
      showClose: false,
    });

    setExportLoading(true);

    try {
      if (onSubmit) await onSubmit(payload);

      const res = await fetch('/api/risk-assessment?endpoint=monthly-inspection-export-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('엑셀 생성 실패');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `월_순회점검표_${dateISO}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      closeAlert();
      onClose();
    } catch (e) {
      openAlert({
        title: '생성 실패',
        lines: ['문서 생성 중 오류가 발생했습니다.'],
        confirmText: '확인',
        showClose: true,
      });
    } finally {
      setExportLoading(false);
    }
  };

  const canGoStep1 = detailTasks.length > 0;
  const canFinish = items.some((it) => !!it.rating);

  return (
    <>
      {open && (
        <div className={s.overlay} role="dialog" aria-modal="true">
          <div className={s.modal}>
            <div className={s.topBar}>
              <span className={s.pill}>월 작업장 순회 점검표</span>
              <button className={s.iconBtn} onClick={onClose} disabled={exportLoading}>
                <X size={18} />
              </button>
            </div>

            <div className={s.card}>
              <div className={s.header}>
                <h3 className={s.title}>월 작업장 순회 점검표</h3>
                <p className={s.desc}>
                  세부 작업을 입력하면 AI가 맞춤형 점검 항목을 생성합니다.<br />
                  <span className={s.subDesc}>{weekLabel}</span>
                </p>
              </div>

              {step === 0 && (
                <>
                  <label className={s.label}>세부 작업 검색</label>
                  <MonthlyInspectionDetailTaskAutocompleteInput
                    value={detailTasks}
                    onChange={setDetailTasks}
                  />
                  {genError && <div className={s.errorText}>{genError}</div>}
                  <button
                    className={s.primaryBtn}
                    disabled={!canGoStep1 || genLoading}
                    onClick={handleCreateChecklist}
                  >
                    {genLoading ? <Loader2 size={18} className={s.spin} /> : <FileText size={18} />}
                    {genLoading ? ' 항목 생성 중...' : ' 점검표 생성하기'}
                  </button>
                </>
              )}

              {step === 1 && (
                <StepBuildChecklist
                  detailTasks={detailTasks}
                  initialSections={sections}
                  onBack={() => setStep(0)}
                  onNext={handleConfirmChecklist}
                />
              )}

              {step === 2 && (
                <StepRunChecklist
                  detailTasks={detailTasks}
                  items={items}
                  onChangeItems={setItems}
                  onBack={() => setStep(1)}
                  onFinish={handleFinish}
                  finishDisabled={!canFinish || exportLoading}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <CenteredAlertModal
        open={alertOpen}
        title={alertConfig.title}
        lines={alertConfig.lines}
        confirmText={alertConfig.confirmText}
        showClose={alertConfig.showClose}
        onConfirm={() => {
          const fn = alertOnConfirmRef.current;
          if (fn) fn();
          else closeAlert();
        }}
        onClose={closeAlert}
      />
    </>
  );
}