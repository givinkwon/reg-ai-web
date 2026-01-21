'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronDown } from 'lucide-react';
import { useChatStore } from '@/app/store/chat';
import s from './RightPanel.module.css';

// ✅ GA
import { track } from '@/app/lib/ga/ga';
import { gaEvent, gaUiId } from '@/app/lib/ga/naming';

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

  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

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
 * 입법예고(참고 입법예고 목록) 파서
 * ========================= */

function parseLawNoticeItems(html: string | undefined | null): NewsItem[] {
  if (!html) return [];

  const items: NewsItem[] = [];
  const seen = new Set<string>();

  // 1) 먼저 a 태그 기반으로 시도
  const aRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = aRe.exec(html)) !== null) {
    let href = m[1].trim();
    if (!href || seen.has(href)) continue;
    seen.add(href);

    let title = m[2].replace(/<[^>]+>/g, '').trim();
    if (!title) title = href;

    items.push({ title, href });
  }

  if (items.length > 0) return items;

  // 2) fallback: 텍스트 + URL 패턴
  let text = html
    .replace(/<(br|BR)\s*\/?>/g, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '');

  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const raw of lines) {
    // "참고 입법예고 목록" 헤더는 스킵
    if (/^#*\s*참고\s*입법예고\s*목록/.test(raw)) continue;

    // 예시:
    // 1. 제목 (입법예고기간: 2025-10-02~2025-11-11, URL: https://www.moleg.go.kr/....)
    const m2 = raw.match(/^\d+\.\s*(.+?)\s*\((?:입법예고기간:[^,]*,)?\s*URL:\s*([^)]+)\)/);
    if (!m2) continue;

    let title = m2[1].trim();
    let href = m2[2].trim().replace(/[)\]\u3009>.,]+$/u, '');

    if (!href || seen.has(href)) continue;
    seen.add(href);

    if (!title) title = href;

    items.push({ title, href });
  }

  return items;
}

/* =========================
 * 사고사례 파서
 * ========================= */

type AccidentCase = {
  title: string;
  body: string;
};

function parseAccidentCases(html: string | undefined | null): AccidentCase[] {
  if (!html) return [];

  // 1) HTML → 텍스트
  let text = html
    .replace(/<(br|BR)\s*\/?>/g, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '');

  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

  // 2) "5) 참고 사고사례" 섹션만 잘라내기
  const idx = text.indexOf('5) 참고 사고사례');
  if (idx === -1) return [];

  const afterTitle = text.slice(idx).split('\n').slice(1); // 제목 줄 한 줄 스킵

  const cases: AccidentCase[] = [];
  let currentTitle = '';
  let currentBody: string[] = [];

  for (const rawLine of afterTitle) {
    const line = rawLine.trim();
    if (!line) continue;

    // 6) ~, 7) ~ 같은 다음 번호 섹션이 나오면 종료
    if (/^\d+\)\s/.test(line) && !line.startsWith('5)')) {
      break;
    }

    // "- [사고사례 1] 제목: ..." 형태의 새 케이스 시작
    if (/^[-•]\s*\[?사고사례\s*\d+\]?/.test(line)) {
      // 이전 케이스 flush
      if (currentTitle) {
        cases.push({
          title: currentTitle,
          body: currentBody.join(' '),
        });
        currentBody = [];
      }

      // 제목 부분만 뽑기
      const m = line.match(/사고사례\s*\d+\]?\s*제목[:：]?\s*(.+)$/);
      const titleText = m ? m[1].trim() : line.replace(/^[-•]\s*/, '');

      currentTitle = titleText;
    } else {
      // 본문 라인
      if (!currentTitle) continue;
      currentBody.push(line);
    }
  }

  // 마지막 케이스 flush
  if (currentTitle) {
    cases.push({
      title: currentTitle,
      body: currentBody.join(' '),
    });
  }

  return cases;
}

/* =========================
 * 컴포넌트
 * ========================= */

const GA_CTX = {
  page: 'Chat',
  section: 'RightPanel',
  component: 'RightPanel',
} as const;

function modeName(mode: any): 'news' | 'lawNotice' | 'accident' | 'evidence' {
  if (mode === 'news') return 'news';
  if (mode === 'lawNotice') return 'lawNotice';
  if (mode === 'accident') return 'accident';
  return 'evidence';
}

