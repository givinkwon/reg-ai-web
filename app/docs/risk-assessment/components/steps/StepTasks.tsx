'use client';

import React, { useRef, useState } from 'react';
import { RefreshCw, Search, X, Sparkles, Check, Plus } from 'lucide-react';
import s from './StepTasks.module.css';
import AddDetailTaskModal from '../ui/AddDetailTaskModal';
import type { RiskAssessmentDraft } from '../RiskAssessmentWizard';
import { useUserStore } from '@/app/store/user';
import { Button } from '@/app/components/ui/button';
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Docs', section: 'RiskAssessment', area: 'StepTasks' } as const;

type Props = {
  draft: RiskAssessmentDraft;
  setDraft: React.Dispatch<React.SetStateAction<RiskAssessmentDraft>>;
  minor?: string;
  onAutoStart?: () => void; // ✅ 부모에게 자동 시작 신호 보내기용 Prop
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const norm = (v?: string | null) => (v ?? '').trim();

export default function StepTasks({ draft, setDraft, onAutoStart }: Props) {
  const user = useUserStore((st) => st.user);
  
  const [nlpText, setNlpText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // 로딩 텍스트를 상태로 관리하여 단계별 안내 멘트 변경
  const [loadingText, setLoadingText] = useState({ 
    title: '작업 내용을 분석 중입니다', 
    desc: '입력하신 내용을 바탕으로\n가장 적합한 표준 공종을 찾고 있습니다.' 
  });
  
  const [recommended, setRecommended] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleNLUSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = norm(nlpText);
    if (!text) return;

    setIsAnalyzing(true);
    // 초기 로딩 멘트 설정
    setLoadingText({ 
      title: '작업 내용을 분석 중입니다', 
      desc: '입력하신 내용을 바탕으로\n가장 적합한 표준 공종을 찾고 있습니다.' 
    });
    setError(null);

    track(gaEvent(GA_CTX, 'RequestAIRec'), { ui_id: gaUiId(GA_CTX, 'RequestAIRec'), input_text: text });

    try {
      // 1. 인위적 딜레이 (사용자 경험용)
      const delayPromise = new Promise((resolve) => setTimeout(resolve, 1500));
      
      // 2. API 호출
      const apiPromise = fetch('/api/risk-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: 'recommend-minors-nlu', text: text }),
      });

      const [_, res] = await Promise.all([delayPromise, apiPromise]);
      
      if (!res.ok) throw new Error('추천 정보를 가져오지 못했습니다.');
      
      const data = await res.json();
      const items: string[] = data.items || [];
      const uniqueItems = Array.from(new Set(items));
      
      setRecommended(uniqueItems);
      
      if (uniqueItems.length === 0) {
        setError('관련된 표준 작업을 찾지 못했습니다. 조금 더 구체적으로 적어주세요.');
        setIsAnalyzing(false); // 실패 시 로딩 종료
      } else {
        // ✅ [성공 시 로직]
        
        // 1. 추천된 작업들을 draft에 모두 자동 추가
        setDraft(prev => {
          const exist = new Set(prev.tasks.map(t => norm(t.title)));
          const merged = [...prev.tasks];
          uniqueItems.forEach(raw => {
            const v = norm(raw);
            if (v && !exist.has(v)) {
              merged.push({ id: uid(), title: v, processes: [] });
            }
          });
          return { ...prev, tasks: merged };
        });

        // 2. 로딩 멘트 변경 (부모 화면으로 넘어가기 전 자연스러운 연결)
        setLoadingText({ 
          title: '공정 데이터 생성 중', 
          desc: '선택된 작업에 대한\n위험성평가 데이터를 구성하고 있습니다...' 
        });
        
        // 3. 잠시 후 부모에게 "자동 주행 시작" 신호 전달
        setTimeout(() => {
          // 여기서 setIsAnalyzing(false)를 하지 않음 -> 화면이 전환될 때까지 오버레이 유지
          if (onAutoStart) onAutoStart();
        }, 1000);
      }

    } catch (err) {
      console.error(err);
      setError('서버 통신 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      setIsAnalyzing(false);
    }
  };

  const toggleSelect = (title: string) => {
    const v = norm(title);
    if (!v) return;
    const exists = draft.tasks.some((t) => norm(t.title) === v);
    
    setDraft((prev) => {
      if (exists) return { ...prev, tasks: prev.tasks.filter((t) => norm(t.title) !== v) };
      return { ...prev, tasks: [...prev.tasks, { id: uid(), title: v, processes: [] }] };
    });

    track(gaEvent(GA_CTX, exists ? 'RemoveTask' : 'SelectTask'), {
      ui_id: gaUiId(GA_CTX, exists ? 'RemoveTask' : 'SelectTask'),
      task_title: v,
    });
  };

  const addManualTask = (title: string) => {
    const v = norm(title);
    if (!v) return;
    
    setDraft((prev) => {
      if (prev.tasks.some(t => norm(t.title) === v)) return prev;
      return { ...prev, tasks: [...prev.tasks, { id: uid(), title: v, processes: [] }] };
    });
    
    setRecommended(prev => Array.from(new Set([v, ...prev])));
  };

  return (
    <div className={s.container}>
      
      {/* ✅ 로딩 오버레이 (멘트가 동적으로 바뀜) */}
      {isAnalyzing && (
        <div className={s.loadingOverlay}>
          <div className={s.loadingPopup}>
            <div className={s.spinnerWrapper}>
              <RefreshCw size={36} className={s.spin} />
              <div className={s.aiBadge}>
                <Sparkles size={14} fill="#fff" /> AI
              </div>
            </div>
            <div className={s.loadingTexts}>
              <h3 className={s.loadingTitle}>{loadingText.title}</h3>
              <p className={s.loadingDesc} style={{ whiteSpace: 'pre-wrap' }}>
                {loadingText.desc}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 1. 상단 자연어 입력 섹션 */}
      <div className={s.nlpSection}>
        <div className={s.nlpHeader}>
          <div className={s.iconBox}>
            <Sparkles size={20} className="text-blue-500" />
          </div>
          <div>
            <h3 className={s.title}>어떤 작업을 진행하시나요?</h3>
            <p className={s.desc}>작업 내용을 문장으로 입력하면 AI가 문서를 자동으로 완성합니다.</p>
          </div>
        </div>
        
        <form onSubmit={handleNLUSearch} className={s.searchBox}>
          <div className={s.inputWrapper}>
            <input 
              ref={inputRef}
              type="text" 
              className={s.aiInput}
              placeholder="예: 굴착기로 터파기 작업을 하고, 덤프트럭에 상차함"
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
              disabled={isAnalyzing}
            />
            {nlpText && (
              <button type="button" className={s.clearBtn} onClick={() => setNlpText('')}>
                <X size={16} />
              </button>
            )}
          </div>
          <Button 
            type="submit" 
            disabled={isAnalyzing || !norm(nlpText)}
            className={s.submitBtn}
          >
            <Search size={18} className="mr-2" />
            AI 검색
          </Button>
        </form>
      </div>

      <hr className={s.divider} />

      {/* 2. 결과 표시 섹션 */}
      <div className={s.resultSection}>
        <div className={s.sectionHeader}>
          <h4 className={s.subTitle}>
            {recommended.length > 0 ? '추천된 작업 (자동 선택됨)' : '선택된 작업 목록'}
          </h4>
          <Button variant="ghost" size="sm" onClick={() => setAddOpen(true)} className={s.manualLink}>
            <Plus size={14} className="mr-1" /> 직접 추가하기
          </Button>
        </div>

        {error && (
          <div className={s.errorBox}>
            <p>{error}</p>
          </div>
        )}

        {/* 추천 목록 그리드 */}
        {recommended.length > 0 ? (
          <div className={s.grid}>
            {recommended.map((item) => {
              const isSelected = draft.tasks.some(t => norm(t.title) === item);
              return (
                <button
                  key={item}
                  className={`${s.card} ${isSelected ? s.active : ''}`}
                  onClick={() => toggleSelect(item)}
                >
                  <div className={s.checkCircle}>
                    {isSelected && <Check size={14} strokeWidth={3} className="text-white" />}
                  </div>
                  <span className={s.cardText}>{item}</span>
                </button>
              );
            })}
          </div>
        ) : (
          /* 빈 상태 */
          draft.tasks.length === 0 && !error && (
            <div className={s.emptyBox}>
              <Search size={48} className="text-slate-200 mb-3" />
              <p className="text-slate-400 font-medium">
                작업 내용을 입력하고 검색하면<br/>
                자동으로 문서를 생성합니다.
              </p>
            </div>
          )
        )}
      </div>

      {/* 3. 하단 선택 요약 (Chips) */}
      {draft.tasks.length > 0 && (
        <div className={s.summary}>
          <span className={s.summaryLabel}>최종 선택된 작업 ({draft.tasks.length})</span>
          <div className={s.chipList}>
            {draft.tasks.map(t => (
              <span key={t.id} className={s.chip}>
                {t.title}
                <button 
                  className={s.chipRemove} 
                  onClick={() => toggleSelect(t.title)}
                  title="제거"
                >
                  <X size={14} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 직접 추가 모달 */}
      <AddDetailTaskModal 
        open={addOpen}
        minorCategory={null} 
        onClose={() => setAddOpen(false)}
        onAdd={addManualTask}
      />
    </div>
  );
}