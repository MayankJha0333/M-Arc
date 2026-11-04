# Arc research — how its features work

Arc **1.171.0** (build 89666, built 28 Oct 2026), `/Applications/Arc.app`, bundle id `company.thebrowser.Browser`.
Researched 4 Nov 2026 for a fresh, offline Electron + React + TypeScript rebuild.

## How to read this file

| Mark | Meaning |
|---|---|
| ✅ **Confirmed** | Seen directly in Arc's app files (text, file names, field names, config files) |
| 🟡 **Likely** | Strong hint in the files, but the exact behavior isn't proven |
| ⚪ **Guess** | From public knowledge of how Arc behaves — not checked on this Mac yet |

**Evidence codes** used below:
- **[S]** = readable text found inside Arc's program file (`Contents/MacOS/Arc`). Arc still contains its own source file names (like `WindowData+SplitViewHelpers.swift`) and its on-screen sentences.
- **[R]** = a resource file inside Arc.app (named in the line).
- **[REA]** = result from the REA tool.
- **[AS]** = Arc's AppleScript dictionary (the list of things other apps can ask Arc to do).

Raw evidence is in `research-evidence/`.

---

## 1. What Arc is built from

- ✅ Native **Swift** Mac app, not Electron. [R] `Info.plist` → `NSPrincipalClass = Arc.BrowserApp`.
- ✅ Web pages are drawn by **Chromium**, inside `Frameworks/ArcCore.framework`. [R] [S "Chromium has finished restoring session for profile"]
- ✅ App logic uses a "one big state + actions" pattern (The Composable Architecture — every change is an *action* that updates one *state* tree). [S `ComposableArchitecture`, `AppSidebarReducer.swift`]
- ✅ Each feature is its own module: `CommandBar`, `LittleBrowser`, `BoostsEditor`, `LinkRouting`, `Archive`, `SpaceStyleEditor`, `StorableSidebar` … [R `Resources/ARC_*.bundle`] — full list in `research-evidence/arc-source-file-names.txt`.
- ✅ Online parts we will **not** copy: Firebase sign-in + sync, CloudKit sync, Sentry/Datadog crash reports, LaunchDarkly feature flags, ChatGPT/"Arc Max". [S + R]

**What this means for us:** Electron's `WebContentsView` replaces Chromium-in-Swift. A single store with actions (Zustand or a reducer) matches Arc's design well.

---

## 2. Where Arc saves Spaces and tabs

- ✅ **Folder:** `~/Library/Application Support/Arc/`. [S "Failed to query application support directory", `ApplicationPaths.swift`]
  - 🟡 Folder name "Arc" itself is not spelled out in the text — macOS normally uses the app name. Confirm when you copy the files.
- ✅ **Spaces, tabs, folders, favorites, pinned:** `StorableSidebar.json`. [S, `StorableSidebar.swift`]
- ✅ Other save files Arc writes there [S, full list in `research-evidence/arc-saved-file-names.txt`]:

| File | Holds | Needed for import? |
|---|---|---|
| `StorableSidebar.json` | Spaces, tabs, folders, favorites, pinned | **Yes** |
| `StorableWindows.json` | Open windows and what each one shows | Nice to have |
| `StorableArchive.json`, `StorableArchiveItems.json` | Archived tabs | Nice to have |
| `StorableLinkRouting.json` | Link routing rules | Nice to have |
| `StorableBoostsData.json` | Boosts | Nice to have |
| `StorableARCDocuments/` (folder) | Notes | Nice to have |
| `StorableProfiles.json` | Profiles (which Space uses which login set) | Nice to have |
| `StorableKeyBindings.json` | Custom shortcuts | No |
| `User Data/` (Chromium) | Cookies, passwords, history | **Never** — private |

- ✅ macOS **blocks** Claude from opening this folder directly (protected location). You must copy the JSON files into `MArc/` yourself.

### 2a. Shape of `StorableSidebar.json`

