'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import s from '../page.module.css';

import type { TbmSignData } from './types';
import { safeShort } from './utils';
import CenteredAlertModal from './CenteredAlertModal';
import SignaturePad from './SignaturePad';

export default function SignView({
  data,
  token,
  signType, // ✅ [추가] 부모로부터 현재 문서의 타입('tbm' 또는 'docs')을 전달받습니다.
  isMock,
}: {
  data: TbmSignData;
  token: string;
  signType: string;
  isMock?: boolean;
}) {
  const router = useRouter();

  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  const [successOpen, setSuccessOpen] = useState(false);

  const locked = !!data.alreadySigned;

  const closeScreenOrFallback = () => {
    setSuccessOpen(false);

    // 1) window.close 시도 (스크립트로 열린 창이 아니면 막힐 수 있음)
    try {
      window.close();
    } catch {}

    // 2) 폴백: history back → 안 되면 홈
    setTimeout(() => {
      try {
        if (window.history.length > 1) {
          window.history.back();
          return;
        }
      } catch {}

      try {
        router.replace('/');
      } catch {
        window.location.replace('/');
      }
    }, 250);
  };

  // 팝업 오픈 후 자동 종료 시도(가능한 브라우저에서만 닫힘)
  useEffect(() => {
    if (!successOpen) return;
    const t = window.setTimeout(() => {
      closeScreenOrFallback();
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successOpen]);

  async function submit() {
    setSubmitMsg(null);
    setDetailErr(null);

    if (locked) {
      setSubmitMsg('이미 서명 완료된 건입니다.');
      return;
    }
    if (!sigUrl) {
      setSubmitMsg('서명을 먼저 입력해 주세요.');
      return;
    }

    setSubmitLoading(true);
    try {
      if (isMock) {
        setSubmitMsg('✅ (MOCK) 서명 제출 성공처럼 처리했습니다. (실제 저장은 안 함)');
        setSuccessOpen(true);
        return;
      }

      // ✅ [핵심 분기 처리] 서명 타입에 따라 호출할 백엔드 API URL 설정
      const submitApiUrl = signType === 'docs' 
        ? '/api/docs-sign/sign/submit' 
        : '/api/tbm-sign/submit';

      // 두 API 모두 같은 payload 구조를 사용하도록 설계됨
      const res = await fetch(submitApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signaturePngDataUrl: sigUrl,
          attendeeName: data.attendeeName || undefined,
        }),
      });

      const raw = await res.text();

      if (!res.ok) {
        try {
          const j = JSON.parse(raw) as any;
          const msg = j?.detail ? safeShort(String(j.detail), 260) : safeShort(raw, 260);
          setSubmitMsg(`❌ 제출 실패: ${msg}`);
          setDetailErr(String(j?.detail || raw));
        } catch {
          setSubmitMsg(`❌ 제출 실패: ${safeShort(raw, 260)}`);
          setDetailErr(raw);
        }
        return;
      }

      setSubmitMsg('✅ 서명이 제출되었습니다.');
      setSuccessOpen(true);
    } catch (e: any) {
      setSubmitMsg(`❌ 제출 실패: ${e?.message || 'unknown error'}`);
      setDetailErr(String(e?.message || 'unknown'));
    } finally {
      setSubmitLoading(false);
    }
  }

  // ✅ 편의성을 위해 분기 변수 할당
  const isDocs = signType === 'docs';

  return (
    <>
      <CenteredAlertModal
        open={successOpen}
        title="서명 제출 완료"
        message="서명이 제출되었습니다."
        confirmText="확인(닫기)"
        onConfirm={closeScreenOrFallback}
      />

      <div className={s.card}>
        <div className={s.headerRow}>
          <div>
            {/* ✅ [수정] 헤더 타이틀 문구 동적 변경 */}
            <h1 className={s.h1}>{data.title || (isDocs ? '안전 문서 서명' : 'TBM 서명')}</h1>
            <div className={s.sub}>
              <span className={s.badge}>{data.company || '—'}</span>
              {data.siteName ? (
                <>
                  <span className={s.dot} />
                  <span className={s.badge2}>{data.siteName}</span>
                </>
              ) : null}
              <span className={s.dot} />
              <span>{data.dateISO}</span>

              {locked ? (
                <>
                  <span className={s.dot} />
                  <span className={s.badge2}>이미 서명됨</span>
                </>
              ) : null}

              {token ? (
                <>
                  <span className={s.dot} />
                  <span className={s.mono}>token: {token}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className={s.grid}>
          <div className={s.block}>
            {/* ✅ [수정] 블록 타이틀 동적 변경 */}
            <div className={s.blockTitle}>{isDocs ? '문서 핵심 요약' : '금일 작업'}</div>
            <div className={s.blockBody}>{data.workSummary}</div>
          </div>
          <div className={s.block}>
            <div className={s.blockTitle}>{isDocs ? '서약 사항' : '주요 위험요인'}</div>
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
        </div>

        <SignaturePad onChangeDataUrl={setSigUrl} disabled={locked || submitLoading} />

        <div className={s.footer}>
          <button className={s.btn} type="button" onClick={submit} disabled={submitLoading || locked}>
            {locked ? '서명 완료됨' : submitLoading ? '제출 중...' : '서명 제출'}
          </button>

          {submitMsg ? <div className={s.msg}>{submitMsg}</div> : null}

          {detailErr ? (
            <details className={s.details}>
              <summary>자세히 보기</summary>
              <pre className={s.pre}>{detailErr.slice(0, 4000)}</pre>
            </details>
          ) : null}
        </div>
      </div>
    </>
  );
}