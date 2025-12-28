'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import RiskAssessmentWizard, { type RiskAssessmentDraft } from './RiskAssessmentWizard';
import s from './RiskAssessmentWizardModal.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (draft: RiskAssessmentDraft) => void;
};

export default function RiskAssessmentWizardModal({ open, onClose, onSubmit }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // 배경 스크롤 잠금(선택)
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className={s.overlay} role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className={s.modal} onMouseDown={(e) => e.stopPropagation()}>
        <RiskAssessmentWizard onClose={onClose} onSubmit={onSubmit} />
      </div>
    </div>,
    document.body,
  );
}
