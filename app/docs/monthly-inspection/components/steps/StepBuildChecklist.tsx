'use client';

import { useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import s from './StepBuildChecklist.module.css';
import type { ChecklistCategory, Sections } from '../MonthlyInspectionCreateModal';

type Props = {
  detailTasks: string[];
  initialSections: Sections;
  onBack: () => void;
  onNext: (sections: Sections) => void;
};

const CATS: ChecklistCategory[] = ['사업장 점검 사항', '노동안전 점검 사항', '세부 작업 및 공정별 점검 사항'];

export default function StepBuildChecklist({ detailTasks, initialSections, onBack, onNext }: Props) {
  const [sections, setSections] = useState<Sections>(initialSections);
  const [openCat, setOpenCat] = useState<ChecklistCategory>('사업장 점검 사항');
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const addItem = (cat: ChecklistCategory) => {
    const val = (inputs[cat] || '').trim();
    if (!val) return;
    setSections(prev => ({
      ...prev,
      [cat]: [...(prev[cat] || []), val]
    }));
    setInputs(prev => ({ ...prev, [cat]: '' }));
  };

  const removeItem = (cat: ChecklistCategory, idx: number) => {
    setSections(prev => ({
      ...prev,
      [cat]: prev[cat].filter((_, i) => i !== idx)
    }));
  };

  return (
    <div className={s.wrap}>
      <div className={s.info}>
        점검 항목을 검토하고 필요한 경우 추가/삭제해주세요.
      </div>

      <div className={s.tagBox}>
        {detailTasks.map(t => <span key={t} className={s.tag}>{t}</span>)}
      </div>

      <div className={s.list}>
        {CATS.map(cat => {
          const isOpen = openCat === cat;
          const items = sections[cat] || [];
          return (
            <div key={cat} className={s.group}>
              <button className={s.groupHeader} onClick={() => setOpenCat(isOpen ? ('' as any) : cat)}>
                <span className={s.catTitle}>{cat}</span>
                <span className={s.count}>{items.length}</span>
                <ChevronDown size={18} className={isOpen ? s.rot : ''} />
              </button>
              
              {isOpen && (
                <div className={s.groupBody}>
                  {items.map((it, idx) => (
                    <div key={idx} className={s.itemRow}>
                      <span className={s.itemText}>{it}</span>
                      <button className={s.delBtn} onClick={() => removeItem(cat, idx)}><X size={14} /></button>
                    </div>
                  ))}
                  
                  <div className={s.addInputRow}>
                    <input
                      className={s.addInput}
                      placeholder="항목 추가"
                      value={inputs[cat] || ''}
                      onChange={e => setInputs({ ...inputs, [cat]: e.target.value })}
                      onKeyDown={e => e.key === 'Enter' && addItem(cat)}
                    />
                    <button className={s.addBtn} onClick={() => addItem(cat)}><Plus size={16} /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={s.footer}>
        <button className={s.backBtn} onClick={onBack}>이전</button>
        <button className={s.nextBtn} onClick={() => onNext(sections)}>점검 실시</button>
      </div>
    </div>
  );
}