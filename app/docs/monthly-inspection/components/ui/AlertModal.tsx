'use client';

import { useEffect, useRef, useCallback } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import s from './AlertModal.module.css';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context: 공통 UI 컴포넌트이므로 'Shared' 섹션으로 정의
const GA_CTX = { page: 'Docs', section: 'MonthlyInspection', area: 'AlertModal' } as const;

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

  // ✅ GA 트래킹을 포함한 내부 핸들러 (Confirm)
  // 키보드 엔터나 클릭 시 모두 이 함수를 타게 하여 트래킹 누락 방지
  const handleConfirm = useCallback(() => {
    track(gaEvent(GA_CTX, 'ClickConfirm'), {
      ui_id: gaUiId(GA_CTX, 'ClickConfirm'),
      modal_title: title, // 어떤 내용의 알림창인지 식별
    });
    onConfirm();
  }, [onConfirm, title]);

  // ✅ GA 트래킹을 포함한 내부 핸들러 (Close)
  const handleClose = useCallback(() => {
    if (onClose) {
      track(gaEvent(GA_CTX, 'ClickClose'), {
        ui_id: gaUiId(GA_CTX, 'ClickClose'),
        modal_title: title,
      });
      onClose();
    }
  }, [onClose, title]);

  useEffect(() => {
    if (!open) return;
    // 열릴 때 버튼에 포커스 (접근성 및 편의성)
    const t = window.setTimeout(() => btnRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Escape는 close가 있으면 close, 없으면 confirm으로 처리
        if (showClose && onClose) {
            handleClose(); // ✅ 트래킹 포함된 핸들러 호출
        } else {
            handleConfirm(); // ✅ 트래킹 포함된 핸들러 호출
        }
      }
      if (e.key === 'Enter') {
        handleConfirm(); // ✅ 트래킹 포함된 핸들러 호출
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, showClose, onClose, handleConfirm, handleClose]);

  // 모달이 열려있을 때 백그라운드 스크롤 방지
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
            // ✅ GA: 닫기 버튼 식별
            <button
              type="button"
              className={s.closeBtn}
              onClick={handleClose}
              aria-label="닫기"
              disabled={disabled}
              data-ga-event="ClickClose"
              data-ga-id={gaUiId(GA_CTX, 'ClickClose')}
              data-ga-label={title}
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
          {/* ✅ GA: 확인 버튼 식별 */}
          <button
            ref={btnRef}
            type="button"
            className={s.confirmBtn}
            onClick={handleConfirm}
            disabled={disabled}
            data-ga-event="ClickConfirm"
            data-ga-id={gaUiId(GA_CTX, 'ClickConfirm')}
            data-ga-label={title}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}