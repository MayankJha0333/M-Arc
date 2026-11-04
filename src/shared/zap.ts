// Element picker used by Boosts' "zap" tool: hover highlights an element,
// click returns a CSS selector for it, Esc cancels.

/**
 * Builds a short, stable CSS selector for an element.
 * Self-contained so it can be injected into pages and unit-tested in jsdom.
 */
export function selectorFor(el: Element): string {
  const esc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/([^a-zA-Z0-9_-])/g, '\\$1'));
  // Ids/classes made by build tools change between visits, so avoid them.
  const looksGenerated = (s: string) => /\d{3,}|^[a-z]{1,3}-[A-Za-z0-9]{5,}$|^_|[A-Z].*[0-9]|^css-|^sc-/.test(s) || (s.length >= 6 && s.replace(/\D/g, '').length >= 3);
  const doc = el.ownerDocument;
  const unique = (sel: string) => {
    try {
      return doc.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  };
  if (el.id && !looksGenerated(el.id) && unique(`#${esc(el.id)}`)) return `#${esc(el.id)}`;

  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1 && cur !== doc.documentElement) {
    const tag = cur.tagName.toLowerCase();
    if (cur.id && !looksGenerated(cur.id)) {
      parts.unshift(`#${esc(cur.id)}`);
      break;
    }
    let part = tag;
    const classes = Array.from(cur.classList).filter((c) => !looksGenerated(c)).slice(0, 2);
    if (classes.length) part += classes.map((c) => `.${esc(c)}`).join('');
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName && (classes.length === 0 || classes.every((k) => c.classList.contains(k))));
      if (same.length > 1) part += `:nth-of-type(${Array.from(parent.children).filter((c) => c.tagName === cur!.tagName).indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    const sel = parts.join(' > ');
    if (unique(sel)) return sel;
    if (tag === 'body') break;
    cur = parent;
  }
  return parts.join(' > ');
}

export function zapPickerScript(): string {
  return `new Promise((resolve) => {
  const selectorFor = ${selectorFor.toString()};
  const box = document.createElement('div');
  const tip = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #ff5a36;background:rgba(255,90,54,.14);border-radius:4px;transition:all .06s ease-out;';
  tip.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:14px;transform:translateX(-50%);padding:8px 14px;border-radius:999px;background:#1c1b22;color:#fff;font:600 13px/1.2 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25);pointer-events:none;';
  tip.textContent = 'Click an element to hide it · Esc to cancel';
  document.documentElement.append(box, tip);
  let current = null;
  const move = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === box || el === tip) return;
    current = el;
    const r = el.getBoundingClientRect();
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
    box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
  };
  const done = (value) => {
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('keydown', key, true);
    box.remove(); tip.remove();
    resolve(value);
  };
  const click = (e) => { e.preventDefault(); e.stopImmediatePropagation(); done(current ? selectorFor(current) : null); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); done(null); } };
  document.addEventListener('mousemove', move, true);
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', key, true);
})`;
}
