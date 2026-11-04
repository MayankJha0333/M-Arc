# Arc AppleScript dictionary — summary (from Arc.app/Contents/Resources/Arc.sdef)
- application → windows; write-only `tabs` collection on app = "create new Little Arc tabs"
- window: id, name, index, active tab, active space, incognito, mode ('normal'|'incognito'); elements: tabs, spaces
- tab: id, title, URL (rw), loading, location ('topApp' | 'pinned' | 'unpinned'); commands select, go back/forward, reload, stop, execute (javascript), close
- space: id, title; elements: tabs; command focus
