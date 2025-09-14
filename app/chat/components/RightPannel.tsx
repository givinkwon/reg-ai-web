'use client';

import { ChevronLeft, ChevronDown, ExternalLink } from 'lucide-react';
import { useChatStore } from '@/app/store/chat';
import s from './RightPanel.module.css';

export default function RightPanel() {
  const rightOpen    = useChatStore((st) => st.rightOpen);
  const setRightOpen = useChatStore((st) => st.setRightOpen);
  const rightData    = useChatStore((st) => st.rightData); // ✅ 파싱 결과

  const evidence = rightData?.evidence ?? [];
  const forms    = rightData?.forms ?? [];

  return (
    <>
      {/* 오버레이 */}
      <div
        className={`${s.overlay} ${rightOpen ? s.show : ''}`}
        onClick={() => setRightOpen(false)}
      />

      {/* 오른쪽 시트 */}
      <aside className={`${s.sheet} ${rightOpen ? s.open : ''}`}>
        <div className={s.header}>
          {/* ▶ 흰색 아이콘 버튼 */}
          <button
            className={s.backBtn}
            onClick={() => setRightOpen(false)}
            aria-label="닫기"
          >
            <ChevronLeft className={s.backIcon} />
          </button>

          <span className={s.title}>답변 근거</span>
          {/* 균형용 더미 아이콘 */}
          <ChevronDown className={s.iconGhost} />
        </div>

        <div className={s.body}>
          {/* ====== 근거 섹션 ====== */}
          <div className={s.groupTitle}>답변 근거</div>
          {evidence.length > 0 ? (
            <ul className={s.linkList}>
              {evidence.map((it, idx) => (
                <li key={`${it.title}-${idx}`} className={s.linkItem}>
                  {it.href ? (
                    <a
                      className={s.row}
                      href={it.href}
                      target="_blank"
                      rel="noreferrer"
                      title={it.href}
                    >
                      <span className={s.linkText}>{it.title}</span>
                      <ExternalLink className={s.linkIcon} />
                    </a>
                  ) : (
                    <div className={s.row}>
                      <span className={s.linkText}>{it.title}</span>
                    </div>
                  )}
                  {it.snippet && <p className={s.snippet}>{it.snippet}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <div className={s.emptyBox}>파싱된 근거 항목이 없습니다.</div>
          )}

          {/* ====== 관련 별표/서식 섹션 ====== */}
          <div className={s.groupTitle}>관련 별표/서식</div>
          {forms.length > 0 ? (
            <ul className={s.linkList}>
              {forms.map((it, idx) => (
                <li key={`${it.title}-${idx}`} className={s.linkItem}>
                  {it.href ? (
                    <a
                      className={s.row}
                      href={it.href}
                      target="_blank"
                      rel="noreferrer"
                      title={it.href}
                    >
                      <span className={s.linkText}>{it.title}</span>
                      <ExternalLink className={s.linkIcon} />
                    </a>
                  ) : (
                    <div className={s.row}>
                      <span className={s.linkText}>{it.title}</span>
                    </div>
                  )}
                  {it.snippet && <p className={s.snippet}>{it.snippet}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <div className={s.emptyBox}>항목을 선택하면 상세가 표시됩니다.</div>
          )}
        </div>
      </aside>
    </>
  );
}
