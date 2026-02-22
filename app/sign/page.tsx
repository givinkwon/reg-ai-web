'use client';

import { useEffect, useMemo, useState } from 'react';
import s from './page.module.css';

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

export default function SignPage() {
  const [token, setToken] = useState('');
  const [manualToken, setManualToken] = useState('');
  
  // ✅ [수정 포인트] URL에서 서명 타입(tbm vs docs)을 읽어와서 저장합니다. 기본값은 'tbm'
  const [signType, setSignType] = useState('tbm');

  const [pass, setPass] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errDetail, setErrDetail] = useState<string | null>(null);
  const [data, setData] = useState<TbmSignData | null>(null);

  // 최초 token 및 type 로드 + URL 변화 감지
  useEffect(() => {
    const sync = () => {
      setToken(readTokenFromLocation());
      // URL에서 type 파라미터 추출
      const sp = new URLSearchParams(window.location.search);
      setSignType(sp.get('type') || 'tbm');
    };

    sync();

    const onPop = () => sync();
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    const notify = () => scheduleMicrotask(sync);

    history.pushState = function (this: History, ...args: Parameters<History['pushState']>): void {
      origPush.apply(this, args);
      notify();
    };

    history.replaceState = function (this: History, ...args: Parameters<History['replaceState']>): void {
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

  // 개발 모드용 가짜 데이터
  const mockData: TbmSignData = useMemo(
    () => ({
      title: signType === 'docs' ? '안전 문서 서명(테스트)' : 'TBM 활동일지 서명(테스트)',
      company: signType === 'docs' ? '안전 보건 자료' : '테스트사업장(DEV)',
      siteName: signType === 'docs' ? '테스트문서.pdf' : '본사 사업장',
      dateISO: '2026-01-11',
      workSummary: signType === 'docs' ? '1. 안전 수칙 확인 요망\n2. 장비 점검 필수' : '고소작업대 이동 및 점검, 현장 자재 운반 작업을 진행함.',
      hazardSummary: signType === 'docs' ? '상단 문서 요약 내용을 숙지하였습니다.' : '추락/협착 위험, 이동 동선 충돌 위험이 있음.',
      complianceSummary: signType === 'docs' ? '해당 문서의 안전 수칙을 준수할 것을 서약합니다.' : '안전모·안전대 착용, 작업 전 점검, 동선 통제 및 신호수 배치.',
      attendeeName: '홍길동',
      alreadySigned: false,
      expiresAt: '',
    }),
    [signType]
  );

  const viewMode = useMemo(() => {
    if (token) return 'REAL_TOKEN';
    if (DEV_UI && unlocked) return 'DEV_UNLOCKED';
    return 'NO_ACCESS';
  }, [token, unlocked]);

  // ✅ [수정 포인트] token과 signType에 따라 알맞은 API를 호출하여 데이터 로드
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);
      setErrDetail(null);
      setData(null);

      try {
        // 타입(docs vs tbm)에 따른 API 엔드포인트 분기
        const apiUrl = signType === 'docs'
          ? `/api/docs-sign/sign/init?token=${encodeURIComponent(token)}`
          : `/api/tbm-sign/get?token=${encodeURIComponent(token)}`;

        const res = await fetch(apiUrl, { cache: 'no-store' });
        const raw = await res.text();

        if (!res.ok) {
          try {
            const j = JSON.parse(raw) as any;
            throw new Error(j?.message || j?.detail ? safeShort(String(j.message || j.detail), 260) : safeShort(raw, 260));
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
  }, [token, signType]); // signType 변경 시에도 재호출되도록 의존성 추가

  const goWithManualToken = () => {
    const t = manualToken.trim();
    if (!t) return;
    // URL에 현재 type 유지
    const typeParam = signType === 'docs' ? `type=docs&` : '';
    const url = `/sign?${typeParam}token=${encodeURIComponent(t)}`;
    window.history.replaceState(null, '', url);
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
          // ✅ 자식 컴포넌트(SignView)에게 signType을 전달하여 화면 라벨과 제출 API 분기를 맡김
          <SignView data={data} token={token} signType={signType} />
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
        <SignView data={mockData} token="DEV-MOCK" signType={signType} isMock />
      </main>
    );
  }

  return (
    <main className={s.wrap}>
      <div className={s.card}>
        <h1 className={s.h1}>{signType === 'docs' ? '안전 문서 서명' : 'TBM 서명'}</h1>
        <div className={s.sub}>
          문자 링크로 접속하면 <span className={s.mono}>/sign?token=...</span> 형태입니다.
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