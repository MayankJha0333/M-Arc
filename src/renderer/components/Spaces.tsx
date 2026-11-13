import { useRef } from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import type { ID, Space } from '@shared/types';
import { ARCHIVE_CHOICES, THEME_PRESETS } from '@shared/defaults';
import { createSpace, deleteSpace, setSpaceTheme, updateSpace, moveSpace } from '@shared/spaces';
import { act, getS, setUi, toast, useKite } from '../store';
import { actions, undoable, switchSpaceCmd } from '../commands';
import { openMenu } from './ContextMenu';
import { DropZone } from '../dnd';
import { Sheet, Field, Segmented, Toggle } from './Sheet';
import { now } from '../platform';

export function SpaceHeader({ space }: { space: Space }) {
  return (
    <div className="space-header" data-testid="space-header" onDoubleClick={() => openSpaceEditor(space.id)}>
      <span className="space-icon">{space.icon}</span>
      <span className="space-name" data-testid="space-name">{space.name}</span>
      {space.isolated && <span className="space-badge" title="This Space has its own logins and cookies" data-testid="space-isolated-badge">Separate logins</span>}
      <button className="icon-btn space-more" aria-label="Space menu" data-testid="space-menu" onClick={(e) => openMenu(e, spaceMenu(space.id))}>
        <MoreHorizontal size={16} />
      </button>
    </div>
  );
}

export function openSpaceEditor(id: ID) {
  setUi({ panel: 'space', panelArg: id });
}

export function newSpaceCmd() {
  const id = act((d) => createSpace(d, {}));
  openSpaceEditor(id);
  return id;
}

export function deleteSpaceCmd(id: ID) {
  const sp = getS().spaces.find((x) => x.id === id);
  if (!sp || getS().spaces.length <= 1) return;
  setUi({ panel: null });
  undoable(`Deleted Space “${sp.name}”`, (d) => void deleteSpace(d, id, now()));
}

function spaceMenu(id: ID) {
  const s = getS();
  const i = s.spaces.findIndex((x) => x.id === id);
  return [
    { label: 'Edit Name, Icon & Colors…', testId: 'menu-edit-space', onSelect: () => openSpaceEditor(id) },
    { label: 'New Folder', testId: 'menu-new-folder', onSelect: actions.newFolder },
    { label: 'Collapse All Folders', testId: 'menu-collapse-all', onSelect: actions.collapseFolders },
    { label: 'Expand All Folders', testId: 'menu-expand-all', onSelect: actions.expandFolders },
    { separator: true, label: '' },
    { label: 'Move Left', disabled: i <= 0, testId: 'menu-space-left', onSelect: () => act((d) => moveSpace(d, id, i - 1)) },
    { label: 'Move Right', disabled: i >= s.spaces.length - 1, testId: 'menu-space-right', onSelect: () => act((d) => moveSpace(d, id, i + 1)) },
    { separator: true, label: '' },
    { label: 'Delete Space…', danger: true, disabled: s.spaces.length <= 1, testId: 'menu-delete-space', onSelect: () => deleteSpaceCmd(id) },
  ];
}

/** Space icons in the sidebar footer: click to switch, drop tabs on them to move. */
export function SpaceBar() {
  const spaces = useKite((st) => st.s.spaces);
  const activeId = useKite((st) => st.s.activeSpaceId);
  return (
    <div className="space-bar" role="tablist" aria-label="Spaces" data-testid="space-bar">
      {spaces.map((sp) => (
        <DropZone key={sp.id} zone={{ type: 'space', spaceId: sp.id }} className="space-dot-wrap">
          <button
            role="tab"
            aria-selected={sp.id === activeId}
            aria-label={sp.name}
            className="space-dot"
            data-active={sp.id === activeId || undefined}
            data-testid={`space-${sp.id}`}
            data-name={sp.name}
            title={sp.name}
            onClick={() => switchSpaceCmd(sp.id)}
            onDoubleClick={() => openSpaceEditor(sp.id)}
            onContextMenu={(e) => openMenu(e, spaceMenu(sp.id))}
          >
            {sp.icon}
          </button>
        </DropZone>
      ))}
      <button className="space-dot space-add" aria-label="New Space" title="New Space" data-testid="btn-new-space" onClick={newSpaceCmd}>
        <Plus size={14} />
      </button>
    </div>
  );
}

/** Two-finger horizontal swipe on the sidebar switches Spaces. */
export function useSpaceSwipe() {
  const acc = useRef(0);
  const cool = useRef(0);
  return (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    const t = Date.now();
    if (t < cool.current) return;
    acc.current += e.deltaX;
    if (Math.abs(acc.current) > 90) {
      (acc.current > 0 ? actions.nextSpace : actions.prevSpace)();
      acc.current = 0;
      cool.current = t + 450;
    }
  };
}

