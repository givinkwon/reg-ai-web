'use client';

import { Download, RefreshCw, Menu } from 'lucide-react';
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
};

export default function DocsVault({ userEmail, onRequireLogin }: Props) {
  // ✅ ChatArea와 동일: 모바일 사이드바 열기
  const setSidebarMobileOpen = useChatStore((st) => st.setSidebarMobileOpen);

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const autoLoginRef = useRef(false);
  useEffect(() => {
    if (!userEmail && !autoLoginRef.current) {
      autoLoginRef.current = true;
      onRequireLogin();
    }
  }, [userEmail, onRequireLogin]);

  const fetchAbortRef = useRef<AbortController | null>(null);

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
        const t = await res.text().catch(() => '');
        throw new Error(`목록 조회 실패 (${res.status}) ${t.slice(0, 200)}`);
      }

      const data = (await res.json()) as { items: DocItem[] };
      const items = Array.isArray(data.items) ? data.items : [];

      setDocs(items);
      setLastFetchedAt(Date.now());
      console.log('[DocsVault] fetched items:', items.length);
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
    const tbmId = (meta?.tbm_id || meta?.tbmId || meta?.tbmID || '').toString().trim();
    const kind = (doc.kind || meta?.kind || '').toString().trim();
    const name = (doc.name || '').toString();

    const qs = new URLSearchParams();
    qs.set('endpoint', 'download');
    qs.set('id', doc.id);
    if (kind) qs.set('kind', kind);
    if (tbmId) qs.set('tbmId', tbmId);
    if (name) qs.set('name', name);

    const res = await fetch(`/api/docs?${qs.toString()}`, {
      method: 'GET',
      headers: { 'x-user-email': userEmail },
      cache: 'no-store',
    });

    console.log('download mode:', res.headers.get('x-doc-download-mode'));
    console.log('debug rid:', res.headers.get('x-debug-rid'));
    console.log('debug kind:', res.headers.get('x-doc-debug-kind'));
    console.log('debug tbmId:', res.headers.get('x-doc-debug-tbmId'));

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      alert(`다운로드 실패 (${res.status}) ${t.slice(0, 200)}`);
      return;
    }

    const blob = await res.blob();

    const cd = res.headers.get('content-disposition') ?? '';
    const utf8 = cd.match(/filename\*\=UTF-8''(.+)$/i);
    const plain = cd.match(/filename=\"?([^\";]+)\"?/i);
    const filename = utf8 ? decodeURIComponent(utf8[1]) : plain ? plain[1] : doc.name;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const countText = useMemo(() => {
    if (loading) return '불러오는 중…';
    return `총 ${docs.length}개`;
  }, [docs.length, loading]);

  const lastFetchedLabel = useMemo(() => {
    if (!lastFetchedAt) return '';
    const d = new Date(lastFetchedAt);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm} 업데이트`;
  }, [lastFetchedAt]);

  // ✅ 로그인 안 된 상태
  if (!userEmail) {
    return (
      <section className={s.wrap}>
        <div className={s.shell}>
          <header className={s.header}>
            <div className={s.headerLeft}>
              {/* ✅ 모바일에서만 보이는 햄버거 */}
              <button
                type="button"
                className={s.menuBtn}
                onClick={() => setSidebarMobileOpen(true)}
                aria-label="사이드바 열기"
                title="메뉴"
              >
                <Menu className={s.menuIcon} />
              </button>

              <div className={s.headerTitles}>
                <h2 className={s.title}>문서함</h2>
                <p className={s.desc}>내 문서함을 보려면 로그인이 필요합니다.</p>
              </div>
            </div>
          </header>

          <div className={s.card}>
            <div className={s.loginBox}>
              <div className={s.loginTitle}>로그인이 필요합니다</div>
              <div className={s.loginDesc}>
                문서 생성/다운로드 이력은 계정에 저장됩니다. 로그인 후 이용해 주세요.
              </div>
              <div className={s.loginActions}>
                <Button onClick={onRequireLogin}>로그인하기</Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ✅ 로그인 된 상태
  return (
    <section className={s.wrap}>
      <div className={s.shell}>
        <header className={s.header}>
          <div className={s.headerLeft}>
            {/* ✅ 모바일에서만 보이는 햄버거 */}
            <button
              type="button"
              className={s.menuBtn}
              onClick={() => setSidebarMobileOpen(true)}
              aria-label="사이드바 열기"
              title="메뉴"
            >
              <Menu className={s.menuIcon} />
            </button>

            <div className={s.headerTitles}>
              <h2 className={s.title}>문서함</h2>
              <p className={s.desc}>생성된 문서를 확인하고 다운로드할 수 있습니다.</p>
            </div>
          </div>

          <div className={s.headerRight}>
            <div className={s.badge} title={lastFetchedLabel}>
              <span className={s.badgeDot} />
              <span className={s.badgeText}>{countText}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className={s.refreshBtn}
              onClick={fetchDocs}
              disabled={loading}
              title="새로고침"
            >
              <RefreshCw size={16} />
              <span>새로고침</span>
            </Button>
          </div>
        </header>

        <div className={s.card}>
          {error && <div className={s.errorBox}>{error}</div>}

          {/* ✅ Desktop: table */}
          <div className={s.desktopOnly}>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th className={s.thName}>문서명</th>
                    <th className={s.thDate}>작성일</th>
                    <th className={s.thDl}>다운로드</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className={s.row}>
                        <td className={s.tdName}>
                          <div className={s.skeletonLine} />
                        </td>
                        <td className={s.tdDate}>
                          <div className={s.skeletonPill} />
                        </td>
                        <td className={s.tdDl}>
                          <div className={s.skeletonBtn} />
                        </td>
                      </tr>
                    ))
                  ) : docs.length === 0 ? (
                    <tr>
                      <td className={s.empty} colSpan={3}>
                        아직 생성된 문서가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    docs.map((d) => (
                      <tr key={d.id} className={s.row}>
                        <td className={s.tdName}>
                          <div className={s.docName}>
                            <span className={s.docIcon} aria-hidden />
                            <span className={s.docText} title={d.name}>
                              {d.name}
                            </span>
                          </div>
                        </td>

                        <td className={s.tdDate}>
                          <span className={s.datePill}>{formatDate(d.createdAt)}</span>
                        </td>

                        <td className={s.tdDl}>
                          <Button
                            variant="outline"
                            size="sm"
                            className={s.dlBtn}
                            onClick={() => handleDownload(d)}
                          >
                            <Download size={16} />
                            <span className={s.dlText}>다운로드</span>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ✅ Mobile: list */}
          <div className={s.mobileOnly}>
            <div className={s.mobileList}>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className={s.mobileRow}>
                    <div className={s.mobileLeft}>
                      <div className={s.skeletonLine} />
                      <div className={s.skeletonPill} />
                    </div>
                    <div className={s.skeletonBtn} />
                  </div>
                ))
              ) : docs.length === 0 ? (
                <div className={s.empty}>아직 생성된 문서가 없습니다.</div>
              ) : (
                docs.map((d) => (
                  <div key={d.id} className={s.mobileRow}>
                    <div className={s.mobileLeft}>
                      <div className={s.docName}>
                        <span className={s.docIcon} aria-hidden />
                        <span className={s.docText} title={d.name}>
                          {d.name}
                        </span>
                      </div>

                      <div className={s.mobileMeta}>
                        <span className={s.datePill}>{formatDate(d.createdAt)}</span>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      className={s.dlBtn}
                      onClick={() => handleDownload(d)}
                      aria-label="다운로드"
                      title="다운로드"
                    >
                      <Download size={16} />
                      <span className={s.dlText}>다운로드</span>
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className={s.footNote}>
          * 문서는 사용자 계정별로 저장되며, 동일 계정으로 다른 기기에서도 확인할 수 있습니다.
        </div>
      </div>
    </section>
  );
}
