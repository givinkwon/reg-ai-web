'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, RefreshCw, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/app/components/ui/button'; 
import s from './page.module.css';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ 모달 및 스토어
import LoginPromptModal from '@/app/docs/components/LoginPromptModal';
import { useChatStore } from '@/app/store/chat';
import { useUserStore } from '@/app/store/user'; // User Store import

// --- 타입 정의 ---
type DocItem = {
  id: string;
  name: string;
  createdAt: number;
  meta?: any;
  kind?: string;
};

// --- 유틸리티 ---
function formatDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ✅ GA Context
const GA_CTX = {
  page: 'SafetyDocs', // 일관성을 위해 SafetyDocs로 통일 권장 (또는 기존 DocsVault 유지 가능)
  section: 'DocsVault',
  area: 'List',
} as const;

export default function DocsBoxPage() {
  // ✅ Store에서 실제 유저 정보 가져오기
  const user = useUserStore((state) => state.user);
  const initialized = useUserStore((state) => state.initialized);
  const { showLoginModal, setShowLoginModal } = useChatStore();

  // 실제 이메일 (로그인 안했으면 undefined)
  const userEmail = user?.email;

  const router = useRouter();
  
  // 가입 미완료 로직
  const [forceExtraOpen, setForceExtraOpen] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const showExtraModal = forceExtraOpen && !!accountEmail;

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fetchAbortRef = useRef<AbortController | null>(null);
  const autoLoginRef = useRef(false);

  // --- 로그인 유도 핸들러 ---
  const handleRequireLogin = () => {
    // ✅ GA: 로그인 버튼 클릭
    track(gaEvent(GA_CTX, 'ClickLogin'), {
      ui_id: gaUiId(GA_CTX, 'ClickLogin'),
      reason: 'require_auth_page',
    });
    setShowLoginModal(true);
  };

  // --- 자동 로그인 체크 (GA 트래킹용) ---
  useEffect(() => {
    // 초기화가 끝났는데 유저가 없을 때만 체크
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
    // 이메일 없으면 요청하지 않음
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
      // ✅ 실제 이메일을 헤더에 담아 요청
      const res = await fetch('/api/docs?endpoint=list', {
        method: 'GET',
        headers: { 
          'x-user-email': userEmail,
          'Cache-Control': 'no-cache' // 최신 데이터 보장
        },
        cache: 'no-store',
        signal: ac.signal,
      });

      if (!res.ok) {
        throw new Error(`목록 조회 실패 (${res.status})`);
      }

      const data = (await res.json()) as { items: DocItem[] };
      const items = Array.isArray(data.items) ? data.items : [];

      setDocs(items);
      console.log(`[DocsBox] Fetched ${items.length} items for ${userEmail}`);

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
    } finally {
      setLoading(false);
    }
  };

  // ✅ 초기화 완료 및 유저 로그인 시 데이터 로드
  useEffect(() => {
    if (initialized && userEmail) {
      track(gaEvent(GA_CTX, 'View'), { ui_id: gaUiId(GA_CTX, 'View'), logged_in: true });
      fetchDocs('mount');
    } else if (initialized && !userEmail) {
      setDocs([]); // 로그아웃 시 목록 비움
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, userEmail]);

  // --- 다운로드 핸들러 ---
  const handleDownload = async (doc: DocItem, source: 'desktop' | 'mobile') => {
    // ✅ GA: 다운로드 클릭
    track(gaEvent(GA_CTX, 'ClickDownload'), {
      ui_id: gaUiId(GA_CTX, 'ClickDownload'),
      doc_id: doc.id,
      doc_name: doc.name,
      doc_kind: doc.kind || 'unknown',
      source_view: source,
    });

    if (!userEmail) return handleRequireLogin();

    // 여기에 기존 다운로드 로직 유지
    alert(`'${doc.name}' 다운로드를 준비 중입니다.`);
  };

  const countText = useMemo(() => loading ? '로딩 중...' : `총 ${docs.length}건`, [docs.length, loading]);

  // --- 렌더링: 비로그인 상태 (초기화 완료 후) ---
  if (initialized && !userEmail) {
    return (
      <div className={s.container}>
        <div className={s.loginCard}>
          <AlertCircle size={48} className={s.loginIcon} />
          <h2 className={s.loginTitle}>로그인이 필요합니다</h2>
          <p className={s.loginDesc}>안전보건 문서를 확인하려면 먼저 로그인해주세요.</p>
          <Button onClick={handleRequireLogin} className={s.primaryBtn}>로그인하기</Button>
        </div>
        {/* 비로그인 상태에서도 모달은 띄울 수 있어야 함 */}
        {showLoginModal && !showExtraModal && (
          <LoginPromptModal onClose={() => setShowLoginModal(false)} />
        )}
      </div>
    );
  }

  // --- 렌더링: 로딩 중 (초기화 전) ---
  if (!initialized) {
    return <div className={s.container}><div style={{padding:'40px', textAlign:'center'}}>로딩 중...</div></div>;
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
                docs.map((doc) => (
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
                      >
                        <Download size={14} />
                        다운로드
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* --- Mobile View (List) --- */}
        <div className={s.mobileView}>
          {docs.length === 0 && !loading ? (
            <div className={s.emptyMobile}>생성된 문서가 없습니다.</div>
          ) : (
            docs.map((doc) => (
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
                >
                  <Download size={14} /> 문서 다운로드
                </Button>
              </div>
            ))
          )}
        </div>
      </main>
      
      <footer className={s.footer}>
        * 문서는 계정별로 안전하게 암호화되어 저장됩니다.
      </footer>

      {/* ✅ 전역 상태 기반 로그인 모달 */}
      {showLoginModal && !showExtraModal && (
          <LoginPromptModal onClose={() => setShowLoginModal(false)} />
      )}
    </div>
  );
}