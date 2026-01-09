'use client';

import React, { useMemo } from 'react';
import s from './LawNoticeSummaryModal.module.css';
import { formatAssistantHtml } from '../../../utils/formatAssistantHtml';

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
  if (!open) return null;

  const prettyHtml = useMemo(() => {
    if (!summaryHtml) return '';
    return formatAssistantHtml(summaryHtml);
  }, [summaryHtml]);

  return (
    <>
      <div className={s.overlay} onClick={onClose} />
      <div className={s.wrap} onClick={onClose}>
        <div className={s.modal} onClick={(e) => e.stopPropagation()}>
          <div className={s.head}>
            <div className={s.title}>📜 입법예고 요약</div>
            <button
              className={s.close}
              onClick={onClose}
              aria-label="닫기"
              type="button"
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
                onClick={onOpenArticles}
                type="button"
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
