'use client';

import { Download, RefreshCw, FileText } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import s from './DocsVault.module.css';

type DocItem = {
  id: string;
  name: string;
  createdAt: number; // epoch ms
  size?: number;     // bytes
  kind?: string;     // 'tbm' | 'riskassessment' | ...
};

function formatDate(ts: number) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatBytes(n?: number) {
  if (!n || n <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

type Props = {
  userEmail: string | null;
  onRequireLogin: () => void;
};

export default function DocsVault({ userEmail, onRequireLogin }: Props) {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ 문서함 진입 시 로그인 안 되어 있으면 로그인 모달 자동 오픈(한 번만)
  const autoLoginRef = useRef(false);
  useEffect(() => {
    if (!userEmail && !autoLoginRef.current) {
      autoLoginRef.current = true;
      onRequireLogin();
    }
  }, [userEmail, onRequireLogin]);

  const fetchDocs = async () => {
    if (!userEmail) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/docs?endpoint=list', {
        method: 'GET',
        headers: {
          'x-user-email': userEmail, // ✅ 간단 식별(나중에 세션/JWT로 대체 권장)
        },
        cache: 'no-store',
      });

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`목록 조회 실패 (${res.status}) ${t.slice(0, 200)}`);
      }

      const data = (await res.json()) as { items: DocItem[] };
      setDocs(Array.isArray(data.items) ? data.items : []);
    } catch (e: any) {
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

    const res = await fetch(`/api/docs?endpoint=download&id=${encodeURIComponent(doc.id)}`, {
      method: 'GET',
      headers: { 'x-user-email': userEmail },
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      alert(`다운로드 실패 (${res.status}) ${t.slice(0, 200)}`);
      return;
    }

    const blob = await res.blob();

    // filename은 서버의 content-disposition 우선
    const cd = res.headers.get('content-disposition') ?? '';
    const match = cd.match(/filename\*\=UTF-8''(.+)$/);
    const filename = match ? decodeURIComponent(match[1]) : doc.name;

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  // ✅ 로그인 안 되어 있으면 안내 화면(버튼은 유지)
  if (!userEmail) {
    return (
      <section className={s.wrap}>
        <div className={s.shell}>
          <header className={s.header}>
            <div className={s.headerLeft}>
              <h2 className={s.title}>문서함</h2>
              <p className={s.desc}>내 문서함을 보려면 로그인이 필요합니다.</p>
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

  const countText = useMemo(() => {
    if (loading) return '불러오는 중…';
    return `총 ${docs.length}개`;
  }, [docs.length, loading]);

  return (
    <section className={s.wrap}>
      <div className={s.shell}>
        <header className={s.header}>
          <div className={s.headerLeft}>
            <h2 className={s.title}>문서함</h2>
            <p className={s.desc}>생성된 문서를 확인하고 다운로드할 수 있습니다.</p>
          </div>

          <div className={s.headerRight}>
            <div className={s.badge}>
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

          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.thName}>문서명</th>
                  <th className={s.thDate}>작성일</th>
                  <th className={s.thMeta}>크기</th>
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
                      <td className={s.tdMeta}>
                        <div className={s.skeletonPill} />
                      </td>
                      <td className={s.tdDl}>
                        <div className={s.skeletonBtn} />
                      </td>
                    </tr>
                  ))
                ) : docs.length === 0 ? (
                  <tr>
                    <td className={s.empty} colSpan={4}>
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
                          {d.kind ? (
                            <span className={s.kindPill}>
                              <FileText size={14} />
                              {d.kind}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className={s.tdDate}>
                        <span className={s.datePill}>{formatDate(d.createdAt)}</span>
                      </td>

                      <td className={s.tdMeta}>
                        <span className={s.metaPill}>{formatBytes(d.size)}</span>
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

        <div className={s.footNote}>
          * 문서는 사용자 계정별로 저장되며, 동일 계정으로 다른 기기에서도 확인할 수 있습니다.
        </div>
      </div>
    </section>
  );
}
