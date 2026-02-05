'use client';

import React, { useState, useRef } from 'react';
import { Search, Sparkles, X, Check, RefreshCw } from 'lucide-react'; // 아이콘 추가
import s from './StepInspectionTasks.module.css'; 
import { useRiskWizardStore } from '@/app/store/docs';
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

type Props = {
  detailTasks: string[];
  setDetailTasks: (tasks: string[]) => void;
  // ✅ [수정] string[] 인자를 받을 수 있게 타입 변경
  onAutoStart: (detectedTasks?: string[]) => void;
};

const GA_CTX = { page: 'Docs', section: 'MonthlyInspection', area: 'StepTasks' } as const;

export default function StepInspectionTasks({ detailTasks, setDetailTasks, onAutoStart }: Props) {
  const [nlpText, setNlpText] = useState('');
  const [recommended, setRecommended] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const isAnalyzing = useRiskWizardStore((st) => st.isAnalyzing);
  const setIsAnalyzing = useRiskWizardStore((st) => st.setIsAnalyzing);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleNLUSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!nlpText.trim()) return;

    setIsAnalyzing(true);
    setError(null);
    
    track(gaEvent(GA_CTX, 'RequestAIRec'), { 
        ui_id: gaUiId(GA_CTX, 'RequestAIRec'), 
        input_text: nlpText 
    });

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const res = await fetch('/api/risk-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: 'recommend-minors-nlu', text: nlpText }),
      });

      if (!res.ok) throw new Error('작업 분석에 실패했습니다.');

      const data = await res.json();
      const items = data.items || [];
      const uniqueItems = Array.from(new Set(items)) as string[];

      setRecommended(uniqueItems);
      
      if (uniqueItems.length > 0) {
        setDetailTasks(uniqueItems);
        
        // 잠시 후 다음 단계로 자동 이동
        setTimeout(() => {
          // ✅ [수정] 방금 찾은 태그들을 바로 전달하여 상태 업데이트 딜레이 방지
          onAutoStart(uniqueItems);
        }, 1200);
      } else {
        setError('관련된 표준 작업을 찾지 못했습니다. 조금 더 구체적으로 적어주세요.');
        setIsAnalyzing(false);
      }
    } catch (e) {
      console.error(e);
      setError('서버 통신 중 오류가 발생했습니다.');
      setIsAnalyzing(false);
    }
  };

  const toggleTask = (task: string) => {
    const newTasks = detailTasks.includes(task)
      ? detailTasks.filter(t => t !== task)
      : [...detailTasks, task];
    
    setDetailTasks(newTasks);
  };

  return (
    <div className={s.container}>
      
      <div className={s.nlpSection}>
        <div className={s.nlpHeader}>
          <div className={s.iconBox}>
            <Sparkles size={20} className="text-blue-500" />
          </div>
          <div>
            <h3 className={s.title}>어떤 현장을 점검하시나요?</h3>
            <p className={s.desc}>작업 내용을 문장으로 입력하면 AI가 필요한 점검 항목을 자동으로 도출합니다.</p>
          </div>
        </div>
        
        <form onSubmit={handleNLUSearch} className={s.searchBox}>
          <div className={s.inputWrapper}>
            <input 
              ref={inputRef}
              className={s.aiInput}
              placeholder="예: 공장 내부에서 지게차 운반 및 용접 작업 진행"
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
              disabled={isAnalyzing}
            />
            {nlpText && !isAnalyzing && (
              <button type="button" className={s.clearBtn} onClick={() => setNlpText('')}>
                <X size={16} />
              </button>
            )}
          </div>
          <button 
            type="submit" 
            className={s.submitBtn} 
            disabled={isAnalyzing || !nlpText.trim()}
          >
            {isAnalyzing ? <RefreshCw size={18} className={s.spin} /> : <Search size={18} className="mr-2" />}
            {isAnalyzing ? '분석 중...' : 'AI 검색'}
          </button>
        </form>
      </div>

      <hr className={s.divider} />

      <div className={s.resultSection}>
        <div className={s.sectionHeader}>
          <h4 className={s.subTitle}>
            {recommended.length > 0 ? '분석된 점검 대상' : '선택된 대상'}
          </h4>
        </div>

        {error && (
          <div className={s.errorBox}>
            <p>{error}</p>
          </div>
        )}

        {recommended.length > 0 ? (
          <div className={s.grid}>
            {recommended.map(task => {
              const isActive = detailTasks.includes(task);
              return (
                <button 
                  key={task} 
                  className={`${s.card} ${isActive ? s.active : ''}`}
                  onClick={() => toggleTask(task)}
                >
                  <div className={s.checkCircle}>
                    {isActive && <Check size={14} className="text-white" strokeWidth={3} />}
                  </div>
                  <span className={s.cardText}>{task}</span>
                </button>
              );
            })}
          </div>
        ) : (
          !error && (
            <div className={s.emptyBox}>
              <Search size={48} className="text-slate-200 mb-3" />
              <p className="text-slate-400 font-medium">
                작업 내용을 입력하고 검색하면<br/>
                자동으로 점검표를 생성합니다.
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}