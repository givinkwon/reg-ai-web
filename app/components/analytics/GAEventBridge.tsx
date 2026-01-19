// components/analytics/GAEventBridge.tsx
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { parseDatasetParams, track, trackClick, trackPageView } from '../../lib/ga/ga';

function closestGaEl(start: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = start;
  while (el) {
    if (el.dataset?.gaId) return el; // data-ga-id가 있는 가장 가까운 부모
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

function buildPagePath(pathname: string) {
  // ✅ useSearchParams() 대신 location.search 사용 (not-found 프리렌더 이슈 회피)
  if (typeof window === 'undefined') return pathname;
  const qs = window.location.search?.replace(/^\?/, '');
  return `${pathname}${qs ? `?${qs}` : ''}`;
}

function scheduleMicrotask(fn: () => void) {
  // queueMicrotask 없는 환경 대비
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else Promise.resolve().then(fn);
}

export default function GAEventBridge() {
  const pathname = usePathname();
  const lastSentRef = useRef<string>('');

  // ✅ pathname 변경 감지용 PV
  useEffect(() => {
    const page_path = buildPagePath(pathname);

    if (lastSentRef.current === page_path) return;
    lastSentRef.current = page_path;

    trackPageView({
      page_path,
      page_location: typeof window !== 'undefined' ? window.location.href : undefined,
      page_title: typeof document !== 'undefined' ? document.title : undefined,
    });
  }, [pathname]);

  // ✅ querystring만 바뀌는 경우까지 잡기 위해 history API 후킹 + popstate
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const send = () => {
      const page_path = buildPagePath(window.location.pathname);

      if (lastSentRef.current === page_path) return;
      lastSentRef.current = page_path;

      trackPageView({
        page_path,
        page_location: window.location.href,
        page_title: document.title,
      });
    };

    const onPopState = () => send();

    type PushState = History['pushState'];
    type ReplaceState = History['replaceState'];

    const origPushState: PushState = history.pushState;
    const origReplaceState: ReplaceState = history.replaceState;

    history.pushState = (function (this: History, ...args: Parameters<PushState>) {
      const ret = origPushState.apply(this, args);
      scheduleMicrotask(send);
      return ret;
    }) as PushState;

    history.replaceState = (function (this: History, ...args: Parameters<ReplaceState>) {
      const ret = origReplaceState.apply(this, args);
      scheduleMicrotask(send);
      return ret;
    }) as ReplaceState;

    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
    };
  }, []);

  // ✅ 전역 클릭 캐치 (캡처 단계)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      const el = closestGaEl(target);
      if (!el) return;

      if (el.dataset.gaIgnore === '1') return;

      const { eventName, uiId, label, text, value, extra } = parseDatasetParams(el.dataset);
      if (!uiId) return;

      const href = pickHref(el);
      const uiText = text || pickText(el);

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
