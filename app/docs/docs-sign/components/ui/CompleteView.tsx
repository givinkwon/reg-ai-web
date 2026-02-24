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
      
      {/* 🚀 기획서 반영: 타이틀 변경 */}
      <h2 className={s.title}>서명 발송 완료!</h2>
      
      {/* 🚀 흐름 반영: 문서 생성이 아니라 '발송'이므로 그에 맞게 안내 문구 수정 */}
      <p className={s.desc}>
        모든 대상자에게 서명 요청 알림톡이 성공적으로 발송되었습니다.<br/>
        서명 진행 현황은 <span className={s.highlight}>문서함</span>에서<br/>
        실시간으로 확인하실 수 있습니다.
      </p>
      
      <div className={s.btnGroup}>
        <button className={s.backBtn} onClick={onBack}>
          <ArrowLeft size={18} />
          내용 다시 보기
        </button>
        <button className={s.confirmBtn} onClick={onClose}>
          확인 (닫기)
        </button>
      </div>
    </div>
  );
}