export default function RightPanel() {
  const rightOpen = useChatStore((st) => st.rightOpen);
  const setRightOpen = useChatStore((st) => st.setRightOpen);
  const data = useChatStore((st) => st.rightData);

  const isNewsMode = data?.mode === 'news';
  const isLawNoticeMode = data?.mode === 'lawNotice';
  const isAccidentMode = data?.mode === 'accident';

  const mode = modeName(data?.mode);

  // SSR/CSR 불일치 방지용
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ✅ GA: open/close 트래킹 (상태 변화 기준)
  useEffect(() => {
    if (!mounted) return;

    if (rightOpen) {
      track(gaEvent(GA_CTX, 'Open'), {
        ui_id: gaUiId(GA_CTX, 'Open'),
        mode,
      });
    } else {
      track(gaEvent(GA_CTX, 'Close'), {
        ui_id: gaUiId(GA_CTX, 'Close'),
        mode,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightOpen, mounted, mode]);

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

  // ---- 입법예고용 데이터 (제목/링크 리스트)
  const lawNoticeItems = useMemo(
    () => (isLawNoticeMode ? parseLawNoticeItems(data?.newsHtml ?? data?.rawHtml ?? '') : []),
    [isLawNoticeMode, data?.newsHtml, data?.rawHtml],
  );

  // ---- 사고사례용 데이터
  const accidentCases = useMemo(
    () => (isAccidentMode ? parseAccidentCases(data?.newsHtml ?? data?.rawHtml ?? '') : []),
    [isAccidentMode, data?.newsHtml, data?.rawHtml],
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

  const panelTitle = isNewsMode
    ? '참고 기사 목록'
    : isLawNoticeMode
    ? '참고 입법예고 목록'
    : isAccidentMode
    ? '참고 사고사례'
    : '답변 근거';

  const closeByOverlay = () => {
    track(gaEvent(GA_CTX, 'ClickOverlayClose'), {
      ui_id: gaUiId(GA_CTX, 'ClickOverlayClose'),
      mode,
    });
    setRightOpen(false);
  };

  const closeByBackBtn = () => {
    track(gaEvent(GA_CTX, 'ClickBackClose'), {
      ui_id: gaUiId(GA_CTX, 'ClickBackClose'),
      mode,
    });
    setRightOpen(false);
  };

  const panel = (
    <>
      {/* overlay */}
      <div
        className={`${s.overlay} ${rightOpen ? s.show : ''}`}
        aria-hidden={!rightOpen}
        onClick={closeByOverlay}
        data-ga-event={gaEvent(GA_CTX, 'Overlay')}
        data-ga-id={gaUiId(GA_CTX, 'Overlay')}
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
            onClick={closeByBackBtn}
            aria-label="닫기"
            data-ga-event={gaEvent(GA_CTX, 'ClickBackClose')}
            data-ga-id={gaUiId(GA_CTX, 'ClickBackClose')}
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
                <div className={s.emptyBox}>참고 기사 목록을 불러오지 못했습니다.</div>
              ) : (
                <ul className={s.newsList}>
                  {newsItems.map((item, idx) => (
                    <li key={item.href} className={s.newsItem}>
                      <a
                        href={item.href}
                        className={s.newsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                          track(gaEvent(GA_CTX, 'ClickNewsLink'), {
                            ui_id: gaUiId(GA_CTX, 'ClickNewsLink'),
                            mode,
                            index: idx + 1,
                            href: item.href,
                            title: item.title,
                          });
                        }}
                        data-ga-event={gaEvent(GA_CTX, 'ClickNewsLink')}
                        data-ga-id={gaUiId(GA_CTX, 'ClickNewsLink')}
                      >
                        <span className={s.newsIndex}>{idx + 1}.</span>
                        <span className={s.newsTitle}>{item.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : isLawNoticeMode ? (
            <>
              {/* =========================
               * 2) 입법예고 모드 (참고 입법예고 목록)
               * ========================= */}
              <div className={s.groupTitle}>참고 입법예고 목록</div>
              {!lawNoticeItems.length ? (
                <div className={s.emptyBox}>참고 입법예고 목록을 불러오지 못했습니다.</div>
              ) : (
                <ul className={s.newsList}>
                  {lawNoticeItems.map((item, idx) => (
                    <li key={item.href} className={s.newsItem}>
                      <a
                        href={item.href}
                        className={s.newsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                          track(gaEvent(GA_CTX, 'ClickLawNoticeLink'), {
                            ui_id: gaUiId(GA_CTX, 'ClickLawNoticeLink'),
                            mode,
                            index: idx + 1,
                            href: item.href,
                            title: item.title,
                          });
                        }}
                        data-ga-event={gaEvent(GA_CTX, 'ClickLawNoticeLink')}
                        data-ga-id={gaUiId(GA_CTX, 'ClickLawNoticeLink')}
                      >
                        <span className={s.newsIndex}>{idx + 1}.</span>
                        <span className={s.newsTitle}>{item.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : isAccidentMode ? (
            <>
              <div className={s.groupTitle}>참고 사고사례</div>
              {!accidentCases.length ? (
                <div className={s.emptyBox}>참고 사고사례를 찾지 못했습니다.</div>
              ) : (
                <ul className={s.newsList}>
                  {accidentCases.map((item, idx) => (
                    <li
                      key={idx}
                      className={s.newsItem}
                      data-ga-event={gaEvent(GA_CTX, 'ViewAccidentCase')}
                      data-ga-id={gaUiId(GA_CTX, 'ViewAccidentCase')}
                      // ✅ 화면에 보일 때까지 정확히 트래킹하려면 IntersectionObserver가 필요하지만,
                      // 여기서는 "렌더된 목록 기준"으로 최소 트래킹만 남김.
                    >
                      <div className={s.newsLink}>
                        <span className={s.newsIndex}>{idx + 1}.</span>
                        <span className={s.newsTitle}>{item.title}</span>
                      </div>
                      {item.body && <div className={s.evSnippet}>{item.body}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <>
              {/* ✅ 기본 모드: 답변 근거 + 관련 별표/서식만 표시 */}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              track(gaEvent(GA_CTX, 'ClickEvidenceLink'), {
                                ui_id: gaUiId(GA_CTX, 'ClickEvidenceLink'),
                                mode,
                                index: i + 1,
                                href: it.href,
                                title: it.title,
                              });
                            }}
                            data-ga-event={gaEvent(GA_CTX, 'ClickEvidenceLink')}
                            data-ga-id={gaUiId(GA_CTX, 'ClickEvidenceLink')}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            track(gaEvent(GA_CTX, 'ClickFormLink'), {
                              ui_id: gaUiId(GA_CTX, 'ClickFormLink'),
                              mode,
                              index: i + 1,
                              href: it.href,
                              title: it.title,
                            });
                          }}
                          data-ga-event={gaEvent(GA_CTX, 'ClickFormLink')}
                          data-ga-id={gaUiId(GA_CTX, 'ClickFormLink')}
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
