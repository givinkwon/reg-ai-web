'use client';

import { Download } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '../../components/ui/button';
import s from './DocsVault.module.css';

type DocItem = {
  id: string;
  name: string;
  createdAt: number; // epoch ms
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
  // ✅ 로그인 안 되어 있으면 안내 화면
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

  // ✅ 임시 더미 데이터 (나중에 API로 교체)
  const docs = useMemo<DocItem[]>(
    () => [
      {
        id: 'doc_1',
        name: '위험성평가_2026-01-08.xlsx',
        createdAt: Date.now() - 1000 * 60 * 60 * 2,
      },
      {
        id: 'doc_2',
        name: '안전보건관리규정_초안.docx',
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 3,
      },
      {
        id: 'doc_3',
        name: 'TBM_일지_양식.pdf',
        createdAt: Date.now() - 1000 * 60 * 60 * 24 * 10,
      },
    ],
    [],
  );

  // ✅ 임시 다운로드: 실제 파일 대신 텍스트를 파일로 내려받게 해둠
  const handleDownload = (doc: DocItem) => {
    const content = `임시 다운로드 파일입니다.\n\n문서명: ${doc.name}\n생성일: ${formatDate(
      doc.createdAt,
    )}\nID: ${doc.id}\n\n(추후 API 연결 시 실제 파일로 대체)`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name.replace(/\.(xlsx|docx|pdf)$/i, '.txt');
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  };

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
              <span className={s.badgeText}>총 {docs.length}개</span>
            </div>
          </div>
        </header>

        <div className={s.card}>
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
                {docs.length === 0 ? (
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

        <div className={s.footNote}>
          * 현재는 더미 데이터입니다. API 연결 시 실제 문서 파일로 다운로드됩니다.
        </div>
      </div>
    </section>
  );
}