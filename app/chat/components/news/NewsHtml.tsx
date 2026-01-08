// app/chat/components/modals/newsHtml.ts

/** summary div만 추출 (없으면 html 전체를 반환) */
export const extractSafetySummaryHtml = (html: string) => {
    const match = html.match(/<div[^>]+data-section="summary"[^>]*>([\s\S]*?)<\/div>/);
    if (!match) return html;
    return match[0];
  };
  
  /** articles div만 추출 (없으면 빈 문자열) */
  export const extractSafetyArticlesHtml = (html: string) => {
    const match = html.match(/<div[^>]+data-section="articles"[^>]*>([\s\S]*?)<\/div>/);
    if (!match) return '';
    const cleaned = match[0].replace(/display\s*:\s*none\s*;?/i, '');
    // 기존 RightPanel에서 하던 것처럼 헤더를 붙여주고 싶으면:
    return `<div><h3 style="margin:0 0 10px; font-size:14px; font-weight:800;">참고 기사 목록</h3>${cleaned}</div>`;
  };
  
  /** digest 텍스트를 (요약/기사)로 나누는 fallback (네 기존 로직 있으면 교체) */
  export const splitDigestForArticles = (digest: string) => {
    // 아주 단순: "참고 기사" 같은 섹션이 있으면 거기서 분리
    const idx =
      digest.indexOf('참고 기사') >= 0
        ? digest.indexOf('참고 기사')
        : digest.indexOf('기사') >= 0
          ? digest.indexOf('기사')
          : -1;
  
    if (idx < 0) return { summaryText: digest, articlesText: '' };
  
    return {
      summaryText: digest.slice(0, idx).trim(),
      articlesText: digest.slice(idx).trim(),
    };
  };
  