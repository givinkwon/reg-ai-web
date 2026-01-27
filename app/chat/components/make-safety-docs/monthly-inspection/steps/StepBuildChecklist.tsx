'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { ChecklistCategory, Sections } from '../MonthlyInspectionCreateModal';
import s from './StepBuildChecklist.module.css';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

type Props = {
  detailTasks: string[];
  initialSections: Sections;
  onBack: () => void;
  onNext: (sections: Sections) => void;
};

const CATS: ChecklistCategory[] = ['사업장 점검 사항', '노동안전 점검 사항', '작업 및 공정별 점검 사항'];
const norm = (v: string) => v.trim();

const GA_CTX = {
  page: 'Chat',
  section: 'SafetyDocs',
  area: 'MonthlyInspection',
  step: 'StepBuildChecklist',
} as const;

export default function StepBuildChecklist({ detailTasks, initialSections, onBack, onNext }: Props) {
  const [openCat, setOpenCat] = useState<ChecklistCategory>('사업장 점검 사항');
  const [sections, setSections] = useState<Sections>(initialSections);

  const [draft, setDraft] = useState<Record<ChecklistCategory, string>>({
    '사업장 점검 사항': '',
    '노동안전 점검 사항': '',
    '작업 및 공정별 점검 사항': '',
  });

  const selectedCount = useMemo(
    () => CATS.reduce((acc, c) => acc + (sections[c]?.length ?? 0), 0),
    [sections],
  );

  // ✅ GA: view 1회
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;

    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      detail_tasks_count: detailTasks.length,
      initial_selected_count: selectedCount,
      initial_open_cat: openCat,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addItem = (cat: ChecklistCategory) => {
    const v = norm(draft[cat] || '');
    if (!v) {
      track(gaEvent(GA_CTX, 'AddChecklistItem'), {
        ui_id: gaUiId(GA_CTX, 'AddChecklistItem'),
        category: cat,
        result: 'blocked_empty',
      });
      return;
    }

    setSections((prev) => {
      const before = prev[cat] ?? [];
      const next = Array.from(new Set([...before, v]));
      const isDup = next.length === before.length;

      track(gaEvent(GA_CTX, 'AddChecklistItem'), {
        ui_id: gaUiId(GA_CTX, 'AddChecklistItem'),
        category: cat,
        input_len: v.length,
        result: isDup ? 'dup_ignored' : 'added',
        selected_count_after: selectedCount + (isDup ? 0 : 1),
      });

      return { ...prev, [cat]: next };
    });

    setDraft((prev) => ({ ...prev, [cat]: '' }));
  };

  const removeItem = (cat: ChecklistCategory, q: string) => {
    track(gaEvent(GA_CTX, 'RemoveChecklistItem'), {
      ui_id: gaUiId(GA_CTX, 'RemoveChecklistItem'),
      category: cat,
      item_len: (q ?? '').length,
    });

    setSections((prev) => ({ ...prev, [cat]: (prev[cat] ?? []).filter((x) => x !== q) }));
  };

  const canNext = selectedCount > 0;

  const handleBack = () => {
    track(gaEvent(GA_CTX, 'ClickBack'), {
      ui_id: gaUiId(GA_CTX, 'ClickBack'),
      selected_count: selectedCount,
      open_cat: openCat,
    });
    onBack();
  };

  const handleNext = () => {
    track(gaEvent(GA_CTX, 'ClickNext'), {
      ui_id: gaUiId(GA_CTX, 'ClickNext'),
      selected_count: selectedCount,
      open_cat: openCat,
      cats_breakdown: CATS.map((c) => `${c}:${(sections[c]?.length ?? 0)}`).join('|'),
    });
    onNext(sections);
  };

  const toggleCat = (cat: ChecklistCategory) => {
    const isOpen = openCat === cat;
    const next = isOpen ? ('노동안전 점검 사항' as any) : cat;

    track(gaEvent(GA_CTX, 'ToggleCategory'), {
      ui_id: gaUiId(GA_CTX, 'ToggleCategory'),
      from: openCat,
      to: next,
      clicked: cat,
      is_open_after: next === cat,
    });

    setOpenCat(next);
  };

  return (
    <div className={s.wrap}>
      <div className={s.note}>생성된 점검 세부 사항을 확인/추가 후 점검을 실시합니다.</div>

      <div className={s.footer}>
        <button
          className={s.ghost}
          type="button"
          onClick={handleBack}
          data-ga-event={gaEvent(GA_CTX, 'ClickBack')}
          data-ga-id={gaUiId(GA_CTX, 'ClickBack')}
          data-ga-label="이전 버튼"
        >
          이전
        </button>

        <button
          className={s.primary}
          type="button"
          disabled={!canNext}
          onClick={handleNext}
          data-ga-event={gaEvent(GA_CTX, 'ClickNext')}
          data-ga-id={gaUiId(GA_CTX, 'ClickNext')}
          data-ga-label="다음 버튼"
        >
          월 작업장 순회 점검 실시
        </button>
      </div>

      <div className={s.tagsRow}>
        {detailTasks.map((t) => (
          <span key={t} className={s.tagChip}>
            {t}
          </span>
        ))}
      </div>

      {CATS.map((cat) => {
        const isOpen = openCat === cat;
        const list = sections[cat] ?? [];

        return (
          <div key={cat} className={s.accordion}>
            <button
              type="button"
              className={s.accHeader}
              onClick={() => toggleCat(cat)}
              data-ga-event={gaEvent(GA_CTX, 'ToggleCategory')}
              data-ga-id={gaUiId(GA_CTX, 'ToggleCategory')}
              data-ga-text={cat}
              data-ga-label="점검 카테고리 토글 버튼"
            >
              <span className={s.accTitle}>{cat}</span>
              <span className={s.accRight}>
                <span className={s.count}>{list.length}</span>
                <ChevronDown className={isOpen ? s.rot : ''} size={18} />
              </span>
            </button>

            {isOpen && (
              <div className={s.accBody}>
                <div className={s.itemList}>
                  {list.length === 0 ? (
                    <div className={s.empty}>생성된 점검 세부 사항이 없습니다. (직접 추가 가능)</div>
                  ) : (
                    list.map((q) => (
                      <div key={q} className={s.itemChipRow}>
                        <div className={s.itemChip}>{q}</div>
                        <button
                          type="button"
                          className={s.removeBtn}
                          onClick={() => removeItem(cat, q)}
                          aria-label="삭제"
                          data-ga-event={gaEvent(GA_CTX, 'RemoveChecklistItem')}
                          data-ga-id={gaUiId(GA_CTX, 'RemoveChecklistItem')}
                          data-ga-text={q}
                          data-ga-label="점검 항목 삭제 버튼"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className={s.addRow}>
                  <input
                    className={s.input}
                    value={draft[cat]}
                    placeholder="점검 항목을 추가하세요"
                    onChange={(e) => {
                      const val = e.target.value;
                      setDraft((p) => ({ ...p, [cat]: val }));
                    }}
                    onFocus={() => {
                      track(gaEvent(GA_CTX, 'FocusInput'), {
                        ui_id: gaUiId(GA_CTX, 'FocusInput'),
                        category: cat,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        track(gaEvent(GA_CTX, 'AddChecklistItem'), {
                          ui_id: gaUiId(GA_CTX, 'AddChecklistItem'),
                          category: cat,
                          trigger: 'enter',
                        });
                        addItem(cat);
                      }
                    }}
                  />
                  <button
                    className={s.addBtn}
                    type="button"
                    onClick={() => {
                      track(gaEvent(GA_CTX, 'AddChecklistItem'), {
                        ui_id: gaUiId(GA_CTX, 'AddChecklistItem'),
                        category: cat,
                        trigger: 'button',
                      });
                      addItem(cat);
                    }}
                    aria-label="추가"
                    data-ga-event={gaEvent(GA_CTX, 'AddChecklistItem')}
                    data-ga-id={gaUiId(GA_CTX, 'AddChecklistItem')}
                    data-ga-text={cat}
                    data-ga-label="점검 항목 추가 버튼"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
