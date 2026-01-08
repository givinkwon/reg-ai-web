'use client';

import React, { useEffect, useMemo, useState } from 'react';
import s from './WeeklySafetyNewsModal.module.css';
import { useChatStore } from '@/app/store/chat';
import { extractSafetyArticlesHtml, extractSafetySummaryHtml, splitDigestForArticles } from './NewsHtml';

type SafetyNewsResponse = {
  period?: string;
  batch_date?: string;
  category?: string;
  source_count?: number;
  digest?: string;
};

const buildNewsHtml = (data: SafetyNewsResponse) => {
  const periodText =
    (data.period && data.period.trim()) || (data.batch_date && data.batch_date.slice(0, 10)) || '';

  const titleHtml = periodText
    ? `🔔 <strong>${periodText} 금주의 안전 뉴스</strong>`
    : '🔔 <strong>금주의 안전 뉴스</strong>';

  const metaParts: string[] = [];
  if (data.category) metaParts.push(`${data.category}`);
  if (typeof data.source_count === 'number') metaParts.push(`기사 ${data.source_count}건 기준`);

  const metaHtml = metaParts.length
    ? `<div style="margin-top:4px; font-size:12px; opacity:0.8;">${metaParts.join(' · ')}</div>`
    : '';

  const digestText = data.digest || '';
  const { summaryText, articlesText } = splitDigestForArticles(digestText);

  const summaryHtml = summaryText
    ? summaryText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('<br />')
    : '';

  const articlesHtml = articlesText
    ? articlesText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .join('<br />')
    : '';

  // ✅ ChatArea에서 쓰던 data-section 구조 유지
  return `
    <div data-msg-type="safety-news">
      <p>${titleHtml}</p>
      ${metaHtml}
      ${summaryHtml ? `<div style="margin-top:8px;" data-section="summary">${summaryHtml}</div>` : ''}
      ${
        articlesHtml
          ? `<div style="margin-top:12px; display:none;" data-section="articles">${articlesHtml}</div>`
          : ''
      }
    </div>
  `;
};

export default function WeeklySafetyNewsModal() {
  const {
    weeklyNewsModal,
    closeWeeklyNewsModal,
    openNewsArticlesModal, // ✅ 2차 팝업 오픈
  } = useChatStore();

  const open = weeklyNewsModal.open;
  const category = weeklyNewsModal.category;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');
  const [data, setData] = useState<SafetyNewsResponse | null>(null);

  const titleText = useMemo(() => {
    const periodText =
      (data?.period && data.period.trim()) ||
      (data?.batch_date && data.batch_date.slice(0, 10)) ||
      '';
    return periodText ? `${periodText} 금주의 안전 뉴스` : '금주의 안전 뉴스';
  }, [data]);

  useEffect(() => {
    if (!open) return;

    let mounted = true;
    const run = async () => {
      setLoading(true);
      setErr('');
      setData(null);

      try {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        const qs = params.toString();
        const url = `/api/safety-news/latest${qs ? `?${qs}` : ''}`;

        const res = await fetch(url, { method: 'GET', cache: 'no-store' });
        if (!res.ok) throw new Error(`status=${res.status}`);

        const json = (await res.json()) as SafetyNewsResponse;
        if (!mounted) return;
        setData(json);
      } catch (e) {
        if (!mounted) return;
        setErr('금주의 안전 뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [open, category]);

  if (!open) return null;

  // ✅ html 구성 → summary/articles 파싱
  const html = data ? buildNewsHtml(data) : '';
  const summaryHtml = html ? extractSafetySummaryHtml(html) : '';
  const articlesHtml = html ? extractSafetyArticlesHtml(html) : '';

  const onOpenArticles = () => {
    if (!articlesHtml) return;
    openNewsArticlesModal(articlesHtml, `${titleText} · 참고 기사`);
  };

  return (
    <div className={s.overlay} onClick={closeWeeklyNewsModal}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.head}>
          <div className={s.title}>🔔 {titleText}</div>
          <button className={s.close} onClick={closeWeeklyNewsModal} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className={s.meta}>
          {data?.category ? <span className={s.badge}>{data.category}</span> : null}
          {typeof data?.source_count === 'number' ? (
            <span className={s.dim}>기사 {data.source_count}건 기준</span>
          ) : null}
        </div>

        <div className={s.body}>
          {loading ? (
            <div className={s.loading}>불러오는 중…</div>
          ) : err ? (
            <div className={s.error}>
              <div>{err}</div>
              <button className={s.retry} onClick={() => location.reload()}>
                새로고침
              </button>
            </div>
          ) : !data ? (
            <div className={s.empty}>표시할 내용이 없습니다.</div>
          ) : (
            <>
              {/* ✅ summary는 HTML로 렌더 (br 등 유지) */}
              <section className={s.section}>
                <div className={s.sectionTitle}>요약</div>
                <div
                  className={s.html}
                  dangerouslySetInnerHTML={{ __html: summaryHtml || '<div>요약이 없습니다.</div>' }}
                />
              </section>

              {/* ✅ 기사 목록은 2차 팝업에서 */}
              <div className={s.footer}>
                <button
                  className={s.articlesBtn}
                  onClick={onOpenArticles}
                  disabled={!articlesHtml}
                  aria-disabled={!articlesHtml}
                >
                  참고 기사 목록 보기
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
