// utils/formatAssistantHtml.ts
export function formatAssistantHtml(html: string): string {
  if (!html) return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="ai-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('ai-root');
  if (!root) return html;

  // ✅ 텍스트 + <br> 기반 라인 추출 (leading 보존)
  const extractLinesFromTextAndBr = (el: HTMLElement) => {
    let buf = '';

    el.childNodes.forEach((n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        buf += n.textContent ?? '';
        return;
      }
      if (n.nodeType === Node.ELEMENT_NODE) {
        if ((n as Element).tagName === 'BR') buf += '\n';
      }
    });

    return buf
      .split('\n')
      .map((v) => v.replace(/\s+$/g, '')) // trailing만 제거
      .filter((v) => v.trim().length > 0);
  };

  // (선택) 위험 태그/이벤트 제거
  root.querySelectorAll('script, iframe, object, embed').forEach((n) => n.remove());
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    [...el.attributes].forEach((attr) => {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    });
  });

  const isInsideCode = (el: Element) => !!el.closest('pre, code');

  const isTextAndBrOnly = (el: HTMLElement) =>
    [...el.childNodes].every((n) => {
      if (n.nodeType === Node.TEXT_NODE) return true;
      if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === 'BR') return true;
      return false;
    });

  type LineInfo =
    | { kind: 'empty' }
    | { kind: 'title'; num: string; title: string } // 1) 답변
    | { kind: 'subheading'; num: string; head: string; body: string; dot?: boolean } // 1. 출입통제: 본문
    | { kind: 'li'; text: string }
    | { kind: 'label'; label: string; rest: string; dot?: boolean }
    | { kind: 'p'; text: string; dot?: boolean };

  const splitByFirstColon = (s: string) => {
    const idx = s.indexOf(':');
    if (idx === -1) return { head: s.trim(), body: '' };
    return { head: s.slice(0, idx).trim(), body: s.slice(idx + 1).trim() };
  };

  // ✅ 핵심: "탭/들여쓰기" 판정 완화 (공백 1개도 포함 + NBSP 포함)
  // - &nbsp; = \u00a0
  // - 기타 유니코드 공백도 포함하려면 범위를 추가
  const hasIndent = (raw: string) =>
    /^[\t \u00a0\u2000-\u200a\u3000]+/.test(raw);

  const classify = (raw: string): LineInfo => {
    // 들여쓰기 판단은 raw(leading 포함)로 하고,
    // 분석은 NBSP를 space로 바꾼 뒤 trim된 텍스트로
    const dot = hasIndent(raw);
    const trimmed = raw.replace(/\u00a0/g, ' ').trim();
    if (!trimmed) return { kind: 'empty' };

    // ✅ 큰 제목: "1) 답변"
    const t = trimmed.match(/^(\d+)\)\s*(.+)?$/);
    if (t) return { kind: 'title', num: `${t[1]})`, title: (t[2] ?? '').trim() };

    // ✅ 소제목(번호 항목): "1. 출입통제: ...."
    const d = trimmed.match(/^(\d+)\.\s*(.+)$/);
    if (d) {
      const num = `${d[1]}.`;
      const rest = d[2].trim();
      const { head, body } = splitByFirstColon(rest);
      return { kind: 'subheading', num, head, body, dot };
    }

    // bullet
    if (/^[-*•]\s+\S/.test(trimmed)) {
      return { kind: 'li', text: trimmed.replace(/^[-*•]\s+/, '') };
    }

    // "요약: ..." 라벨형
    const m = trimmed.match(/^(.+?)\s*:\s*(.*)$/);
    if (m) {
    const label = m[1].trim();
    const rest = (m[2] ?? '').trim();

    // 라벨이 너무 길면(문장 전체가 콜론 포함) label로 오인될 수 있어서 안전장치(원하면 조절)
    // 예: "입력하신 내용은: ..." 같은 건 라벨로 보는 게 맞으니 60 정도로
    if (label.length > 60) return { kind: 'p', text: trimmed, dot };

    return { kind: 'label', label, rest, dot };
    }

    return { kind: 'p', text: trimmed, dot };
  };

  // ✅ data-ai를 덮어쓰지 말고 dot은 별도 attribute로
  const appendDotIfNeeded = (p: HTMLElement, dot?: boolean) => {
    if (!dot) return null;

    p.setAttribute('data-ai-dot', '1');

    const mark = doc.createElement('span');
    mark.setAttribute('data-ai', 'dotmark');
    mark.textContent = '·';

    const textWrap = doc.createElement('span');
    textWrap.setAttribute('data-ai', 'dottext');

    p.appendChild(mark);
    p.appendChild(textWrap);

    return textWrap;
  };

  const makeNode = (info: LineInfo) => {
    switch (info.kind) {
      case 'title': {
        const h = doc.createElement('h3');
        h.setAttribute('data-ai', 'title');

        const s1 = doc.createElement('strong');
        s1.textContent = info.num;
        h.appendChild(s1);

        if (info.title) {
          h.appendChild(doc.createTextNode(' '));
          const s2 = doc.createElement('strong');
          s2.textContent = info.title;
          h.appendChild(s2);
        }
        return h;
      }

      case 'subheading': {
        const p = doc.createElement('p');
        p.setAttribute('data-ai', 'subheading');

        const textWrap = appendDotIfNeeded(p, info.dot) ?? p;

        const s1 = doc.createElement('strong');
        s1.textContent = info.num;

        const s2 = doc.createElement('strong');
        s2.textContent = info.head;

        textWrap.appendChild(s1);
        textWrap.appendChild(doc.createTextNode(' '));
        textWrap.appendChild(s2);

        if (info.body) {
          textWrap.appendChild(doc.createTextNode(': '));
          const span = doc.createElement('span');
          span.textContent = info.body;
          textWrap.appendChild(span);
        }
        return p;
      }

      case 'p': {
        const p = doc.createElement('p');
        const textWrap = appendDotIfNeeded(p, info.dot) ?? p;
        textWrap.appendChild(doc.createTextNode(info.text));
        return p;
      }

      case 'label': {
        const p = doc.createElement('p');
        const textWrap = appendDotIfNeeded(p, info.dot) ?? p;

        const strong = doc.createElement('strong');
        strong.textContent = `${info.label}: `;

        const span = doc.createElement('span');
        span.textContent = info.rest;

        textWrap.appendChild(strong);
        textWrap.appendChild(span);
        return p;
      }

      
      case 'li': {
        const li = doc.createElement('li');
        const text = info.text;

        const idx1 = text.indexOf(':');
        const idx2 = text.indexOf('：');
        const idx =
            idx1 === -1 ? idx2 :
            idx2 === -1 ? idx1 :
            Math.min(idx1, idx2);

        if (idx !== -1) {
            const headRaw = text.slice(0, idx);          // 콜론 앞부분(원본)
            const colon = text[idx];                     // ':' or '：'
            const head = headRaw.trim();
            const rest = text.slice(idx + 1).trim();

            // ✅ (예: 처럼 괄호가 head에 포함되면 볼드 처리 금지
            const hasParen = headRaw.includes('(') || headRaw.includes('（');

            if (!hasParen && head.length > 0) {
            // ✅ li가 flex여도 깨지지 않도록 wrapper 1개
            const wrap = doc.createElement('span');

            const strong = doc.createElement('strong');
            strong.textContent = `${head}${colon} `;

            wrap.appendChild(strong);
            wrap.appendChild(doc.createTextNode(rest));

            li.appendChild(wrap);
            return li;
            }
        }

        // 괄호 포함 / 콜론 없음 / 기타 케이스는 그대로
        li.textContent = text;
        return li;
        }




      default:
        return null;
    }
  };

  const applyFragment = (container: HTMLElement, frag: DocumentFragment) => {
    // root는 컨테이너를 유지하고 내용만 교체
    if (container === root) {
      container.innerHTML = '';
      container.appendChild(frag);
      return;
    }
    // 내부 p/div는 통째로 교체 (p 안에 p 넣는 문제 방지)
    container.replaceWith(frag);
  };

  const rebuildFromLines = (container: HTMLElement) => {
    const lines = extractLinesFromTextAndBr(container);
    if (lines.length === 0) return;

    const frag = doc.createDocumentFragment();
    let ul: HTMLUListElement | null = null;

    for (const line of lines) {
      const info = classify(line);

      if (info.kind === 'li') {
        if (!ul) {
          ul = doc.createElement('ul');
          frag.appendChild(ul);
        }
        const li = makeNode(info);
        if (li) ul.appendChild(li);
        continue;
      }

      ul = null;
      const node = makeNode(info);
      if (node) frag.appendChild(node);
    }

    applyFragment(container, frag);
  };

  // ✅ root 자체가 텍스트+<br>이면 root를 처리
  if (isTextAndBrOnly(root) && !isInsideCode(root)) {
    rebuildFromLines(root);
  } else {
    // fallback: 내부 div/p가 텍스트+br만 있는 경우 처리
    root.querySelectorAll<HTMLElement>('div, p').forEach((el) => {
      if (isInsideCode(el)) return;
      if (!isTextAndBrOnly(el)) return;
      rebuildFromLines(el);
    });
  }

  return root.innerHTML;
}
