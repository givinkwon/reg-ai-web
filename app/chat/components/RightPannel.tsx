'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { useChatStore } from '@/app/store/chat';
import s from './RightPanel.module.css';

/* =========================
 * 뉴스(참고 기사) 파서
 * ========================= */

type NewsItem = {
  title: string;
  href: string;
};

function parseNewsItems(html: string | undefined | null): NewsItem[] {
  if (!html) return [];

  // 1) <br> → 개행, 나머지 태그 제거
  let text = html
    .replace(/<(br|BR)\s*\/?>/g, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '');

  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: NewsItem[] = [];
  const seen = new Set<string>();

  for (const raw of lines) {
    // "참고 기사 목록" 헤더 라인은 스킵
    if (/^#*\s*참고\s*기사\s*목록/.test(raw)) continue;

    const urlMatch = raw.match(/https?:\/\/\S+/i);
    if (!urlMatch) continue;

    let href = urlMatch[0];

    // URL 뒤에 붙은 괄호/쉼표/마침표 등 꼬리문자 삭제
    href = href.replace(/[)\]\u3009>.,]+$/u, '');

    if (seen.has(href)) continue; // ✅ 중복 URL 제거
    seen.add(href);

    // URL 앞부분 = 제목 후보
    let beforeUrl = raw.slice(0, urlMatch.index ?? raw.length).trim();

    // "제목 - " 꼴이면 끝의 대시 제거
    beforeUrl = beforeUrl.replace(/[-–—]\s*$/, '').trim();

    // "1. ", "1) " 같은 번호 제거
    beforeUrl = beforeUrl.replace(/^\d+\s*[.)]\s*/, '').trim();

    const title = beforeUrl || href;

    items.push({ title, href });
  }

  return items;
}

/* =========================
 * 컴포넌트
 * ========================= */

export default function RightPanel() {
  const rightOpen    = useChatStore((st) => st.rightOpen);
  const setRightOpen = useChatStore((st) => st.setRightOpen);
  const data         = useChatStore((st) => st.rightData);

  const isNewsMode = data?.mode === 'news';

  // SSR/CSR 불일치 방지용
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 열렸을 때 바디 스크롤 잠금
  useEffect(() => {
    if (!mounted) return;
    if (rightOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [rightOpen, mounted]);

  // ---- 뉴스용 데이터 (제목/링크 리스트)
  const newsItems = useMemo(
    () => (isNewsMode ? parseNewsItems(data?.newsHtml ?? data?.rawHtml ?? '') : []),
    [isNewsMode, data?.newsHtml, data?.rawHtml],
  );

  // ---- 기존 근거/서식용 데이터
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

  const panelTitle = isNewsMode ? '참고 기사 목록' : '답변 근거';

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
        aria-label={panelTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.header}>
          <button
            type="button"
            className={s.backBtn}
            onClick={() => setRightOpen(false)}
            aria-label="닫기"
          >
            <ChevronLeft
              color="#ffffff" 
              className={s.iconWhite}
              size={18}
              strokeWidth={2}
              aria-hidden
            />
          </button>
          <span className={s.title}>{panelTitle}</span>
          <ChevronDown className={s.iconGhost} aria-hidden />
        </div>

        <div className={s.body}>
          {/* =========================
           * 1) 뉴스 모드 (참고 기사 목록)
           * ========================= */}
          {isNewsMode ? (
            <>
              <div className={s.groupTitle}>참고 기사 목록</div>
              {!newsItems.length ? (
                <div className={s.emptyBox}>
                  참고 기사 목록을 불러오지 못했습니다.
                </div>
              ) : (
                <ul className={s.newsList}>
                  {newsItems.map((item, idx) => (
                    <li key={item.href} className={s.newsItem}>
                      <a
                        href={item.href}
                        className={s.newsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className={s.newsIndex}>{idx + 1}.</span>
                        <span className={s.newsTitle}>{item.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              {/* =========================
               * 2) 기본 모드 (근거 / 서식)
               * ========================= */}
              <div className={s.groupTitle}>답변 근거</div>
              {!evidence.length ? (
                <div className={s.emptyBox}>
                  답변에서 근거를 찾지 못했습니다.
                </div>
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
                      {it.snippet && (
                        <div className={s.evSnippet}>{it.snippet}</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className={s.groupTitle}>관련 별표/서식</div>
              {!forms.length ? (
                <div className={s.emptyBox}>
                  항목을 선택하면 상세가 표시됩니다.
                </div>
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
            </>
          )}
        </div>
      </aside>
    </>
  );

  // 포털로 최상위(body)에 렌더 → 모바일 쌓임 맥락 문제 방지
  return createPortal(panel, document.body);
}
