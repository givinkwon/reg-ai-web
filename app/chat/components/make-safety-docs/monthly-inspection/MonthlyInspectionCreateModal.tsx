// components/monthly-inspection/MonthlyInspectionCreateModal.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, FileText, Loader2 } from 'lucide-react';
import s from './MonthlyInspectionCreateModal.module.css';

import MonthlyInspectionDetailTaskAutocompleteInput from './MonthlyInspectionDetailTaskAutocompleteInput';
import StepBuildChecklist from './steps/StepBuildChecklist';
import StepRunChecklist from './steps/StepRunChecklist';

// ✅ TBM 방식 Alert 모달
import CenteredAlertModal from './ui/AlertModal';

import { useUserStore } from '@/app/store/user';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

export type Rating = 'O' | '△' | 'X';

const GA_CTX = { page: 'Chat', section: 'MakeSafetyDocs', area: 'MonthlyInspection' } as const;

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

// ✅ [핵심] 항목 생성 시 무조건 'O'를 기본값으로 설정
function toItems(sections: Sections): ChecklistItem[] {
  console.log('🔨 [toItems] 아이템 생성 시작');
  const items = (Object.keys(sections) as ChecklistCategory[]).flatMap((cat) =>
    (sections[cat] ?? []).map((q) => ({
      id: uid(),
      category: cat,
      question: q,
      rating: 'O' as Rating, // 강제 'O' 설정
      note: '',
    })),
  );
  console.log('🔨 [toItems] 생성된 아이템(첫번째 예시):', items[0]);
  return items;
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
    '작업 및 공정별 점검 사항': [
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
 * localStorage: checklist cache
 * ---------------------- */
type ChecklistCacheEntry = {
  t: number;
  key: string;
  minorKey: string;
  tasksKey: string;
  sections: Sections;
};

type ChecklistCacheStore = Record<string, ChecklistCacheEntry>;

const CHECKLIST_CACHE_KEY = 'regai:monthlyInspection:checklistCache:v1';
const CHECKLIST_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;
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
  } catch {}
}