✅ **These field names exist in Arc** [S, exact matches]: `sidebar`, `sidebarSyncState`, `containers`, `spaces`, `items`, `topAppsContainerIDs`, `containerIDs`, `childrenIds`, `parentID`, `title`, `savedURL`, `savedTitle`, `timeLastActiveAt`, `isUnread`, `createdAt`, `customInfo`, `iconType`, `emoji_v2`, `windowTheme`, `profile`, `directoryBasename`, `tab`, `list`, `splitView`, `easel`, `arcDocument`, `arcDocumentID`, `pinned`, `unpinned`, `global`.

⚪ **How they fit together (guess, from public Arc-export tools — verify on your real file):**

```text
{ sidebar: { containers: [ {global:{}}, {                        ← 2nd entry is the real data
    spaces: [ "id1", {space}, "id2", {space}, ... ],             ← flat list: id, object, id, object
    items:  [ "idA", {item},  "idB", {item},  ... ],
    topAppsContainerIDs: [ {default:true}, "favContainerId", ... ]  ← favorites per profile
}]}}

space = { id, title, containerIDs: ["pinned","<pinnedId>","unpinned","<unpinnedId>"],
          customInfo: { iconType: { emoji_v2: "🚀" }, windowTheme: {...} },
          profile: { default: true } | { custom: { _0: { directoryBasename: "Profile 1" } } } }

item  = { id, parentID, childrenIds: [...], title, createdAt, isUnread,
          data: { tab: { savedURL, savedTitle, timeLastActiveAt } }   ← a tab
              | { list: {} }                                          ← a folder
              | { splitView: {...} } | { easel: {...} } | { arcDocument: { arcDocumentID } } }
```

- ✅ Everything is a **tree of items**: a Space has a "pinned" container and an "unpinned" container; folders hold children; tabs are leaves. [S `parentID`, `childrenIds`, "Item belongs to an outdated unpinned container… parentID"]
- ✅ A Space links to a **Profile** (separate cookies/logins). [S "Edit Space profile", "Arc has reverted to using your Default profile for space(s)"]
- ✅ Arc can already **export Spaces and tabs as Markdown**. [S "Button label; exports Arc Spaces and tabs as Markdown."]

**Importer plan:** read `StorableSidebar.json` → walk the tree → make our Spaces / Pinned / Folders / Today tabs / Favorites. Copy only titles, URLs, emoji icons and colors. No cookies, no logins.

---

## 3. Features, one by one

### 3.1 Sidebar tabs
- ✅ Tabs live in a **vertical sidebar**, not a top bar. [S `SidebarContainer`, `AppSidebarReducer.swift`]
- ✅ Each tab sits in one of three places: **Favorites** ("topApp"), **Pinned**, or **Unpinned** (Today). [AS `location: 'topApp' | 'pinned' | 'unpinned'`]
- ✅ "Tidy unpinned tabs" and "Clear unpinned tabs in this space" buttons. [S]
- ✅ Optional **tidy titles**: tab titles get shorter when you pin them. [S "Have your tabs automatically renamed with tidier, shorter titles when you Pin them."]
- ✅ Hover a Folder / Pinned / Favorite tab → **preview card**. [S "Hover your mouse over an Arc Folder, Pinned, or Favorited tab to quickly preview…"]
- ✅ Recently closed tabs can be undone. [S `ClosedSidebarItemsCache.swift`, `ArcUndoManager`]
- ⚪ Drag to reorder; New Tab button at the bottom opens the Command Bar.

### 3.2 Favorites
- ✅ Icon-only tiles at the **top of the sidebar** — "Favorites keep your most used sites and apps close". [S]
- ✅ Favorites belong to a **Profile**, not a Space — so Spaces that share a profile share favorites. [S "Each Profile has different browser data, so you might… see different Favorites up top"; `topAppsContainerIDs` keyed by profile]
- ✅ Commands: favorite / unfavorite / move current tab to Favorites. [S query candidates]
- ✅ ⌘1…⌘9 can include or skip Favorites (a setting). [S "Include Favorites in ordering.", `excludeFavoritesInSwitchToNthTab`]

### 3.3 Pinned tabs
- ✅ "Like a bookmarks bar, your Pinned Tabs keep the things you need within reach." [S]
- ✅ A pinned tab **remembers its home URL**. If you browse away, you get **"Back to Pinned URL"**, and you can **"Edit the pinned URL"** or replace it. [S]
- ✅ Closing a pinned tab can **"Close and Keep Pinned"** — it unloads but stays in the sidebar. [S]
- 🟡 Pinned tabs are **never auto-archived** — only unpinned (Today) tabs are. [S `AutoArchiveType`; public Arc behavior]

