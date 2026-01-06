'use client';

import React, { useEffect } from 'react';
import s from './AnimatedLoadingModal.module.css';

type Props = {
  open: boolean;
  title?: string;
  message?: string;
};

export default function AnimatedLoadingModal({
  open,
  title = '세부작업을 불러오는 중…',
  message = '잠시만 기다려 주세요.',
}: Props) {
  // ✅ 모달 열릴 때 스크롤 잠금(선택)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={s.backdrop} role="dialog" aria-modal="true" aria-label={title}>
      <div className={s.modal}>
        <div className={s.spinner} aria-hidden="true">
          <span className={s.dot} />
          <span className={s.dot} />
          <span className={s.dot} />
        </div>

        <div className={s.title}>{title}</div>
        {message ? <div className={s.message}>{message}</div> : null}
      </div>
    </div>
  );
}
