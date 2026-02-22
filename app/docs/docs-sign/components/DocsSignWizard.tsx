'use client';

import React, { useState, useRef } from 'react';
import { Sparkles, RefreshCw, ArrowLeft, UploadCloud, Users, Plus, X } from 'lucide-react';
import s from './DocsSignWizard.module.css';

import Navbar from '@/app/docs/components/Navbar';
import CompleteView from './ui/CompleteView'; 

import { useUserStore } from '@/app/store/user';

// ✅ GA 로직 임포트
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'DocsSign', section: 'Sign', area: 'Wizard' } as const;

export type Attendee = { name: string; contact: string };

type StepId = 'upload' | 'summary' | 'sign';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'upload', label: '문서 업로드' },
  { id: 'summary', label: '문서 내용 확인' }, 
  { id: 'sign', label: '서명 요청' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  onRequireLogin?: () => void; // ✅ 로그인 트리거 추가
};

export default function DocsSignWizard({ open, onClose, onRequireLogin }: Props) {
  const user = useUserStore((st) => st.user);

  const [step, setStep] = useState<StepId>('upload');
  
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<string[]>([]);
  const [attendees, setAttendees] = useState<Attendee[]>([{ name: '', contact: '' }]);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  // ✅ [핵심] 무료 1회 사용 제한 체크 함수 (캐시 기반)
  const checkUsageLimit = () => {
    if (user?.email) return true; // 로그인된 회원은 통과 (서버단 과금/구독 로직으로 위임)
    
    const count = parseInt(localStorage.getItem('docs_sign_usage_count') || '0', 10);
    if (count >= 1) {
      if (onRequireLogin) onRequireLogin();
      return false; // 1회 이상 사용했으면 로그인 모달 띄우고 진행 중단
    }
    return true;
  };

  const incrementUsageLimit = () => {
    if (user?.email) return;
    const count = parseInt(localStorage.getItem('docs_sign_usage_count') || '0', 10);
    localStorage.setItem('docs_sign_usage_count', String(count + 1));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) setFile(e.dataTransfer.files[0]);
  };

  const handleNext = async () => {
    if (step === 'upload') {
      if (!file) return alert('파일을 선택해주세요.');
      
      // ✅ AI 요약을 돌리기 전에 캐시(사용 횟수) 체크!
      if (!checkUsageLimit()) return;

      track(gaEvent(GA_CTX, 'ClickNext_Upload'), { ui_id: gaUiId(GA_CTX, 'ClickNext_Upload'), file_name: file.name });
      
      setIsAnalyzing(true);
      try {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/docs-sign', { method: 'POST', body: formData });
        if (!res.ok) throw new Error('요약 실패');
        
        const data = await res.json();
        setSummary(data.summary || []);
        setStep('summary');

        // ✅ 분석이 성공적으로 끝나면 무료 1회 차감
        incrementUsageLimit();

      } catch (error) {
        console.error(error);
        alert('문서 분석 중 오류가 발생했습니다.');
      } finally {
        setIsAnalyzing(false);
      }
    } else if (step === 'summary') {
      track(gaEvent(GA_CTX, 'ClickNext_Summary'), { ui_id: gaUiId(GA_CTX, 'ClickNext_Summary') });
      setStep('sign');
    }
  };

  const handlePrev = () => {
    track(gaEvent(GA_CTX, 'ClickPrev'), { ui_id: gaUiId(GA_CTX, 'ClickPrev'), current_step: step });
    if (step === 'summary') setStep('upload');
    else if (step === 'sign') setStep('summary');
  };

  const handleFinish = async () => {
    track(gaEvent(GA_CTX, 'ClickSubmit'), { ui_id: gaUiId(GA_CTX, 'ClickSubmit') });
    
    const validAttendees = attendees.filter(a => a.name.trim() && a.contact.trim());
    if(validAttendees.length === 0) return alert('이름과 연락처를 1명 이상 정확히 입력해주세요.');

    // 💡 참고: 여기서는 비회원 차단을 해제했습니다. (위의 handleNext에서 이미 카운트를 깎고 넘어왔기 때문)
    
    setSubmitting(true);
    try {
      const res = await fetch('/api/docs-sign/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file?.name || '안전_관련_문서',
          summary: summary,
          attendees: validAttendees,
          // 비회원일 경우 guest 처리를 하여 백엔드에서 이메일 전송을 우회하도록 합니다.
          user_email: user?.email || 'guest@reg.ai.kr'
        }),
      });

      if (!res.ok) {
         const errData = await res.json();
         throw new Error(errData.message || '서명 발송 실패');
      }
      
      const data = await res.json();
      console.log('서명 요청 성공:', data);
      setIsCompleted(true);
      
    } catch (e: any) {
      console.error(e);
      alert(`서명 요청 발송 중 오류가 발생했습니다: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (isCompleted) {
    return (
      <div className={s.wrap}>
        <div style={{ position: 'relative', zIndex: 100 }}><Navbar /></div>
        <CompleteView onClose={onClose} onBack={() => { setIsCompleted(false); setStep('sign'); }} />
      </div>
    );
  }

  const currentIdx = STEPS.findIndex(x => x.id === step);

  return (
    <div className={s.wrap}>
      <div style={{ position: 'relative', zIndex: 100 }}><Navbar /></div>

      {(isAnalyzing || submitting) && (
        <div className={s.loadingOverlay}>
          <div className={s.loadingPopup}>
            <div className={s.spinnerWrapper}>
              <RefreshCw size={36} className={s.spin} />
              <div className={s.aiBadge}><Sparkles size={14} fill="#fff" /> AI</div>
            </div>
            <div className={s.loadingTexts}>
              <h3 className={s.loadingTitle}>{isAnalyzing ? '문서 내용 요약 중' : '서명 요청 발송 중'}</h3>
              <p className={s.loadingDesc}>
                {isAnalyzing ? 'AI가 서명자를 위해 문서의 핵심 내용을 정리하고 있습니다.' : '참석자들에게 알림톡을 발송하고 있습니다.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className={s.header}>
        <div className={s.centerWrap}>
          <div className={s.headerLeft}>
            <button 
              className={s.closeBtn} 
              onClick={onClose} 
              disabled={isAnalyzing || submitting}
              data-ga-event="ClickClose"
              data-ga-id={gaUiId(GA_CTX, 'ClickClose')}
            >
              <ArrowLeft size={18} /> 나가기
            </button>
            <h2 className={s.title}>문서 요약 및 서명 요청</h2>
          </div>
          <div className={s.progressText}>{currentIdx + 1} / 3 단계</div>
        </div>
      </div>

      {/* 탭 */}
      <div className={s.tabs}>
        <div className={s.centerWrap}>
          {STEPS.map((t, i) => {
            const isActive = step === t.id;
            const isPast = currentIdx > i;
            return (
              <button key={t.id} type="button" className={`${s.tab} ${isActive ? s.tabActive : ''} ${isPast ? s.tabPast : ''}`} disabled>
                <span className={s.stepNum}>{i + 1}</span>
                <span className={s.tabLabel}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className={s.content}>
        <div className={s.container}>
          
          {step === 'upload' && (
            <div className={s.card}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#1e293b' }}>서명이 필요한 문서를 업로드하세요</h3>
              
              <div 
                className={`${s.dropZone} ${isDragging ? s.dropZoneDragging : ''}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  track(gaEvent(GA_CTX, 'ClickUploadBox'), { ui_id: gaUiId(GA_CTX, 'ClickUploadBox') });
                  fileInputRef.current?.click();
                }}
                data-ga-event="ClickUploadBox"
                data-ga-id={gaUiId(GA_CTX, 'ClickUploadBox')}
              >
                <UploadCloud size={56} color={isDragging ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: '1rem' }} />
                <p style={{ color: '#334155', fontWeight: 'bold', fontSize: '1.1rem', margin: '0 0 0.5rem 0' }}>
                  이곳으로 파일을 드래그하여 놓거나 클릭하여 업로드하세요
                </p>
                <p style={{ color: '#64748b', margin: 0 }}>지원 형식: PDF, Word, Excel</p>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  style={{ display: 'none' }} 
                  accept=".pdf,.doc,.docx,.xls,.xlsx" 
                />
              </div>

              {file && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 'bold', color: '#1e40af' }}>📁 {file.name}</span>
                  <button onClick={() => setFile(null)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}><X size={18} /></button>
                </div>
              )}
            </div>
          )}

          {step === 'summary' && (
            <div className={s.card}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem', marginBottom: '1rem', color: '#1e293b' }}>
                <Sparkles size={20} color="#3b82f6" /> AI 문서 핵심 요약
              </h3>
              <p style={{ fontSize: '0.95rem', color: '#64748b', marginBottom: '1rem' }}>
                아래 요약된 내용이 대상자에게 발송되어 서명 전 안내됩니다.
              </p>
              <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <ul style={{ paddingLeft: '1.5rem', color: '#334155', lineHeight: '1.8', margin: 0 }}>
                  {summary.map((txt, idx) => (
                    <li key={idx} style={{ marginBottom: '0.5rem' }}>{txt}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {step === 'sign' && (
            <div className={s.card}>
              <div className={s.attendeeHeader}>
                <span style={{ fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e293b', fontWeight: 'bold' }}>
                  <Users size={20} color="#3b82f6" /> 서명 대상자 지정
                </span>
                <button 
                  className={s.addBtn} 
                  onClick={() => {
                    track(gaEvent(GA_CTX, 'ClickAddAttendee'), { ui_id: gaUiId(GA_CTX, 'ClickAddAttendee') });
                    setAttendees([...attendees, { name: '', contact: '' }]);
                  }}
                  data-ga-event="ClickAddAttendee"
                >
                  <Plus size={16} /> 인원 추가
                </button>
              </div>
              
              <div className={s.table}>
                {attendees.map((a, i) => (
                  <div key={i} className={s.trow}>
                    <input className={s.inputCell} placeholder="이름" value={a.name} onChange={e => { const n = [...attendees]; n[i].name = e.target.value; setAttendees(n); }} />
                    <input className={s.inputCell} style={{ flex: 2 }} placeholder="연락처 (알림톡 발송용)" value={a.contact} onChange={e => { const n = [...attendees]; n[i].contact = e.target.value; setAttendees(n); }} />
                    <button className={s.removeBtn} onClick={() => setAttendees(p => p.filter((_, idx) => idx !== i))}><X size={20} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* 푸터 */}
      <div className={s.footer}>
        <div className={s.centerWrap}>
          <div className={s.footerMessage}></div>
          <div className={s.footerBtns}>
            {step !== 'upload' && (
              <button 
                className={s.navBtn} 
                onClick={handlePrev} 
                disabled={isAnalyzing || submitting}
                data-ga-event="ClickPrev"
                data-ga-id={gaUiId(GA_CTX, 'ClickPrev')}
              >
                이전
              </button>
            )}
            
            {step !== 'sign' ? (
              <button 
                className={s.navBtnPrimary} 
                onClick={handleNext} 
                disabled={isAnalyzing || (!file && step === 'upload')}
                data-ga-event="ClickNext"
                data-ga-id={gaUiId(GA_CTX, 'ClickNext')}
              >
                다음 단계
              </button>
            ) : (
              <button 
                className={s.submitBtn} 
                onClick={handleFinish} 
                disabled={submitting}
                data-ga-event="ClickSubmit"
                data-ga-id={gaUiId(GA_CTX, 'ClickSubmit')}
              >
                서명 요청 발송
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}