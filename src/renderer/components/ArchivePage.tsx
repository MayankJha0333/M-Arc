import { useMemo, useState } from 'react';
import { Archive, Search, RotateCcw, X, StickyNote, Trash2, Clock } from 'lucide-react';
import { groupArchive, restoreArchived, deleteArchived, clearArchive, archiveAfterFor } from '@shared/archive';
import { ARCHIVE_CHOICES } from '@shared/defaults';
import { displayUrl } from '@shared/url';
import { act, setUi, useKite } from '../store';
import { selectItem } from '../commands';
import { now } from '../platform';
import { Sheet } from './Sheet';
import { SiteIcon } from './SiteIcon';

function ruleText(ms: number | null) {
  if (ms === null) return 'Auto-archive is off for this Space.';
  const c = ARCHIVE_CHOICES.find((x) => x.ms === ms);
  return `Unpinned tabs you haven’t used for ${c ? c.label : `${Math.round(ms / 60000)} minutes`} are archived automatically.`;
}

export function ArchivePage() {
  const archive = useKite((st) => st.s.archive);
  const rule = useKite((st) => archiveAfterFor(st.s, st.s.activeSpaceId));
  const spaces = useKite((st) => st.s.spaces);
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(false);
  const groups = useMemo(() => groupArchive(archive, now(), q), [archive, q]);
  const spaceName = (id: string) => spaces.find((x) => x.id === id);

  return (
    <Sheet
      title="Archive"
      subtitle={
        <>
          <Clock size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          {ruleText(rule)}{' '}
          <button className="link" data-testid="archive-settings" onClick={() => setUi({ panel: 'settings', panelArg: 'tabs' })}>
            Change
          </button>
        </>
      }
      testId="archive-page"
      wide
      footer={
        <>
          <span className="muted">{archive.length} item{archive.length === 1 ? '' : 's'}</span>
          <span className="spacer" />
          {archive.length > 0 &&
            (confirm ? (
              <>
                <span className="muted">Delete everything in the Archive?</span>
                <button className="btn small" onClick={() => setConfirm(false)}>Cancel</button>
                <button className="btn small danger-solid" data-testid="archive-clear-confirm" onClick={() => { act(clearArchive); setConfirm(false); }}>
                  Clear Archive
                </button>
              </>
            ) : (
              <button className="btn small danger" data-testid="archive-clear" onClick={() => setConfirm(true)}>
                <Trash2 size={13} /> Clear Archive
              </button>
            ))}
        </>
      }
    >
      <div className="search-box">
        <Search size={15} />
        <input autoFocus placeholder="Search archived pages" value={q} data-testid="archive-search" onChange={(e) => setQ(e.target.value)} />
      </div>
      {groups.length === 0 && (
        <div className="empty-list" data-testid="archive-empty">
          <span className="empty-state-icon"><Archive size={20} /></span>
          <span className="empty-state-title">{q ? 'Nothing matches' : 'Nothing archived yet'}</span>
          <span className="empty-state-text">{q ? 'Try another word, or part of the address.' : 'Tabs you clear or don’t use for a while land here, so you never lose them.'}</span>
        </div>
      )}
      {groups.map((g) => (
        <div key={g.label} className="arch-group">
          <h3 className="arch-day">{g.label}</h3>
          {g.items.map((e) => {
            const sp = spaceName(e.spaceId);
            return (
              <div key={e.id} className="arch-row" data-testid="archive-row" data-title={e.title}>
                <button
                  className="arch-main"
                  data-testid="archive-restore"
                  title="Restore"
                  onClick={() => {
                    const id = act((d) => restoreArchived(d, e.id, now()));
                    if (id) selectItem(id);
                    setUi({ panel: null });
                  }}
                >
                  {e.kind === 'note' ? <StickyNote size={16} className="row-glyph" /> : <SiteIcon url={e.url} title={e.title} size={16} />}
                  <span className="arch-text">
                    <span className="arch-title">{e.title || displayUrl(e.url)}</span>
                    <span className="arch-meta">
                      {e.kind === 'note' ? 'Note' : displayUrl(e.url)} · {sp ? `${sp.icon} ${sp.name}` : 'Deleted Space'} · {e.reason === 'auto' ? 'auto-archived' : e.reason === 'cleared' ? 'cleared' : 'archived'} {new Date(e.archivedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </span>
                  <RotateCcw size={14} className="arch-restore-icon" />
                </button>
                <button className="icon-btn" aria-label="Delete from Archive" data-testid="archive-delete" onClick={() => act((d) => deleteArchived(d, e.id))}>
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </Sheet>
  );
}