### 3.4 Folders
- ✅ Folders live in the pinned area and can be **nested**. [S `WindowData+Folders.swift`, "Action to pin this tab to a folder"]
- ✅ Can hold tabs, Notes, Easels, split views. [S "Creates a new folder for your tabs, Easels, Notes, and everything else… Supports multiselect"]
- ✅ Expand all / collapse all in the current Space. [S]
- ✅ Deleting a folder **archives** the tabs inside. [S "Deleting this folder will archive the tabs inside it."]
- ✅ "Live Folders" (auto-filled from GitHub/Notion etc.) exist. [S `LiveFoldersFeature`] — needs online services, **skip**.

### 3.5 Auto-archive
- ✅ Unpinned tabs you haven't used for a while move to the **Archive**. Default: **12 hours**. [S "Arc archives tabs that you haven't used in the past 12 hours."]
- ✅ Choices: **1 hour, 6 hours, 12 hours, 24 hours, 7 days, 30 days, never**. [S "Auto archive threshold; …" ×7]
- ✅ Setting is **per profile**; Arc asks whether to apply a change to all profiles. [S `AutoArchiveTimeThresholdsPerProfile`, dialog strings]
- ✅ Little Arc windows have their **own** archive timer. [S "Archive Little Arcs after:", `autoArchiveLittleArcTimeThreshold`]
- ✅ Based on each tab's **last-active time**, checked by a **timer**. [S `timeLastActiveAt`, `autoArchiveTimer`, `autoArchiveStartTime`]
- ✅ Archive page: browse, restore, **Clear Archive**. [S "Are you sure you'd like to Clear Archive?"]
- ✅ Toast: "Auto archived %d tabs". [S]

### 3.6 Spaces
- ✅ A Space = a named set of pinned + unpinned tabs — "for your work tabs, personal tabs, or otherwise". [S]
- ✅ Each Space has: **name, icon (emoji), color theme, profile**. [S "Edit Space theme", "Edit Space profile", `customInfo`, `emoji_v2`, `windowTheme`]
- ✅ Theme editor has **light / dark / automatic**. [R `SpaceStyleEditor.bundle/{sun,moon,automatic}.json`]
- ✅ Switch with a shortcut per position ("1st Space"…); drag to reorder; delete closes its tabs. [S]
- ✅ Move tabs between Spaces; move Spaces between profiles. [S]
- ⚪ Swipe two fingers left/right on the sidebar to switch Spaces; ⌃1…⌃9.

### 3.7 Command Bar
- ✅ Opens with **⌘T**; "search the web, navigate to recent tabs, launch an extension, and more". [S]
- ✅ Result types include: open URL / search, **switch to open tab** (even inside a split view), history, actions (e.g. "Clean up Folders", "Create new folder with items"), Spaces ("Focus on <space>"). [S captions]
- ✅ **De-duplicates** results by title + host for sites like figma.com, notion.so, github.com. [R `CommandBar.bundle/command_bar_behavior.json`]
- ✅ Has a ranking model with extra saved ranking data. [S `CommandBarAdditionalRankingDataStoreClient`]
- ✅ ⌘L edits the current URL; Copy URL buttons. [S]
- Skip: ChatGPT in Command Bar (online).

### 3.8 Split View
- ✅ Show **2–4 pages side by side** in one tab. [S "Jumps to the fourth Split View page"]
- ✅ Add left / right / top / bottom; flip between **vertical and horizontal**. [S menu strings]
- ✅ Create by **dragging a tab from the sidebar into the middle** of the page. [S "Drag a tab from your sidebar into the middle of the screen to create a Split View."]
- ✅ A split view is **one sidebar item**; "separate a tab from split view" undoes it. [S `splitView` item data, "Fallback title for a sidebar split view item"]
- ✅ Layout sizes are remembered. [S `SplitViewLayoutCache.swift`]

