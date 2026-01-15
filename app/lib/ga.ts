// lib/ga.ts
export type GaBaseParams = Record<string, any>;

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

const isProd = process.env.NODE_ENV === 'production';

function safeJsonParse(v?: string) {
  if (!v) return undefined;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

/**
 * ✅ GTM 중심: dataLayer로 이벤트를 보내면
 * GTM에서 GA4/Ads로 라우팅 가능
 */
export function dlPush(event: string, params: GaBaseParams = {}) {
  if (typeof window === 'undefined') return;
  if (!isProd) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event,
    ...params,
  });
}

/**
 * ✅ 공용 이벤트 전송 함수
 */
export function track(eventName: string, params: GaBaseParams = {}) {
  dlPush(eventName, params);
}

/**
 * ✅ 클릭 이벤트 표준화
 */
export function trackClick(params: {
  ui_id: string;
  ui_label?: string;
  ui_text?: string;
  ui_href?: string;
  page_path?: string;
  value?: number;
  extra?: GaBaseParams;
}) {
  const { ui_id, ui_label, ui_text, ui_href, page_path, value, extra } = params;

  track('ui_click', {
    ui_id,
    ui_label,
    ui_text,
    ui_href,
    page_path,
    ...(value !== undefined ? { value } : {}),
    ...(extra || {}),
  });
}

/**
 * ✅ App Router 페이지 이동(PageView) 표준화
 * (GTM에서 "virtual_page_view" 커스텀 이벤트로 트리거 걸기 쉬움)
 */
export function trackPageView(params: {
  page_path: string;
  page_location?: string;
  page_title?: string;
  extra?: GaBaseParams;
}) {
  const { page_path, page_location, page_title, extra } = params;

  track('virtual_page_view', {
    page_path,
    page_location,
    page_title,
    ...(extra || {}),
  });
}

/**
 * ✅ data- 속성 기반 옵션 파서(필요시 외부에서도 사용 가능)
 */
export function parseDatasetParams(dataset: DOMStringMap) {
  const eventName = (dataset.gaEvent || 'ui_click').trim();
  const uiId = (dataset.gaId || '').trim();
  const label = dataset.gaLabel?.trim();
  const text = dataset.gaText?.trim();
  const valueRaw = dataset.gaValue;
  const value =
    valueRaw && !Number.isNaN(Number(valueRaw)) ? Number(valueRaw) : undefined;

  // data-ga-params='{"foo":1,"bar":"x"}'
  const extra = safeJsonParse(dataset.gaParams);

  return { eventName, uiId, label, text, value, extra };
}
