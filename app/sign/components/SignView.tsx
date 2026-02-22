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
  isMock,
}: {
  data: TbmSignData;
  token: string;
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

      // ✅ [핵심 수정] 제출 API 엔드포인트를 Docs-Sign 전용으로 변경
      // payload 파라미터 중 백엔드가 받는 이름인 'signature'로 매핑해서 보냅니다.
      const res = await fetch('/api/docs-sign-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          signature: sigUrl, 
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
            {/* ✅ [수정] 헤더 타이틀 문구 변경 */}
            <h1 className={s.h1}>{data.title || '안전 문서 서명'}</h1>
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
          {/* ✅ [수정] 블록 타이틀을 문서 요약 맥락에 맞게 변경 */}
          <div className={s.block}>
            <div className={s.blockTitle}>문서 핵심 내용</div>
            <div className={s.blockBody}>{data.workSummary}</div>
          </div>
          <div className={s.block}>
            <div className={s.blockTitle}>서약 사항</div>
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