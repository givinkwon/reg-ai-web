// app/docs/components/ui/CompleteView.tsx
'use client';

import React from 'react';
import { Check, ArrowLeft } from 'lucide-react';
import s from './CompleteView.module.css';
import { useRouter } from 'next/navigation';

type Props = {
  onClose: () => void;
  onBack: () => void;
};

export default function CompleteView({ onClose, onBack }: Props) {
  const router = useRouter();

  const handleGoToVault = () => {
    onClose();
    router.push('/docs/docs-box');
  };

  return (
    <div className={s.container}>
      <div className={s.iconWrapper}>
        <Check size={40} strokeWidth={3} />
      </div>
      
      {/* 🚀 기획안에 맞춘 텍스트 수정 */}
      <h2 className={s.title}>문서 생성 완료!</h2>
      <p className={s.desc}>
        문서가 생성되었습니다. <br />
        미완료 서명은 자동으로 계속 수집됩니다. <br />
        진행 현황과 결과 파일은 <span className={s.highlight}>문서함</span>에서 확인할 수 있습니다.
      </p>

      <div className={s.btnGroup}>
        <button className={s.backBtn} onClick={onBack}>
          <ArrowLeft size={16} /> 내용 다시 보기
        </button>
        <button className={s.confirmBtn} onClick={handleGoToVault}>
          확인 (닫기)
        </button>
      </div>
    </div>
  );
}