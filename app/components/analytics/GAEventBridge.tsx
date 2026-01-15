// components/analytics/GAEventBridge.tsx
'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { parseDatasetParams, track, trackClick, trackPageView } from '../../lib/ga';

function closestGaEl(start: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = start;
  while (el) {
    if (el.dataset?.gaId) return el; // ✅ data-ga-id가 있는 가장 가까운 부모
    el = el.parentElement;
  }
  return null;
}

function pickHref(el: HTMLElement): string | undefined {
  if (el instanceof HTMLAnchorElement) return el.href;
  const a = el.querySelector?.('a[href]') as HTMLAnchorElement | null;
  return a?.href;
}

function pickText(el: HTMLElement): string | undefined {
  const t = el.textContent?.trim();
  return t ? t.slice(0, 80) : undefined;
}

export default function GAEventBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ✅ App Router: route change마다 virtual pageview 쏘기
  useEffect(() => {
    const qs = searchParams?.toString();
    const page_path = `${pathname}${qs ? `?${qs}` : ''}`;

    trackPageView({
      page_path,
      page_location: typeof window !== 'undefined' ? window.location.href : undefined,
      page_title: typeof document !== 'undefined' ? document.title : undefined,
    });
  }, [pathname, searchParams]);

  // ✅ 전역 클릭 캐치 (캡처 단계에서 잡아서 Link/버튼 모두 커버)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return; // left click only

      const target = e.target as HTMLElement | null;
      const el = closestGaEl(target);
      if (!el) return;

      // ✅ 제외 옵션
      if (el.dataset.gaIgnore === '1') return;

      const { eventName, uiId, label, text, value, extra } = parseDatasetParams(
        el.dataset
      );
      if (!uiId) return;

      const href = pickHref(el);
      const uiText = text || pickText(el);

      // ✅ 기본은 ui_click, 필요하면 data-ga-event로 커스텀 가능
      if (eventName === 'ui_click') {
        trackClick({
          ui_id: uiId,
          ui_label: label,
          ui_text: uiText,
          ui_href: href,
          page_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
          value,
          extra,
        });
      } else {
        // 커스텀 이벤트
        track(eventName, {
          ui_id: uiId,
          ui_label: label,
          ui_text: uiText,
          ui_href: href,
          page_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
          ...(value !== undefined ? { value } : {}),
          ...(extra || {}),
        });
      }
    };

    // ✅ 키보드 접근성: Enter/Space도 클릭처럼 트래킹하고 싶으면
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;

      const target = e.target as HTMLElement | null;
      const el = closestGaEl(target);
      if (!el) return;
      if (el.dataset.gaIgnore === '1') return;

      const { uiId, label, text, value, extra } = parseDatasetParams(el.dataset);
      if (!uiId) return;

      track('ui_keypress', {
        ui_id: uiId,
        ui_label: label,
        ui_text: text || pickText(el),
        page_path: typeof window !== 'undefined' ? window.location.pathname : undefined,
        ...(value !== undefined ? { value } : {}),
        ...(extra || {}),
      });
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);

  return null;
}
