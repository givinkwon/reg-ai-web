'use client';

import React, { useState } from 'react';
import { MessageCircle, Mail, Copy, Check } from 'lucide-react'; 
import s from './Footer.module.css';

// ✅ GA Imports
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

// ✅ GA Context 정의
const GA_CTX = { page: 'Common', section: 'Footer', area: 'Contact' } as const;

export default function Footer() {
  const [copied, setCopied] = useState(false);
  const emailAddress = "support@reg.ai.kr";

  // ✅ GA: 이메일 복사 트래킹 및 복사 로직
  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailAddress);
    setCopied(true);
    
    // GA 트래킹 (함수 호출)
    track(gaEvent(GA_CTX, 'CopyEmail'), {
      ui_id: gaUiId(GA_CTX, 'CopyEmail'),
      target_email: emailAddress,
      action: 'clipboard_copy',
    });

    // 2초 뒤에 다시 원래 아이콘으로 복귀
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  // ✅ GA: 카카오톡 문의 클릭 트래킹
  const handleClickKakao = () => {
    track(gaEvent(GA_CTX, 'ClickKakao'), {
      ui_id: gaUiId(GA_CTX, 'ClickKakao'),
      target_url: 'https://pf.kakao.com/_ExjVxcn',
      label: 'KakaoTalk Channel',
    });
  };

  return (
    <footer className={s.footer}>
      <div className={s.container}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            서비스 이용 중 궁금한 점이 있으신가요?
          </h3>
          <p className={s.message}>
            언제든 편하게 문의해 주세요. 신속하게 답변 드리겠습니다.
          </p>
        </div>

        <div className={s.buttonGroup}>
          {/* 1. 카카오톡 1:1 문의 */}
          <a 
            href="https://pf.kakao.com/_ExjVxcn" 
            target="_blank" 
            rel="noopener noreferrer"
            className={`${s.contactBtn} ${s.kakao}`}
            onClick={handleClickKakao}
            // ✅ GA Data Attributes 추가
            data-ga-event="ClickKakao"
            data-ga-id={gaUiId(GA_CTX, 'ClickKakao')}
            data-ga-label="카카오톡 문의하기 버튼"
          >
            <MessageCircle size={20} fill="currentColor" fillOpacity={0.4} />
            카카오톡 문의하기
          </a>

          {/* 2. 이메일 (복사) */}
          <button 
            onClick={handleCopyEmail}
            className={`${s.contactBtn} ${s.email}`}
            title="클릭하여 이메일 주소 복사"
            // ✅ GA Data Attributes 추가
            data-ga-event="CopyEmail"
            data-ga-id={gaUiId(GA_CTX, 'CopyEmail')}
            data-ga-label="이메일 주소 복사 버튼"
          >
            <Mail size={20} />
            <span className={s.emailText}>{emailAddress}</span>
            <div className={s.copyIcon}>
              {copied ? <Check size={16} color="#10B981" /> : <Copy size={16} color="#999" />}
            </div>
          </button>
        </div>

        <p className={s.copyright}>
          © {new Date().getFullYear()} REG AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}