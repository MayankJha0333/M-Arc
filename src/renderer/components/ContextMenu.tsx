import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import { setUi, useKite, type ContextMenuItem } from '../store';

/** Open a menu at the mouse position. */
export function openMenu(e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void }, items: ContextMenuItem[]) {
  e.preventDefault?.();
  e.stopPropagation?.();
  setUi({ menu: { x: e.clientX, y: e.clientY, items } });
}

function MenuList({ items, x, y, onClose, level = 0 }: { items: ContextMenuItem[]; x: number; y: number; onClose: () => void; level?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [open, setOpen] = useState<number | null>(null);
  const [focus, setFocus] = useState(-1);
  // Hover intent: give the pointer time to travel diagonally into an open submenu.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRow = (i: number, hasSub: boolean) => {
    setFocus(i);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (hasSub) setOpen(i);
    else closeTimer.current = setTimeout(() => setOpen(null), 280);
  };
  const keepSub = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  useEffect(() => () => void (closeTimer.current && clearTimeout(closeTimer.current)), []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(6, Math.min(x, window.innerWidth - r.width - 6)),
      y: Math.max(6, Math.min(y, window.innerHeight - r.height - 6)),
    });
  }, [x, y]);

  useEffect(() => {
    if (level > 0) return;
    const key = (e: KeyboardEvent) => {
      const enabled = items.map((it, i) => (!it.separator && !it.disabled ? i : -1)).filter((i) => i >= 0);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const cur = enabled.indexOf(focus);
        const next = e.key === 'ArrowDown' ? enabled[(cur + 1) % enabled.length] : enabled[(cur - 1 + enabled.length) % enabled.length];
        setFocus(next);
      } else if (e.key === 'Enter' && focus >= 0) {
        e.preventDefault();
        const it = items[focus];
        if (it.submenu) setOpen(focus);
        else {
          onClose();
          it.onSelect?.();
        }
      } else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [items, focus, onClose, level]);

  return (
    <div ref={ref} className="menu" role="menu" style={{ left: pos.x, top: pos.y }} data-testid={level === 0 ? 'context-menu' : 'context-submenu'}>
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="menu-sep" />
        ) : (
          <div key={i} className="menu-row-wrap" data-row-index={i} onMouseEnter={() => hoverRow(i, !!it.submenu)}>
            <button
              role="menuitem"
              className={`menu-item${it.danger ? ' danger' : ''}${focus === i ? ' focus' : ''}`}
              disabled={it.disabled}
              data-testid={it.testId}
              onClick={(e) => {
                if (it.submenu) {
                  setOpen(i);
                  return;
                }
                e.stopPropagation();
                onClose();
                it.onSelect?.();
              }}
            >
              <span>{it.label}</span>
              {it.hint && <span className="menu-hint">{it.hint}</span>}
              {it.submenu && <ChevronRight size={14} className="menu-chev" />}
            </button>
            {it.submenu && open === i && (
              <div onMouseEnter={keepSub}>
                <SubMenu items={it.submenu} parent={ref} index={i} onClose={onClose} />
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}

function SubMenu({ items, parent, index, onClose }: { items: ContextMenuItem[]; parent: React.RefObject<HTMLDivElement>; index: number; onClose: () => void }) {
  const row = parent.current?.querySelector(`[data-row-index="${index}"]`) as HTMLElement | null;
  const r = row?.getBoundingClientRect();
  const pr = parent.current?.getBoundingClientRect();
  if (!r || !pr) return null;
  // Rendered outside the parent menu: its backdrop blur would otherwise offset fixed positioning.
  const host = parent.current?.closest('.app') ?? document.body;
  return createPortal(<MenuList items={items} x={pr.right - 4} y={r.top - 5} onClose={onClose} level={1} />, host);
}

export function ContextMenuHost() {
  const menu = useKite((st) => st.ui.menu);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.menu')) setUi({ menu: null });
    };
    const blur = () => setUi({ menu: null });
    window.addEventListener('mousedown', close, true);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('mousedown', close, true);
      window.removeEventListener('blur', blur);
    };
  }, [menu]);
  if (!menu) return null;
  return <MenuList items={menu.items} x={menu.x} y={menu.y} onClose={() => setUi({ menu: null })} />;
}
