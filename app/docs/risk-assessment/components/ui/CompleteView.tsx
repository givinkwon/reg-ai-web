'use client';

import React from 'react';
import { Check, ArrowLeft } from 'lucide-react';
import s from './CompleteView.module.css';

type Props = {
  onClose: () => void;
  onBack: () => void;
};

export default function CompleteView({ onClose, onBack }: Props) {
  return (
    <div className={s.container}>
      <div className={s.iconWrapper}>
        <Check size={40} className="text-green-600" strokeWidth={3} />
      </div>
      
      <h2 className={s.title}>위험성평가표 생성 완료!</h2>
      
      <p className={s.desc}>
        모든 절차가 성공적으로 마무리되었습니다.<br/>
        생성된 파일은 <span className={s.highlight}>문서함</span> 또는 <span className={s.highlight}>이메일</span>에서<br/>
        지금 바로 확인하실 수 있습니다.
      </p>
      
      <div className={s.btnGroup}>
        <button className={s.backBtn} onClick={onBack}>
          <ArrowLeft size={18} />
          작성 내용 다시 보기
        </button>
        <button className={s.confirmBtn} onClick={onClose}>
          확인 (닫기)
        </button>
      </div>
    </div>
  );
}