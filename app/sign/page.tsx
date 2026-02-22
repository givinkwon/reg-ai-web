'use client';

import { useEffect, useMemo, useState } from 'react';
import s from './page.module.css'; // 필요 시 본인의 CSS 경로로 맞춰주세요.

import SignView from './components/SignView';
import type { TbmSignData } from './components/types';
import {
  readTokenFromLocation,
  scheduleMicrotask,
  setTokenToUrl,
  safeShort,
} from './components/utils';

const DEV_UI = true;
const DEV_PASSPHRASE = 'dev-open';

export default function DocsSignPage() {
  const [token, setToken] = useState('');
  const [manualToken, setManualToken] = useState('');

  const [pass, setPass] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errDetail, setErrDetail] = useState<string | null>(null);
  const [data, setData] = useState<TbmSignData | null>(null);

  // 최초 token 로드 + URL 변화 감지(popstate + history 후킹)
  useEffect(() => {
    const sync = () => setToken(readTokenFromLocation());

    sync();

    const onPop = () => sync();

    const origPush = history.pushState;
    const origReplace = history.replaceState;

    const notify = () => scheduleMicrotask(sync);

    history.pushState = function (
      this: History,
      ...args: Parameters<History['pushState']>
    ): void {
      origPush.apply(this, args);
      notify();
    };

    history.replaceState = function (
      this: History,
      ...args: Parameters<History['replaceState']>
    ): void {
      origReplace.apply(this, args);
      notify();
    };

    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  }, []);

  // DEV 모드 테스트용 가짜 데이터 (문서 서명용 텍스트로 변경)
  const mockData: TbmSignData = useMemo(
    () => ({
      title: '안전 문서 서명(테스트)',
      company: '안전 보건 자료',
      siteName: '테스트문서.pdf',
      dateISO: '2026-01-11',
      workSummary: '1. 안전모 등 개인보호구를 반드시 착용할 것\n2. 작업 전 안전점검을 실시할 것',
      hazardSummary: '상단 문서 요약 내용을 숙지하였습니다.',
      complianceSummary: '해당 문서의 안전 수칙을 준수할 것을 서약합니다.',
      attendeeName: '홍길동',
      alreadySigned: false,
      expiresAt: '',
    }),
    []
  );

  const viewMode = useMemo(() => {
    if (token) return 'REAL_TOKEN';
    if (DEV_UI && unlocked) return 'DEV_UNLOCKED';
    return 'NO_ACCESS';
  }, [token, unlocked]);

  // ✅ [수정 포인트] token이 있으면 데이터를 로드하는 로직 (TBM API -> Docs-Sign API 변경)
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);
      setErrDetail(null);
      setData(null);

      try {
        // 기존 TBM API가 아닌 문서 서명(Docs-Sign) 프록시 API 호출
        const res = await fetch(`/api/docs-sign/sign/init?token=${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });

        const raw = await res.text();

        if (!res.ok) {
          try {
            const j = JSON.parse(raw) as any;
            throw new Error(j?.detail ? safeShort(String(j.detail), 260) : safeShort(raw, 260));
          } catch {
            throw new Error(safeShort(raw, 260));
          }
        }

        const json = JSON.parse(raw) as TbmSignData;
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message || 'failed');
          setErrDetail(String(e?.message || 'failed'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const goWithManualToken = () => {
    const t = manualToken.trim();
    if (!t) return;
    setTokenToUrl(t);
    setToken(t);
  };

  const unlock = () => {
    if (pass.trim() === DEV_PASSPHRASE) {
      setUnlocked(true);
      setErr(null);
      setErrDetail(null);
    } else {
      setErr('테스트 키가 올바르지 않습니다.');
    }
  };

  if (viewMode === 'REAL_TOKEN') {
    return (
      <main className={s.wrap}>
        {loading ? (
          <div className={s.card}>
            <h1 className={s.h1}>불러오는 중…</h1>
            <div className={s.sub}>
              token: <span className={s.mono}>{token}</span>
            </div>
          </div>
        ) : err ? (
          <div className={s.card}>
            <h1 className={s.h1}>오류</h1>
            <div className={s.err}>{err}</div>

            {errDetail ? (
              <details className={s.details}>
                <summary>자세히 보기</summary>
                <pre className={s.pre}>{errDetail.slice(0, 4000)}</pre>
              </details>
            ) : null}

            <div className={s.hr} />
            <div className={s.row}>
              <input
                className={s.input}
                placeholder="다른 토큰으로 테스트"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
              />
              <button className={s.btn} type="button" onClick={goWithManualToken}>
                이동
              </button>
            </div>
          </div>
        ) : data ? (
          <SignView data={data} token={token} />
        ) : (
          <div className={s.card}>
            <h1 className={s.h1}>데이터가 없습니다.</h1>
          </div>
        )}
      </main>
    );
  }

  if (viewMode === 'DEV_UNLOCKED') {
    return (
      <main className={s.wrap}>
        <SignView data={mockData} token="DEV-MOCK" isMock />
      </main>
    );
  }

  return (
    <main className={s.wrap}>
      <div className={s.card}>
        {/* ✅ [수정] 텍스트 변경 */}
        <h1 className={s.h1}>안전 문서 서명</h1>
        <div className={s.sub}>
          문자 링크로 접속하면 <span className={s.mono}>/sign-doc?token=...</span> 형태입니다.
        </div>

        <div className={s.section}>
          <div className={s.sectionTitle}>토큰으로 접속(테스트)</div>
          <div className={s.row}>
            <input
              className={s.input}
              placeholder="token 입력"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
            />
            <button className={s.btn} type="button" onClick={goWithManualToken}>
              이동
            </button>
          </div>
        </div>

        {DEV_UI ? (
          <div className={s.section}>
            <div className={s.sectionTitle}>DEV 테스트 화면 해금</div>
            <div className={s.sub2}>
              키(예: <span className={s.mono}>dev-open</span>)를 입력하면 토큰 없이도 MOCK 화면을 볼 수 있어요.
            </div>

            <div className={s.row}>
              <input
                className={s.input}
                placeholder="테스트 키 입력"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
              <button className={s.btnGhost} type="button" onClick={unlock}>
                해금
              </button>
            </div>
          </div>
        ) : null}

        {err ? <div className={s.err}>❌ {err}</div> : null}
      </div>
    </main>
  );
}