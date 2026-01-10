'use client';

import s from './CompletionToastModal.module.css';

type Props = {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
};

export default function CompletionToastModal({ open, title, message, onConfirm }: Props) {
  if (!open) return null;

  return (
    <div className={s.overlay} role="dialog" aria-modal="true">
      <div className={s.toast}>
        <div className={s.title}>{title}</div>
        <div className={s.msg}>{message}</div>
        <button className={s.btn} type="button" onClick={onConfirm}>
          확인
        </button>
      </div>
    </div>
  );
}
