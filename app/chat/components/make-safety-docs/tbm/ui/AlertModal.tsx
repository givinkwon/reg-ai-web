'use client';

import { useEffect, useRef } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import s from './AlertModal.module.css';

type Props = {
  open: boolean;
  title?: string;
  lines: string[];
  confirmText?: string;
  onConfirm: () => void;

  // 옵션: 닫기(X) 허용하고 싶을 때
  showClose?: boolean;
  onClose?: () => void;

  // 옵션: 버튼 비활성화
  disabled?: boolean;
};

export default function CenteredAlertModal({
  open,
  title = '안내',
  lines,
  confirmText = '확인',
  onConfirm,
  showClose = false,
  onClose,
  disabled = false,
}: Props) {
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    // 열릴 때 버튼에 포커스
    const t = window.setTimeout(() => btnRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Escape는 close가 있으면 close, 없으면 confirm로 처리
        if (showClose && onClose) onClose();
        else onConfirm();
      }
      if (e.key === 'Enter') {
        onConfirm();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onConfirm, onClose, showClose]);

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
    <div className={s.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <div className={s.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <div className={s.iconWrap} aria-hidden="true">
            <CheckCircle2 className={s.icon} />
          </div>

          <div className={s.titleWrap}>
            <div className={s.title}>{title}</div>
          </div>

          {showClose && (
            <button
              type="button"
              className={s.closeBtn}
              onClick={onClose}
              aria-label="닫기"
              disabled={disabled}
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className={s.body}>
          {lines.map((t, idx) => (
            <p key={idx} className={s.line}>
              {t}
            </p>
          ))}
        </div>

        <div className={s.footer}>
          <button
            ref={btnRef}
            type="button"
            className={s.confirmBtn}
            onClick={onConfirm}
            disabled={disabled}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
