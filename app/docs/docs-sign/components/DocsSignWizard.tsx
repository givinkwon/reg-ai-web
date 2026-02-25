'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, RefreshCw, ArrowLeft, UploadCloud, Users, Plus, X, Save, Download } from 'lucide-react';
import s from './DocsSignWizard.module.css';

import Navbar from '@/app/docs/components/Navbar';
import CompleteView from './ui/CompleteView'; 
import { useUserStore } from '@/app/store/user';

// ✅ GA 로직 임포트
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'DocsSign', section: 'Sign', area: 'Wizard' } as const;

export type Attendee = { name: string; contact: string; status?: 'pending' | 'completed' | 'failed' };
type AttendeeGroup = { groupName: string; attendees: Attendee[]; };

type StepId = 'upload' | 'request' | 'status';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'upload', label: '문서 업로드' },
  { id: 'request', label: '요청 정보 입력' },
  { id: 'status', label: '서명 현황 확인' },
];

type SignStatusData = {
  total: number; completed: number; pending: number; failed: number; updatedAt: string;
  attendees: Attendee[];
};

type Props = { open: boolean; onClose: () => void; onRequireLogin?: () => void; };

export default function DocsSignWizard({ open, onClose, onRequireLogin }: Props) {
  const user = useUserStore((st) => st.user);
  const router = useRouter();

  const [step, setStep] = useState<StepId>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<string[]>([]);
  const [originalPath, setOriginalPath] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([{ name: '', contact: '' }]);
  
  const [savedGroups, setSavedGroups] = useState<AttendeeGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [masterId, setMasterId] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<SignStatusData | null>(null);
  const [isStatusLoading, setIsStatusLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const storedGroups = localStorage.getItem('regai_attendee_groups');
      if (storedGroups) {
        try { setSavedGroups(JSON.parse(storedGroups)); } catch (e) { console.error(e); }
      }
    }
  }, [open]);

  const fetchStatus = async (id: string, isSilent = false) => {
    if (!isSilent) setIsStatusLoading(true);
    try {
      const res = await fetch(`/api/docs-sign/status?master_id=${id}`, {
        method: 'GET',
        headers: { 'x-user-email': user?.email || 'guest@reg.ai.kr' }
      });
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!isSilent) setIsStatusLoading(false);
    }
  };

  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    if (step === 'status' && masterId) {
      intervalId = setInterval(() => {
        fetchStatus(masterId, true);
      }, 5000); 
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [step, masterId]);

  if (!open) return null;

  const checkUsageLimit = () => {
    if (user?.email) return true; 
    const count = parseInt(localStorage.getItem('docs_sign_usage_count') || '0', 10);
    if (count >= 1) {
      if (onRequireLogin) onRequireLogin();
      return false; 
    }
    return true;
  };

  const incrementUsageLimit = () => {
    if (user?.email) return;
    const count = parseInt(localStorage.getItem('docs_sign_usage_count') || '0', 10);
    localStorage.setItem('docs_sign_usage_count', String(count + 1));
  };

  // PPTX, PPT 차단
  const validateAndSetFile = (selectedFile: File) => {
    const fileName = selectedFile.name.toLowerCase();
    if (fileName.endsWith('.hwp')) return alert("현재 HWP 파일은 지원 준비 중입니다. PDF로 변환하여 업로드해 주세요.");
    
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
    if (!allowedExtensions.some(ext => fileName.endsWith(ext))) {
      return alert("지원하지 않는 파일 형식입니다.\n(지원 형식: PDF, Word, Excel)");
    }
    setFile(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) validateAndSetFile(e.target.files[0]);
  };

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) validateAndSetFile(e.dataTransfer.files[0]);
  };

  const handleSaveGroup = () => {
    if (!newGroupName.trim()) return alert("그룹 이름을 입력해주세요.");
    const validAttendees = attendees.filter(a => a.name.trim() && a.contact.trim());
    if (validAttendees.length === 0) return alert("저장할 인원이 없습니다. (이름과 연락처를 확인해주세요)");

    const newGroup: AttendeeGroup = {
      groupName: newGroupName.trim(),
      attendees: validAttendees.map(a => ({ name: a.name, contact: a.contact }))
    };

    const updatedGroups = [...savedGroups, newGroup];
    setSavedGroups(updatedGroups);
    localStorage.setItem('regai_attendee_groups', JSON.stringify(updatedGroups));
    
    setNewGroupName('');
    setIsGroupModalOpen(false);
    alert(`'${newGroup.groupName}' 그룹이 저장되었습니다.`);
  };

  const handleLoadGroup = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedGroupName = e.target.value;
    if (!selectedGroupName) return;

    const group = savedGroups.find(g => g.groupName === selectedGroupName);
    if (group) {
      const isConfirmed = window.confirm(`'${selectedGroupName}' 그룹의 인원(${group.attendees.length}명)을 불러오시겠습니까?\n기존 명단 아래에 추가됩니다.`);
      if (isConfirmed) {
        const currentValid = attendees.filter(a => a.name.trim() || a.contact.trim());
        setAttendees([...currentValid, ...group.attendees]);
      }
    }
    e.target.value = ""; 
  };

  const handleNext = async () => {
    if (step === 'upload') {
      if (!file) return alert('파일을 선택해주세요.');
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
        if (data.original_path) setOriginalPath(data.original_path);

        setStep('request'); 
        incrementUsageLimit();
      } catch (error) {
        console.error(error);
        alert('문서 분석 중 오류가 발생했습니다.');
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handlePrev = () => {
    track(gaEvent(GA_CTX, 'ClickPrev'), { ui_id: gaUiId(GA_CTX, 'ClickPrev'), current_step: step });
    if (step === 'request') setStep('upload');
  };

  const handleSendRequest = async () => {
    track(gaEvent(GA_CTX, 'ClickSubmit'), { ui_id: gaUiId(GA_CTX, 'ClickSubmit') });
    
    const validAttendees = attendees.filter(a => a.name.trim() && a.contact.trim());
    if(validAttendees.length === 0) return alert('이름과 연락처를 1명 이상 정확히 입력해주세요.');
    
    setSubmitting(true);
    try {
      const res = await fetch('/api/docs-sign/request-signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file?.name || '안전_관련_문서',
          summary: summary,
          attendees: validAttendees,
          user_email: user?.email || 'guest@reg.ai.kr',
          original_path: originalPath 
        }),
      });

      if (!res.ok) {
         const errData = await res.json();
         throw new Error(errData.message || '서명 발송 실패');
      }
      
      const resData = await res.json();
      setMasterId(resData.master_id);
      
      setStep('status');
      fetchStatus(resData.master_id);
      
    } catch (e: any) {
      console.error(e);
      alert(`서명 요청 발송 중 오류가 발생했습니다: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrevFromStatus = () => {
    alert("이전으로 돌아가도, 서명 발송이 완료된 문서는 문서함에서 확인할 수 있어요.");
    setStep('request');
  };

  const handleCompleteWizard = () => {
    setIsCompleted(true);
  };

  const handleDownloadCurrentState = async () => {
    if (!masterId) return alert('문서 정보가 없습니다.');
    
    setIsDownloading(true);
    try {
      const listRes = await fetch('/api/docs?endpoint=list', {
        headers: { 'x-user-email': user?.email || 'guest@reg.ai.kr', 'Cache-Control': 'no-cache' }
      });
      if (!listRes.ok) throw new Error('문서함 연동 실패');
      
      const listData = await listRes.json();
      const items = Array.isArray(listData.items) ? listData.items : [];
      
      const targetDoc = items.find((d: any) => 
        d.meta?.master_id === masterId || d.meta?.masterId === masterId
      );
      
      if (!targetDoc) {
         alert('생성된 문서를 찾을 수 없습니다. 문서함에서 확인해주세요.');
         return;
      }

      const qs = new URLSearchParams({ endpoint: 'download', key: targetDoc.id });
      const tbmId = targetDoc.meta?.tbm_id || targetDoc.meta?.tbmId;
      if (tbmId) qs.append('tbmId', tbmId);

      const downRes = await fetch(`/api/docs?${qs.toString()}`, {
        method: 'GET',
        headers: { 'x-user-email': user?.email || 'guest@reg.ai.kr' }
      });

      if (!downRes.ok) throw new Error('다운로드 실패');

      const blob = await downRes.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = targetDoc.name; 
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      
    } catch (e: any) {
      console.error(e);
      alert('다운로드 중 오류가 발생했습니다.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (isCompleted) {
    return (
      <div className={s.wrap}>
        <div className={s.navWrapper}>
          <Navbar />
        </div>
        <CompleteView onClose={onClose} onBack={() => { setIsCompleted(false); setStep('status'); }} />
      </div>
    );
  }

  const currentIdx = STEPS.findIndex(x => x.id === step);

  return (
    <div className={s.wrap}>

      <div className={s.navWrapper}>
        <Navbar />
      </div>

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

      <div className={s.header}>
        <div className={s.centerWrap}>
          <div className={s.headerLeft}>
            <button 
              className={s.closeBtn} 
              onClick={onClose} 
              disabled={isAnalyzing || submitting}
            >
              <ArrowLeft size={18} /> 나가기
            </button>
            <h2 className={s.title}>안전 문서 단체 서명 받기</h2>
          </div>
          <div className={s.progressText}>{currentIdx + 1} / {STEPS.length} 단계</div>
        </div>
      </div>

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

      <div className={s.footer}>
        <div className={s.centerWrap}>
          <div className={s.footerMessage}></div>
          <div className={s.footerBtns}>
            {step === 'request' && <button className={s.navBtn} onClick={handlePrev} disabled={submitting}>이전</button>}
            {step === 'status' && <button className={s.navBtn} onClick={handlePrevFromStatus} disabled={isStatusLoading || isDownloading}>이전</button>}
            
            {step === 'upload' && <button className={s.navBtnPrimary} onClick={handleNext} disabled={isAnalyzing || !file}>다음 단계</button>}
            {step === 'request' && <button className={s.submitBtn} onClick={handleSendRequest} disabled={submitting}>서명 요청 발송</button>}
            {step === 'status' && <button className={s.submitBtn} onClick={handleCompleteWizard} disabled={isDownloading}>완료</button>}
          </div>
        </div>
      </div>

      <div className={s.content}>
        <div className={s.container}>
          
          {step === 'upload' && (
            <div className={s.card}>
              <h3 className={s.fileCardTitle}>서명이 필요한 문서를 업로드하세요</h3>
              
              <div 
                className={`${s.dropZone} ${isDragging ? s.dropZoneDragging : ''}`}
                onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadCloud size={56} className={isDragging ? 'text-blue-500' : 'text-slate-400'} style={{ marginBottom: '1rem' }} />
                <p className={s.dropZoneTitle}>이곳으로 파일을 드래그하여 놓거나 클릭하여 업로드하세요</p>
                <p className={s.dropZoneDesc}>지원 형식: PDF, Word, Excel</p>
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  style={{ display: 'none' }} 
                  accept=".pdf,.doc,.docx,.xls,.xlsx" 
                />
              </div>

              {file && (
                <div className={s.fileUploadedBox}>
                  <span className={s.fileName}>📁 {file.name}</span>
                  <button className={s.fileRemoveBtn} onClick={() => setFile(null)}>
                    <X size={18} />
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'request' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className={s.summaryCard}>
                <h3 className={s.summaryTitle}>
                  <Sparkles size={20} color="#3b82f6" /> AI 문서 핵심 요약
                </h3>
                <p className={s.summaryDesc}>
                  아래 요약된 내용이 대상자에게 발송되어 서명 전 안내됩니다.
                </p>
                <ul className={s.summaryList}>
                  {summary.map((txt, idx) => (
                    <li key={idx}>{txt}</li>
                  ))}
                </ul>
              </div>

              <div className={s.card}>
                <div className={s.attendeeHeader}>
                  <span className={s.attendeeTitle}>
                    <Users size={20} color="#3b82f6" /> 서명 대상자 지정
                  </span>
                  
                  <div className={s.groupActionWrapper}>
                    <select 
                      className={s.groupSelect}
                      onChange={handleLoadGroup}
                      defaultValue=""
                    >
                      <option value="" disabled>그룹 선택(불러오기)</option>
                      {savedGroups.map(g => (
                        <option key={g.groupName} value={g.groupName}>{g.groupName} ({g.attendees.length}명)</option>
                      ))}
                    </select>
                    
                    <button className={s.saveGroupBtn} onClick={() => setIsGroupModalOpen(true)}>
                      <Save size={16} /> 현재 입력을 그룹으로 저장
                    </button>

                    <button 
                      className={s.addBtn} 
                      onClick={() => setAttendees([...attendees, { name: '', contact: '' }])}
                    >
                      <Plus size={16} /> 인원 추가
                    </button>
                  </div>
                </div>
                
                {attendees.length === 0 ? (
                  <div className={s.emptyState}>
                    등록된 서명 대상자가 없습니다. <br/>인원을 추가하거나 그룹을 불러와주세요.
                  </div>
                ) : (
                  <div className={s.table}>
                    {/* 🚀 기획안 반영: 리스트 UI 변경 */}
                    {attendees.map((a, i) => (
                      <div key={i} className={s.attendeeRow}>
                        <div className={s.rowNum}>{i + 1}</div>
                        <div className={s.inputWrapper}>
                          <input 
                            className={s.inputCell} 
                            placeholder="이름" 
                            value={a.name} 
                            onChange={e => { const n = [...attendees]; n[i].name = e.target.value; setAttendees(n); }} 
                          />
                        </div>
                        <div className={s.inputWrapperLarge}>
                          <input 
                            className={s.inputCell} 
                            placeholder="연락처 (알림톡 발송용)" 
                            value={a.contact} 
                            onChange={e => { const n = [...attendees]; n[i].contact = e.target.value; setAttendees(n); }} 
                          />
                        </div>
                        <button className={s.removeBtn} onClick={() => setAttendees(p => p.filter((_, idx) => idx !== i))}>
                          <X size={20} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 'status' && (
            <div className={s.card}>
              <div className={s.statusHeaderBox}>
                <h3 className={s.statusMainTitle}>서명 진행 현황</h3>
                <p className={s.statusDesc}>
                  참여자에게 서명 링크가 발송되었습니다. 아래에서 서명 수집 진행 상황을 확인하세요.<br/>
                  이 페이지를 닫아도 수집은 계속 진행되며, 생성된 파일은 <b>문서함</b> 또는 <b>이메일</b>에서 확인 가능합니다.
                </p>
                {statusData && (
                  <span className={s.statusTime}>
                    <RefreshCw size={12} className={s.spin} style={{ display: 'inline-block', marginRight: '4px' }}/>
                    업데이트: {statusData.updatedAt}
                  </span>
                )}
              </div>

              {isStatusLoading && !statusData ? (
                <div className={s.loadingState}>
                  <RefreshCw className={`${s.spin} mb-2`} size={32} color="#3b82f6" />
                  데이터를 불러오는 중입니다...
                </div>
              ) : (
                <div className={s.statusBody}>
                  {statusData && (
                    <>
                      <div className={s.statsGrid}>
                        <div className={s.statBox}><span className={s.statLabel}>완료</span><span className={s.statValue}>{statusData.completed}</span></div>
                        <div className={s.statBox}><span className={s.statLabel}>대기</span><span className={s.statValue}>{statusData.pending}</span></div>
                        <div className={s.statBox}><span className={s.statLabel}>실패</span><span className={`${s.statValue} ${s.statFail}`}>{statusData.failed}</span></div>
                      </div>

                      <div className={s.progressTrack}>
                        <div className={s.progressFill} style={{ width: `${Math.round((statusData.completed / statusData.total) * 100)}%` }} />
                      </div>

                      <div className={s.attendeeList}>
                        {statusData.attendees.map((a, idx) => (
                          <div key={idx} className={s.attendeeItem}>
                            <div className={s.attendeeInfo}>
                              <span className={s.attendeeName}>{a.name}</span>
                              <span className={s.attendeeContact}>
                                {a.contact} - {a.status === 'completed' ? '서명 완료' : a.status === 'failed' ? '발송 실패' : '서명 대기'}
                              </span>
                            </div>
                            <div className={s.attendeeActions}>
                               <span className={`${s.attBadge} ${a.status === 'completed' ? s.attComplete : a.status === 'failed' ? s.attFail : s.attPending}`}>
                                {a.status === 'completed' ? '완료' : a.status === 'failed' ? '실패' : '대기'}
                              </span>
                              {a.status !== 'completed' && <button className={s.resendBtn}>재발송</button>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className={s.statusBottomActions}>
                    <button className={s.btnOutline} onClick={() => { onClose(); router.push('/docs/docs-box'); }}>
                      문서함 바로가기
                    </button>
                    <button className={s.btnPrimarySm} onClick={handleDownloadCurrentState} disabled={isDownloading}>
                      {isDownloading ? <RefreshCw size={14} className={s.spin} /> : <Download size={14}/>}
                      {isDownloading ? '다운로드 중...' : '현재 상태로 다운로드'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {isGroupModalOpen && (
        <div className={s.modalOverlay}>
          <div className={s.modalContent}>
            <h3 className={s.modalTitle}>그룹 저장</h3>
            <p className={s.modalDesc}>현재 입력된 명단을 나중에도 쉽게 불러올 수 있습니다.</p>
            <input type="text" placeholder="예) 지게차팀, 야간조, 협력사A" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className={s.modalInput} />
            <div className={s.modalActionBox}>
              <button className={s.modalCancelBtn} onClick={() => setIsGroupModalOpen(false)}>취소</button>
              <button className={s.modalConfirmBtn} onClick={handleSaveGroup}>저장하기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}