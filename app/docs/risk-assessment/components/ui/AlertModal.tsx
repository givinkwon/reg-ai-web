'use client';

import React, { useEffect, useRef } from 'react';
import s from './AlertModal.module.css';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context: 공통 UI 컴포넌트이므로 Shared 섹션 사용
const GA_CTX = { page: 'Docs', section: 'RiskAssessment', area: 'AlertModal' } as const;

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
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // ✅ GA: 확인 버튼 핸들러
  const handleConfirm = () => {
    track(gaEvent(GA_CTX, 'ClickConfirm'), {
      ui_id: gaUiId(GA_CTX, 'ClickConfirm'),
      modal_title: title,
    });
    onConfirm();
  };

  // ✅ GA: 닫기/취소 버튼 핸들러
  const handleClose = () => {
    track(gaEvent(GA_CTX, 'ClickClose'), {
      ui_id: gaUiId(GA_CTX, 'ClickClose'),
      modal_title: title,
    });
    onClose();
  };

  // ✅ 키보드 접근성 (ESC 키로 닫기, Enter 키로 확인)
  useEffect(() => {
    if (!open) return;

    // 모달 열리면 확인 버튼에 포커스 (빠른 엔터 지원)
    setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
      if (e.key === 'Enter') {
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className={s.overlay} onMouseDown={handleClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className={s.modal} onMouseDown={(e) => e.stopPropagation()}>
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
            // ✅ GA: 취소 버튼 식별
            <button 
              type="button"
              className={s.cancelBtn} 
              onClick={handleClose}
              data-ga-event="ClickClose"
              data-ga-id={gaUiId(GA_CTX, 'ClickClose')}
              data-ga-label="취소 버튼"
            >
              취소
            </button>
          )}
          
          {/* ✅ GA: 확인 버튼 식별 */}
          <button 
            ref={confirmBtnRef}
            type="button"
            className={s.confirmBtn} 
            onClick={handleConfirm}
            data-ga-event="ClickConfirm"
            data-ga-id={gaUiId(GA_CTX, 'ClickConfirm')}
            data-ga-label="확인 버튼"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}