'use client';

import React, { useState } from 'react';
import { MessageCircle, Mail, X, MessageCircleQuestion } from 'lucide-react';
import s from './FloatingSupport.module.css';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context 정의
// page: 'Common' (공통), section: 'FloatingSupport' (플로팅 버튼), area: 'Support' (고객지원)
const GA_CTX = { page: 'Common', section: 'FloatingSupport', area: 'Support' } as const;

export default function FloatingSupport() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const emailAddress = "support@reg.ai.kr"; 

  // ✅ GA: 메뉴 열기/닫기 트래킹
  const toggleOpen = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);

    track(gaEvent(GA_CTX, 'ToggleMenu'), {
      ui_id: gaUiId(GA_CTX, 'MainButton'),
      action: nextState ? 'open' : 'close', // 열림/닫힘 상태 기록
    });
  };

  // ✅ GA: 이메일 복사 트래킹
  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailAddress);
    setCopied(true);
    
    track(gaEvent(GA_CTX, 'CopyEmail'), {
      ui_id: gaUiId(GA_CTX, 'CopyEmail'),
      target_email: emailAddress,
    });

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  // ✅ GA: 카카오톡 클릭 트래킹 핸들러
  const handleClickKakao = () => {
    track(gaEvent(GA_CTX, 'ClickKakao'), {
      ui_id: gaUiId(GA_CTX, 'ClickKakao'),
      target_url: 'https://pf.kakao.com/_ExjVxcn',
    });
  };

  return (
    <div className={s.wrapper}>
      <div className={`${s.menu} ${isOpen ? s.isOpen : ''}`}>
        
        {/* 1. 카카오톡 문의 버튼 */}
        <a
          href="https://pf.kakao.com/_ExjVxcn"
          target="_blank"
          rel="noopener noreferrer"
          className={`${s.actionBtn} ${s.kakao}`}
          title="카카오톡 문의하기"
          onClick={handleClickKakao}
          // ✅ GA Data Attributes 추가
          data-ga-event="ClickKakao"
          data-ga-id={gaUiId(GA_CTX, 'ClickKakao')}
          data-ga-label="카카오톡 문의하기 버튼"
        >
          <MessageCircle size={24} fill="currentColor" fillOpacity={0.4} />
        </a>

        {/* 2. 이메일 복사 버튼 */}
        <button
          onClick={handleCopyEmail}
          className={`${s.actionBtn} ${s.email}`}
          aria-label="이메일 주소 복사"
          // ✅ GA Data Attributes 추가
          data-ga-event="CopyEmail"
          data-ga-id={gaUiId(GA_CTX, 'CopyEmail')}
          data-ga-label="이메일 주소 복사 버튼"
        >
          <Mail size={24} />
          <span className={`${s.tooltip} ${copied ? s.show : ''}`}>
            {copied ? '주소 복사완료!' : emailAddress}
          </span>
        </button>
      </div>

      {/* 3. 메인 플로팅 버튼 */}
      <button 
        onClick={toggleOpen} 
        className={s.mainBtn} 
        aria-label="고객센터 메뉴 열기"
        // ✅ GA Data Attributes 추가
        data-ga-event="ToggleMenu"
        data-ga-id={gaUiId(GA_CTX, 'MainButton')}
        data-ga-label="고객센터 메뉴 토글 버튼"
      >
        {isOpen ? <X size={28} /> : <MessageCircleQuestion size={28} />}
      </button>
    </div>
  );
}