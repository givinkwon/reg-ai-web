'use client';

import React, { useMemo } from 'react';
import s from './NewsArticlesModal.module.css';
import { useChatStore } from '@/app/store/chat';
import { parseNewsItemsFromHtml } from './NewsItems';

export default function NewsArticlesModal() {
  const { newsArticlesModal, closeNewsArticlesModal } = useChatStore();
  const open = newsArticlesModal.open;

  const items = useMemo(
    () => parseNewsItemsFromHtml(newsArticlesModal.html),
    [newsArticlesModal.html],
  );

  if (!open) return null;

  return (
    <div className={s.overlay} onClick={closeNewsArticlesModal}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.head}>
          <div className={s.title}>{newsArticlesModal.title ?? '참고 기사 목록'}</div>
          <button className={s.close} onClick={closeNewsArticlesModal} aria-label="닫기">
            ✕
          </button>
        </div>

        <div className={s.body}>
          {!items.length ? (
            <div className={s.empty}>기사 목록이 없습니다.</div>
          ) : (
            <ul className={s.newsList}>
              {items.map((it: any, idx: any) => (
                <li key={it.href} className={s.newsItem}>
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
