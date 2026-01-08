'use client';

import { useCallback, useMemo, useState } from 'react';

export type LawNoticeArticle = {
  title: string;
  url?: string;
};

type LawNoticeSummaryResponse = {
  cutoff_date?: string;
  run_date?: string;
  months_back?: number;
  item_count?: number;
  digest?: string;
  summary_kor?: string;
  text?: { summary_kor?: string };
};

type SplitResult = { summaryText: string; articlesText: string };

function splitDigestForArticles(digest: string, marker: string): SplitResult {
  const raw = (digest ?? '').trim();
  if (!raw) return { summaryText: '', articlesText: '' };

  const idx = raw.indexOf(marker);
  if (idx < 0) return { summaryText: raw, articlesText: '' };

  const summaryText = raw.slice(0, idx).trim();
  const articlesText = raw.slice(idx + marker.length).trim();

  return { summaryText, articlesText };
}

function parseLawNoticeArticles(raw: string): LawNoticeArticle[] {
  if (!raw) return [];

  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const urlMatch = line.match(/https?:\/\/[^\s)]+/i);
    const url = urlMatch?.[0];

    const cleaned = line
      .replace(/^\d+\.\s*/, '')
      .replace(/^[-•]\s*/, '')
      .replace(url ? url : '', '')
      .replace(/\(\s*\)/g, '')
      .trim();

    return { title: cleaned || line, url };
  });
}

function toBrHtml(text: string): string {
  return (text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('<br />');
}

export function useLawNoticeModal() {
  const [open, setOpen] = useState(false);
  const [articlesOpen, setArticlesOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('입법 예고 요약');
  const [metaText, setMetaText] = useState('');
  const [summaryHtml, setSummaryHtml] = useState('');
  const [articles, setArticles] = useState<LawNoticeArticle[]>([]);

  const hasArticles = useMemo(() => articles.length > 0, [articles.length]);

  const close = useCallback(() => setOpen(false), []);
  const closeArticles = useCallback(() => setArticlesOpen(false), []);
  const openArticles = useCallback(() => setArticlesOpen(true), []);

  const fetchLatest = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/expect-law/latest', { cache: 'no-store' });

      if (!res.ok) {
        setError('입법 예고 요약을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        setLoading(false);
        return;
      }

      const data = (await res.json()) as LawNoticeSummaryResponse;

      const cutoff = data.cutoff_date?.slice(0, 10);
      const run = data.run_date?.slice(0, 10);
      const periodText = cutoff && run ? `${cutoff} ~ ${run}` : run || cutoff || '';
      const computedTitle = periodText ? `${periodText} 입법 예고 요약` : '입법 예고 요약';

      const metaParts: string[] = [];
      if (typeof data.months_back === 'number') metaParts.push(`최근 ${data.months_back}개월 기준`);
      if (typeof data.item_count === 'number') metaParts.push(`입법예고 ${data.item_count}건 기준`);
      const computedMeta = metaParts.join(' · ');

      const digestText = data.digest || data.summary_kor || data.text?.summary_kor || '';

      const { summaryText, articlesText } = splitDigestForArticles(digestText, '참고 입법예고 목록');

      const computedSummaryHtml = toBrHtml(summaryText);
      const computedArticles = parseLawNoticeArticles(articlesText || '');

      setTitle(computedTitle);
      setMetaText(computedMeta);
      setSummaryHtml(computedSummaryHtml);
      setArticles(computedArticles);

      setLoading(false);
    } catch (e) {
      console.error('[useLawNoticeModal] fetch error:', e);
      setError('입법 예고 요약을 불러오는 중 오류가 발생했습니다.');
      setLoading(false);
    }
  }, []);

  return {
    // state
    open,
    articlesOpen,
    loading,
    error,
    title,
    metaText,
    summaryHtml,
    articles,
    hasArticles,

    // actions
    fetchLatest,
    close,
    openArticles,
    closeArticles,
  };
}
