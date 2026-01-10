'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';
import s from './MonthlyInspectionCreateModal.module.css';

import MonthlyInspectionDetailTaskAutocompleteInput from './MonthlyInspectionDetailTaskAutocompleteInput';
import StepBuildChecklist from './steps/StepBuildChecklist';
import StepRunChecklist from './steps/StepRunChecklist';
import CompletionToastModal from './ui/CompletionToastModal';

export type Rating = 'O' | '△' | 'X';

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
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const norm = (v?: string | null) => (v ?? '').trim();

/** -----------------------
 * 체크리스트 생성 결과 캐시 (GPT 결과 재사용)
 * ---------------------- */
type ChecklistCacheEntry = {
  t: number; // saved at
  minorKey: string; // normalized minor
  tasks: string[]; // normalized+sorted unique
  sections: Sections;
  model?: string;
  hazards?: string[];
};
type ChecklistCacheStore = Record<string, ChecklistCacheEntry>;

const CHECKLIST_CACHE_KEY = 'regai:monthlyInspection:checklistGen:v1';
const CHECKLIST_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180일
const CHECKLIST_CACHE_MAX = 120;

/** -----------------------
 * 모달 드래프트 캐시 (모달 껐다 켜도 유지)
 * ---------------------- */
type DraftEntry = {
  t: number;
  minorKey: string;
  step: 0 | 1 | 2;
  detailTasks: string[];
  sections?: Sections;
  items?: ChecklistItem[];
};
type DraftStore = Record<string, DraftEntry>;

const DRAFT_CACHE_KEY = 'regai:monthlyInspection:draft:v1';
const DRAFT_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30일
const DRAFT_CACHE_MAX = 30;

function safeJsonParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeLoadLocal<T>(key: string): T | null {
  try {
    if (typeof window === 'undefined') return null;
    return safeJsonParse<T>(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

function safeSaveLocal(key: string, value: any) {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function pruneStore<T extends { t: number }>(
  store: Record<string, T>,
  ttlMs: number,
  maxKeys: number,
): Record<string, T> {
  const now = Date.now();
  const entries = Object.entries(store || {})
    .filter(([, v]) => v && typeof v.t === 'number' && now - v.t <= ttlMs);

  entries.sort((a, b) => (b[1].t ?? 0) - (a[1].t ?? 0));
  return Object.fromEntries(entries.slice(0, maxKeys));
}

/** 키 길이 줄이기용: fnv1a 32-bit */
function fnv1a32(input: string): string {
  let h = 0x811c9dc5; // 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 16777619 (32-bit)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function minorKeyOf(minorCategory?: string | null) {
  const m = norm(minorCategory);
  return m ? m : 'ALL';
}

function stableTaskSet(tasks: string[]): string[] {
  const cleaned = tasks.map(norm).filter(Boolean);
  return Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
}

function checklistCacheId(minorKey: string, stableTasksArr: string[]) {
  // order-insensitive
  const base = `${minorKey}||${stableTasksArr.join('||')}`;
  return fnv1a32(base);
}

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

function buildFallbackSections(detailTasks: string[]): Sections {
  const hint = detailTasks.length ? `(${detailTasks.slice(0, 3).join(', ')} 등)` : '';
  return {
    '사업장 점검 사항': [
      `작업장 정리정돈/통로 확보가 유지되는가? ${hint}`,
      '출입 통제 및 위험구역 표시가 적절한가?',
      '비상구/소화기/대피로 접근이 원활한가?',
    ],
    '노동안전 점검 사항': [
      '개인보호구(PPE) 착용이 적절한가?',
      '기계/설비 방호장치가 정상 작동하는가?',
      '작업 전 위험성 공유(TBM)가 실시되었는가?',
    ],
    '세부 작업 및 공정별 점검 사항': [
      '끼임/협착 위험 구간에서 안전거리/방호조치가 확보되었는가?',
      '중량물 취급 시 인양장비 점검 및 신호수 배치가 되었는가?',
      '화기/가연물 작업 시 화재예방 및 감시가 이루어지는가?',
    ],
  };
}

type GenResponse = {
  sections?: Partial<Record<string, string[]>>;
  hazards?: string[];
  model?: string;
};

export default function MonthlyInspectionCreateModal({
  open,
  onClose,
  onSubmit,
  defaultValue,
  minorCategory,
}: Props) {
  const [step, setStep] = useState<0 | 1 | 2>(0);

  const [detailTasks, setDetailTasks] = useState<string[]>(defaultValue?.detailTasks ?? []);
  const [sections, setSections] = useState<Sections>(
    defaultValue?.sections ??
      ({
        '사업장 점검 사항': [],
        '노동안전 점검 사항': [],
        '세부 작업 및 공정별 점검 사항': [],
      } as Sections),
  );
  const [items, setItems] = useState<ChecklistItem[]>(defaultValue?.results ?? []);

  const [doneOpen, setDoneOpen] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string>('');

  const today = useMemo(() => new Date(), []);
  const weekLabel = useMemo(() => formatKoreanWeekLabel(today), [today]);
  const dateISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const dirtyRef = useRef(false);
  const markDirty = () => {
    dirtyRef.current = true;
  };

  const canFinish = useMemo(() => items.some((it) => !!it.rating), [items]);
  const canGoStep1 = detailTasks.map(norm).filter(Boolean).length > 0;

  /** 캐시 refs */
  const checklistCacheRef = useRef<ChecklistCacheStore>({});
  const draftRef = useRef<DraftStore>({});
  const saveDebounceRef = useRef<number | null>(null);

  /** 캐시 로드 (open 시점에만) */
  useEffect(() => {
    if (!open) return;

    const cl = pruneStore<ChecklistCacheEntry>(
      safeLoadLocal<ChecklistCacheStore>(CHECKLIST_CACHE_KEY) || {},
      CHECKLIST_CACHE_TTL_MS,
      CHECKLIST_CACHE_MAX,
    );
    checklistCacheRef.current = cl;
    safeSaveLocal(CHECKLIST_CACHE_KEY, cl);

    const dr = pruneStore<DraftEntry>(
      safeLoadLocal<DraftStore>(DRAFT_CACHE_KEY) || {},
      DRAFT_CACHE_TTL_MS,
      DRAFT_CACHE_MAX,
    );
    draftRef.current = dr;
    safeSaveLocal(DRAFT_CACHE_KEY, dr);
  }, [open]);

  /** draft 저장 (debounced) */
  const scheduleSaveDraft = (entry: DraftEntry | null) => {
    if (saveDebounceRef.current) window.clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = window.setTimeout(() => {
      if (entry) {
        draftRef.current[entry.minorKey] = entry;
      }
      const pruned = pruneStore<DraftEntry>(draftRef.current, DRAFT_CACHE_TTL_MS, DRAFT_CACHE_MAX);
      draftRef.current = pruned;
      safeSaveLocal(DRAFT_CACHE_KEY, pruned);
    }, 300);
  };

  /** 완료 후 draft 초기화(원하면 유지해도 됨) */
  const clearDraftForMinor = () => {
    const mk = minorKeyOf(minorCategory);
    delete draftRef.current[mk];
    const pruned = pruneStore<DraftEntry>(draftRef.current, DRAFT_CACHE_TTL_MS, DRAFT_CACHE_MAX);
    draftRef.current = pruned;
    safeSaveLocal(DRAFT_CACHE_KEY, pruned);
  };

  /** open 시 state 복원 로직
   * 1) defaultValue 우선
   * 2) 없으면 draft 캐시로 복원
   */
  useEffect(() => {
    if (!open) return;

    dirtyRef.current = false;
    setDoneOpen(false);
    setGenLoading(false);
    setGenError('');

    const dvTasks = (defaultValue?.detailTasks ?? []).map(norm).filter(Boolean);
    const dvSections = defaultValue?.sections;
    const dvResults = defaultValue?.results;

    // ✅ 1) defaultValue 우선
    if (dvTasks.length > 0) {
      setDetailTasks(dvTasks);

      if (dvSections) {
        const cleaned = cleanSections(dvSections as Sections);
        setSections(cleaned);

        if (dvResults?.length) {
          setItems(dvResults as ChecklistItem[]);
          setStep(2);
        } else {
          setItems(toItems(cleaned));
          setStep(1);
        }
      } else {
        setSections({
          '사업장 점검 사항': [],
          '노동안전 점검 사항': [],
          '세부 작업 및 공정별 점검 사항': [],
        });
        setItems([]);
        setStep(0);
      }
      return;
    }

    // ✅ 2) draft 캐시 복원
    const mk = minorKeyOf(minorCategory);
    const cachedDraft = draftRef.current?.[mk];
    const now = Date.now();

    if (cachedDraft && now - cachedDraft.t <= DRAFT_CACHE_TTL_MS) {
      const tasks = (cachedDraft.detailTasks ?? []).map(norm).filter(Boolean);
      const sec = cachedDraft.sections;
      const its = cachedDraft.items;

      setDetailTasks(tasks);

      if (sec && sec['사업장 점검 사항'] && sec['노동안전 점검 사항'] && sec['세부 작업 및 공정별 점검 사항']) {
        const cleaned = cleanSections(sec);
        setSections(cleaned);

        if (cachedDraft.step === 2 && Array.isArray(its) && its.length > 0) {
          setItems(its);
          setStep(2);
        } else {
          setItems(toItems(cleaned));
          setStep(1);
        }
      } else {
        setSections({
          '사업장 점검 사항': [],
          '노동안전 점검 사항': [],
          '세부 작업 및 공정별 점검 사항': [],
        });
        setItems([]);
        setStep(0);
      }
      return;
    }

    // ✅ 아무것도 없으면 초기화
    setStep(0);
    setDetailTasks([]);
    setSections({
      '사업장 점검 사항': [],
      '노동안전 점검 사항': [],
      '세부 작업 및 공정별 점검 사항': [],
    });
    setItems([]);
  }, [open, defaultValue, minorCategory]);

  /** 모달 열려있을 때 body scroll lock */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /** 모달 열려있을 때 draft 자동 저장 */
  useEffect(() => {
    if (!open) return;

    const mk = minorKeyOf(minorCategory);

    const entry: DraftEntry = {
      t: Date.now(),
      minorKey: mk,
      step,
      detailTasks: detailTasks.map(norm).filter(Boolean),
      sections: step >= 1 ? sections : undefined,
      items: step >= 2 ? items : undefined,
    };

    scheduleSaveDraft(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, detailTasks, sections, items, minorCategory]);

  if (!open) return null;

  /** ✅ 캐시 기반: 동일 세트면 API 호출 없이 즉시 sections 로드 */
  const handleCreateChecklist = async () => {
    markDirty();
    setGenError('');

    const mk = minorKeyOf(minorCategory);
    const tasksStable = stableTaskSet(detailTasks);
    if (tasksStable.length === 0) return;

    const cid = checklistCacheId(mk, tasksStable);
    const now = Date.now();

    const cached = checklistCacheRef.current?.[cid];
    if (cached && now - cached.t <= CHECKLIST_CACHE_TTL_MS) {
      const cachedSections = cleanSections(cached.sections);
      setSections(cachedSections);
      setItems(toItems(cachedSections));
      setStep(1);
      return;
    }

    setGenLoading(true);

    try {
      const res = await fetch('/api/risk-assessment?endpoint=monthly-inspection-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minorCategory: mk === 'ALL' ? undefined : mk,
          detailTasks: tasksStable,
          limitPerCategory: 10,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`generate checklist failed: ${res.status} ${txt}`);
      }

      const data = (await res.json()) as GenResponse;
      const sec = data?.sections ?? {};

      const next: Sections = {
        '사업장 점검 사항': (sec['사업장 점검 사항'] ?? []).map(String),
        '노동안전 점검 사항': (sec['노동안전 점검 사항'] ?? []).map(String),
        '세부 작업 및 공정별 점검 사항': (sec['세부 작업 및 공정별 점검 사항'] ?? []).map(String),
      };

      const cleaned = cleanSections(next);

      const anyEmpty =
        cleaned['사업장 점검 사항'].length === 0 ||
        cleaned['노동안전 점검 사항'].length === 0 ||
        cleaned['세부 작업 및 공정별 점검 사항'].length === 0;

      const finalSections = anyEmpty ? buildFallbackSections(tasksStable) : cleaned;

      setSections(finalSections);
      setItems(toItems(finalSections));
      setStep(1);

      // ✅ API 성공 시에만 “생성 결과 캐시” 저장 (fallback만 나온 경우는 원하면 저장해도 됨)
      if (!anyEmpty) {
        checklistCacheRef.current[cid] = {
          t: Date.now(),
          minorKey: mk,
          tasks: tasksStable,
          sections: finalSections,
          model: data?.model,
          hazards: data?.hazards,
        };

        const pruned = pruneStore<ChecklistCacheEntry>(
          checklistCacheRef.current,
          CHECKLIST_CACHE_TTL_MS,
          CHECKLIST_CACHE_MAX,
        );
        checklistCacheRef.current = pruned;
        safeSaveLocal(CHECKLIST_CACHE_KEY, pruned);
      }
    } catch (e) {
      const fb = buildFallbackSections(tasksStable);
      setSections(fb);
      setItems(toItems(fb));
      setStep(1);
      setGenError((e as Error)?.message || '점검 항목 생성에 실패했습니다.');
    } finally {
      setGenLoading(false);
    }
  };

  const handleConfirmChecklist = (nextSections: Sections) => {
    markDirty();
    const cleaned = cleanSections(nextSections);
    setSections(cleaned);
    setItems(toItems(cleaned));
    setStep(2);
  };

  const handleFinish = async () => {
    const payload: MonthlyInspectionPayload = {
      dateISO,
      detailTasks: detailTasks.map(norm).filter(Boolean),
      sections,
      results: items,
    };

    try {
      await onSubmit?.(payload);
    } finally {
      setDoneOpen(true);
    }
  };

  const resetAndClose = () => {
    // ✅ close는 state reset 하되, draft는 localStorage에 남겨서 다음 open에 복원됨
    setStep(0);
    setDetailTasks([]);
    setSections({
      '사업장 점검 사항': [],
      '노동안전 점검 사항': [],
      '세부 작업 및 공정별 점검 사항': [],
    });
    setItems([]);
    setDoneOpen(false);
    setGenLoading(false);
    setGenError('');
    onClose();
  };

  const closeAfterDone = () => {
    // ✅ “완료” 확인 후에는 draft를 비우는 편이 보통 UX가 좋음(원하면 이 줄 삭제)
    clearDraftForMinor();
    resetAndClose();
  };

  return (
    <div
      className={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="월 작업장 순회 점검표"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) resetAndClose();
      }}
    >
      <div className={s.modal}>
        <div className={s.topBar}>
          <span className={s.pill}>월 작업장 순회 점검표</span>
          <button type="button" className={s.iconBtn} onClick={resetAndClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className={s.card}>
          <div className={s.header}>
            <h3 className={s.title}>월 작업장 순회 점검표</h3>
            <p className={s.desc}>
              세부 작업을 검색해 추가하면, 해당 작업/소분류 위험요인 기반으로 점검 항목을 생성합니다. <br />
              <span className={s.subDesc}>{weekLabel}</span>
            </p>
          </div>

          {step === 0 && (
            <>
              <label className={s.label}>세부 작업 검색</label>

              <MonthlyInspectionDetailTaskAutocompleteInput
                value={detailTasks}
                onChange={(next) => {
                  markDirty();
                  setDetailTasks(next);
                }}
              />

              {genError && <div className={s.errorText}>{genError}</div>}

              <button
                type="button"
                className={s.primaryBtn}
                disabled={!canGoStep1 || genLoading}
                onClick={handleCreateChecklist}
              >
                {genLoading ? (
                  <>
                    <Loader2 size={18} className={s.spin} />
                    점검 항목 생성 중...
                  </>
                ) : (
                  <>
                    <FileText size={18} />
                    월 작업장 순회 점검표 생성
                  </>
                )}
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
              onChangeItems={(next) => {
                markDirty();
                setItems(next);
              }}
              onBack={() => setStep(1)}
              onFinish={handleFinish}
              finishDisabled={!canFinish}
            />
          )}
        </div>
      </div>

      <CompletionToastModal
        open={doneOpen}
        title="순회 점검 완료"
        message={`${weekLabel} 작업장 순회 점검이 완료되었습니다.`}
        onConfirm={closeAfterDone}
      />
    </div>
  );
}
