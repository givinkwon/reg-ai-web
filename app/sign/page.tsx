'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import s from './page.module.css';

type TbmSignData = {
  title: string;
  company: string;
  dateISO: string;
  workSummary: string;
  hazardSummary: string;
  complianceSummary: string;
  attendeeName?: string;
  attendeePhone?: string;
};

// const DEV_UI = process.env.NEXT_PUBLIC_TBM_SIGN_DEV === '1';
// const DEV_PASSPHRASE =
  // process.env.NEXT_PUBLIC_TBM_SIGN_TEST_PASSPHRASE || 'dev-open'; // 개발용 기본값
const DEV_UI = 1
const DEV_PASSPHRASE = 'dev-open'

function formatPhone(raw?: string) {
  const v = (raw || '').replace(/\D/g, '');
  if (v.length === 11) return `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7)}`;
  if (v.length === 10) return `${v.slice(0, 3)}-${v.slice(3, 6)}-${v.slice(6)}`;
  return raw || '';
}

/** 간단 서명패드 */
function SignaturePad({
  onChangeDataUrl,
}: {
  onChangeDataUrl?: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // DPR 스케일 + 리사이즈
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const resize = () => {
      const parent = c.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;

      const cssW = parent.clientWidth;
      const cssH = 220;

      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;

      c.width = Math.floor(cssW * dpr);
      c.height = Math.floor(cssH * dpr);

      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#111';

      // 리사이즈 시 잉크 유지하려면 이미지 백업/복원이 필요하지만
      // 테스트/서명용에서는 보통 리사이즈를 막거나 clear 후 다시 서명하도록 둠.
      clear();
    };

    const clear = () => {
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      setHasInk(false);
      onChangeDataUrl?.(null);
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPoint = (e: PointerEvent) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const exportDataUrl = () => {
    const c = canvasRef.current;
    if (!c) return null;
    try {
      return c.toDataURL('image/png');
    } catch {
      return null;
    }
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChangeDataUrl?.(null);
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;

    const onDown = (e: PointerEvent) => {
      drawingRef.current = true;
      lastRef.current = getPoint(e);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    };

    const onMove = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;

      const p = getPoint(e);
      const last = lastRef.current;
      if (!last) {
        lastRef.current = p;
        return;
      }

      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();

      lastRef.current = p;

      if (!hasInk) setHasInk(true);
    };

    const onUp = () => {
      drawingRef.current = false;
      lastRef.current = null;
      const url = exportDataUrl();
      onChangeDataUrl?.(url);
    };

    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('pointerleave', onUp);

    return () => {
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp);
      c.removeEventListener('pointercancel', onUp);
      c.removeEventListener('pointerleave', onUp);
    };
  }, [hasInk, onChangeDataUrl]);

  return (
    <div className={s.signBox}>
      <div className={s.signTop}>
        <div className={s.signHint}>아래 영역에 서명하세요</div>
        <button className={s.btnGhost} type="button" onClick={clear}>
          지우기
        </button>
      </div>
      <div className={s.canvasWrap}>
        <canvas ref={canvasRef} className={s.canvas} />
      </div>
      <div className={s.signMeta}>
        {hasInk ? '서명이 입력되었습니다.' : '아직 서명이 없습니다.'}
      </div>
    </div>
  );
}

