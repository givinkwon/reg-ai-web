'use client';

import React, { useEffect, useMemo } from 'react';
import s from './NewsArticlesModal.module.css';
import { useChatStore } from '@/app/store/chat';
import { parseNewsItemsFromHtml, type NewsItem } from './NewsItems';

const NEWS_DEBUG = true;
//   typeof process !== 'undefined' &&
//   (process.env.NEXT_PUBLIC_NEWS_DEBUG === '1' || process.env.NODE_ENV === 'development');

export default function NewsArticlesModal() {
  const { newsArticlesModal, closeNewsArticlesModal } = useChatStore();
  const open = newsArticlesModal.open;

  // ✅ 핵심: open은 true여도 html이 준비되기 전엔 dim을 빼고 모달도 숨긴다
  const hasHtml = !!(newsArticlesModal.html && newsArticlesModal.html.trim().length > 0);
  const isLoading = open && !hasHtml;

  const items: NewsItem[] = useMemo(() => {
    const html = newsArticlesModal.html ?? '';

    if (NEWS_DEBUG) {
      console.group('[NewsArticlesModal] useMemo parse');
      console.log('open:', open);
      console.log('hasHtml:', hasHtml);
      console.log('html length:', html.length);
      console.log('html preview:', html.slice(0, 400));
    }

    const parsed = parseNewsItemsFromHtml(html, { debug: NEWS_DEBUG });

    if (NEWS_DEBUG) {
      console.log('parsed count:', parsed.length);
      console.log('parsed items:', parsed.slice(0, 10));
      console.groupEnd();
    }

    return parsed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsArticlesModal.html]);

  useEffect(() => {
    if (!NEWS_DEBUG) return;
    if (!open) return;

    console.group('[NewsArticlesModal] render');
    console.log('open:', open);
    console.log('isLoading:', isLoading);
    console.log('title:', newsArticlesModal.title);
    console.log('html length:', newsArticlesModal.html?.length ?? 0);
    console.log('items length:', items.length);
    console.groupEnd();
  }, [open, isLoading, newsArticlesModal.title, newsArticlesModal.html, items.length]);

  if (!open) return null;

  return (
    <div
      className={`${s.overlay} ${isLoading ? s.overlayLoading : ''}`}
      onClick={closeNewsArticlesModal}
      aria-hidden={false}
    >
      <div
        className={`${s.modal} ${isLoading ? s.modalLoading : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="참고 기사 목록"
      >
        <div className={s.head}>
          <div className={s.title}>{newsArticlesModal.title ?? '참고 기사 목록'}</div>
          <button className={s.close} onClick={closeNewsArticlesModal} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className={s.body}>
          {!items.length ? (
            <div className={s.empty}>
              기사 목록이 없습니다.
              {NEWS_DEBUG && (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
                  <div>DEBUG: htmlLength={newsArticlesModal.html?.length ?? 0}</div>
                  <div>DEBUG: isLoading={String(isLoading)}</div>
                </div>
              )}
            </div>
          ) : (
            <ul className={s.newsList}>
              {items.map((it, idx) => (
                <li key={`${it.href}-${idx}`} className={s.newsItem}>
                  <a
                    href={it.href}
                    className={s.newsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="새 탭으로 열기"
                  >
                    <span className={s.newsIndex}>{idx + 1}.</span>
                    <span className={s.newsTitle}>{it.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
