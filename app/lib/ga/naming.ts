// app/lib/ga/naming.ts
const norm = (v?: string | null) => (v ?? '').trim();

function toPascalCase(input: string) {
  const s = norm(input);
  if (!s) return '';
  const words = s
    .replace(/[:\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

export type GAContext = {
  page?: string;   // 기본값 Chat
  section?: string;
  area?: string;
};

export function gaEvent(ctx: GAContext, action: string) {
  const page = toPascalCase(ctx.page || 'Chat');
  const section = toPascalCase(ctx.section || '');
  const area = toPascalCase(ctx.area || '');
  const act = toPascalCase(action);
  return [page, section, area, act].filter(Boolean).join(':');
}

export function gaUiId(ctx: GAContext, action: string) {
  const area = toPascalCase(ctx.area || '');
  const act = toPascalCase(action);
  return [area, act].filter(Boolean).join(':');
}
