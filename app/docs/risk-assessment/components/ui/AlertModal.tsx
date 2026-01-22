'use client';

import React from 'react';
import s from './AlertModal.module.css';

type Props = {
  open: boolean;
  title: string;
  lines: string[];
  confirmText?: string;
  showClose?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export default function CenteredAlertModal({
  open,
  title,
  lines,
  confirmText = '확인',
  showClose,
  onConfirm,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className={s.overlay}>
      <div className={s.modal}>
        <h3 className={s.title}>{title}</h3>
        <div className={s.content}>
          {lines.map((line, i) => (
            <p key={i} className={s.line}>
              {line}
            </p>
          ))}
        </div>
        <div className={s.actions}>
          {showClose && (
            <button className={s.cancelBtn} onClick={onClose}>
              취소
            </button>
          )}
          <button className={s.confirmBtn} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}