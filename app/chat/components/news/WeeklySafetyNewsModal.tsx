'use client';

import React, { useEffect, useMemo, useState } from 'react';
import s from './WeeklySafetyNewsModal.module.css';
import { useChatStore } from '@/app/store/chat';
import {
  extractSafetyArticlesHtml,
  extractSafetySummaryHtml,
  splitDigestForArticles,
} from './NewsHtml';

// ✅ 입법예고에서 쓰던 PRETTY 유틸
import { formatAssistantHtml } from '../../../utils/formatAssistantHtml'; // 경로는 프로젝트에 맞게 조정

type SafetyNewsResponse = {
  period?: string;
  batch_date?: string;
  category?: string;
  source_count?: number;
  digest?: string;
};

/**
 * ✅ <li> 안에서 "헤더:" 패턴만 굵게 처리
 * - ':' 또는 '：' 지원
 * - "(예:" 같은 예시성 head 제외: 콜론 앞에 '(' 또는 '（' 들어가면 스킵
 * - 줄 쪼개지 않고 같은 줄에서 strong만 감쌈
 */
function boldColonHeadInListHtml(html: string): string {
  if (!html) return html;
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.getElementById('root');
  if (!root) return html;

  const pickColonIndex = (s: string) => {
    const idx1 = s.indexOf(':');
    const idx2 = s.indexOf('：');
    if (idx1 === -1) return idx2;
    if (idx2 === -1) return idx1;
    return Math.min(idx1, idx2);
  };

  const findFirstTextNode = (node: Node): Text | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? '').trim();
      return t ? (node as Text) : null;
    }
    for (let c = node.firstChild; c; c = c.nextSibling) {
      const found = findFirstTextNode(c);
      if (found) return found;
    }
    return null;
  };

  root.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
    if (li.getAttribute('data-colon-bold') === '1') return;

    const firstText = findFirstTextNode(li);
    if (!firstText) return;

    const text = firstText.textContent ?? '';
    const idx = pickColonIndex(text);
    if (idx === -1) return;

    const headRaw = text.slice(0, idx);
    const colon = text[idx];
    const restRaw = text.slice(idx + 1);

    // ✅ "(예:" 같은 케이스 제외
    if (headRaw.includes('(') || headRaw.includes('（')) return;

    const head = headRaw.trim();
    if (!head) return;

    const strong = doc.createElement('strong');
    strong.textContent = `${head}${colon} `;

    const rest = doc.createTextNode(restRaw.trimStart());

    const parent = firstText.parentNode;
    if (!parent) return;

    parent.insertBefore(strong, firstText);
    parent.insertBefore(rest, firstText);
    firstText.remove();

    li.setAttribute('data-colon-bold', '1');
  });

  return root.innerHTML;
}

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
  const { weeklyNewsModal, closeWeeklyNewsModal, openNewsArticlesModal } = useChatStore();

  const open = weeklyNewsModal.open;
  const category = weeklyNewsModal.category;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');
  const [data, setData] = useState<SafetyNewsResponse | null>(null);

  // ✅ fetch
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
      } catch {
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

  // ✅ title
  const titleText = useMemo(() => {
    const periodText =
      (data?.period && data.period.trim()) ||
      (data?.batch_date && data.batch_date.slice(0, 10)) ||
      '';
    return periodText ? `${periodText} 금주의 안전 뉴스` : '금주의 안전 뉴스';
  }, [data]);

  // ✅ 훅 순서 고정 (open 여부와 상관없이 훅은 항상 호출)
  const rawHtml = useMemo(() => (data ? buildNewsHtml(data) : ''), [data]);
  const rawSummaryHtml = useMemo(() => (rawHtml ? extractSafetySummaryHtml(rawHtml) : ''), [rawHtml]);
  const rawArticlesHtml = useMemo(
    () => (rawHtml ? extractSafetyArticlesHtml(rawHtml) : ''),
    [rawHtml],
  );

  // ✅ PRETTY TEXT 적용 (formatAssistantHtml) + li의 "텍스트:"만 bold
  const prettySummaryHtml = useMemo(() => {
    if (!rawSummaryHtml) return '';
    if (typeof window === 'undefined') return rawSummaryHtml; // SSR 가드
    const pretty = formatAssistantHtml(rawSummaryHtml);
    return boldColonHeadInListHtml(pretty);
  }, [rawSummaryHtml]);

  const prettyArticlesHtml = useMemo(() => {
    if (!rawArticlesHtml) return '';
    if (typeof window === 'undefined') return rawArticlesHtml; // SSR 가드
    const pretty = formatAssistantHtml(rawArticlesHtml);
    return boldColonHeadInListHtml(pretty);
  }, [rawArticlesHtml]);

  const onOpenArticles = () => {
    if (!prettyArticlesHtml) return;
    openNewsArticlesModal(prettyArticlesHtml, `${titleText} · 참고 기사`);
  };

  if (!open) return null;

  return (
    <div className={s.overlay} onClick={closeWeeklyNewsModal}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.head}>
          <div className={s.title}>🔔 {titleText}</div>
          <button className={s.close} onClick={closeWeeklyNewsModal} aria-label="닫기" type="button">
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
              <button className={s.retry} onClick={() => location.reload()} type="button">
                새로고침
              </button>
            </div>
          ) : !data ? (
            <div className={s.empty}>표시할 내용이 없습니다.</div>
          ) : (
            <>
              <section className={s.section}>
                <div className={s.sectionTitle}>요약</div>
                <div
                  className={s.html}
                  dangerouslySetInnerHTML={{
                    __html: prettySummaryHtml || '<div>요약이 없습니다.</div>',
                  }}
                />
              </section>

              <div className={s.footer}>
                <button
                  className={s.articlesBtn}
                  onClick={onOpenArticles}
                  disabled={!prettyArticlesHtml}
                  aria-disabled={!prettyArticlesHtml}
                  type="button"
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
