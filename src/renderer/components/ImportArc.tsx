import { useState } from 'react';
import { Download, FileJson, Search, CheckCircle2, AlertTriangle } from 'lucide-react';
import { countNodes, importArc, parseArc, type ArcData } from '@shared/arcImport';
import { act, setUi, toast } from '../store';
import { bridge, isElectron, now } from '../platform';
import { switchSpaceCmd } from '../commands';
import { Sheet, Toggle } from './Sheet';

export function ImportArc() {
  const [data, setData] = useState<ArcData | null>(null);
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [favs, setFavs] = useState(true);

  const load = (text: string, from: string) => {
    try {
      const d = parseArc(text);
      setData(d);
      setPath(from);
      setError('');
      setChosen(new Set(d.spaces.map((s) => s.arcId)));
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    }
  };

  const findAuto = async () => {
    const r = await bridge.readDefaultArcFile();
    if (r) load(r.text, r.path);
    else setError('Couldn’t find Arc’s data on this computer. Use “Choose file…” instead.');
  };

  const run = () => {
    if (!data) return;
    const sum = act((d) => importArc(d, data, { now: now(), spaceIds: [...chosen], includeFavorites: favs, tidy: true }));
    setUi({ panel: null });
    if (sum.firstSpaceId) switchSpaceCmd(sum.firstSpaceId);
    toast(`Imported ${sum.spaces} Space${sum.spaces === 1 ? '' : 's'}, ${sum.tabs} tabs, ${sum.folders} folders${sum.favorites ? `, ${sum.favorites} favorites` : ''}`);
  };

  return (
    <Sheet
      wide
      title={
        <span className="boost-title">
          <Download size={18} /> Import from Arc
        </span>
      }
      subtitle="Brings your Spaces, pinned tabs, folders, split views and Favorites into Kite. Nothing is removed from Kite or from Arc."
      testId="import-arc"
      footer={
        <>
          {data && (
            <span className="field-inline">
              <Toggle checked={favs} onChange={setFavs} testId="import-favs" label="Include Favorites" /> Include Favorites ({data.favorites.length})
            </span>
          )}
          <span className="spacer" />
          <button className="btn primary" disabled={!data || (chosen.size === 0 && !(favs && data.favorites.length))} data-testid="import-run" onClick={run}>
            Import
          </button>
        </>
      }
    >
      <div className="import-sources">
        <button className="btn" data-testid="import-auto" onClick={() => void findAuto()}>
          <Search size={14} /> Find Arc’s data automatically
        </button>
        {isElectron ? (
          <button className="btn" data-testid="import-pick" onClick={async () => { const r = await bridge.pickArcFile(); if (r) load(r.text, r.path); }}>
            <FileJson size={14} /> Choose file…
          </button>
        ) : (
          <label className="btn">
            <FileJson size={14} /> Choose file…
            <input type="file" accept=".json" hidden data-testid="import-file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text(), f.name); e.target.value = ''; }} />
          </label>
        )}
      </div>
      <p className="muted import-help">
        Arc keeps this in <code>~/Library/Application Support/Arc/StorableSidebar.json</code>. Only that file is read — never your passwords, cookies or history.
      </p>

      {error && (
        <div className="import-error" data-testid="import-error">
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {data && (
        <div className="import-preview" data-testid="import-preview">
          <div className="import-found">
            <CheckCircle2 size={14} /> Found {data.spaces.length} Space{data.spaces.length === 1 ? '' : 's'} in <code>{path}</code>
          </div>
          {data.spaces.map((sp) => {
            const p = countNodes(sp.pinned);
            const t = countNodes(sp.today);
            const on = chosen.has(sp.arcId);
            return (
              <label key={sp.arcId} className="import-space" data-on={on || undefined} data-testid="import-space">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setChosen((c) => {
                      const n = new Set(c);
                      if (n.has(sp.arcId)) n.delete(sp.arcId);
                      else n.add(sp.arcId);
                      return n;
                    })
                  }
                />
                <span className="import-swatch" style={sp.colors ? { background: `linear-gradient(135deg, ${sp.colors[0]}, ${sp.colors[1]})` } : undefined}>
                  {sp.icon}
                </span>
                <span className="import-space-text">
                  <b>{sp.name}</b>
                  <span className="muted">
                    {p.tabs} pinned tab{p.tabs === 1 ? '' : 's'}
                    {p.folders ? ` · ${p.folders} folder${p.folders === 1 ? '' : 's'}` : ''}
                    {p.notes ? ` · ${p.notes} note${p.notes === 1 ? '' : 's'}` : ''} · {t.tabs} open tab{t.tabs === 1 ? '' : 's'}
                  </span>
                </span>
              </label>
            );
          })}
          {data.skipped.length > 0 && (
            <p className="muted" data-testid="import-skipped">
              {data.skipped.length} item{data.skipped.length === 1 ? '' : 's'} will be skipped ({Array.from(new Set(data.skipped.map((x) => x.reason))).join(', ')}).
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
