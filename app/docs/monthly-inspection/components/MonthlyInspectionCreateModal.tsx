'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';
import s from './MonthlyInspectionCreateModal.module.css';

import MonthlyInspectionDetailTaskAutocompleteInput from './MonthlyInspectionDetailTaskAutocompleteInput';
import StepBuildChecklist from './steps/StepBuildChecklist';
import StepRunChecklist from './steps/StepRunChecklist';
import CenteredAlertModal from './ui/AlertModal';

import { useUserStore } from '@/app/store/user';
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context 수정: page='Docs', area='CreateModal'
const GA_CTX = { page: 'Docs', section: 'MonthlyInspection', area: 'CreateModal' } as const;

export type Rating = 'O' | '△' | 'X';

export type ChecklistCategory =
  | '사업장 점검 사항'
  | '노동안전 점검 사항'
  | '작업 및 공정별 점검 사항';

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
    '사업장 점검 사항': Array.from(
      new Set((nextSections['사업장 점검 사항'] ?? []).map(norm).filter(Boolean)),
    ),
    '노동안전 점검 사항': Array.from(
      new Set((nextSections['노동안전 점검 사항'] ?? []).map(norm).filter(Boolean)),
    ),
    '작업 및 공정별 점검 사항': Array.from(
      new Set((nextSections['작업 및 공정별 점검 사항'] ?? []).map(norm).filter(Boolean)),
    ),
  };
}

// ---------------- LocalStorage Helpers ----------------
const DRAFT_KEY = 'regai:monthlyInspection:draft:v1';
function loadDraft(): any {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveDraft(data: any) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, t: Date.now() }));
  } catch {}
}

