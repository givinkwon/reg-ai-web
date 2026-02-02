'use client';

import React, { useState } from 'react';
// ✅ Headset 대신 MessageCircleQuestion (질문 말풍선) 임포트
// 다른 추천 아이콘: LifeBuoy(구명튜브), MessageSquareText(대화창)
import { MessageCircle, Mail, X, MessageCircleQuestion, Check } from 'lucide-react';
import s from './FloatingSupport.module.css';

export default function FloatingSupport() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const emailAddress = "support@reg.ai.kr"; 

  const toggleOpen = () => setIsOpen(!isOpen);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailAddress);
    setCopied(true);
    
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <div className={s.wrapper}>
      <div className={`${s.menu} ${isOpen ? s.isOpen : ''}`}>
        
        <a
          href="https://pf.kakao.com/_ExjVxcn"
          target="_blank"
          rel="noopener noreferrer"
          className={`${s.actionBtn} ${s.kakao}`}
          title="카카오톡 문의하기"
        >
          <MessageCircle size={24} fill="currentColor" fillOpacity={0.4} />
        </a>

        <button
          onClick={handleCopyEmail}
          className={`${s.actionBtn} ${s.email}`}
          aria-label="이메일 주소 복사"
        >
          <Mail size={24} />
          <span className={`${s.tooltip} ${copied ? s.show : ''}`}>
            {copied ? '주소 복사완료!' : emailAddress}
          </span>
        </button>
      </div>

      <button onClick={toggleOpen} className={s.mainBtn} aria-label="고객센터 메뉴 열기">
        {/* ✅ 아이콘 변경됨: 질문 말풍선 */}
        {isOpen ? <X size={28} /> : <MessageCircleQuestion size={28} />}
      </button>
    </div>
  );
}