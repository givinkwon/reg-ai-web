'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { ChecklistCategory, Sections } from '../MonthlyInspectionCreateModal';
import s from './StepBuildChecklist.module.css';

type Props = {
  detailTasks: string[];
  initialSections: Sections;
  onBack: () => void;
  onNext: (sections: Sections) => void;
};

const CATS: ChecklistCategory[] = ['사업장 점검 사항', '노동안전 점검 사항', '세부 작업 및 공정별 점검 사항'];
const norm = (v: string) => v.trim();

export default function StepBuildChecklist({ detailTasks, initialSections, onBack, onNext }: Props) {
  const [openCat, setOpenCat] = useState<ChecklistCategory>('사업장 점검 사항');
  const [sections, setSections] = useState<Sections>(initialSections);

  const [draft, setDraft] = useState<Record<ChecklistCategory, string>>({
    '사업장 점검 사항': '',
    '노동안전 점검 사항': '',
    '세부 작업 및 공정별 점검 사항': '',
  });

  const selectedCount = useMemo(
    () => CATS.reduce((acc, c) => acc + (sections[c]?.length ?? 0), 0),
    [sections],
  );

  const addItem = (cat: ChecklistCategory) => {
    const v = norm(draft[cat] || '');
    if (!v) return;
    setSections((prev) => {
      const next = Array.from(new Set([...(prev[cat] ?? []), v]));
      return { ...prev, [cat]: next };
    });
    setDraft((prev) => ({ ...prev, [cat]: '' }));
  };

  const removeItem = (cat: ChecklistCategory, q: string) => {
    setSections((prev) => ({ ...prev, [cat]: (prev[cat] ?? []).filter((x) => x !== q) }));
  };

  const canNext = selectedCount > 0;

  return (
    <div className={s.wrap}>
      <div className={s.note}>
        생성된 점검 세부 사항을 확인/추가 후 점검을 실시합니다.
      </div>

      <div className={s.footer}>
        <button className={s.ghost} type="button" onClick={onBack}>
          이전
        </button>
        <button className={s.primary} type="button" disabled={!canNext} onClick={() => onNext(sections)}>
          월 작업장 순회 점검 실시
        </button>
      </div>

      <div className={s.tagsRow}>
        {detailTasks.map((t) => (
          <span key={t} className={s.tagChip}>{t}</span>
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
              onClick={() => setOpenCat(isOpen ? ('노동안전 점검 사항' as any) : cat)}
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
                    onChange={(e) => setDraft((p) => ({ ...p, [cat]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addItem(cat);
                      }
                    }}
                  />
                  <button className={s.addBtn} type="button" onClick={() => addItem(cat)} aria-label="추가">
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
