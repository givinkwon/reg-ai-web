// app/chat/components/modals/newsItems.ts

export type NewsItem = {
    title: string;
    href: string;
  };
  
  const normalizeUrl = (u: string) => {
    if (!u) return u;
    let clean = u.replace(/[)\]\u3009>.,]+$/u, '');
    try {
      const url = new URL(clean);
      url.protocol = 'https:'; // http도 https로 통일하고 싶으면
      return url.toString();
    } catch {
      return clean;
    }
  };
  
  const decodeHtmlEntities = (s: string) =>
    (s || '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  
  const stripTagsToText = (html: string) => {
    let text = html
      .replace(/<(br|BR)\s*\/?>/g, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, '');
    return decodeHtmlEntities(text);
  };
  
  const cleanTitle = (s: string) =>
    (s || '')
      .replace(/^\s*(?:[-*•]|(?:\d+[\)\.]))\s+/, '') // 불릿/번호
      .replace(/[-–—]\s*$/, '') // 뒤의 대시
      .replace(/\s+/g, ' ')
      .trim();
  
  /**
   * articlesHtml(또는 rawHtml)에서 "참고 기사 목록" 아이템 파싱
   * - 1) a 태그 우선
   * - 2) fallback: 텍스트 라인 + URL
   */
  export function parseNewsItemsFromHtml(html: string | undefined | null): NewsItem[] {
    if (!html) return [];
  
    const items: NewsItem[] = [];
    const seen = new Set<string>();
  
    // 1) a 태그 기반 파싱 (가장 정확)
    const aRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = aRe.exec(html)) !== null) {
      const href = normalizeUrl(m[1].trim());
      if (!href || seen.has(href)) continue;
      seen.add(href);
  
      const title = cleanTitle(m[2].replace(/<[^>]+>/g, ''));
      items.push({ title: title || href, href });
    }
  
    if (items.length) return items;
  
    // 2) fallback: 텍스트 + URL
    const text = stripTagsToText(html);
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  
    for (const raw of lines) {
      if (/^#*\s*참고\s*기사\s*목록/i.test(raw)) continue;
  
      const urlMatch = raw.match(/https?:\/\/\S+/i);
      if (!urlMatch) continue;
  
      let href = normalizeUrl(urlMatch[0]);
      if (seen.has(href)) continue;
      seen.add(href);
  
      let beforeUrl = raw.slice(0, urlMatch.index ?? raw.length).trim();
      beforeUrl = beforeUrl.replace(/^\d+\s*[.)]\s*/, '').trim(); // 번호 제거
      beforeUrl = beforeUrl.replace(/[-–—]\s*$/, '').trim(); // 끝 대시 제거
  
      const title = cleanTitle(beforeUrl) || href;
      items.push({ title, href });
    }
  
    return items;
  }
  