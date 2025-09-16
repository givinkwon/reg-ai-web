'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { useChatStore } from '@/app/store/chat';
import s from './RightPanel.module.css';

export default function RightPanel() {
  const rightOpen     = useChatStore((st) => st.rightOpen);
  const setRightOpen  = useChatStore((st) => st.setRightOpen);
  const data          = useChatStore((st) => st.rightData);

  // SSR/CSR 불일치 방지용
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 열렸을 때 바디 스크롤 잠금
  useEffect(() => {
    if (!mounted) return;
    if (rightOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [rightOpen, mounted]);

  // ---- 안전 필터링: 제목이 URL이거나 비어있으면 제거, href 기준 중복 제거
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

  if (!mounted) return null;

  const panel = (
    <>
      {/* overlay */}
      <div
        className={`${s.overlay} ${rightOpen ? s.show : ''}`}
        aria-hidden={!rightOpen}
        onClick={() => setRightOpen(false)}
      />

      {/* sheet */}
      <aside
        className={`${s.sheet} ${rightOpen ? s.open : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="답변 근거 및 관련 별표/서식"
        onClick={(e) => e.stopPropagation()} // 내부 클릭 시 오버레이로 전파 방지
      >
        <div className={s.header}>
          <button
            type="button"
            className={s.backBtn}
            onClick={() => setRightOpen(false)}
            aria-label="닫기"
          >
            ←
            <ChevronLeft
              className={s.iconWhite}
              size={18}           // 크기 명시
              strokeWidth={2}
              aria-hidden
            />
          </button>
          <span className={s.title}>답변 근거</span>
          <ChevronDown className={s.iconGhost} aria-hidden />
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
                        onClick={(e) => e.stopPropagation()}
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
                      onClick={(e) => e.stopPropagation()}
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

  // 포털로 최상위(body)에 렌더 → 모바일 쌓임 맥락 문제 방지
  return createPortal(panel, document.body);
}
