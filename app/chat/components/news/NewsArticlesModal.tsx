// components/news/NewsArticlesModal.tsx
'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import s from './NewsArticlesModal.module.css';
import { useChatStore } from '@/app/store/chat';
import { parseNewsItemsFromHtml, type NewsItem } from './NewsItems';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'News', area: 'NewsArticlesModal' } as const;

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

  // ✅ GA: open/close 상태 추적 (중복 방지)
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;

    if (!prev && open) {
      track(gaEvent(GA_CTX, 'Open'), {
        ui_id: gaUiId(GA_CTX, 'Open'),
        title: newsArticlesModal.title ?? '참고 기사 목록',
        html_len: newsArticlesModal.html?.length ?? 0,
      });
    }

    if (prev && !open) {
      track(gaEvent(GA_CTX, 'Close'), {
        ui_id: gaUiId(GA_CTX, 'Close'),
      });
    }
  }, [open, newsArticlesModal.title, newsArticlesModal.html]);

  // ✅ GA: 로딩 -> 로드 완료(아이템 파싱 완료) 전환 추적
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    const prev = prevLoadingRef.current;
    prevLoadingRef.current = isLoading;

    if (!open) return;

    if (!prev && isLoading) {
      track(gaEvent(GA_CTX, 'LoadStart'), {
        ui_id: gaUiId(GA_CTX, 'LoadStart'),
      });
    }

    if (prev && !isLoading) {
      track(gaEvent(GA_CTX, 'LoadDone'), {
        ui_id: gaUiId(GA_CTX, 'LoadDone'),
        item_count: items.length,
        html_len: newsArticlesModal.html?.length ?? 0,
      });
    }
  }, [open, isLoading, items.length, newsArticlesModal.html]);

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
      onClick={() => {
        // ✅ GA: dim 클릭으로 닫기
        track(gaEvent(GA_CTX, 'CloseDim'), {
          ui_id: gaUiId(GA_CTX, 'CloseDim'),
          is_loading: isLoading,
          item_count: items.length,
        });
        closeNewsArticlesModal();
      }}
      aria-hidden={false}
      data-ga-event={gaEvent(GA_CTX, 'Overlay')}
      data-ga-id={gaUiId(GA_CTX, 'Overlay')}
    >
      <div
        className={`${s.modal} ${isLoading ? s.modalLoading : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="참고 기사 목록"
        data-ga-event={gaEvent(GA_CTX, 'View')}
        data-ga-id={gaUiId(GA_CTX, 'View')}
      >
        <div className={s.head}>
          <div className={s.title}>{newsArticlesModal.title ?? '참고 기사 목록'}</div>
          <button
            className={s.close}
            onClick={() => {
              track(gaEvent(GA_CTX, 'CloseBtn'), {
                ui_id: gaUiId(GA_CTX, 'CloseBtn'),
                is_loading: isLoading,
                item_count: items.length,
              });
              closeNewsArticlesModal();
            }}
            aria-label="닫기"
            data-ga-event={gaEvent(GA_CTX, 'CloseBtn')}
            data-ga-id={gaUiId(GA_CTX, 'CloseBtn')}
          >
            ✕
          </button>
        </div>

        <div className={s.body}>
          {!items.length ? (
            <div
              className={s.empty}
              data-ga-event={gaEvent(GA_CTX, 'Empty')}
              data-ga-id={gaUiId(GA_CTX, 'Empty')}
            >
              기사 목록이 없습니다.
              {NEWS_DEBUG && (
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
                  <div>DEBUG: htmlLength={newsArticlesModal.html?.length ?? 0}</div>
                  <div>DEBUG: isLoading={String(isLoading)}</div>
                </div>
              )}
            </div>
          ) : (
            <ul
              className={s.newsList}
              aria-label="참고 기사 리스트"
              data-ga-event={gaEvent(GA_CTX, 'List')}
              data-ga-id={gaUiId(GA_CTX, 'List')}
            >
              {items.map((it, idx) => (
                <li key={`${it.href}-${idx}`} className={s.newsItem}>
                  <a
                    href={it.href}
                    className={s.newsLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.stopPropagation();

                      // ✅ GA: 기사 클릭(외부 링크)
                      track(gaEvent(GA_CTX, 'ArticleClick'), {
                        ui_id: gaUiId(GA_CTX, 'ArticleClick'),
                        index: idx + 1,
                        href: it.href,
                        title: it.title?.slice(0, 120),
                        modal_title: newsArticlesModal.title ?? '참고 기사 목록',
                      });
                    }}
                    title="새 탭으로 열기"
                    data-ga-event={gaEvent(GA_CTX, 'ArticleClick')}
                    data-ga-id={gaUiId(GA_CTX, 'ArticleClick')}
                    data-ga-label={it.title}
                    data-ga-text={String(idx + 1)}
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