### 3.9 Peek
- ✅ "A way to preview a link without opening a new tab." [S]
- ✅ Opens when clicking a link **from a Pinned/Favorite tab to another site**, or with **Shift+click**. [S "Open a Peek window when clicking on links to other sites", "…with Shift held"]
- ✅ Floats over the page; **Esc** closes it; closing can be undone. [S]
- ✅ Can be expanded into a full tab. [S `WindowData+Expansion.swift`]

### 3.10 Little Arc (small window)
- ✅ "A smaller, simpler Arc window… perfect for quick lookups." [S]
- ✅ **Links from other apps** open here (setting). [S "Links from other apps open in Little Arc"]
- ✅ Has its own **global hotkey** (works when Arc isn't in front). [S `globalLittleBrowserHotkeyEnabled`, `GlobalHotkeyListenerClient`] — ⚪ default ⌥⌘N.
- ✅ **⌥⌘+click** a link opens it in Little Arc. [S "Open Little Arc when clicking on links with ⌥⌘ held"]
- ✅ **"Open in"** button moves the page into a full window / a chosen Space. [S]

### 3.11 Boosts (change how a site looks)
- ✅ Per-site edits; can be turned on/off per site from the site menu. [S "Enable Boosts on websites you visit", "Subtitle for active/inactive Boost"]
- ✅ Kinds: **CSS**, **JS**, **Zap** (hide an element). [S `editCSS`, `editJS`, `zaps`, "Zap all related elements"]
- ✅ Zap picker: hover an element → highlight → build a **CSS selector** (with `:nth-child`) → hide it. [REA `ev_a924df20…` on `SelectorPicker.js`]
- ✅ Disabled in Incognito. [S]
- ✅ Saved in `StorableBoostsData.json`. [S]
- Skip: sharing Boosts by link (needs Arc's server).

### 3.12 Link routing ("Air Traffic Control")
- ✅ "Routes let you choose where specific sites open inside Arc. For example, you can route Spotify links to always open inside your Personal space." [S]
- ✅ Has a **default destination** plus a list of **rules**. [S `defaultLinkRoutingDestination`, `LinkRoutingRuleChangeType`, `matchType`]
- ✅ Applies to links **from other apps**. [S `externalLinkDestination`]
- ✅ Saved in `StorableLinkRouting.json`. [S]
- 🟡 Rule = "URL contains / host matches X" → open in Space Y or Little Arc. Exact match options unknown.

### 3.13 Notes
- ✅ "Creates a new Note beside your current page." Lives in the sidebar like a tab. [S, `arcDocument` item data]
- ✅ Rich text editor. [R `ARC_ArcRichTextEditor.bundle`]
- ✅ Saved under `StorableARCDocuments/`. [S] Notes > 1 MB can't sync. [S]
- ✅ Arc has **deprecated Notes** (shows an end date + export option). [S "Notes deprecation", "Alert button; Export notes."]
- Related: **Easels** (freeform canvas) exist, also deprecated-looking — **skip** unless you want them.

### 3.14 Other things found (not on your list)
- Profiles, Incognito windows, picture-in-picture, media controls, native ad blocker, Captures (screenshots), Downloads page, keyboard shortcut editor. [S/R]

---

## 4. What I could not check yet

| Item | Why | How to fix |
|---|---|---|
| Exact JSON nesting (§2a) | Arc's data folder is macOS-protected | You copy `StorableSidebar.json` into `MArc/` |
| Watching Arc on screen | Claude needs **Screen Recording + Accessibility** in macOS settings; then quit + reopen Claude | Optional — and even then browsers are **look-only** for Claude (no clicking) |
| Default shortcuts (⌘S, ⌥⌘N, ⌃1…) | Stored in a compiled menu file | Live look, or you confirm |
| Deep code logic (decompiling) | REA's decompiler needs Ghidra/Hopper on macOS; my shell is Linux | Not needed for a rebuild |

## 5. Tools used
- **REA 6.7.0** via its command line (`npx rea-agents@6.7.0`): `doctor`, `analyze-javascript-application` (worked); `inspect-macho`, `inspect-plist`, `demangle-swift` (refused — need a macOS host).
- `strings` on the Arc program file (944k lines of text), Arc's `Info.plist`, resource bundles, AppleScript dictionary.
- **Nothing from Arc goes into the new app** — only behavior notes. No code, name, logo or icons.
