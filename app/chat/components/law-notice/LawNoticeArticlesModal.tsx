'use client';

import React from 'react';
import s from './LawNoticeArticlesModal.module.css';

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
  if (!open) return null;

  return (
    <>
      <div className={s.overlay} onClick={onClose} />
      <div className={s.wrap} onClick={onClose}>
        <div className={s.modal} onClick={(e) => e.stopPropagation()}>
          <div className={s.head}>
            <div className={s.title}>{title}</div>
            <button className={s.close} onClick={onClose} aria-label="닫기" type="button">
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
                      >
                        <span className={s.newsIndex}>{idx + 1}.</span>
                        <span className={s.newsTitle}>{it.title}</span>
                      </a>
                    ) : (
                      <div className={s.newsLink} role="listitem">
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
            <button className={s.closeBtn} onClick={onClose} type="button">
              닫기
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
