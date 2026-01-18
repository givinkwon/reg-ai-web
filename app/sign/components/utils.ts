export function safeShort(str: string, n = 280) {
  const t = (str || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

export function readTokenFromLocation(): string {
  if (typeof window === 'undefined') return '';
  const sp = new URLSearchParams(window.location.search);
  return (sp.get('token') || '').trim();
}

export function setTokenToUrl(token: string) {
  if (typeof window === 'undefined') return;
  const t = token.trim();
  const url = t ? `/sign?token=${encodeURIComponent(t)}` : '/sign';
  window.history.replaceState(null, '', url);
}

export function scheduleMicrotask(fn: () => void) {
  if (typeof queueMicrotask === 'function') queueMicrotask(fn);
  else Promise.resolve().then(fn);
}
