// components/monthly-inspection/MonthlyInspectionCreateModal.tsx
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

const CATS: ChecklistCategory[] = [
  '사업장 점검 사항',
  '노동안전 점검 사항',
  '세부 작업 및 공정별 점검 사항',
];

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

/** -----------------------
 * localStorage: draft (모달 껐다 켜도 그대로)
 * ---------------------- */
type DraftState = {
  t: number;
  minorCategory?: string | null;
  step: 0 | 1 | 2;
  detailTasks: string[];
  sections: Sections;
  results: ChecklistItem[];
};

const DRAFT_KEY = 'regai:monthlyInspection:draft:v1';
const DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180일

function loadDraft(): DraftState | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftState;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.t || Date.now() - parsed.t > DRAFT_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveDraft(next: Omit<DraftState, 't'>) {
  try {
    const payload: DraftState = { ...next, t: Date.now() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

/** -----------------------
 * localStorage: checklist cache (세부작업 세트 동일 시 GPT 호출 방지)
 * ---------------------- */
type ChecklistCacheEntry = {
  t: number;
  key: string;
  minorKey: string;     // minorCategory 정규화
  tasksKey: string;     // 정규화된 tasks(정렬) 기반
  sections: Sections;
};

type ChecklistCacheStore = Record<string, ChecklistCacheEntry>;

const CHECKLIST_CACHE_KEY = 'regai:monthlyInspection:checklistCache:v1';
const CHECKLIST_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30일
const CHECKLIST_CACHE_MAX = 120;

function fnv1a32(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function stableTasksKey(minorCategory: string | null | undefined, tasks: string[]) {
  const minorKey = norm(minorCategory || '') || 'ALL';
  const arr = tasks.map(norm).filter(Boolean).sort();
  const tasksKey = arr.join('||');
  const raw = `${minorKey}::${tasksKey}`;
  const key = fnv1a32(raw);
  return { key, minorKey, tasksKey, sortedTasks: arr };
}

function loadChecklistCache(): ChecklistCacheStore {
  try {
    const raw = localStorage.getItem(CHECKLIST_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ChecklistCacheStore;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function pruneChecklistCache(store: ChecklistCacheStore): ChecklistCacheStore {
  const now = Date.now();
  const entries = Object.entries(store)
    .filter(([, v]) => v && typeof v.t === 'number' && v.sections)
    .filter(([, v]) => now - v.t <= CHECKLIST_CACHE_TTL_MS);

  entries.sort((a, b) => (b[1].t ?? 0) - (a[1].t ?? 0));
  const limited = entries.slice(0, CHECKLIST_CACHE_MAX);
  return Object.fromEntries(limited);
}

function saveChecklistCache(store: ChecklistCacheStore) {
  try {
    localStorage.setItem(CHECKLIST_CACHE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

function getFilenameFromContentDisposition(cd: string | null, fallback: string) {
  if (!cd) return fallback;

  // filename*=UTF-8''...
  const mStar = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (mStar?.[1]) {
    try {
      return decodeURIComponent(mStar[1]);
    } catch {
      return mStar[1];
    }
  }

  // filename="..."
  const m = cd.match(/filename\s*=\s*"([^"]+)"/i) || cd.match(/filename\s*=\s*([^;]+)/i);
  if (m?.[1]) return m[1].trim();

  return fallback;
}

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

  const [exportLoading, setExportLoading] = useState(false);

  const today = useMemo(() => new Date(), []);
  const weekLabel = useMemo(() => formatKoreanWeekLabel(today), [today]);
  const dateISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const dirtyRef = useRef(false);
  const markDirty = () => {
    dirtyRef.current = true;
  };

  const canFinish = useMemo(() => items.some((it) => !!it.rating), [items]);
  const canGoStep1 = detailTasks.map(norm).filter(Boolean).length > 0;

  // ✅ checklist cache store in memory
  const checklistCacheRef = useRef<ChecklistCacheStore>({});

  // mount: load checklist cache
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const loaded = pruneChecklistCache(loadChecklistCache());
    checklistCacheRef.current = loaded;
    saveChecklistCache(loaded);
  }, []);

  // ✅ open 시: defaultValue 우선, 없으면 draft 복원
  useEffect(() => {
    if (!open) return;

    dirtyRef.current = false;
    setDoneOpen(false);
    setGenLoading(false);
    setGenError('');
    setExportLoading(false);

    const dvTasks = (defaultValue?.detailTasks ?? []).map(norm).filter(Boolean);
    const dvSections = defaultValue?.sections;
    const dvResults = defaultValue?.results;

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

    // ✅ draft 로드 (모달 껐다 켜도 동일)
    const draft = loadDraft();
    if (draft) {
      setDetailTasks((draft.detailTasks ?? []).map(norm).filter(Boolean));
      setSections(cleanSections(draft.sections ?? {
        '사업장 점검 사항': [],
        '노동안전 점검 사항': [],
        '세부 작업 및 공정별 점검 사항': [],
      }));
      setItems(draft.results ?? []);
      setStep(draft.step ?? 0);
      return;
    }

    // ✅ 아무 것도 없으면 초기화
    setStep(0);
    setDetailTasks([]);
    setSections({
      '사업장 점검 사항': [],
      '노동안전 점검 사항': [],
      '세부 작업 및 공정별 점검 사항': [],
    });
    setItems([]);
  }, [open, defaultValue]);

  // ✅ body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ✅ draft 즉시 저장 (세부작업 1개만 추가하고 바로 닫아도 안 날아가게)
  const persistDraftNow = (next?: Partial<DraftState>) => {
    const payload: Omit<DraftState, 't'> = {
      minorCategory: minorCategory ?? null,
      step,
      detailTasks: detailTasks.map(norm).filter(Boolean),
      sections,
      results: items,
      ...(next ?? {}),
    };
    saveDraft(payload);
  };

  // 상태 바뀔 때마다 draft 저장(짧은 debounce가 필요하면 추가 가능)
  useEffect(() => {
    if (!open) return;
    persistDraftNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, detailTasks, sections, items, minorCategory]);

  if (!open) return null;

  const closeOnly = () => {
    // ✅ reset하지 않음: 캐시/드래프트 유지
    setDoneOpen(false);
    onClose();
  };

  const handleCreateChecklist = async () => {
    markDirty();
    setGenError('');
    setGenLoading(true);

    const tasks = detailTasks.map(norm).filter(Boolean);

    // ✅ 캐시 키 생성 (minor + tasks set)
    const { key, minorKey } = stableTasksKey(minorCategory, tasks);

    // ✅ 1) 캐시 hit면 GPT 호출/서버 호출 없이 바로 로드
    const cached = checklistCacheRef.current[key];
    if (cached && Date.now() - cached.t <= CHECKLIST_CACHE_TTL_MS) {
      setSections(cached.sections);
      setItems(toItems(cached.sections));
      setStep(1);
      setGenLoading(false);

      persistDraftNow({
        step: 1,
        detailTasks: tasks,
        sections: cached.sections,
        results: toItems(cached.sections),
      });

      return;
    }

    // ✅ 2) 캐시 없으면 서버 호출
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

      const finalSections = anyEmpty ? buildFallbackSections(tasks) : cleaned;

      // ✅ 캐시에 저장
      const store = checklistCacheRef.current;
      store[key] = {
        t: Date.now(),
        key,
        minorKey,
        tasksKey: stableTasksKey(minorCategory, tasks).tasksKey,
        sections: finalSections,
      };
      checklistCacheRef.current = pruneChecklistCache(store);
      saveChecklistCache(checklistCacheRef.current);

      setSections(finalSections);
      setItems(toItems(finalSections));
      setStep(1);

      persistDraftNow({
        step: 1,
        detailTasks: tasks,
        sections: finalSections,
        results: toItems(finalSections),
      });
    } catch (e) {
      // fallback + (원하면 fallback도 캐시 저장 가능)
      const fb = buildFallbackSections(tasks);
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
    const nextItems = toItems(cleaned);

    setSections(cleaned);
    setItems(nextItems);
    setStep(2);

    // ✅ 편집된 섹션도 캐시에 덮어쓰기 (같은 세트면 다음엔 편집본 바로 뜸)
    const tasks = detailTasks.map(norm).filter(Boolean);
    const { key, minorKey, tasksKey } = stableTasksKey(minorCategory, tasks);

    const store = checklistCacheRef.current;
    store[key] = {
      t: Date.now(),
      key,
      minorKey,
      tasksKey,
      sections: cleaned,
    };
    checklistCacheRef.current = pruneChecklistCache(store);
    saveChecklistCache(checklistCacheRef.current);

    persistDraftNow({
      step: 2,
      detailTasks: tasks,
      sections: cleaned,
      results: nextItems,
    });
  };

  const handleFinish = async () => {
    const payload: MonthlyInspectionPayload = {
      dateISO,
      detailTasks: detailTasks.map(norm).filter(Boolean),
      sections,
      results: items,
    };

    setExportLoading(true);

    try {
      // (옵션) DB 저장/로그
      await onSubmit?.(payload);

      // ✅ 엑셀 다운로드
      const res = await fetch('/api/risk-assessment?endpoint=monthly-inspection-export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`export excel failed: ${res.status} ${txt}`);
      }

      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      const fallbackName = `월_작업장_순회점검표_${dateISO}.xlsx`;
      const filename = getFilenameFromContentDisposition(cd, fallbackName);

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setDoneOpen(true);
    } catch (e) {
      setGenError((e as Error)?.message || '엑셀 생성에 실패했습니다.');
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div
      className={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="월 작업장 순회 점검표"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeOnly();
      }}
    >
      <div className={s.modal}>
        <div className={s.topBar}>
          <span className={s.pill}>월 작업장 순회 점검표</span>
          <button type="button" className={s.iconBtn} onClick={closeOnly} aria-label="닫기">
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
                  // ✅ 즉시 draft 저장: 첫 태그 추가 후 바로 닫아도 유지
                  persistDraftNow({ detailTasks: next.map(norm).filter(Boolean), step: 0 });
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
                // ✅ 결과/조치사항도 draft로 저장
                persistDraftNow({ results: next, step: 2 });
              }}
              onBack={() => setStep(1)}
              onFinish={handleFinish}
              finishDisabled={!canFinish || exportLoading}
            />
          )}
        </div>
      </div>

      <CompletionToastModal
        open={doneOpen}
        title="순회 점검 완료"
        message={`${weekLabel} 작업장 순회 점검이 완료되었습니다.`}
        onConfirm={() => {
          setDoneOpen(false);
          closeOnly();
        }}
      />
    </div>
  );
}
