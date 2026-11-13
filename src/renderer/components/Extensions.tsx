// Chrome extensions: install, review what one asks for, turn on/off, remove.

import { useEffect, useState } from 'react';
import { AlertTriangle, Check, FolderOpen, FileArchive, Puzzle, Settings2, Store, Trash2, AppWindow, Info } from 'lucide-react';
import { ENGINE_SUPPORT, type ExtensionInfo, type ExtensionPreview } from '@shared/extensions';
import type { Result } from '@shared/ipc';
import { bridge } from '../platform';
import { toast } from '../store';
import { Sheet, Toggle } from './Sheet';

export function ExtensionsPanel() {
  const [list, setList] = useState<ExtensionInfo[]>([]);
  const [preview, setPreview] = useState<ExtensionPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [store, setStore] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    void bridge.extensions().then(setList);
    return bridge.onExtensions(setList);
  }, []);

  const offer = async (get: () => Promise<Result<ExtensionPreview | null>>) => {
    setBusy(true);
    setError('');
    const r = await get().catch((e: Error) => ({ error: e.message }) as Result<ExtensionPreview | null>);
    setBusy(false);
    if (r.error) return setError(r.error);
    if (r.value) setPreview(r.value);
  };
  const cancel = () => {
    if (preview) bridge.extensionCancel(preview.token);
    setPreview(null);
  };
  const install = async () => {
    if (!preview) return;
    setBusy(true);
    const r = await bridge.extensionConfirm(preview.token);
    setBusy(false);
    setPreview(null);
    if (r.error) return setError(r.error);
    setStore('');
    toast(`“${preview.name}” installed`);
  };

  return (
    <Sheet title="Extensions" subtitle="Chrome extensions that run inside Kite" testId="extensions" wide>
      {preview ? (
        <div className="ext-review" data-testid="ext-review">
          <h3><Puzzle size={18} /> Add “{preview.name}”?</h3>
          <p className="muted">Version {preview.version} · Manifest V{preview.manifestVersion}{preview.description ? ` · ${preview.description}` : ''}</p>
          <div className="ext-cols">
            <div>
              <span className="look-h">It will be able to</span>
              <ul data-testid="ext-access">
                {preview.access.length ? preview.access.map((a) => <li key={a}>{a}</li>) : <li>Nothing beyond its own pages</li>}
              </ul>
              {preview.sites.length > 0 && preview.sites[0] !== 'All websites' && <p className="muted ext-sites">{preview.sites.join(', ')}</p>}
            </div>
            {preview.limits.length > 0 && (
              <div>
                <span className="look-h">May not fully work in Kite</span>
                <ul className="ext-limits" data-testid="ext-limits">{preview.limits.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            )}
          </div>
          <p className="muted">Only add extensions you trust: one that can read every website can see what you type there, including passwords.</p>
          <div className="inline-form">
            <button className="btn" data-testid="ext-cancel" onClick={cancel}>Cancel</button>
            <button className="btn primary" data-testid="ext-install" disabled={busy} onClick={install}><Check size={14} /> Add extension</button>
          </div>
        </div>
      ) : (
        <>
          <div className="ext-add">
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (store.trim()) void offer(() => bridge.extensionFromStore(store.trim())); }}>
              <input className="input" placeholder="Chrome Web Store link or extension id" value={store} data-testid="ext-store-input" onChange={(e) => setStore(e.target.value)} />
              <button className="btn primary" disabled={busy || !store.trim()} data-testid="ext-store-add"><Store size={14} /> {busy ? 'Getting…' : 'Add'}</button>
            </form>
            <div className="inline-form">
              <button className="btn small" disabled={busy} data-testid="ext-add-file" onClick={() => void offer(() => bridge.extensionPick('file'))}><FileArchive size={13} /> From a .crx or .zip file…</button>
              <button className="btn small" disabled={busy} data-testid="ext-add-folder" onClick={() => void offer(() => bridge.extensionPick('folder'))}><FolderOpen size={13} /> From an unpacked folder…</button>
            </div>
          </div>
          {error && <div className="import-error" role="alert" data-testid="ext-error"><AlertTriangle size={14} /> {error}</div>}

          {list.length === 0 && <p className="muted dl-empty" data-testid="ext-empty">No extensions yet. Paste a Chrome Web Store link above to add one.</p>}
          <div className="ext-list">
            {list.map((x) => (
              <div className="ext-row" key={x.id} data-testid={`ext-${x.id}`} data-off={!x.enabled || undefined}>
                <span className="import-swatch"><Puzzle size={16} /></span>
                <div className="ext-main">
                  <b>{x.name} <span className="muted">{x.version}</span></b>
                  <span className="muted">{x.description || (x.sites[0] === 'All websites' ? 'Runs on all websites' : `Runs on ${x.sites.length} site${x.sites.length === 1 ? '' : 's'}`)}</span>
                  {x.error && <span className="ext-problem" data-testid="ext-problem"><AlertTriangle size={12} /> Couldn’t start: {x.error}</span>}
                  {!x.error && x.limits.length > 0 && <span className="ext-limit-note" title={x.limits.join('\n')}><Info size={12} /> {x.limits.length} thing{x.limits.length === 1 ? '' : 's'} may not work in Kite</span>}
                  {removing === x.id && (
                    <span className="inline-form">
                      <button className="btn small" onClick={() => setRemoving(null)}>Keep</button>
                      <button className="btn small danger-solid" data-testid="ext-remove-confirm" onClick={async () => { await bridge.extensionRemove(x.id); setRemoving(null); toast(`“${x.name}” removed, with its data`); }}>Remove it and its data</button>
                    </span>
                  )}
                </div>
                <div className="ext-actions">
                  {x.enabled && x.hasPopup && <button className="icon-btn" aria-label="Open popup" title="Open its popup" data-testid="ext-popup" onClick={() => void bridge.extensionOpen(x.id, 'popup')}><AppWindow size={15} /></button>}
                  {x.enabled && x.hasOptions && <button className="icon-btn" aria-label="Options" title="Its options" data-testid="ext-options" onClick={() => void bridge.extensionOpen(x.id, 'options')}><Settings2 size={15} /></button>}
                  <button className="icon-btn" aria-label="Remove" title="Remove" data-testid="ext-remove" onClick={() => setRemoving(x.id)}><Trash2 size={15} /></button>
                  <Toggle checked={x.enabled} onChange={(v) => void bridge.extensionEnable(x.id, v)} testId="ext-toggle" label={`${x.name} on`} />
                </div>
              </div>
            ))}
          </div>

          <details className="ext-support" data-testid="ext-support">
            <summary>What works, and what doesn’t</summary>
            <p className="muted">Kite is built on Electron, which runs part of Chrome’s extension system. Extensions that mostly change pages work well; ones that need Chrome’s own toolbar and tab controls work partly or not at all.</p>
            <div className="ext-cols">
              <div><span className="look-h">Works</span><ul>{ENGINE_SUPPORT.works.map((t) => <li key={t}>{t}</li>)}</ul></div>
              <div><span className="look-h">Doesn’t work</span><ul className="ext-limits">{ENGINE_SUPPORT.missing.map((t) => <li key={t}>{t}</li>)}</ul></div>
            </div>
          </details>
        </>
      )}
    </Sheet>
  );
}