const CHECKLIST_CACHE_KEY = 'regai:monthlyInspection:checklistCache:v1';
function loadChecklistCache() {
  try {
    const raw = localStorage.getItem(CHECKLIST_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
// ------------------------------------------------------

export default function MonthlyInspectionCreateModal({
  open,
  onClose,
  onSubmit,
  defaultValue,
  minorCategory,
  onRequireLogin,
}: Props) {
  // 0: 작업선택, 1: 항목구성, 2: 점검실시
  const [step, setStep] = useState<0 | 1 | 2>(0);
  
  const [detailTasks, setDetailTasks] = useState<string[]>(defaultValue?.detailTasks ?? []);
  const [sections, setSections] = useState<Sections>(
    defaultValue?.sections ?? {
      '사업장 점검 사항': [],
      '노동안전 점검 사항': [],
      '작업 및 공정별 점검 사항': [],
    },
  );
  const [items, setItems] = useState<ChecklistItem[]>(defaultValue?.results ?? []);

  // 하나라도 평가가 있으면 true
  const canFinish = useMemo(() => items.some((it) => !!it.rating), [items]);

  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string>('');
  const [exportLoading, setExportLoading] = useState(false);

  const today = useMemo(() => new Date(), []);
  const weekLabel = useMemo(() => formatKoreanWeekLabel(today), [today]);
  const dateISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const user = useUserStore((st) => st.user);
  const userEmail = (user?.email || '').trim();

  // Alert Modal State
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', lines: [] as string[], confirmText: '확인', showClose: false });
  const alertOnConfirmRef = useRef<(() => void) | null>(null);

  const openAlert = (cfg: any) => {
    setAlertConfig({
      title: cfg.title || '안내',
      lines: cfg.lines || [],
      confirmText: cfg.confirmText || '확인',
      showClose: !!cfg.showClose,
    });
    alertOnConfirmRef.current = cfg.onConfirm || null;
    setAlertOpen(true);
  };

  const closeAlert = () => {
    setAlertOpen(false);
    alertOnConfirmRef.current = null;
  };

  // Cache Init
  const checklistCacheRef = useRef<any>({});
  useEffect(() => {
    if (typeof window !== 'undefined') checklistCacheRef.current = loadChecklistCache();
  }, []);

  // ✅ GA: 모달 View 추적 (Step 변경 시에도 추적)
  useEffect(() => {
    if (open) {
      track(gaEvent(GA_CTX, 'View'), {
        ui_id: gaUiId(GA_CTX, 'View'),
        step,
        is_logged_in: !!userEmail,
      });
    }
  }, [open, step, userEmail]);

  // Init Logic
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;

    // ✅ 수정된 부분: 모달이 "처음 열리는 순간"에만 실행
    if (!prev && open) {
      setGenLoading(false);
      setExportLoading(false);
      setGenError('');

      // defaultValue(기본값)가 있거나 이미 작업이 선택되어 있다면 드래프트를 불러오지 않음
      if (detailTasks.length > 0) return;

      // 드래프트 로드 로직을 여기 안으로 이동
      const draft = loadDraft();
      if (draft) {
        setDetailTasks(draft.detailTasks || []);
        const dSec = draft.sections || {};
        setSections(cleanSections(dSec));

        const dRes = (draft.results || []).map((it: any) => ({
          ...it,
          category: it.category,
          rating: it.rating
        }));
        setItems(dRes);
        setStep(draft.step ?? 0);
      }
    }
  }, [open, defaultValue]); // ❌ [open, defaultValue, detailTasks.length] 에서 detailTasks.length 제거

  // Auto Save
  useEffect(() => {
    if (!open) return;
    saveDraft({ detailTasks, sections, results: items, step });
  }, [open, step, detailTasks, sections, items]);


  // --- Actions ---

  // 1. AI 항목 생성 (Step 0 -> 1)
  const handleCreateChecklist = async () => {
    setGenError('');
    setGenLoading(true);
    const tasks = detailTasks.map(norm).filter(Boolean);

    // ✅ GA: 생성 시작
    track(gaEvent(GA_CTX, 'ClickCreate'), {
        ui_id: gaUiId(GA_CTX, 'ClickCreate'),
        task_count: tasks.length
    });

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

      if (!res.ok) throw new Error('생성 실패');
      const data = await res.json();
      const sec = data?.sections ?? {};
      const next: Sections = {
        '사업장 점검 사항': (sec['사업장 점검 사항'] ?? []).map(String),
        '노동안전 점검 사항': (sec['노동안전 점검 사항'] ?? []).map(String),
        '작업 및 공정별 점검 사항': (sec['작업 및 공정별 점검 사항'] ?? sec['작업 및 공정별 점검 사항'] ?? []).map(String),
      };

      const cleaned = cleanSections(next);
      setSections(cleaned);
      setItems(toItems(cleaned)); 
      setStep(1);
    } catch (e: any) {
      setGenError(e.message || '오류 발생');
    } finally {
      setGenLoading(false);
    }
  };

  // 2. 점검 실시 진입 (Step 1 -> 2)
  const handleConfirmChecklist = () => {
    const cleaned = cleanSections(sections);
    const nextItems = toItems(cleaned);
    
    // ✅ GA: 점검 실시 시작
    track(gaEvent(GA_CTX, 'ClickStartInspection'), {
        ui_id: gaUiId(GA_CTX, 'ClickStartInspection'),
        total_items: nextItems.length
    });

    setSections(cleaned);
    setItems(nextItems);
    setStep(2);
  };

  // 3. 점검 완료 및 엑셀 다운로드 (Step 2 -> Finish)
  const handleFinish = async () => {
    if (!userEmail) {
      openAlert({
        title: '로그인이 필요합니다',
        lines: ['저장을 위해 로그인이 필요합니다.'],
        confirmText: '로그인하기',
        onConfirm: () => onRequireLogin?.(),
      });
      return;
    }
    if (exportLoading) return;

    // ✅ GA: 완료 클릭
    track(gaEvent(GA_CTX, 'ClickFinish'), {
        ui_id: gaUiId(GA_CTX, 'ClickFinish'),
        total_items: items.length,
        checked_items: items.filter(i => !!i.rating).length
    });

    const payload: MonthlyInspectionPayload = {
      dateISO,
      detailTasks: detailTasks.map(norm).filter(Boolean),
      sections,
      results: items,
    };

    openAlert({
      title: '점검표 생성 요청',
      lines: ['서버에서 문서를 생성 중입니다.', '완료되면 이메일/파일함에서 확인 가능합니다.'],
      confirmText: '확인',
      onConfirm: () => onClose(), 
    });

    setExportLoading(true);
    
    try {
      if (onSubmit) await onSubmit(payload);
      const res = await fetch('/api/risk-assessment?endpoint=monthly-inspection-export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-email': userEmail },
        body: JSON.stringify(payload),
      });
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `월_순회점검표_${dateISO}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      console.error(e);
    } finally {
      setExportLoading(false);
    }
  };

  // 4. 이전 단계
  const handleBack = () => {
    track(gaEvent(GA_CTX, 'ClickBack'), {
        ui_id: gaUiId(GA_CTX, 'ClickBack'),
        from_step: step
    });
    setStep((prev) => (prev - 1) as any);
  };

  return (
    <>
      {open && (
        <div className={s.overlay} role="dialog" aria-modal="true">
          <div className={s.modal}>
            <div className={s.topBar}>
              <span className={s.pill}>월 작업장 순회 점검표</span>
              {/* ✅ GA: 닫기 버튼 */}
              <button 
                className={s.iconBtn} 
                onClick={() => {
                    track(gaEvent(GA_CTX, 'Close'), { ui_id: gaUiId(GA_CTX, 'Close') });
                    onClose();
                }} 
                disabled={exportLoading}
                data-ga-event="Close"
                data-ga-id={gaUiId(GA_CTX, 'Close')}
              >
                <X size={18} />
              </button>
            </div>

            <div className={s.card}>
              <div className={s.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 className={s.title}>월 작업장 순회 점검표</h3>
                  <p className={s.desc}>
                    {step === 0 && '작업을 입력하면 AI가 맞춤형 점검 항목을 생성합니다.'}
                    {step === 1 && '생성된 점검 항목을 검토하고 수정해주세요.'}
                    {step === 2 && '각 항목별 점검 결과(O/X)를 입력해주세요.'}
                    <br />
                    <span className={s.subDesc}>{weekLabel}</span>
                  </p>
                </div>

                {/* 헤더 버튼 그룹 */}
                {step > 0 && (
                  <div className={s.headerActions} style={{ display: 'flex', gap: '8px', minWidth: 'fit-content' }}>
                    
                    {/* Primary Button */}
                    {step === 1 && (
                      <button 
                        className={s.primaryBtn} 
                        onClick={handleConfirmChecklist}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', marginTop: 0 }}
                        data-ga-event="ClickStartInspection"
                        data-ga-id={gaUiId(GA_CTX, 'ClickStartInspection')}
                      >
                        점검 실시
                      </button>
                    )}
                    
                    {step === 2 && (
                      <button 
                        className={s.primaryBtn} 
                        onClick={handleFinish}
                        disabled={!canFinish || exportLoading}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.9rem', marginTop: 0 }}
                        data-ga-event="ClickFinish"
                        data-ga-id={gaUiId(GA_CTX, 'ClickFinish')}
                      >
                        점검 완료
                      </button>
                    )}

                    {/* Secondary Button */}
                    <button 
                      className={s.secondaryBtn} 
                      onClick={handleBack}
                      style={{ padding: '0.5rem 0.8rem', fontSize: '0.9rem' }}
                      data-ga-event="ClickBack"
                      data-ga-id={gaUiId(GA_CTX, 'ClickBack')}
                    >
                      이전
                    </button>
                  </div>
                )}
              </div>

              {step === 0 && (
                <>
                  <label className={s.label}>작업 검색</label>
                  <MonthlyInspectionDetailTaskAutocompleteInput
                    value={detailTasks}
                    onChange={setDetailTasks}
                  />
                  {genError && <div className={s.errorText}>{genError}</div>}
                  <button
                    className={s.primaryBtn}
                    disabled={detailTasks.length === 0 || genLoading}
                    onClick={handleCreateChecklist}
                    data-ga-event="ClickCreate"
                    data-ga-id={gaUiId(GA_CTX, 'ClickCreate')}
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
                  onNext={(updatedSections) => {
                      setSections(updatedSections);
                      setItems(toItems(updatedSections));
                      handleConfirmChecklist(); // 다음 단계로 이동 처리
                  }}
                />
              )}

              {step === 2 && (
                <StepRunChecklist
                  detailTasks={detailTasks}
                  items={items}
                  onChangeItems={setItems}
                  onBack={handleBack}
                  onFinish={handleFinish}
                  finishDisabled={false}
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
          closeAlert(); 
          if (fn) fn();
        }}
        onClose={closeAlert}
      />
    </>
  );
}