function SignView({
  data,
  token,
  isMock,
}: {
  data: TbmSignData;
  token?: string;
  isMock?: boolean;
}) {
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  async function submit() {
    setSubmitMsg(null);

    if (!sigUrl) {
      setSubmitMsg('서명을 먼저 입력해 주세요.');
      return;
    }

    // ✅ Mock 모드면 서버 없이도 “동작” 확인 가능
    if (isMock) {
      setSubmitMsg('✅ (MOCK) 서명 제출 성공처럼 처리했습니다. (실제 저장은 안 함)');
      return;
    }

    // ✅ 실제 제출 (서버 구현되어 있으면)
    setSubmitLoading(true);
    try {
      const res = await fetch('/api/tbm-sign/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signaturePngDataUrl: sigUrl,
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      setSubmitMsg('✅ 서명이 제출되었습니다.');
    } catch (e: any) {
      setSubmitMsg(`❌ 제출 실패: ${e?.message || 'unknown error'}`);
    } finally {
      setSubmitLoading(false);
    }
  }

  return (
    <div className={s.card}>
      <div className={s.headerRow}>
        <div>
          <h1 className={s.h1}>{data.title || 'TBM 서명'}</h1>
          <div className={s.sub}>
            <span className={s.badge}>{data.company}</span>
            <span className={s.dot} />
            <span>{data.dateISO}</span>
            {token ? (
              <>
                <span className={s.dot} />
                <span className={s.mono}>token: {token}</span>
              </>
            ) : null}
            {isMock ? (
              <>
                <span className={s.dot} />
                <span className={s.badge2}>MOCK</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className={s.grid}>
        <div className={s.block}>
          <div className={s.blockTitle}>금일 작업</div>
          <div className={s.blockBody}>{data.workSummary}</div>
        </div>
        <div className={s.block}>
          <div className={s.blockTitle}>주요 위험요인</div>
          <div className={s.blockBody}>{data.hazardSummary}</div>
        </div>
        <div className={s.block}>
          <div className={s.blockTitle}>안전 준수사항</div>
          <div className={s.blockBody}>{data.complianceSummary}</div>
        </div>
      </div>

      <div className={s.infoRow}>
        <div className={s.infoItem}>
          <div className={s.infoKey}>서명자</div>
          <div className={s.infoVal}>{data.attendeeName || '—'}</div>
        </div>
        <div className={s.infoItem}>
          <div className={s.infoKey}>연락처</div>
          <div className={s.infoVal}>{formatPhone(data.attendeePhone) || '—'}</div>
        </div>
      </div>

      <SignaturePad onChangeDataUrl={setSigUrl} />

      {sigUrl ? (
        <div className={s.preview}>
          <div className={s.previewTitle}>미리보기</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={s.previewImg} src={sigUrl} alt="signature preview" />
        </div>
      ) : null}

      <div className={s.footer}>
        <button className={s.btn} type="button" onClick={submit} disabled={submitLoading}>
          {submitLoading ? '제출 중...' : '서명 제출'}
        </button>
        {submitMsg ? <div className={s.msg}>{submitMsg}</div> : null}
      </div>
    </div>
  );
}

export default function TbmSignPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = (sp.get('token') || '').trim();

  // DEV 테스트 해금
  const [pass, setPass] = useState('');
  const [unlocked, setUnlocked] = useState(false);

  // 토큰 수동 입력 (테스트 편의)
  const [manualToken, setManualToken] = useState('');

  // 실제 데이터 로딩(토큰 있을 때)
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<TbmSignData | null>(null);

  const mockData: TbmSignData = useMemo(
    () => ({
      title: 'TBM 활동일지 서명(테스트)',
      company: '테스트사업장(DEV)',
      dateISO: '2026-01-11',
      workSummary: '고소작업대 이동 및 점검, 현장 자재 운반 작업을 진행함.',
      hazardSummary: '추락/협착 위험, 이동 동선 충돌 위험이 있음.',
      complianceSummary: '안전모·안전대 착용, 작업 전 점검, 동선 통제 및 신호수 배치.',
      attendeeName: '홍길동',
      attendeePhone: '01012345678',
    }),
    []
  );

  const viewMode = useMemo(() => {
    if (token) return 'REAL_TOKEN';
    if (DEV_UI && unlocked) return 'DEV_UNLOCKED';
    return 'NO_ACCESS';
  }, [token, unlocked]);

  useEffect(() => {
    // 토큰이 있을 때만 실제 데이터 조회
    if (!token) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr(null);
      setData(null);
      try {
        // ✅ 너 서버에 맞게 구현된 API로 바꿔도 됨
        // 예: /api/tbm-sign/get?token=...
        const res = await fetch(`/api/tbm-sign/get?token=${encodeURIComponent(token)}`);
        const text = await res.text();
        if (!res.ok) throw new Error(text);
        const json = JSON.parse(text) as TbmSignData;

        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'failed');
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
    router.replace(`/tbm/sign?token=${encodeURIComponent(t)}`);
  };

  const unlock = () => {
    if (pass.trim() === DEV_PASSPHRASE) {
      setUnlocked(true);
      setErr(null);
    } else {
      setErr('테스트 키가 올바르지 않습니다.');
    }
  };

  // ✅ 1) 토큰 기반 실제 화면
  if (viewMode === 'REAL_TOKEN') {
    return (
      <main className={s.wrap}>
        {loading ? (
          <div className={s.card}>
            <h1 className={s.h1}>불러오는 중…</h1>
            <div className={s.sub}>token: <span className={s.mono}>{token}</span></div>
          </div>
        ) : err ? (
          <div className={s.card}>
            <h1 className={s.h1}>오류</h1>
            <div className={s.err}>{err}</div>
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
          <main className={s.wrap}>
            <SignView data={data} token={token} />
          </main>
        ) : (
          <div className={s.card}>
            <h1 className={s.h1}>데이터가 없습니다.</h1>
          </div>
        )}
      </main>
    );
  }

  // ✅ 2) DEV 패스프레이즈로 “실제 화면” (MOCK 데이터로)
  if (viewMode === 'DEV_UNLOCKED') {
    return (
      <main className={s.wrap}>
        <SignView data={mockData} isMock />
      </main>
    );
  }

  // ✅ 3) 토큰 없을 때: 테스트 패널 포함
  return (
    <main className={s.wrap}>
      <div className={s.card}>
        <h1 className={s.h1}>TBM 서명</h1>
        <div className={s.sub}>
          보통 문자 링크로 접속하면 <span className={s.mono}>/tbm/sign?token=...</span> 형태입니다.
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
              특정 키를 입력하면(예: <span className={s.mono}>dev-open</span>) 토큰 없이도 “실제 서명 UI”를
              MOCK 데이터로 확인할 수 있어요.
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
        ) : (
          <div className={s.notice}>
            운영 환경에서는 토큰 없이 서명 화면을 열 수 없도록 막는 것을 권장합니다.
          </div>
        )}

        {err ? <div className={s.err}>❌ {err}</div> : null}
      </div>
    </main>
  );
}
