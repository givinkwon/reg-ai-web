'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, RefreshCw, FileText, AlertCircle, Loader2, PieChart, X, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/app/components/ui/button'; 
import s from './page.module.css';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ 모달 및 스토어
import LoginPromptModal from '@/app/docs/components/LoginPromptModal';
import { useChatStore } from '@/app/store/chat';
import { useUserStore } from '@/app/store/user';

// --- 타입 정의 ---
type DocItem = {
  id: string;
  name: string;
  createdAt: number;
  meta?: { 
    s3Key?: string; 
    kind?: string; 
    tbm_id?: string; 
    master_id?: string;
    total_count?: number; // 🚀 서버에서 향후 보내줄 전체 인원
    signed_count?: number; // 🚀 서버에서 향후 보내줄 완료 인원
    [key: string]: any; 
  }; 
  kind?: string;
};

// 🚀 [추가] 모달에서 사용할 상태 타입
type SignStatusData = {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  updatedAt: string;
  attendees: {
    name: string;
    phone: string;
    status: 'completed' | 'pending' | 'failed';
  }[];
};

// --- 유틸리티 ---
function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ✅ GA Context
const GA_CTX = {
  page: 'Docs',
  section: 'DocsVault',
  area: 'List',
} as const;

export default function DocsBoxPage() {
  const user = useUserStore((state) => state.user);
  const initialized = useUserStore((state) => state.initialized);
  const { showLoginModal, setShowLoginModal } = useChatStore();

  const userEmail = user?.email;
  const router = useRouter();
  
  // 가입 미완료 로직
  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const showExtraModal = forceExtraOpen && !!accountEmail;

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 다운로드 및 모달 상태
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [statusDocId, setStatusDocId] = useState<string | null>(null); // 현재 모달이 열린 master_id
  const [statusData, setStatusData] = useState<SignStatusData | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const fetchAbortRef = useRef<AbortController | null>(null);
  const autoLoginRef = useRef(false);

  // --- 로그인 유도 핸들러 ---
  const handleRequireLogin = () => {
    track(gaEvent(GA_CTX, 'ClickLogin'), {
      ui_id: gaUiId(GA_CTX, 'ClickLogin'),
      reason: 'require_auth_page',
    });
    setShowLoginModal(true);
  };

  useEffect(() => {
    if (initialized && !userEmail && !autoLoginRef.current) {
      autoLoginRef.current = true;
      track(gaEvent(GA_CTX, 'AutoRequireLogin'), {
        ui_id: gaUiId(GA_CTX, 'AutoRequireLogin'),
      });
    }
  }, [initialized, userEmail]);

  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, []);

  // --- 목록 페칭 ---
  const fetchDocs = async (source: 'mount' | 'manual' = 'manual') => {
    if (!userEmail) return;

    track(gaEvent(GA_CTX, 'FetchDocsStart'), { ui_id: gaUiId(GA_CTX, 'FetchDocsStart'), source });

    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/docs?endpoint=list', {
        method: 'GET',
        headers: { 'x-user-email': userEmail, 'Cache-Control': 'no-cache' },
        cache: 'no-store',
        signal: ac.signal,
      });

      if (!res.ok) throw new Error(`목록 조회 실패 (${res.status})`);

      const data = (await res.json()) as { items: DocItem[] };
      const items = Array.isArray(data.items) ? data.items : [];

      items.sort((a, b) => b.createdAt - a.createdAt);
      setDocs(items);

      track(gaEvent(GA_CTX, 'FetchDocsSuccess'), { ui_id: gaUiId(GA_CTX, 'FetchDocsSuccess'), source, count: items.length });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      const msg = e?.message ?? '문서 목록을 불러오지 못했습니다.';
      setError(msg);
      setDocs([]); 
      track(gaEvent(GA_CTX, 'FetchDocsFailure'), { ui_id: gaUiId(GA_CTX, 'FetchDocsFailure'), source, error_message: msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialized) {
      if (userEmail) {
        track(gaEvent(GA_CTX, 'View'), { ui_id: gaUiId(GA_CTX, 'View'), logged_in: true });
        fetchDocs('mount');
      } else {
        track(gaEvent(GA_CTX, 'View'), { ui_id: gaUiId(GA_CTX, 'View'), logged_in: false });
        setDocs([]); 
      }
    }
  }, [initialized, userEmail]);

  // --- 실제 다운로드 핸들러 ---
  const handleDownload = async (doc: DocItem, source: 'desktop' | 'mobile') => {
    if (!userEmail) return handleRequireLogin();
    if (downloadingId) return; 

    track(gaEvent(GA_CTX, 'ClickDownload'), {
      ui_id: gaUiId(GA_CTX, 'ClickDownload'),
      doc_id: doc.id, doc_name: doc.name, doc_kind: doc.kind || 'unknown', source_view: source,
    });

    setDownloadingId(doc.id);

    try {
      const tbmId = (doc.meta as any)?.tbm_id || (doc.meta as any)?.tbmId;
      const qs = new URLSearchParams({ endpoint: 'download', key: doc.id });
      if (tbmId) qs.append('tbmId', tbmId);

      const res = await fetch(`/api/docs?${qs.toString()}`, {
        method: 'GET',
        headers: { 'x-user-email': userEmail }
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || '다운로드 요청 실패');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name; 
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

    } catch (e: any) {
      console.error('Download error:', e);
      track(gaEvent(GA_CTX, 'DownloadFailure'), { ui_id: gaUiId(GA_CTX, 'DownloadFailure'), doc_id: doc.id, error_message: e?.message || 'Unknown error' });
      alert('다운로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setDownloadingId(null);
    }
  };

  // 🚀 [추가] 서명 현황 보기 버튼 핸들러
  const handleViewStatus = async (masterId: string | undefined) => {
    if (!masterId) return alert("문서 정보를 찾을 수 없습니다.");
    setStatusDocId(masterId);
    setStatusLoading(true);

    try {
      // 🚨 실제 백엔드 API가 완성되면 주석을 해제하고 연동하세요!
      // const res = await fetch(`/api/docs-sign/status?master_id=${masterId}`);
      // if (!res.ok) throw new Error("데이터 조회 실패");
      // const data = await res.json();
      // setStatusData(data);
      
      // 💡 현재는 UI 검증을 위한 가짜 데이터(Mock Data)를 0.5초 뒤에 보여줍니다.
      await new Promise(r => setTimeout(r, 500));
      setStatusData({
        total: 8,
        completed: 6,
        pending: 1,
        failed: 1,
        updatedAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
        attendees: [
          { name: '홍길동', phone: '010-1234-5678', status: 'completed' },
          { name: '김현장', phone: '010-2345-6789', status: 'failed' },
          { name: '박안전', phone: '010-3456-7890', status: 'completed' },
          { name: '오야간', phone: '010-7890-1234', status: 'pending' },
          { name: '최작업', phone: '010-4567-8901', status: 'completed' },
          { name: '이협력', phone: '010-5678-9012', status: 'completed' },
        ]
      });

    } catch (e) {
      alert("서명 현황을 불러오지 못했습니다.");
      setStatusDocId(null);
    } finally {
      setStatusLoading(false);
    }
  };

  const countText = useMemo(() => loading ? '로딩 중...' : `총 ${docs.length}건`, [docs.length, loading]);

  // --- 렌더링: 비로그인 상태 ---
  if (initialized && !userEmail) {
    return (
      <div className={s.container}>
        <div className={s.loginCard}>
          <AlertCircle size={48} className={s.loginIcon} />
          <h2 className={s.loginTitle}>로그인이 필요합니다</h2>
          <p className={s.loginDesc}>안전보건 문서를 확인하려면 먼저 로그인해주세요.</p>
          <Button onClick={handleRequireLogin} className={s.primaryBtn}>로그인하기</Button>
        </div>
        {showLoginModal && !showExtraModal && <LoginPromptModal onClose={() => setShowLoginModal(false)} />}
      </div>
    );
  }

  // --- 렌더링: 로딩 중 ---
  if (!initialized) {
    return (
        <div className={s.container}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', color: '#666' }}>
                <Loader2 className="animate-spin mb-2" size={32} />
                <p>문서함을 불러오는 중입니다...</p>
            </div>
        </div>
    );
  }

  // --- 렌더링: 문서함 (로그인 상태) ---
  return (
    <div className={s.container}>
      <header className={s.header}>
        <div className={s.headerTitles}>
          <h1 className={s.title}>안전보건 문서함</h1>
          <p className={s.desc}>RegAI에서 생성된 모든 안전 문서를 안전하게 보관하고 관리하세요.</p>
        </div>
        
        <div className={s.headerActions}>
           <div className={s.statusBadge}>
             <span className={s.dot} />
             {countText}
           </div>
           <Button 
             variant="outline" 
             size="sm" 
             onClick={() => fetchDocs('manual')} 
             disabled={loading}
             className={s.refreshBtn}
           >
             <RefreshCw size={14} className={loading ? s.spin : ''} />
             <span className={s.btnText}>새로고침</span>
           </Button>
        </div>
      </header>

      <main className={s.content}>
        {error && <div className={s.errorBox}>{error}</div>}

        {/* --- Desktop View (Table) --- */}
        <div className={s.desktopView}>
          <table className={s.table}>
            <thead>
              <tr>
                <th style={{ width: '55%' }}>문서명</th>
                <th style={{ width: '15%', textAlign: 'center' }}>작성일</th>
                <th style={{ width: '30%', textAlign: 'center' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {docs.length === 0 && !loading ? (
                <tr>
                  <td colSpan={3} className={s.emptyCell}>
                    생성된 문서가 없습니다.
                  </td>
                </tr>
              ) : (
                docs.map((doc) => {
                    const isDownloading = downloadingId === doc.id;
                    
                    // 🚀 [추가] 서명 관련 문서 판별 및 진행률 계산
                    const isSignDoc = doc.kind === 'signing_progress' || doc.kind === 'signed_complete';
                    const masterId = doc.meta?.master_id;
                    const totalCount = doc.meta?.total_count; 
                    const signedCount = doc.meta?.signed_count;
                    const progressPercent = (totalCount && signedCount !== undefined) 
                      ? Math.round((signedCount / totalCount) * 100) 
                      : null;

                    return (
                        <tr key={doc.id}>
                            <td>
                            <div className={s.docNameWrapper}>
                                <div className={s.iconBox}><FileText size={18} /></div>
                                <div className={s.docNameBox}>
                                  <span className={s.docName}>{doc.name}</span>
                                  
                                  {/* 🚀 [추가] 서명 문서일 경우 진척도 뱃지 노출 */}
                                  {isSignDoc && (
                                    <span className={`${s.signBadge} ${doc.kind === 'signed_complete' ? s.signBadgeComplete : s.signBadgeProgress}`}>
                                      {doc.kind === 'signed_complete' 
                                        ? <><CheckCircle2 size={12}/> 서명 완료 {progressPercent !== null && '(100%)'}</>
                                        : <><Clock size={12}/> 서명 진행중 {progressPercent !== null && `(${progressPercent}%)`}</>
                                      }
                                    </span>
                                  )}
                                </div>
                            </div>
                            </td>
                            <td className={s.textCenter}>{formatDate(doc.createdAt)}</td>
                            <td>
                              <div className={s.actionBtns}>
                                <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className={s.downloadBtn}
                                    onClick={() => handleDownload(doc, 'desktop')}
                                    disabled={isDownloading}
                                >
                                    {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                    {isDownloading ? '다운로드 중' : '다운로드'}
                                </Button>
                                
                                {/* 🚀 [추가] 현황 보기 버튼 */}
                                {isSignDoc && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className={s.statusBtn}
                                    onClick={() => handleViewStatus(masterId)}
                                  >
                                    <PieChart size={14} /> 진행상태
                                  </Button>
                                )}
                              </div>
                            </td>
                        </tr>
                    );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* --- Mobile View (List) --- */}
        <div className={s.mobileView}>
          {docs.length === 0 && !loading ? (
            <div className={s.emptyMobile}>생성된 문서가 없습니다.</div>
          ) : (
            docs.map((doc) => {
                const isDownloading = downloadingId === doc.id;
                const isSignDoc = doc.kind === 'signing_progress' || doc.kind === 'signed_complete';
                const masterId = doc.meta?.master_id;
                
                return (
                    <div key={doc.id} className={s.mobileCard}>
                        <div className={s.mobileCardHeader}>
                          <div className={s.iconBox}><FileText size={16} /></div>
                          <span className={s.mobileDate}>{formatDate(doc.createdAt)}</span>
                        </div>
                        <div className={s.mobileDocName}>{doc.name}</div>
                        <div className={s.mobileActionBtns}>
                          <Button 
                              variant="outline" 
                              className={`${s.mobileBtn} ${isSignDoc ? '' : 'w-full'}`}
                              onClick={() => handleDownload(doc, 'mobile')}
                              disabled={isDownloading}
                          >
                              {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                              {isDownloading ? '다운로드 중...' : '다운로드'}
                          </Button>

                          {/* 🚀 [추가] 모바일 현황 보기 버튼 */}
                          {isSignDoc && (
                            <Button 
                              variant="outline" 
                              className={s.mobileBtnStatus}
                              onClick={() => handleViewStatus(masterId)}
                            >
                              <PieChart size={14} /> 진행상태
                            </Button>
                          )}
                        </div>
                    </div>
                );
            })
          )}
        </div>
      </main>
      
      <footer className={s.footer}>
        * 문서는 계정별로 안전하게 암호화되어 저장됩니다.
      </footer>

      {showLoginModal && !showExtraModal && (
          <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}

      {/* 🚀 [추가] 서명 현황 팝업 모달 */}
      {statusDocId && (
        <div className={s.modalOverlay}>
          <div className={s.modalContent}>
            <div className={s.modalHeader}>
              <div>
                <h3 className={s.modalTitle}>서명 현황</h3>
                {statusData && <span className={s.modalTime}>업데이트: {statusData.updatedAt}</span>}
              </div>
              <button className={s.closeModalBtn} onClick={() => { setStatusDocId(null); setStatusData(null); }}>
                <X size={24} />
              </button>
            </div>
            
            <div className={s.modalBody}>
              {statusLoading || !statusData ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: '#64748b' }}>
                  <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 1rem', color: '#3b82f6' }} />
                  데이터를 불러오고 있습니다...
                </div>
              ) : (
                <>
                  <div className={s.statsGrid}>
                    <div className={s.statBox}>
                      <span className={s.statLabel}>완료</span>
                      <span className={s.statValue}>{statusData.completed}</span>
                    </div>
                    <div className={s.statBox}>
                      <span className={s.statLabel}>대기</span>
                      <span className={s.statValue}>{statusData.pending}</span>
                    </div>
                    <div className={s.statBox}>
                      <span className={s.statLabel}>실패</span>
                      <span className={s.statValue} style={{ color: '#ef4444' }}>{statusData.failed}</span>
                    </div>
                  </div>

                  <div className={s.progressTrack}>
                    <div 
                      className={s.progressFill} 
                      style={{ width: `${Math.round((statusData.completed / statusData.total) * 100)}%` }} 
                    />
                  </div>

                  <div className={s.attendeeList}>
                    {statusData.attendees.map((a, idx) => (
                      <div key={idx} className={s.attendeeItem}>
                        <div className={s.attendeeInfo}>
                          <span className={s.attendeeName}>{a.name}</span>
                          <span className={s.attendeeDesc}>
                            {a.phone} - {a.status === 'completed' ? '서명 완료' : a.status === 'failed' ? '발송 실패' : '서명 대기'}
                          </span>
                        </div>
                        <div className={s.attendeeActions}>
                          <span className={`${s.attBadge} ${a.status === 'completed' ? s.attComplete : a.status === 'failed' ? s.attFail : s.attPending}`}>
                            {a.status === 'completed' ? '완료' : a.status === 'failed' ? '실패' : '대기'}
                          </span>
                          {a.status !== 'completed' && (
                            <button className={s.resendBtn}>재발송</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}