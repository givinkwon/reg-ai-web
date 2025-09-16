'use client';

import { ChevronLeft, ChevronDown } from 'lucide-react';
import { useMemo } from 'react';
import { useChatStore } from '@/app/store/chat';
import s from './RightPanel.module.css';

export default function RightPanel() {
  const rightOpen   = useChatStore((st) => st.rightOpen);
  const setRightOpen = useChatStore((st) => st.setRightOpen);
  const data        = useChatStore((st) => st.rightData);

  // ---- 안전 필터링: 제목이 URL이거나 비어있는 아이템 제거, href 기준 중복 제거
  const forms = useMemo(() => {
    const raw = data?.forms ?? [];
    const dedup: Record<string, boolean> = {};
    return raw
      .filter((it) => it && it.title && !/^https?:\/\//i.test(it.title))
      .filter((it) => {
        if (!it.href) return true;
        if (dedup[it.href]) return false;
        dedup[it.href] = true;
        return true;
      });
  }, [data?.forms]);

  const evidence = useMemo(() => data?.evidence ?? [], [data?.evidence]);

  return (
    <>
      {/* overlay */}
      <div
        className={`${s.overlay} ${rightOpen ? s.show : ''}`}
        onClick={() => setRightOpen(false)}
      />

      {/* sheet */}
      <aside className={`${s.sheet} ${rightOpen ? s.open : ''}`}>
        <div className={s.header}>
          <button className={s.backBtn} onClick={() => setRightOpen(false)} aria-label="닫기">
            {/* 요청: 내부 아이콘 흰색 */}
            <ChevronLeft className={s.iconWhite} />
          </button>
          <span className={s.title}>답변 근거</span>
          <ChevronDown className={s.iconGhost} />
        </div>

        <div className={s.body}>
          {/* 근거 */}
          <div className={s.groupTitle}>답변 근거</div>
          {!evidence.length ? (
            <div className={s.emptyBox}>답변에서 근거를 찾지 못했습니다.</div>
          ) : (
            <ul className={s.evList}>
              {evidence.map((it, i) => (
                <li key={`ev-${i}`} className={s.evItem}>
                  <div className={s.evTitle}>
                    {it.href ? (
                      <a
                        href={it.href}
                        className={s.linkA}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="새 탭으로 열기"
                      >
                        {it.title}
                      </a>
                    ) : (
                      it.title
                    )}
                  </div>
                  {it.snippet && <div className={s.evSnippet}>{it.snippet}</div>}
                </li>
              ))}
            </ul>
          )}

          {/* 관련 별표/서식 */}
          <div className={s.groupTitle}>관련 별표/서식</div>
          {!forms.length ? (
            <div className={s.emptyBox}>항목을 선택하면 상세가 표시됩니다.</div>
          ) : (
            <ul className={s.linkList}>
              {forms.map((it, i) => (
                <li key={`form-${i}`} className={s.linkItem}>
                  {it.href ? (
                    <a
                      href={it.href}
                      className={s.linkA}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="새 탭으로 열기"
                    >
                      {it.title}
                    </a>
                  ) : (
                    it.title
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
