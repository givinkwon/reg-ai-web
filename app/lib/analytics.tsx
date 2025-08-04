// lib/analytics.ts
declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

// === (A) GTM 방식 ===
export function pushToDataLayer(event: string, params: Record<string, any> = {}) {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

// === (B) gtag 직접 방식 ===
export function gtagEvent(event: string, params: Record<string, any> = {}) {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", event, params);
}