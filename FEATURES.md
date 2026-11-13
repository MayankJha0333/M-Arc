# Arc vs Kite — feature inventory

Taken from the Arc app installed on this Mac (Arc.app, Nov 2026): its menu bar (~200
items), its ~4,900 on-screen texts and its module names (`ARC_EaselUI`,
`ARC_PictureInPicture`, …). Evidence is in `research-evidence/arc-inventory/` on the Mac it was taken from (kept out of git: it is Arc's own text).
Studied only — no Arc code, text, icons or name are used in Kite.

**Key:** ✅ Kite has it · 🟡 Kite has part of it · ❌ missing, can be built offline ·
☁️ needs an account, a server or an AI service (Kite is offline by design)

## Summary

| | Count |
|---|---|
| ✅ Kite has it | 23 |
| 🟡 Partly | 6 |
| ❌ Missing, buildable offline | 21 |
| ☁️ Needs a server, account or AI | 12 |

## Sidebar, tabs and organising

| Arc feature | Evidence in Arc | Kite |
|---|---|---|
| Vertical sidebar tabs, close/undo, reopen closed tab, rename, duplicate | Menu: Reopen Closed Tab, Rename Current Item, Duplicate | ✅ |
| Favorites (icon grid, shared across Spaces) | "Drag to add Favorites" | ✅ |
| Pinned tabs, reset to original URL | Menu: Reset Tab to Original URL | ✅ |
| Folders: nested, collapse/expand all | Menu: Collapse/Expand All Folders | ✅ |
| Collapse the whole Pinned section | Menu: Collapse/Expand Pinned Section | ❌ |
| Today tabs, Clear Unpinned Tabs | Menu: Clear Unpinned Tabs | ✅ |
| Reset all tabs in a Space (back to pinned pages) | Menu: Reset all tabs in this Space | ❌ |
| Auto-archive + Archive (search, restore, clear) | Menu: Archive Tab, View Archive, Clear Archive | ✅ |
| Spaces: name, icon, colours, theme, switch by keys/swipe | Menu: New/Rename/Manage Spaces, Next/Previous Space | ✅ |
| Sidebar hide / slide out / lock / anchor | "lock the sidebar", "anchor the sidebar" | 🟡 hide + slide out; no lock/anchor modes |
| Hover preview of a tab | "Show Hover Preview" | ❌ |
| Mute / unmute tab, **mute all tabs** | "mute all tabs", "unmute all tabs" | 🟡 per-tab only |
| Sidebar media controls / mini player for whatever is playing | "Close Mini Player", "Has media player open" | 🟡 mini player for popped-out videos only |
| Profiles (separate logins/cookies, per Space) | Menu: New Profile, Change Profile | ✅ “Separate logins” per Space |
| Incognito / private window, blank window | Menu: New Incognito Window, Blank Window | ❌ |
| Several main windows | Menu: New Window, Create Window | ❌ (one main window) |

## Browsing and pages

| Arc feature | Evidence in Arc | Kite |
|---|---|---|
| Command bar: search tabs, history, actions | Menu: Open Command Bar | ✅ |
| Split view 2–4 panes, separate a pane | Menu: Add/Close Split View, Separate Page from Split View | ✅ |
| Peek (preview links from pinned tabs) | "re-opening a closed Peek" | ✅ |
| Little window, links from other apps open in it | Menu: New Little Arc Window | ✅ |
| Link routing rules ("Air Traffic Control") | "Air Traffic Control", routes | ✅ |
| Find in page | Menu: Find in Page | ✅ |
| Copy URL | Menu: Copy URL | ✅ |
| Copy URL **as Markdown / as quote** | Menu: Copy URL as Markdown, Copy URL as Quote | ❌ |
| Zoom in / out / reset | Menu: Zoom In, Zoom Out, Reset Zoom | ✅ |
| Clear cookies / cache **and refresh** this site | Menu: Clear Cookies and Refresh, Clear Cache and Refresh | ❌ |
| Site Control Center (per-site permissions, cookies, zoom, developer mode) | `ARC_SiteControlCenter`, "site settings view" | ✅ address-bar popover: connection, Shields, permissions, erase site data |
| Built-in ad blocking and cookie-banner blocking | `ARC_AdBlocking`, "Block Cookie Banners" | ✅ Shields (EasyList/EasyPrivacy, per-site exceptions) |
| Downloads list | Menu: Downloads, View Downloads | ✅ (plus image conversion and video/HLS saving) |
| Full History page | Menu: View History | 🟡 history in the command bar only |
| Print, Save Page As, View Source | Menu items | ❌ |
| Developer tools for a page, JavaScript console, network inspector, task manager | Menu: Developer | ❌ (only Kite's own developer tools) |
| Picture-in-picture video, floats over other apps | `ARC_PictureInPicture` | ✅ (plus controls and mini player) |
| Translate page | `ARC_Translation`, "Never Translate This Site" | ☁️ needs a translation service |
| Passwords and autofill | "manage passwords", "Autofill your passwords" | ❌ (big job; macOS Passwords app works meanwhile) |
| Chrome extensions | Menu: Extensions, Add Extension | 🟡 install/manage/remove; runs what Electron supports (no toolbar buttons, see Settings → Extensions) |
| Cast to a TV | Menu: Cast | ❌ |

## Making and customising

| Arc feature | Evidence in Arc | Kite |
|---|---|---|
| Notes in the sidebar, export | Menu: New Note, Export Arc Notes | ✅ |
| Boosts: per-site CSS, fonts, zap, scripts | Menu: New/Edit Boost | ✅ |
| Boost Gallery (share and install others' Boosts) | Menu: Boost Gallery, "Delete and unshare this Boost?" | ☁️ |
| Capture: screenshot area / full page, edit, copy | `ARC_Capture`, Menu: Capture Full Page | ❌ |
| Easels / mood boards (canvas of captures and notes) | `ARC_EaselUI`, Menu: New Easel, Mood Board | ❌ (left out at first) |
| Library (Downloads, Media/screenshots, Easels, Archive in one place) | Menu: View Library, View Media | ❌ |
| Themes per Space, light/dark/auto | Menu: Edit Theme, Switch to Dark Mode | ✅ |
| Custom keyboard shortcuts | "Custom Shortcuts" | ✅ |
| Sound effects | "Play Arc sound effects" | ❌ |
| Alternative app icons | "App icon could not be set" | ❌ |
| Welcome / onboarding steps | `ARC_WelcomeToArcFeature` | 🟡 empty state only |

## Data, import and accounts

| Arc feature | Evidence in Arc | Kite |
|---|---|---|
| Import from Arc | — | ✅ (Kite's own) |
| Import from other browsers (Chrome, Safari, …) | Menu: Import from Another Browser | ❌ |
| Back up / restore data | Menu: Restore Data, Reveal Arc Data | ✅ |
| Set as default browser | Menu: Set as Default Browser | ✅ |
| Sign-in, account, membership, referral codes | `ARC_AuthFeature`, `ARC_MembershipCard` | ☁️ |
| Sync across devices (Firebase / iCloud) | `ARC_SidebarSyncCloudKit`, "trouble syncing" | ☁️ |
| Shared folders and Spaces with other people | "Default title for a shared folder" | ☁️ |
| Shared Quotes (highlight text → share link) | "Enable Shared Quotes" | ☁️ |
| Calendar: join next meeting, Peek email | Menu: Join Meeting, Peek Email | ☁️ needs your Google account |
| Live previews of Gmail, Notion, Figma, Linear in Favorites | "Empty state string for Gmail preview" | ☁️ |
| Send tab to Dia (their newer browser) | Menu: Send Tab to Dia | ☁️ not applicable |

## Arc Max (AI)

| Arc feature | Evidence in Arc | Kite |
|---|---|---|
| Tidy tab titles, auto-rename downloads | "Tidy Tab Title", "Auto-Renamed Tabs and Downloads" | ☁️ needs AI (left out on purpose) |
| Ask on Page, ChatGPT in the command bar | "Ask on Page", Menu: New ChatGPT Message | ☁️ |
| Browse for Me, instant links, 5-second previews | "Browse for Me", "Instant Open" | ☁️ |

## Worth building next (offline, most useful first)

1. **Downloads list + Library page** (downloads, screenshots, archive in one place)
2. **History page** (full, searchable)
3. **Capture**: screenshot an area or full page, copy or save
4. **Site controls**: per-site permissions, zoom, clear cookies and refresh
5. **Built-in ad and cookie-banner blocking** (offline filter lists)
6. **Profiles** and **private windows**
7. **Small wins**: Copy URL as Markdown, mute all tabs, reset all tabs in a Space,
   collapse Pinned section, Print / Save Page As / View Source, tab hover preview
8. **Import from Chrome / Safari** (bookmarks and open tabs)
9. **Easels** (canvas of captures and notes)
