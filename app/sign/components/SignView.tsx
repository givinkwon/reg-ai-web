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
  signType,
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

    try {
      window.close();
    } catch {}

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

  useEffect(() => {
    if (!successOpen) return;
    const t = window.setTimeout(() => {
      closeScreenOrFallback();
    }, 1200);
    return () => window.clearTimeout(t);
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

      // ✅ [수정 포인트] 제출 API 엔드포인트를 Docs-Sign 폴더 구조에 맞춤
      const submitApiUrl = signType === 'docs' 
        ? '/api/docs-sign/submit' 
        : '/api/tbm-sign/submit';

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