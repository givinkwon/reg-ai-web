export type NewsItem = {
  title: string;
  href: string;
};

type ParseOptions = { debug?: boolean };

const fixWeirdUrl = (s: string) =>
  (s || '')
    // https: // 형태 교정
    .replace(/\bhttps\s*:\s*\/\s*\//gi, 'https://')
    .replace(/\bhttp\s*:\s*\/\s*\//gi, 'http://')
    // zero-width 제거
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();

const decodeHtmlEntities = (s: string) =>
  (s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

const stripTagsToText = (html: string) =>
  fixWeirdUrl(
    decodeHtmlEntities(
      (html || '')
        .replace(/<(br|BR)\s*\/?>/g, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/\r/g, ''),
    ),
  );

const cleanTitle = (s: string) =>
  (s || '')
    .replace(/^\s*(?:[-*•]|(?:\d+[\)\.]))\s+/, '') // 불릿/번호 제거
    .replace(/\s+/g, ' ')
    .trim();

const normalizeHref = (raw: string) => {
  let u = fixWeirdUrl(raw);

  // //news... 형태면 https 붙이기
  if (u.startsWith('//')) u = 'https:' + u;

  // /news.google.com/... 형태면 https:// 붙이기
  if (u.startsWith('/news.')) u = 'https://' + u.slice(1);

  // news.google.com/... 형태면 https:// 붙이기
  if (/^news\.google\.com\//i.test(u)) u = 'https://' + u;

  // 끝 문장부호 제거
  u = u.replace(/[)\]\u3009>.,]+$/u, '');

  // URL 객체로 정규화(실패해도 문자열은 유지)
  try {
    const url = new URL(u);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.toString();
  } catch {
    return u;
  }
};

// "번호. 제목 - URL" 패턴
const LINE_RE =
  /^\s*(\d+)\.\s*(.+?)\s*-\s*(https?:\s*\/\/\S+|https?:\/\/\S+|\/\/\S+|\/news\.google\.com\/\S+|news\.google\.com\/\S+)\s*$/i;

// URL만 뽑는 보조 패턴
const URL_RE =
  /(https?:\s*\/\/\S+|https?:\/\/\S+|\/\/\S+|\/news\.google\.com\/\S+|news\.google\.com\/\S+)/i;

/**
 * 입력이 아래 3가지여도 모두 동작:
 * 1) HTML string
 * 2) JSON 배열 문자열: ["...", "1. ... - https: //..."]
 * 3) 그냥 텍스트
 */
export function parseNewsItemsFromHtml(
  input: string | undefined | null,
  opts: ParseOptions = {},
): NewsItem[] {
  const debug = !!opts.debug;
  const log = (...args: any[]) => debug && console.log(...args);

  if (!input) return [];

  let raw = input;

  // ✅ (핵심) JSON 배열 문자열이면 파싱해서 줄바꿈으로 합침
  // 예: '["참고 기사 목록", "1. ... - https: //..."]'
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      raw = parsed.join('\n');
      log('[parse] detected JSON array -> joined lines');
    }
  } catch {
    // JSON 아니면 무시
  }

  // HTML일 수도 있고, 그냥 텍스트일 수도 있으니 태그 제거해서 텍스트화
  const text = stripTagsToText(raw);

  const lines = text
    .split('\n')
    .map((l) => fixWeirdUrl(l.trim()))
    .filter(Boolean);

  log('[parse] lines:', lines.length);
  log('[parse] preview lines:', lines.slice(0, 8));

  const items: NewsItem[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    // 헤더/설명 제거
    if (line === '참고 기사 목록') continue;
    if (line.includes('원번호 그대로 유지')) continue;

    const m = line.match(LINE_RE);

    // 1) 정석 패턴(번호. 제목 - URL)
    if (m) {
      const titleRaw = m[2];
      const urlRaw = m[3];

      const href = normalizeHref(urlRaw);
      if (!href || seen.has(href)) continue;
      seen.add(href);

      const title = cleanTitle(titleRaw) || href;
      items.push({ title, href });
      continue;
    }

    // 2) 보조: URL만 찾아서, URL 앞을 title로
    const um = line.match(URL_RE);
    if (!um) continue;

    const href = normalizeHref(um[1]);
    if (!href || seen.has(href)) continue;
    seen.add(href);

    const idx = line.indexOf(um[1]);
    let titlePart = (idx >= 0 ? line.slice(0, idx) : line).trim();
    titlePart = titlePart.replace(/^\d+\.\s*/, '').trim();
    titlePart = titlePart.replace(/[-–—:]\s*$/, '').trim();

    const title = cleanTitle(titlePart) || href;
    items.push({ title, href });
  }

  log('[parse] items:', items.length, items.slice(0, 3));
  return items;
}
