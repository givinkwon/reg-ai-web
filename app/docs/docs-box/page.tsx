'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, RefreshCw, FileText, AlertCircle, Loader2 } from 'lucide-react';
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
  // ✅ meta에 tbm_id 등이 포함될 수 있으므로 [key: string]: any 추가 혹은 tbm_id 명시
  meta?: { 
    s3Key?: string; 
    kind?: string; 
    tbm_id?: string; // 혹은 tbmId, 백엔드 응답 키값 확인 필요
    [key: string]: any; 
  }; 
  kind?: string;
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
  
  // 가입 미완료 로직 (필요 시 사용)
  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const showExtraModal = forceExtraOpen && !!accountEmail;

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 개별 파일 다운로드 로딩 상태
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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

  // --- 자동 로그인 체크 (GA 트래킹용) ---
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

  // --- 데이터 페칭 ---
  const fetchDocs = async (source: 'mount' | 'manual' = 'manual') => {
    if (!userEmail) return;

    track(gaEvent(GA_CTX, 'FetchDocsStart'), {
      ui_id: gaUiId(GA_CTX, 'FetchDocsStart'),
      source,
    });

    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/docs?endpoint=list', {
        method: 'GET',
        headers: { 
          'x-user-email': userEmail,
          'Cache-Control': 'no-cache'
        },
        cache: 'no-store',
        signal: ac.signal,
      });

      if (!res.ok) {
        throw new Error(`목록 조회 실패 (${res.status})`);
      }

      const data = (await res.json()) as { items: DocItem[] };
      const items = Array.isArray(data.items) ? data.items : [];

      // 최신순 정렬
      items.sort((a, b) => b.createdAt - a.createdAt);

      setDocs(items);

      track(gaEvent(GA_CTX, 'FetchDocsSuccess'), {
        ui_id: gaUiId(GA_CTX, 'FetchDocsSuccess'),
        source,
        count: items.length,
      });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      
      const msg = e?.message ?? '문서 목록을 불러오지 못했습니다.';
      setError(msg);
      setDocs([]); 
      
      // ✅ [추가됨] 실패 이벤트 트래킹
      track(gaEvent(GA_CTX, 'FetchDocsFailure'), {
        ui_id: gaUiId(GA_CTX, 'FetchDocsFailure'),
        source,
        error_message: msg,
      });

    } finally {
      setLoading(false);
    }
  };

  // ✅ 초기화 완료 및 유저 로그인 시 데이터 로드 + View 이벤트
  useEffect(() => {
    if (initialized) {
      if (userEmail) {
        // 로그인 유저 View
        track(gaEvent(GA_CTX, 'View'), { ui_id: gaUiId(GA_CTX, 'View'), logged_in: true });
        fetchDocs('mount');
      } else {
        // ✅ [추가됨] 비로그인 유저 View (게스트가 페이지에 진입했음을 알기 위함)
        track(gaEvent(GA_CTX, 'View'), { ui_id: gaUiId(GA_CTX, 'View'), logged_in: false });
        setDocs([]); 
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, userEmail]);

  // --- 실제 다운로드 핸들러 ---
  const handleDownload = async (doc: DocItem, source: 'desktop' | 'mobile') => {
    if (!userEmail) return handleRequireLogin();
    if (downloadingId) return; 

    track(gaEvent(GA_CTX, 'ClickDownload'), {
      ui_id: gaUiId(GA_CTX, 'ClickDownload'),
      doc_id: doc.id,
      doc_name: doc.name,
      doc_kind: doc.kind || 'unknown',
      source_view: source,
    });

    setDownloadingId(doc.id);

    try {
      // ✅ [수정 부분 1] doc.meta에서 tbm_id 추출 (없을 수도 있으므로 안전하게 접근)
      // 백엔드에서 저장할 때 키가 'tbm_id'인지 'tbmId'인지 확실치 않을 때는 둘 다 체크
      const tbmId = (doc.meta as any)?.tbm_id || (doc.meta as any)?.tbmId;

      const qs = new URLSearchParams({
        endpoint: 'download',
        key: doc.id, 
      });

      // ✅ [수정 부분 2] tbmId가 존재하면 쿼리 파라미터에 추가
      // 이 값이 넘어가야 백엔드에서 단순 다운로드가 아닌 '서명 재생성'을 수행함
      if (tbmId) {
        qs.append('tbmId', tbmId);
      }

      const res = await fetch(`/api/docs?${qs.toString()}`, {
        method: 'GET',
        headers: {
            'x-user-email': userEmail,
        }
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
      
      // ✅ [추가됨] 다운로드 실패 트래킹
      track(gaEvent(GA_CTX, 'DownloadFailure'), {
        ui_id: gaUiId(GA_CTX, 'DownloadFailure'),
        doc_id: doc.id,
        error_message: e?.message || 'Unknown error',
      });

      alert('다운로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setDownloadingId(null);
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
        {showLoginModal && !showExtraModal && (
          <LoginPromptModal onClose={() => setShowLoginModal(false)} />
        )}
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
                <th style={{ width: '60%' }}>문서명</th>
                <th style={{ width: '20%', textAlign: 'center' }}>작성일</th>
                <th style={{ width: '20%', textAlign: 'center' }}>관리</th>
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
                    return (
                        <tr key={doc.id}>
                            <td>
                            <div className={s.docNameWrapper}>
                                <div className={s.iconBox}><FileText size={18} /></div>
                                <span className={s.docName}>{doc.name}</span>
                            </div>
                            </td>
                            <td className={s.textCenter}>{formatDate(doc.createdAt)}</td>
                            <td className={s.textCenter}>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                className={s.downloadBtn}
                                onClick={() => handleDownload(doc, 'desktop')}
                                disabled={isDownloading}
                            >
                                {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                {isDownloading ? '다운로드 중...' : '다운로드'}
                            </Button>
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
                return (
                    <div key={doc.id} className={s.mobileCard}>
                        <div className={s.mobileCardHeader}>
                        <div className={s.iconBox}><FileText size={16} /></div>
                        <span className={s.mobileDate}>{formatDate(doc.createdAt)}</span>
                        </div>
                        <div className={s.mobileDocName}>{doc.name}</div>
                        <Button 
                            variant="outline" 
                            className={s.mobileDownloadBtn}
                            onClick={() => handleDownload(doc, 'mobile')}
                            disabled={isDownloading}
                        >
                            {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            {isDownloading ? '다운로드 중...' : '문서 다운로드'}
                        </Button>
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
    </div>
  );
}