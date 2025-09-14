'use client';

import { ChevronLeft, ChevronDown } from 'lucide-react';
import { useChatStore } from '@/app/store/chat';
import s from './RightPanel.module.css';

export default function RightPanel() {
  const rightOpen = useChatStore((st) => st.rightOpen);
  const setRightOpen = useChatStore((st) => st.setRightOpen);

  return (
    <>
      {/* ✅ 오버레이 (열렸을 때만) */}
      <div
        className={`${s.overlay} ${rightOpen ? s.show : ''}`}
        onClick={() => setRightOpen(false)}
      />

      {/* ✅ 오른쪽에서 슬라이드 인 */}
      <aside className={`${s.sheet} ${rightOpen ? s.open : ''}`}>
        <div className={s.header}>
          <button className={s.backBtn} onClick={() => setRightOpen(false)} aria-label="닫기">
            <ChevronLeft className={s.icon} />
          </button>
          <span className={s.title}>답변 근거</span>
          <ChevronDown className={s.iconGhost} />
        </div>

        <div className={s.body}>
          {/* 이 영역에 근거/링크 리스트 컴포넌트가 들어가면 됨 */}
          <div className={s.groupTitle}>답변 근거</div>
          <ul className={s.linkList}>
            <li className={s.linkItem}>[산업안전보건법] 제110조 …</li>
            <li className={s.linkItem}>[시행규칙] 제156조 …</li>
            <li className={s.linkItem}>[시행규칙] 제157조 …</li>
            <li className={s.linkItem}>[고용노동부 고시] 제2025-50호 …</li>
          </ul>

          <div className={s.groupTitle}>관련 별표/서식</div>
          <div className={s.emptyBox}>항목을 선택하면 상세가 표시됩니다.</div>
        </div>
      </aside>
    </>
  );
}