function getFilenameFromContentDisposition(cd: string | null, fallback: string) {
  if (!cd) return fallback;

  const mStar = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (mStar?.[1]) {
    try {
      return decodeURIComponent(mStar[1]);
    } catch {
      return mStar[1];
    }
  }

  const m = cd.match(/filename\s*=\s*"([^"]+)"/i) || cd.match(/filename\s*=\s*([^;]+)/i);
  if (m?.[1]) return m[1].trim();

  return fallback;
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
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
        '작업 및 공정별 점검 사항': [],
      } as Sections),
  );
  const [items, setItems] = useState<ChecklistItem[]>(defaultValue?.results ?? []);

  // 🐛 [디버깅 로그] 렌더링 시점의 items 상태 확인
  if (open) {
      console.log('👀 [Modal] 렌더링 - 현재 Step:', step);
      if (items.length > 0) {
          console.log(`👀 [Modal] items[0] 상태: id=${items[0].id}, rating=${items[0].rating}`);
      } else {
          console.log('👀 [Modal] items 비어있음');
      }
  }

  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState<string>('');
  const [exportLoading, setExportLoading] = useState(false);

  const today = useMemo(() => new Date(), []);
  const weekLabel = useMemo(() => formatKoreanWeekLabel(today), [today]);
  const dateISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const user = useUserStore((st) => st.user);
  const userEmail = (user?.email || '').trim();

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
    gaAction?: string;
    gaExtra?: Record<string, any>;
  }) => {
    setAlertTitle(opts.title ?? '안내');
    setAlertLines(opts.lines);
    setAlertConfirmText(opts.confirmText ?? '확인');
    setAlertShowClose(!!opts.showClose);
    alertOnConfirmRef.current = opts.onConfirm ?? null;
    alertOnCloseRef.current = opts.onClose ?? null;
    setAlertOpen(true);

    if (opts.gaAction) {
      track(gaEvent(GA_CTX, opts.gaAction), {
        ui_id: gaUiId(GA_CTX, opts.gaAction),
        step,
        minor: norm(minorCategory || '') || 'ALL',
        tasks_count: detailTasks.map(norm).filter(Boolean).length,
        ...((opts.gaExtra || {}) as Record<string, any>),
      });
    }
  };

  const closeAlert = () => {
    setAlertOpen(false);
    alertOnConfirmRef.current = null;
    alertOnCloseRef.current = null;
  };

  const dirtyRef = useRef(false);
  const markDirty = () => {
    dirtyRef.current = true;
  };

  const canFinish = useMemo(() => items.some((it) => !!it.rating), [items]);
  const canGoStep1 = detailTasks.map(norm).filter(Boolean).length > 0;

  const checklistCacheRef = useRef<ChecklistCacheStore>({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const loaded = pruneChecklistCache(loadChecklistCache());
    checklistCacheRef.current = loaded;
    saveChecklistCache(loaded);
  }, []);

  const prevOpenGaRef = useRef(false);
  useEffect(() => {
    const prev = prevOpenGaRef.current;
    prevOpenGaRef.current = open;

    if (!prev && open) {
      track(gaEvent(GA_CTX, 'Open'), {
        ui_id: gaUiId(GA_CTX, 'Open'),
        minor: norm(minorCategory || '') || 'ALL',
      });
    }
    if (prev && !open) {
      track(gaEvent(GA_CTX, 'Close'), {
        ui_id: gaUiId(GA_CTX, 'Close'),
        step,
      });
    }
  }, [open]);

  // ✅ [초기화 로직] open 시 초기화
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;

    if (!open) return;

    if (!prev && open) {
      console.log('🚀 [Modal] 처음 열림: 상태 초기화 시작');
      dirtyRef.current = false;
      setGenLoading(false);
      setGenError('');
      setExportLoading(false);
      setAlertOpen(false);
    }

    const dvTasks = (defaultValue?.detailTasks ?? []).map(norm).filter(Boolean);
    const dvSections = defaultValue?.sections;
    const dvResults = defaultValue?.results;

    if (dvTasks.length > 0) {
      console.log('🚀 [Modal] defaultValue 있음');
      setDetailTasks(dvTasks);

      if (dvSections) {
        const cleaned = cleanSections(dvSections as Sections);
        setSections(cleaned);

        if (dvResults?.length) {
          console.log('🚀 [Modal] defaultValue 결과 적용 (rating 보정)');
          setItems((dvResults as ChecklistItem[]).map(it => ({
            ...it,
            rating: it.rating || ('O' as Rating)
          })));
          setStep(2);
        } else {
          setItems(toItems(cleaned));
          setStep(1);
        }
      } else {
        setSections({
          '사업장 점검 사항': [],
          '노동안전 점검 사항': [],
          '작업 및 공정별 점검 사항': [],
        });
        setItems([]);
        setStep(0);
      }
      return;
    }

    console.log('🚀 [Modal] 초기화: Step 0으로 이동');
    setStep(0);
    setDetailTasks([]);
    setSections({
      '사업장 점검 사항': [],
      '노동안전 점검 사항': [],
      '작업 및 공정별 점검 사항': [],
    });
    setItems([]);
  }, [open, defaultValue, minorCategory]);

  useEffect(() => {
    if (!open && !alertOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, alertOpen]);

  if (!open && !alertOpen) return null;

  const closeOnly = () => {
    if (exportLoading) return;
    track(gaEvent(GA_CTX, 'ClickClose'), {
      ui_id: gaUiId(GA_CTX, 'ClickClose'),
      step,
    });
    onClose();
  };

  const handleCreateChecklist = async () => {
    markDirty();
    setGenError('');

    const tasks = detailTasks.map(norm).filter(Boolean);

    track(gaEvent(GA_CTX, 'ClickGenerateChecklist'), {
      ui_id: gaUiId(GA_CTX, 'ClickGenerateChecklist'),
      step,
      minor: norm(minorCategory || '') || 'ALL',
      tasks_count: tasks.length,
    });

    setGenLoading(true);

    const { key, minorKey } = stableTasksKey(minorCategory, tasks);

    const cached = checklistCacheRef.current[key];
    if (cached && Date.now() - cached.t <= CHECKLIST_CACHE_TTL_MS) {
      setSections(cached.sections);
      setItems(toItems(cached.sections)); 
      setStep(1);
      setGenLoading(false);
      return;
    }

    track(gaEvent(GA_CTX, 'GenerateChecklistRequest'), {
      ui_id: gaUiId(GA_CTX, 'GenerateChecklistRequest'),
      step,
      minor: norm(minorCategory || '') || 'ALL',
      tasks_count: tasks.length,
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

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`generate checklist failed: ${res.status} ${txt}`);
      }

      const data = (await res.json()) as GenResponse;
      const sec = data?.sections ?? {};
      const next: Sections = {
        '사업장 점검 사항': (sec['사업장 점검 사항'] ?? []).map(String),
        '노동안전 점검 사항': (sec['노동안전 점검 사항'] ?? []).map(String),
        '작업 및 공정별 점검 사항': (sec['작업 및 공정별 점검 사항'] ?? []).map(String),
      };

      const cleaned = cleanSections(next);
      const anyEmpty =
        cleaned['사업장 점검 사항'].length === 0 ||
        cleaned['노동안전 점검 사항'].length === 0 ||
        cleaned['작업 및 공정별 점검 사항'].length === 0;

      const finalSections = anyEmpty ? buildFallbackSections(tasks) : cleaned;

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

      track(gaEvent(GA_CTX, 'GenerateChecklistSuccess'), {
        ui_id: gaUiId(GA_CTX, 'GenerateChecklistSuccess'),
        step: 0,
        next_step: 1,
        tasks_count: tasks.length,
        sections_counts: {
          a: finalSections['사업장 점검 사항'].length,
          b: finalSections['노동안전 점검 사항'].length,
          c: finalSections['작업 및 공정별 점검 사항'].length,
        },
      });
    } catch (e) {
      const fb = buildFallbackSections(tasks);
      setSections(fb);
      setItems(toItems(fb));
      setStep(1);
      setGenError((e as Error)?.message || '점검 항목 생성에 실패했습니다.');

      track(gaEvent(GA_CTX, 'GenerateChecklistFail'), {
        ui_id: gaUiId(GA_CTX, 'GenerateChecklistFail'),
        step: 0,
        next_step: 1,
        tasks_count: tasks.length,
        err: (e as Error)?.message || 'unknown',
        used_fallback: true,
      });
    } finally {
      setGenLoading(false);
    }
  };

  const handleConfirmChecklist = (nextSections: Sections) => {
    console.log('🚀 [Modal] handleConfirmChecklist 실행됨');
    markDirty();
    const cleaned = cleanSections(nextSections);
    
    // 🔥 여기가 핵심입니다. toItems가 호출되면서 rating: 'O'가 들어가야 합니다.
    const nextItems = toItems(cleaned);
    
    console.log('🚀 [Modal] 생성된 nextItems 첫번째:', nextItems[0]);

    track(gaEvent(GA_CTX, 'ConfirmChecklist'), {
      ui_id: gaUiId(GA_CTX, 'ConfirmChecklist'),
      step: 1,
      next_step: 2,
      sections_counts: {
        a: cleaned['사업장 점검 사항'].length,
        b: cleaned['노동안전 점검 사항'].length,
        c: cleaned['작업 및 공정별 점검 사항'].length,
      },
    });

    setSections(cleaned);
    setItems(nextItems);
    setStep(2);

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
  };

  const handleFinish = async () => {
    const tasks = detailTasks.map(norm).filter(Boolean);

    track(gaEvent(GA_CTX, 'ClickFinish'), {
      ui_id: gaUiId(GA_CTX, 'ClickFinish'),
      step: 2,
      minor: norm(minorCategory || '') || 'ALL',
      tasks_count: tasks.length,
      rated_count: items.filter((it) => !!it.rating).length,
      total_count: items.length,
    });

    if (!userEmail) {
      openAlert({
        title: '로그인이 필요합니다',
        lines: [
          '월 순회 점검표를 저장/다운로드하려면 로그인이 필요합니다.',
          '로그인 후 다시 시도해주세요.',
        ],
        confirmText: '확인',
        gaAction: 'AlertLoginRequired',
      });
      return;
    }

    if (exportLoading) return;

    const payload: MonthlyInspectionPayload = {
      dateISO,
      detailTasks: tasks,
      sections,
      results: items,
    };

    openAlert({
      title: '순회 점검 문서 생성 요청',
      lines: [
        '순회 점검 문서 생성이 요청되었어요!',
        '서버에서 문서를 생성 중이며, 완료되면 이메일로 안내해드립니다. 파일함에서도 확인 가능해요!',
      ],
      confirmText: '확인',
      gaAction: 'AlertExportRequested',
      gaExtra: {
        tasks_count: tasks.length,
      },
    });

    setExportLoading(true);
    await nextFrame();

    track(gaEvent(GA_CTX, 'ExportRequestStart'), {
      ui_id: gaUiId(GA_CTX, 'ExportRequestStart'),
      step: 2,
      tasks_count: tasks.length,
    });

    try {
      await onSubmit?.(payload);

      const res = await fetch('/api/risk-assessment?endpoint=monthly-inspection-export-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');

        track(gaEvent(GA_CTX, 'ExportFail'), {
          ui_id: gaUiId(GA_CTX, 'ExportFail'),
          step: 2,
          http_status: res.status,
          err: txt ? txt.slice(0, 160) : 'no_body',
        });

        openAlert({
          title: '생성 실패',
          lines: [
            `엑셀 생성에 실패했습니다. (HTTP ${res.status})`,
            txt ? txt.slice(0, 160) : '잠시 후 다시 시도해주세요.',
          ],
          confirmText: '확인',
          gaAction: 'AlertExportFail',
          gaExtra: { http_status: res.status },
        });
        return;
      }

      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition');
      const fallbackName = `월_작업장_순회점검표_${dateISO}.xlsx`;
      const filename = getFilenameFromContentDisposition(cd, fallbackName);

      const url = window.URL.createObjectURL(blob);

      track(gaEvent(GA_CTX, 'DownloadExcel'), {
        ui_id: gaUiId(GA_CTX, 'DownloadExcel'),
        step: 2,
        filename,
        bytes: blob.size,
      });

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      track(gaEvent(GA_CTX, 'ExportSuccess'), {
        ui_id: gaUiId(GA_CTX, 'ExportSuccess'),
        step: 2,
        filename,
        bytes: blob.size,
      });

      onClose();
    } catch (e) {
      track(gaEvent(GA_CTX, 'ExportError'), {
        ui_id: gaUiId(GA_CTX, 'ExportError'),
        step: 2,
        err: (e as Error)?.message || 'unknown',
      });

      openAlert({
        title: '오류',
        lines: ['문서 생성 중 오류가 발생했습니다.', '잠시 후 다시 시도해주세요.'],
        confirmText: '확인',
        gaAction: 'AlertExportError',
      });
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <>
      {open && (
        <div
          className={s.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="월 작업장 순회 점검표"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              track(gaEvent(GA_CTX, 'ClickOverlay'), {
                ui_id: gaUiId(GA_CTX, 'ClickOverlay'),
                step,
              });
            }
          }}
        >
          <div className={s.modal}>
            <div className={s.topBar}>
              <span className={s.pill}>월 작업장 순회 점검표</span>
              <button
                type="button"
                className={s.iconBtn}
                onClick={closeOnly}
                aria-label="닫기"
                disabled={exportLoading}
                data-ga-event={gaEvent(GA_CTX, 'ClickClose')}
                data-ga-id={gaUiId(GA_CTX, 'ClickClose')}
                data-ga-label="모달 닫기 버튼"
              >
                <X size={18} />
              </button>
            </div>

            <div className={s.card}>
              <div className={s.header}>
                <h3 className={s.title}>월 작업장 순회 점검표</h3>
                <p className={s.desc}>
                  작업을 검색해 추가하면, 해당 작업/소분류 위험요인 기반으로 점검 항목을
                  생성합니다. <br />
                  <span className={s.subDesc}>{weekLabel}</span>
                </p>
              </div>

              {step === 0 && (
                <>
                  <label className={s.label}>작업 검색</label>

                  <MonthlyInspectionDetailTaskAutocompleteInput
                    value={detailTasks}
                    onChange={(next) => {
                      markDirty();
                      setDetailTasks(next);
                      track(gaEvent(GA_CTX, 'ChangeDetailTasks'), {
                        ui_id: gaUiId(GA_CTX, 'ChangeDetailTasks'),
                        step: 0,
                        tasks_count: next.map(norm).filter(Boolean).length,
                      });
                    }}
                  />

                  {genError && <div className={s.errorText}>{genError}</div>}

                  <button
                    type="button"
                    className={s.primaryBtn}
                    disabled={!canGoStep1 || genLoading}
                    onClick={handleCreateChecklist}
                    data-ga-event={gaEvent(GA_CTX, 'ClickGenerateChecklist')}
                    data-ga-id={gaUiId(GA_CTX, 'ClickGenerateChecklist')}
                    data-ga-label="점검 항목 생성 버튼"
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
                  onBack={() => {
                    track(gaEvent(GA_CTX, 'ClickBack'), {
                      ui_id: gaUiId(GA_CTX, 'ClickBack'),
                      step: 1,
                      next_step: 0,
                    });
                    setStep(0);
                  }}
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
                    // 🐛 [디버깅] 여기서 데이터가 잘 바뀌는지 확인
                    console.log('🔄 [Modal] onChangeItems 호출됨. 변경된 rating:', next[0]?.rating);
                    track(gaEvent(GA_CTX, 'ChangeRatings'), {
                      ui_id: gaUiId(GA_CTX, 'ChangeRatings'),
                      step: 2,
                      rated_count: next.filter((it) => !!it.rating).length,
                      total_count: next.length,
                    });
                  }}
                  onBack={() => {
                    track(gaEvent(GA_CTX, 'ClickBack'), {
                      ui_id: gaUiId(GA_CTX, 'ClickBack'),
                      step: 2,
                      next_step: 1,
                    });
                    setStep(1);
                  }}
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
        title={alertTitle}
        lines={alertLines}
        confirmText={alertConfirmText}
        onConfirm={() => {
          track(gaEvent(GA_CTX, 'AlertConfirm'), {
            ui_id: gaUiId(GA_CTX, 'AlertConfirm'),
            step,
            title: alertTitle,
          });

          const fn = alertOnConfirmRef.current;
          closeAlert();
          fn?.();
        }}
        showClose={alertShowClose}
        onClose={() => {
          track(gaEvent(GA_CTX, 'AlertClose'), {
            ui_id: gaUiId(GA_CTX, 'AlertClose'),
            step,
            title: alertTitle,
          });

          const fn = alertOnCloseRef.current;
          closeAlert();
          fn?.();
        }}
      />
    </>
  );
}