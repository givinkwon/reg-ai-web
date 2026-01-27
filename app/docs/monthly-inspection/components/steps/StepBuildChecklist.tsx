'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import s from './StepBuildChecklist.module.css';
import type { ChecklistCategory, Sections } from '../MonthlyInspectionCreateModal';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context: 점검표 항목 구성 단계
const GA_CTX = { page: 'Docs', section: 'MonthlyInspection', area: 'StepBuildChecklist' } as const;

type Props = {
  detailTasks: string[];
  initialSections: Sections;
  onBack: () => void;
  onNext: (sections: Sections) => void;
};

const CATS: ChecklistCategory[] = ['사업장 점검 사항', '노동안전 점검 사항', '작업 및 공정별 점검 사항'];

export default function StepBuildChecklist({ detailTasks, initialSections, onBack, onNext }: Props) {
  const [sections, setSections] = useState<Sections>(initialSections);
  const [openCat, setOpenCat] = useState<ChecklistCategory>('사업장 점검 사항');
  const [inputs, setInputs] = useState<Record<string, string>>({});

  // ✅ GA: 화면 진입 시 View 이벤트 (총 항목 수 포함)
  useEffect(() => {
    const totalItems = Object.values(initialSections).flat().length;
    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      total_items: totalItems,
    });
  }, [initialSections]);

  // ✅ GA: 카테고리 토글 핸들러
  const handleToggleCat = (cat: ChecklistCategory) => {
    const isOpen = openCat === cat;
    
    if (!isOpen) {
        track(gaEvent(GA_CTX, 'OpenCategory'), {
            ui_id: gaUiId(GA_CTX, 'OpenCategory'),
            category_name: cat
        });
    }

    setOpenCat(isOpen ? ('' as any) : cat);
  };

  const addItem = (cat: ChecklistCategory) => {
    const val = (inputs[cat] || '').trim();
    if (!val) return;

    // ✅ GA: 항목 추가 추적
    track(gaEvent(GA_CTX, 'AddItem'), {
        ui_id: gaUiId(GA_CTX, 'AddItem'),
        category_name: cat,
        item_text: val
    });

    setSections(prev => ({
      ...prev,
      [cat]: [...(prev[cat] || []), val]
    }));
    setInputs(prev => ({ ...prev, [cat]: '' }));
  };

  const removeItem = (cat: ChecklistCategory, idx: number, itemText: string) => {
    // ✅ GA: 항목 삭제 추적
    track(gaEvent(GA_CTX, 'RemoveItem'), {
        ui_id: gaUiId(GA_CTX, 'RemoveItem'),
        category_name: cat,
        item_text: itemText
    });

    setSections(prev => ({
      ...prev,
      [cat]: prev[cat].filter((_, i) => i !== idx)
    }));
  };

  // ✅ GA: 다음 단계(완료) 버튼 핸들러
  const handleNextClick = () => {
    const finalCount = Object.values(sections).flat().length;
    track(gaEvent(GA_CTX, 'ClickNext'), {
        ui_id: gaUiId(GA_CTX, 'ClickNext'),
        final_item_count: finalCount
    });
    onNext(sections);
  };

  // ✅ GA: 이전 버튼 핸들러
  const handleBackClick = () => {
    track(gaEvent(GA_CTX, 'ClickBack'), {
        ui_id: gaUiId(GA_CTX, 'ClickBack'),
    });
    onBack();
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
              <button 
                className={s.groupHeader} 
                onClick={() => handleToggleCat(cat)}
                data-ga-event="OpenCategory"
                data-ga-id={gaUiId(GA_CTX, 'OpenCategory')}
                data-ga-label={cat}
              >
                <div className={s.titleGroup}>
                  <span className={s.catTitle}>{cat}</span>
                  <span className={s.count}>{items.length}</span>
                </div>
                
                <ChevronDown size={18} className={isOpen ? s.rot : ''} />
              </button>
              
              {isOpen && (
                <div className={s.groupBody}>
                  {items.map((it, idx) => (
                    <div key={idx} className={s.itemRow}>
                      <span className={s.itemText}>{it}</span>
                      <button 
                        className={s.delBtn} 
                        onClick={() => removeItem(cat, idx, it)}
                        data-ga-event="RemoveItem"
                        data-ga-id={gaUiId(GA_CTX, 'RemoveItem')}
                        data-ga-label={it}
                      >
                        <X size={14} />
                      </button>
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
                    <button 
                        className={s.addBtn} 
                        onClick={() => addItem(cat)}
                        data-ga-event="AddItem"
                        data-ga-id={gaUiId(GA_CTX, 'AddItem')}
                        data-ga-label={inputs[cat] || ''}
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

      <div className={s.footer}>
        <button 
            className={s.backBtn} 
            onClick={handleBackClick}
            data-ga-event="ClickBack"
            data-ga-id={gaUiId(GA_CTX, 'ClickBack')}
            data-ga-label="이전 버튼"
        >
            이전
        </button>
        <button 
            className={s.nextBtn} 
            onClick={handleNextClick}
            data-ga-event="ClickNext"
            data-ga-id={gaUiId(GA_CTX, 'ClickNext')}
            data-ga-label="점검 실시 버튼"
        >
            점검 실시
        </button>
      </div>
    </div>
  );
}