const EMOJIS = ['🪁', '🏠', '💼', '🎨', '📚', '🧪', '🎧', '🌿', '🔥', '⭐', '🚀', '🧭', '🍳', '🎮', '💡', '🛠️', '📈', '✈️', '🧘', '🐙', '🌙', '☕', '🎬', '🗂️'];

export function SpaceEditor({ id }: { id: ID }) {
  const space = useKite((st) => st.s.spaces.find((x) => x.id === id));
  const count = useKite((st) => st.s.spaces.length);
  if (!space) return null;
  const t = space.theme;
  const set = (patch: Partial<Space['theme']>) => act((d) => setSpaceTheme(d, id, patch));
  return (
    <Sheet
      title="Edit Space"
      testId="space-editor"
      footer={
        <>
          {count > 1 && (
            <button className="btn danger" data-testid="btn-delete-space" onClick={() => deleteSpaceCmd(id)}>
              <Trash2 size={14} /> Delete Space
            </button>
          )}
          <span className="spacer" />
          <button className="btn primary" data-testid="space-done" onClick={() => setUi({ panel: null })}>
            Done
          </button>
        </>
      }
    >
      <div className="space-preview" style={{ background: `linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]})` }}>
        <span className="space-preview-icon">{space.icon}</span>
        <span className="space-preview-name">{space.name}</span>
      </div>

      <Field label="Name">
        <input
          className="input"
          data-testid="space-name-input"
          defaultValue={space.name}
          autoFocus
          onChange={(e) => act((d) => updateSpace(d, id, { name: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && setUi({ panel: null })}
        />
      </Field>

      <Field label="Icon" hint="Pick one or type any emoji">
        <div className="emoji-grid">
          {EMOJIS.map((e) => (
            <button key={e} className="emoji" data-on={space.icon === e || undefined} onClick={(ev) => { ev.preventDefault(); act((d) => updateSpace(d, id, { icon: e })); }}>
              {e}
            </button>
          ))}
          <input className="input emoji-input" maxLength={4} placeholder="✎" data-testid="space-icon-input" onChange={(e) => e.target.value && act((d) => updateSpace(d, id, { icon: e.target.value }))} />
        </div>
      </Field>

      <Field label="Colors">
        <div className="swatches" data-testid="theme-presets">
          {THEME_PRESETS.map((p) => (
            <button
              key={p.name}
              className="swatch"
              title={p.name}
              data-testid={`preset-${p.name}`}
              data-on={(t.colors[0] === p.colors[0] && t.colors[1] === p.colors[1]) || undefined}
              style={{ background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` }}
              onClick={(e) => { e.preventDefault(); set({ colors: [...p.colors] as [string, string] }); }}
            />
          ))}
          <span className="swatch-custom">
            <input type="color" aria-label="First color" data-testid="color-a" value={t.colors[0]} onChange={(e) => set({ colors: [e.target.value, t.colors[1]] })} />
            <input type="color" aria-label="Second color" data-testid="color-b" value={t.colors[1]} onChange={(e) => set({ colors: [t.colors[0], e.target.value] })} />
          </span>
        </div>
      </Field>

      <div className="field-row">
        <Field label="Appearance">
          <Segmented
            testId="space-mode"
            value={t.mode}
            onChange={(mode) => set({ mode })}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'Auto' },
            ]}
          />
        </Field>
        <Field label="Grain" inline>
          <Toggle checked={t.grain} onChange={(grain) => set({ grain })} testId="space-grain" label="Grain texture" />
        </Field>
      </div>

      <Field label="Color strength" hint={`${Math.round(t.intensity * 100)}%`}>
        <input type="range" className="range" min={0} max={1} step={0.05} value={t.intensity} data-testid="space-intensity" onChange={(e) => set({ intensity: Number(e.target.value) })} />
      </Field>

      <label className="field-inline space-isolated">
        <Toggle
          checked={!!space.isolated}
          testId="space-isolated"
          label="Separate logins for this Space"
          onChange={(isolated) => {
            act((d) => updateSpace(d, id, { isolated }));
            toast(isolated ? `“${space.name}” now has its own logins and cookies. Its tabs reloaded.` : `“${space.name}” shares logins with your other Spaces again. Its tabs reloaded.`);
          }}
        />
        <span>
          <b>Separate logins for this Space</b>
          <span className="muted">Its own cookies, sign-ins and site data, so you can use a second account on the same sites. Favorites stay shared.</span>
        </span>
      </label>

      <Field label="Archive unused tabs after" hint="Overrides the global setting for this Space">
        <select
          className="input"
          data-testid="space-archive"
          value={space.archiveAfterMs === undefined ? 'global' : String(space.archiveAfterMs)}
          onChange={(e) => act((d) => updateSpace(d, id, { archiveAfterMs: e.target.value === 'global' ? undefined : e.target.value === 'null' ? null : Number(e.target.value) }))}
        >
          <option value="global">Same as Settings</option>
          {ARCHIVE_CHOICES.map((c) => (
            <option key={c.label} value={String(c.ms)}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
    </Sheet>
  );
}
