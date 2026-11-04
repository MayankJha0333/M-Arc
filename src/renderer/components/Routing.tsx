import { useEffect, useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Route, CheckCircle2 } from 'lucide-react';
import { addRoute, deleteRoute, MATCH_LABELS, moveRoute, routeFor, updateRoute } from '@shared/routing';
import type { RouteMatchType, RouteTarget } from '@shared/types';
import { act, toast, useKite } from '../store';
import { bridge } from '../platform';
import { Sheet, Field, Segmented, Toggle } from './Sheet';

function targetValue(t: RouteTarget) {
  return t.type === 'space' ? `space:${t.spaceId}` : t.type;
}

function parseTarget(v: string): RouteTarget {
  if (v.startsWith('space:')) return { type: 'space', spaceId: v.slice(6) };
  return v === 'little' ? { type: 'little' } : { type: 'active' };
}

export function RoutingPanel() {
  const routes = useKite((st) => st.s.routes);
  const spaces = useKite((st) => st.s.spaces);
  const fallback = useKite((st) => st.s.settings.externalLinksTarget);
  const s = useKite((st) => st.s);
  const [test, setTest] = useState('');
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  useEffect(() => {
    void bridge.isDefaultBrowser().then(setIsDefault);
  }, []);

  const testResult = (() => {
    if (!test.trim()) return null;
    const url = /^[a-z]+:\/\//i.test(test) ? test : `https://${test}`;
    const { target, rule } = routeFor(s, url);
    const where = target.type === 'little' ? 'a little window' : target.type === 'active' ? 'the current Space' : (() => {
      const sp = spaces.find((x) => x.id === (target as { spaceId: string }).spaceId);
      return sp ? `${sp.icon} ${sp.name}` : 'the current Space';
    })();
    return { where, rule };
  })();

  return (
    <Sheet
      wide
      title={
        <span className="boost-title">
          <Route size={18} /> Link Routing
        </span>
      }
      subtitle="Choose where links from other apps (Mail, Slack, Notes…) open in Kite."
      testId="routing-panel"
      footer={
        <>
          {isDefault ? (
            <span className="field-inline">
              <CheckCircle2 size={14} /> Kite is your default browser
            </span>
          ) : (
            <button
              className="btn small"
              data-testid="make-default"
              onClick={async () => {
                const ok = await bridge.setDefaultBrowser();
                setIsDefault(ok);
                toast(ok ? 'Kite is now your default browser' : 'Your system asked to confirm — check System Settings');
              }}
            >
              Make Kite the default browser
            </button>
          )}
          <span className="spacer" />
        </>
      }
    >
      <Field label="Links that match no rule open in">
        <Segmented
          testId="route-fallback"
          value={fallback}
          onChange={(v) => act((d) => void (d.settings.externalLinksTarget = v))}
          options={[
            { value: 'little', label: 'A little window' },
            { value: 'active', label: 'The current Space' },
          ]}
        />
      </Field>

      <div className="routes" data-testid="route-list">
        <div className="routes-head">
          <span className="field-label">Rules</span>
          <span className="muted">Checked top to bottom — the first match wins.</span>
        </div>
        {routes.length === 0 && <div className="empty-list">No rules yet. Example: send every spotify.com link to your Personal Space.</div>}
        {routes.map((r, i) => (
          <div key={r.id} className="route-row" data-testid="route-row" data-enabled={r.enabled || undefined}>
            <select className="input" value={r.matchType} data-testid="route-match" onChange={(e) => act((d) => updateRoute(d, r.id, { matchType: e.target.value as RouteMatchType }))}>
              {Object.entries(MATCH_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input className="input" placeholder={r.matchType === 'host' ? 'spotify.com' : r.matchType === 'contains' ? 'meet.google' : 'github.com/my-team'} value={r.value} data-testid="route-value" onChange={(e) => act((d) => updateRoute(d, r.id, { value: e.target.value }))} />
            <span className="route-arrow">→</span>
            <select className="input" value={targetValue(r.target)} data-testid="route-target" onChange={(e) => act((d) => updateRoute(d, r.id, { target: parseTarget(e.target.value) }))}>
              {spaces.map((sp) => (
                <option key={sp.id} value={`space:${sp.id}`}>{sp.icon} {sp.name}</option>
              ))}
              <option value="little">Little window</option>
              <option value="active">Current Space</option>
            </select>
            <Toggle checked={r.enabled} onChange={(v) => act((d) => updateRoute(d, r.id, { enabled: v }))} label="Rule on" testId="route-enabled" />
            <span className="route-btns">
              <button className="icon-btn tiny" aria-label="Move up" disabled={i === 0} onClick={() => act((d) => moveRoute(d, r.id, -1))}><ArrowUp size={12} /></button>
              <button className="icon-btn tiny" aria-label="Move down" disabled={i === routes.length - 1} onClick={() => act((d) => moveRoute(d, r.id, 1))}><ArrowDown size={12} /></button>
              <button className="icon-btn tiny" aria-label="Delete rule" data-testid="route-delete" onClick={() => act((d) => deleteRoute(d, r.id))}><Trash2 size={12} /></button>
            </span>
          </div>
        ))}
        <button className="btn small add-route" data-testid="route-add" onClick={() => act((d) => void addRoute(d))}>
          <Plus size={13} /> Add rule
        </button>
      </div>

      <Field label="Try a link">
        <input className="input" placeholder="Paste a link to see where it would open" value={test} data-testid="route-test" onChange={(e) => setTest(e.target.value)} />
        {testResult && (
          <span className="route-result" data-testid="route-result">
            Opens in <b>{testResult.where}</b> {testResult.rule ? `(rule: ${MATCH_LABELS[testResult.rule.matchType].toLowerCase()} “${testResult.rule.value}”)` : '(no rule matched)'}
          </span>
        )}
      </Field>
    </Sheet>
  );
}
