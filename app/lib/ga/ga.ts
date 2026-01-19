// lib/ga.ts
export type GaBaseParams = Record<string, any>;

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

/**
 * ✅ "env에 특정 값이 있으면 차단, 아니면 미차단" (NODE_ENV 무시)
 * - .env.local 에 NEXT_PUBLIC_GA_DISABLED=1 넣으면 로컬에서만 차단 가능
 * - 배포 환경에서 넣으면 해당 환경도 차단됨
 */
function envBool(key: string): boolean {
  const v = (process.env[key] ?? '').toString().trim();
  if (!v) return false;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const GA_DISABLED = envBool('NEXT_PUBLIC_GA_DISABLED');

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

  // ✅ 오직 env로만 차단
  if (GA_DISABLED) return;

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

/**
 * ✅ (선택) 현재 차단 여부 확인용
 */
export function isTrackingDisabled() {
  return GA_DISABLED;
}
