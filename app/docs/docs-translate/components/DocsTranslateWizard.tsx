'use client';

import React, { useState, useRef } from 'react';
import { Sparkles, RefreshCw, ArrowLeft, UploadCloud, Globe, Send, X } from 'lucide-react';
import s from './DocsTranslateWizard.module.css';

import Navbar from '@/app/docs/components/Navbar';
import CompleteView from './ui/CompleteView';

// 🚀 현재 로그인한 유저 정보를 가져오기 위한 스토어 임포트
import { useUserStore } from '@/app/store/user';

type StepId = 'upload' | 'select' | 'download';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'upload', label: '교안 업로드' },
  { id: 'select', label: '언어 선택' },
  { id: 'download', label: '번역 요청' },
];

const SUPPORTED_LANGS = ['영어', '중국어', '베트남어', '태국어', '몽골어', '우즈베크어', '캄보디아어', '인도네시아어', '네팔어'];

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function DocsTranslateWizard({ open, onClose }: Props) {
  const user = useUserStore((st) => st.user);

  const [step, setStep] = useState<StepId>('upload');
  
  const [file, setFile] = useState<File | null>(null);
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentLang: '' });

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

const validateAndSetFile = (selectedFile: File) => {
    const fileName = selectedFile.name.toLowerCase();

    // 1. HWP 전용 경고 팝업 (기획서 반영)
    if (fileName.endsWith('.hwp')) {
      alert("현재 HWP 파일은 지원 준비 중입니다. PDF로 변환하여 업로드해 주세요.");
      return;
    }

    // 2. 허용된 확장자 리스트
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    
    // 현재 파일이 허용된 확장자 중 하나로 끝나는지 검사
    const isValid = allowedExtensions.some(ext => fileName.endsWith(ext));

    if (!isValid) {
      alert("지원하지 않는 파일 형식입니다.\n(지원 형식: PDF, Word, Excel, PPT)");
      return;
    }

    // 모든 검사를 통과했을 때만 파일 세팅
    setFile(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const toggleLang = (lang: string) => {
    setSelectedLangs(prev => 
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const handleNext = () => {
    if (step === 'upload') {
      if (!file) return alert('파일을 첨부해주세요.');
      setStep('select');
    } else if (step === 'select') {
      if (selectedLangs.length === 0) return alert('번역할 언어를 1개 이상 선택해주세요.');
      setStep('download');
    }
  };

  const handlePrev = () => {
    if (step === 'select') setStep('upload');
    else if (step === 'download') setStep('select');
  };

  // 🚀 비동기 처리(Background Tasks)에 맞춘 빠른 요청 로직
  const handleTranslateAndDownload = async () => {
    setIsTranslating(true);
    setProgress({ current: 0, total: selectedLangs.length, currentLang: '' });

    for (let i = 0; i < selectedLangs.length; i++) {
      const lang = selectedLangs[i];
      setProgress({ current: i + 1, total: selectedLangs.length, currentLang: lang });
      
      try {
        const formData = new FormData();
        if (file) formData.append('file', file);
        formData.append('target_language', lang);
        formData.append('user_email', user?.email || 'guest@reg.ai.kr');

        // 🚨 [수정됨] 404 에러의 원인이었던 /process 주소를 제거하고 원래 프론트엔드 API 주소로 롤백했습니다!
        const res = await fetch('/api/docs-translate', { method: 'POST', body: formData });
        
        if (!res.ok) throw new Error(`${lang} 번역 요청 실패`);

        // 서버가 0.1초 만에 반환한 JSON 접수 메시지 확인
        const data = await res.json();
        console.log(`[${lang}] 서버 응답:`, data.message);

      } catch (error) {
        console.error(error);
        alert(`${lang} 번역 요청 중 오류가 발생했습니다.`);
      }
    }

    setIsTranslating(false);
    setIsCompleted(true); 
  };

  if (isCompleted) {
    return (
      <div className={s.wrap}>
        <div style={{ position: 'relative', zIndex: 100 }}><Navbar /></div>
        <CompleteView onClose={onClose} onBack={() => { setIsCompleted(false); setStep('download'); }} />
      </div>
    );
  }

  const currentIdx = STEPS.findIndex(x => x.id === step);

  return (
    <div className={s.wrap}>
      {/* <div style={{ position: 'relative', zIndex: 100 }}><Navbar /></div> */}

      {/* 로딩 오버레이 (서버 응답이 0.1초라 아주 잠깐 스쳐 지나갑니다) */}
      {isTranslating && (
        <div className={s.loadingOverlay}>
          <div className={s.loadingPopup}>
            <div className={s.spinnerWrapper}>
              <RefreshCw size={36} className={s.spin} />
              <div className={s.aiBadge}><Sparkles size={14} fill="#fff" /> AI</div>
            </div>
            <div className={s.loadingTexts}>
              <h3 className={s.loadingTitle}>서버에 번역 요청 중... ({progress.current}/{progress.total})</h3>
              <p className={s.loadingDesc}>
                <strong>{progress.currentLang}</strong> 번역을 안전하게 백그라운드로 접수하고 있습니다.<br/>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className={s.header}>
        <div className={s.centerWrap}>
          <div className={s.headerLeft}>
            <button className={s.closeBtn} onClick={onClose} disabled={isTranslating}>
              <ArrowLeft size={18} /> 나가기
            </button>
            <h2 className={s.title}>다국어 문서 생성</h2>
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
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#1e293b' }}>원본 교안을 업로드하세요</h3>
              
              <div 
                className={`${s.dropZone} ${isDragging ? s.dropZoneDragging : ''}`}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud size={56} color={isDragging ? '#3b82f6' : '#94a3b8'} style={{ marginBottom: '1rem' }} />
                <p style={{ color: '#334155', fontWeight: 'bold', fontSize: '1.1rem', margin: '0 0 0.5rem 0' }}>
                  이곳으로 파일을 드래그하여 놓거나 클릭하여 업로드하세요
                </p>
                <p style={{ color: '#64748b', margin: 0, lineHeight: '1.5' }}>
                  지원 형식: PPT, Word, Excel, PDF<br/>
                  (PDF는 텍스트 추출 시 레이아웃이 다소 변경될 수 있습니다)
                </p>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  style={{ display: 'none' }} 
                  accept=".ppt,.pptx,.doc,.docx,.xls,.xlsx,.pdf" 
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

          {step === 'select' && (
            <div className={s.card}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                <Globe size={20} color="#3b82f6"/> 번역할 국가 언어 선택
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
                {SUPPORTED_LANGS.map(lang => (
                  <label key={lang} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '1rem', border: '1px solid', borderColor: selectedLangs.includes(lang) ? '#3b82f6' : '#e2e8f0', borderRadius: '12px', background: selectedLangs.includes(lang) ? '#eff6ff' : '#fff', transition: 'all 0.2s' }}>
                    <input type="checkbox" checked={selectedLangs.includes(lang)} onChange={() => toggleLang(lang)} style={{ transform: 'scale(1.2)' }} />
                    <span style={{ fontWeight: selectedLangs.includes(lang) ? 'bold' : '500', color: '#334155' }}>{lang}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 'download' && (
            <div className={s.card} style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <Send size={56} color="#3b82f6" style={{ margin: '0 auto 1.5rem' }} />
              <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#334155' }}>모든 준비가 완료되었습니다!</h3>
              <p style={{ color: '#64748b', marginBottom: '2rem', lineHeight: '1.6' }}>
                선택하신 <strong>{selectedLangs.join(', ')}</strong> ({selectedLangs.length}개 국어)로<br/>
                문서 변환을 요청하시겠습니까?<br/>
                <span style={{ fontSize: '0.9rem', color: '#3b82f6', marginTop: '0.5rem', display: 'inline-block' }}>
                  작업이 완료되면 시스템 문서함에 저장되며, 이메일로 알림을 보내드립니다.
                </span>
              </p>
            </div>
          )}

        </div>
      </div>

      {/* 푸터 */}
      <div className={s.footer}>
        <div className={s.centerWrap}>
          <div className={s.footerMessage}></div>
          <div className={s.footerBtns}>
            {step !== 'upload' && <button className={s.navBtn} onClick={handlePrev} disabled={isTranslating}>이전</button>}
            
            {step !== 'download' ? (
              <button className={s.navBtnPrimary} onClick={handleNext} disabled={!file && step === 'upload'}>
                다음 단계
              </button>
            ) : (
              <button className={s.submitBtn} onClick={handleTranslateAndDownload} disabled={isTranslating}>
                번역 요청 시작
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}