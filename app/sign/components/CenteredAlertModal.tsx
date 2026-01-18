'use client';

import { useEffect } from 'react';
import s from '../page.module.css';

export default function CenteredAlertModal({
  open,
  title,
  message,
  confirmText = '확인',
  onConfirm,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onConfirm]);

  if (!open) return null;

  return (
    <div className={s.modalOverlay} role="dialog" aria-modal="true">
      <div className={s.modalCard}>
        <div className={s.modalTitle}>{title || '알림'}</div>
        <div className={s.modalBody}>{message}</div>
        <div className={s.modalActions}>
          <button className={s.btn} type="button" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
        <div className={s.modalHint}>
          * 자동으로 창을 닫지 못하면, 뒤로 이동하거나 홈으로 이동합니다.
        </div>
      </div>
    </div>
  );
}
