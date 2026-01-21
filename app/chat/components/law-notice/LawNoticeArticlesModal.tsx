// components/law-notice/LawNoticeArticlesModal.tsx
'use client';

import React, { useEffect, useRef } from 'react';
import s from './LawNoticeArticlesModal.module.css';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

const GA_CTX = { page: 'Chat', section: 'LawNotice', area: 'LawNoticeArticlesModal' } as const;

export type LawNoticeArticle = {
  title: string;
  url?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  items: LawNoticeArticle[];
};

export default function LawNoticeArticlesModal({
  open,
  onClose,
  title = '참고 입법예고 목록',
  items,
}: Props) {
  const openedOnceRef = useRef(false);

  // ✅ GA: modal open view
  useEffect(() => {
    if (!open) {
      openedOnceRef.current = false;
      return;
    }
    if (openedOnceRef.current) return;
    openedOnceRef.current = true;

    track(gaEvent(GA_CTX, 'View'), {
      ui_id: gaUiId(GA_CTX, 'View'),
      modal_title: title,
      items_count: items?.length ?? 0,
    });
  }, [open, title, items?.length]);

  if (!open) return null;

  const close = (reason: 'overlay' | 'wrap' | 'x' | 'button' | 'esc' = 'button') => {
    track(gaEvent(GA_CTX, 'Close'), {
      ui_id: gaUiId(GA_CTX, 'Close'),
      reason,
      modal_title: title,
      items_count: items?.length ?? 0,
    });
    onClose();
  };

  const onClickItem = (idx: number, it: LawNoticeArticle) => {
    track(gaEvent(GA_CTX, 'ClickArticle'), {
      ui_id: gaUiId(GA_CTX, 'ClickArticle'),
      index: idx + 1,
      article_title: it.title,
      has_url: !!it.url,
      // URL은 길거나 민감할 수 있어 기본은 미전송(원하면 추가 가능)
    });
  };

  return (
    <>
      <div
        className={s.overlay}
        onClick={() => close('overlay')}
        data-ga-event={gaEvent(GA_CTX, 'Close')}
        data-ga-id={gaUiId(GA_CTX, 'Close')}
        data-ga-text="overlay"
      />
      <div
        className={s.wrap}
        onClick={() => close('wrap')}
        data-ga-event={gaEvent(GA_CTX, 'Close')}
        data-ga-id={gaUiId(GA_CTX, 'Close')}
        data-ga-text="wrap"
      >
        <div className={s.modal} onClick={(e) => e.stopPropagation()}>
          <div className={s.head}>
            <div className={s.title}>{title}</div>
            <button
              className={s.close}
              onClick={() => close('x')}
              aria-label="닫기"
              type="button"
              data-ga-event={gaEvent(GA_CTX, 'Close')}
              data-ga-id={gaUiId(GA_CTX, 'Close')}
              data-ga-text="x"
            >
              ×
            </button>
          </div>

          <div className={s.body}>
            {items.length === 0 ? (
              <div className={s.emptyBox}>표시할 참고 목록이 없습니다.</div>
            ) : (
              <ul className={s.newsList}>
                {items.map((it, idx) => (
                  <li key={`${idx}-${it.title}`} className={s.newsItem}>
                    {it.url ? (
                      <a
                        className={s.newsLink}
                        href={it.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onClickItem(idx, it)}
                        data-ga-event={gaEvent(GA_CTX, 'ClickArticle')}
                        data-ga-id={gaUiId(GA_CTX, 'ClickArticle')}
                        data-ga-text={it.title}
                      >
                        <span className={s.newsIndex}>{idx + 1}.</span>
                        <span className={s.newsTitle}>{it.title}</span>
                      </a>
                    ) : (
                      <div
                        className={s.newsLink}
                        role="listitem"
                        onClick={() => onClickItem(idx, it)}
                        data-ga-event={gaEvent(GA_CTX, 'ClickArticle')}
                        data-ga-id={gaUiId(GA_CTX, 'ClickArticle')}
                        data-ga-text={it.title}
                      >
                        <span className={s.newsIndex}>{idx + 1}.</span>
                        <span className={s.newsTitle}>{it.title}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={s.footer}>
            <button
              className={s.closeBtn}
              onClick={() => close('button')}
              type="button"
              data-ga-event={gaEvent(GA_CTX, 'Close')}
              data-ga-id={gaUiId(GA_CTX, 'Close')}
              data-ga-text="button"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
