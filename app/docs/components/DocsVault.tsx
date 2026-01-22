'use client';

import { Download, RefreshCw, Menu, ArrowLeft, FileText } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { useChatStore } from '../../store/chat';
import s from './DocsVault.module.css';

type DocItem = {
  id: string;
  name: string;
  createdAt: number; // epoch ms
  meta?: any;
  kind?: string;
};

function formatDate(ts: number) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

type Props = {
  userEmail: string | null;
  onRequireLogin: () => void;
  onClose: () => void; // ✅ 메인으로 돌아가기 위한 prop 추가
};

export default function DocsVault({ userEmail, onRequireLogin, onClose }: Props) {
  const setSidebarMobileOpen = useChatStore((st) => st.setSidebarMobileOpen);

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  // 자동 로그인 요청 방지 (한 번만 실행)
  const autoLoginRef = useRef(false);
  useEffect(() => {
    if (!userEmail && !autoLoginRef.current) {
      autoLoginRef.current = true;
      onRequireLogin();
    }
  }, [userEmail, onRequireLogin]);

  const fetchAbortRef = useRef<AbortController | null>(null);

  // 언마운트 시 fetch abort
  useEffect(() => {
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, []);

  const fetchDocs = async () => {
    if (!userEmail) return;

    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/docs?endpoint=list', {
        method: 'GET',
        headers: { 'x-user-email': userEmail },
        cache: 'no-store',
        signal: ac.signal,
      });

      if (!res.ok) {
        throw new Error(`목록 조회 실패 (${res.status})`);
      }

      const data = (await res.json()) as { items: DocItem[] };
      const items = Array.isArray(data.items) ? data.items : [];

      setDocs(items);
      setLastFetchedAt(Date.now());
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setError(e?.message ?? '문서 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userEmail) return;
    fetchDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail]);

  const handleDownload = async (doc: DocItem) => {
    if (!userEmail) {
      onRequireLogin();
      return;
    }

    const meta = doc.meta || {};
    const tbmId = (meta?.tbm_id || meta?.tbmId || '').toString().trim();
    const kind = (doc.kind || meta?.kind || '').toString().trim();
    const name = (doc.name || '').toString();

    const qs = new URLSearchParams();
    qs.set('endpoint', 'download');
    qs.set('id', doc.id);
    if (kind) qs.set('kind', kind);
    if (tbmId) qs.set('tbmId', tbmId);
    if (name) qs.set('name', name);

    try {
      const res = await fetch(`/api/docs?${qs.toString()}`, {
        method: 'GET',
        headers: { 'x-user-email': userEmail },
        cache: 'no-store',
      });

      if (!res.ok) throw new Error('다운로드 실패');

      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') ?? '';
      const utf8 = cd.match(/filename\*=UTF-8''(.+)$/i);
      const plain = cd.match(/filename="?([^";]+)"?/i);
      const filename = utf8 ? decodeURIComponent(utf8[1]) : plain ? plain[1] : doc.name;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('파일을 다운로드하는 중 오류가 발생했습니다.');
    }
  };

  const countText = useMemo(() => {
    if (loading) return '로딩 중...';
    return `총 ${docs.length}건`;
  }, [docs.length, loading]);

  // === 렌더링 ===

  // 1. 비로그인 상태
  if (!userEmail) {
    return (
      <section className={s.wrap}>
        <div className={s.shell}>
          <header className={s.header}>
            <div className={s.headerLeft}>
              <button onClick={onClose} className={s.iconBtn} aria-label="뒤로가기">
                <ArrowLeft size={20} />
              </button>
              <h2 className={s.title}>문서함</h2>
            </div>
          </header>
          <div className={s.emptyStateCard}>
            <div className={s.loginMsg}>
              <h3>로그인이 필요합니다</h3>
              <p>문서함 기능을 이용하려면 로그인이 필요합니다.</p>
              <Button onClick={onRequireLogin} className="mt-4">
                로그인하기
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // 2. 로그인 상태
  return (
    <section className={s.wrap}>
      <div className={s.shell}>
        {/* 헤더 영역 */}
        <header className={s.header}>
          <div className={s.headerLeft}>
            {/* 뒤로가기 버튼 */}
            <button onClick={onClose} className={s.iconBtn} title="메인으로">
              <ArrowLeft size={20} />
            </button>
            
            {/* (모바일용) 사이드바 토글 */}
            <button
              className={`${s.iconBtn} ${s.mobileMenuBtn}`}
              onClick={() => setSidebarMobileOpen(true)}
              title="메뉴 열기"
            >
              <Menu size={20} />
            </button>

            <div className={s.titleGroup}>
              <h2 className={s.title}>안전보건 도구함</h2>
              <span className={s.badge}>{countText}</span>
            </div>
          </div>

          <div className={s.headerRight}>
            <Button
              variant="ghost"
              size="sm"
              className={s.refreshBtn}
              onClick={fetchDocs}
              disabled={loading}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              <span className={s.btnLabel}>새로고침</span>
            </Button>
          </div>
        </header>

        {/* 메인 컨텐츠 (카드) */}
        <div className={s.card}>
          {error && <div className={s.errorBox}>{error}</div>}

          <div className={s.cardBody}>
            {/* === PC 뷰 (테이블) === */}
            <div className={s.desktopView}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thName}>문서명</th>
                    <th className={s.thDate}>작성일</th>
                    <th className={s.thAction}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={3} className="p-4">
                          <div className={s.skeletonBar} />
                        </td>
                      </tr>
                    ))
                  ) : docs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className={s.emptyCell}>
                        저장된 문서를 찾을 수 없습니다.
                      </td>
                    </tr>
                  ) : (
                    docs.map((d) => (
                      <tr key={d.id} className={s.row}>
                        <td className={s.tdName}>
                          <div className={s.fileName}>
                            <FileText size={18} className={s.fileIcon} />
                            <span>{d.name}</span>
                          </div>
                        </td>
                        <td className={s.tdDate}>{formatDate(d.createdAt)}</td>
                        <td className={s.tdAction}>
                          <Button
                            variant="outline"
                            size="sm"
                            className={s.downloadBtn}
                            onClick={() => handleDownload(d)}
                          >
                            <Download size={14} className="mr-2" />
                            다운로드
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* === 모바일 뷰 (리스트) === */}
            <div className={s.mobileView}>
              {loading ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className={s.skeletonBox} />
                  ))}
                </div>
              ) : docs.length === 0 ? (
                <div className={s.emptyCell}>저장된 문서를 찾을 수 없습니다.</div>
              ) : (
                <div className={s.listContainer}>
                  {docs.map((d) => (
                    <div key={d.id} className={s.listItem}>
                      <div className={s.listContent}>
                        <div className={s.listTitle}>
                          <FileText size={16} className={s.fileIcon} />
                          <span>{d.name}</span>
                        </div>
                        <div className={s.listDate}>{formatDate(d.createdAt)}</div>
                      </div>
                      <Button
                        variant="ghost"
                        className={s.mobileDlBtn}
                        onClick={() => handleDownload(d)}
                      >
                        <Download size={18} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        <p className={s.footerNote}>
          * 문서는 안전하게 암호화되어 저장되며 본인만 확인할 수 있습니다.
        </p>
      </div>
    </section>
  );
}