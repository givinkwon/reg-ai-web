// components/law-notice/LawNoticeSummaryModal.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import s from './LawNoticeSummaryModal.module.css';
import { formatAssistantHtml } from '../../../utils/formatAssistantHtml';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'LawNotice', area: 'LawNoticeSummaryModal' } as const;

type Props = {
  open: boolean;
  onClose: () => void;

  title: string;
  metaText?: string;
  loading?: boolean;
  error?: string | null;

  summaryHtml?: string;

  hasArticles?: boolean;
  onOpenArticles?: () => void;
};

export default function LawNoticeSummaryModal({
  open,
  onClose,
  title,
  metaText,
  loading = false,
  error = null,
  summaryHtml,
  hasArticles = false,
  onOpenArticles,
}: Props) {
  const openedOnceRef = useRef(false);

  // ✅ View (modal open)
  useEffect(() => {
    if (!open) {
      openedOnceRef.current = false;
      return;
    }
    if (openedOnceRef.current) return;
    openedOnceRef.current = true;

    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      law_title: title,
      meta_text: metaText ?? '',
      has_articles: !!hasArticles,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ✅ State changes (loading/error/success) - open일 때만
  const prevStateRef = useRef<string>('');
  useEffect(() => {
    if (!open) return;

    const state = loading ? 'loading' : error ? 'error' : summaryHtml ? 'success' : 'empty';

    if (prevStateRef.current === state) return;
    prevStateRef.current = state;

    track(gaEvent(GA_CTX, 'State'), {
      ui_id: gaUiId(GA_CTX, 'State'),
      state,
      law_title: title,
      has_articles: !!hasArticles,
      error: error ? String(error).slice(0, 200) : '',
    });
  }, [open, loading, error, summaryHtml, title, hasArticles]);

  // ✅ Hook들은 항상 여기까지 "무조건" 호출되어야 함
  if (!open) return null;

  const prettyHtml = summaryHtml ? formatAssistantHtml(summaryHtml) : '';

  const close = (reason: 'overlay' | 'wrap' | 'x' | 'esc' | 'program' = 'program') => {
    track(gaEvent(GA_CTX, 'Close'), {
      ui_id: gaUiId(GA_CTX, 'Close'),
      reason,
      law_title: title,
      has_articles: !!hasArticles,
      is_loading: !!loading,
      has_error: !!error,
    });
    onClose();
  };

  const onClickOpenArticles = () => {
    track(gaEvent(GA_CTX, 'ClickOpenArticles'), {
      ui_id: gaUiId(GA_CTX, 'ClickOpenArticles'),
      law_title: title,
      enabled: !!hasArticles && !loading && !error,
    });
    onOpenArticles?.();
  };

  return (
    <>
      <div
        className={s.overlay}
        onClick={() => close('overlay')}
        data-ga-event={gaEvent(GA_CTX, 'Close')}
        data-ga-id={gaUiId(GA_CTX, 'Close')}
        data-ga-text="overlay"
        data-ga-label="모달 오버레이"
      />
      <div
        className={s.wrap}
        onClick={() => close('wrap')}
        data-ga-event={gaEvent(GA_CTX, 'Close')}
        data-ga-id={gaUiId(GA_CTX, 'Close')}
        data-ga-text="wrap"
        data-ga-label="모달 랩"
      >
        <div className={s.modal} onClick={(e) => e.stopPropagation()}>
          <div className={s.head}>
            <div className={s.title}>📜 입법예고 요약</div>
            <button
              className={s.close}
              onClick={() => close('x')}
              aria-label="닫기"
              type="button"
              data-ga-event={gaEvent(GA_CTX, 'Close')}
              data-ga-id={gaUiId(GA_CTX, 'Close')}
              data-ga-text="x"
              data-ga-label="모달 닫기 버튼"
            >
              ×
            </button>
          </div>

          <div className={s.meta}>
            <span className={s.badge}>{title}</span>
            {metaText ? <span className={s.dim}>{metaText}</span> : null}
          </div>

          <div className={s.body}>
            {loading ? (
              <div className={s.loading}>⏳ 입법예고 요약을 불러오는 중…</div>
            ) : error ? (
              <div className={s.error}>
                <div className={s.errorTitle}>불러오기 실패</div>
                <div className={s.errorMsg}>{error}</div>
              </div>
            ) : prettyHtml ? (
              <div className={s.html} dangerouslySetInnerHTML={{ __html: prettyHtml }} />
            ) : (
              <div className={s.empty}>표시할 요약 내용이 없습니다.</div>
            )}

            <div className={s.footer}>
              <button
                className={s.articlesBtn}
                disabled={!hasArticles || !!loading || !!error}
                onClick={onClickOpenArticles}
                type="button"
                data-ga-event={gaEvent(GA_CTX, 'ClickOpenArticles')}
                data-ga-id={gaUiId(GA_CTX, 'ClickOpenArticles')}
                data-ga-text="open_articles"
                data-ga-label="참고 입법예고 목록 보기"
              >
                참고 입법예고 목록 보기
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
