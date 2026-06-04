-use context7

# RipFlow Desktop — Project Context for Claude

## Overview
**RipFlow Desktop** — Electron + React app automating print workflow for PrintFactory machines.
**Platform:** Windows only (network paths, backslashes) | **Users:** production operators | **Code comments:** English

## Stack
| Layer | Tech |
|---|---|
| Shell | Electron 40.1.0 — frameless window, starts maximized |
| Frontend | React 19.2.0 + Vite 7.2.4 (port 5173 strictPort, alias `@` → `./src/ui`) |
| State | Zustand 5.0.11 (subscribeWithSelector) |
| Styling | CSS Modules + global.css (`--navbar-width: 104px`) |
| Animations | GSAP 2.1.2 + @gsap/react |
| Icons | React Icons 5.5.0 (Lucide `Lu*`, hi2 `Hi*`, fi `Fi*`, pi `Pi*`) |
| PDF copy | pdf-lib 1.17.1 (page 1 only) |
| PDF preview | pdfjs-dist **v4 only** — v5 breaks in Electron 40 Chromium |
| Settings | electron-store → `%APPDATA%\ripflow-desktop\config.json` — **machine-specific only** |
| DB | better-sqlite3 → `ripflow.db` in **storagePath** (NOT userData) — **shared across all PCs** |

## Key Files
```
src/electron/
  main.js                  # Frameless window, starts maximized, DEV:5173 PROD:dist/index.html
  preload.js               # IPC bridge → window.api
  helpers/
    parseFileName.js       # CORE LOGIC 600+ lines — change with extreme care
    getMaterialType.js     # material → "Cottons" | "Polyesters" | "Unknown"
                           # Uses fabricCache as primary; falls back to static sets if cache not loaded
    getSettings.js         # electron-store: storagePath, xmlPath, workstationName, customOrderFolderPath
                           # NO longer stores reasonDefinitions (migrated to DB on first run)
    getRootPath.js         # Derives all paths from getSettings() — no hardcoded values
    db.js                  # SQLite: all tables; all fns guarded if(!db)
                           # DB errors log via console.error — silent catches removed
    defaultFabrics.js      # Default seed data: 33 cotton + 87 poly materials with widths/flags
    fabricCache.js         # In-memory cache of fabrics+globals; load on startup, invalidate on save
    createBatchIds.js      # GROUP_NAME_OVERRIDES + GROUP_NAME_OVERRIDES_REVERSE (both exported)
    ipcError.js            # toIpcError(err, stage, title)
    validateStoragePath.js # assertStorageFilePath — validate batchPath/filePath before file ops
    getFileAgeInDays.js    # uses Math.floor (not ceil) — 1h-old file = 0 days, not 1
  ipc/
    index.js               # Registers all handlers; calls initDb() then loadFabricCache()
                           # Runs one-time migration: reasonDefinitions electron-store → DB
                           # file:read-buffer uses assertStorageFilePath — no path traversal
    createBatch.js         # Atomic file move; stale lock timeout = 60s (not 5min)
    batchHistoryHandlers.js # rollback, regenerateXML, deleteBatch; uses resolveOriginalGroup()
    readPrintedFolder.js   # Reads PRINTED/ tree
    createXML.js           # isVelvet/isLinen/isBlossom read from fabricCache (fallback: string-contains)

src/ui/
  store/useStore.jsx       # Zustand store — central app state
  hooks/usePdfPreview.js   # PDF → JPEG via pdfjs; module-level Map cache by filePath
  utils/notify.js          # ALWAYS use instead of setAlert() — adds toast + SessionLogs entry
  services/                # IPC abstraction layer — ALWAYS import from here, NOT window.api directly
    batchService.js        # readPrintedFolder, rollback*, watcher, deleteBatch, regenerateXml
    fileService.js         # readFolders, submitBatch, openPreview, openInFolder, readFileBuffer
    settingsService.js     # getSettings, setSettings, selectFolder
    analyticsService.js    # getRollbackStats, getRollbackDetails, clearRollbackReasons
    systemService.js       # getLogs, clearLogs, hold*, minimizeWindow, closeWindow, showConfirm
    customOrderService.js  # scanCustomOrderFolder, importCSVContent, generateCustomOrderXML,
                           #   getCustomOrderHistory, clearCustomOrderHistory, selectCustomOrderCSV
    reasonDefsService.js   # getRollbackDefinitions, setReasonDefinitions — reads/writes DB via IPC
    fabricService.js       # getFabricGlobals, setFabricGlobals, getFabrics, saveFabric,
                           #   deleteFabric, setAllFabrics
  constants/
    printerColors.js       # PRINTER_COLORS: { DGEN, YOKO, YUMI } → { bg, color }
    rollbackReasons.js     # ROLLBACK_REASONS: static fallback only — runtime data comes from DB
    rollbackReasonIcons.js # ICON_MAP, ICON_OPTIONS, resolveIcon(iconName)
  components/
    Analytics/             # rollback analytics (Details/, Summary/, hooks/)
    BatchHistory/          # day→batch→file tree, real-time watcher, rollback with reasons
      BatchHistory.jsx     # state, handlers, filter logic, day-level rendering (~620 lines)
      BatchRow.jsx         # batch header row + action buttons + file list
      FileRow.jsx          # single file row with badges and context menu
    CustomOrder/           # CSV import workflow for Minerva custom orders
      CustomOrder.jsx      # drag-drop + file picker, imports via customOrderService
      CustomOrderCard.jsx  # per-CSV card: printer toggle, generate XML button
      CustomOrderHistory.jsx # read-only history list from DB
    DataList/              # Inbox file list; own usePdfPreview instance; 5 fixed-width tag slots
    ContextMenu/           # Portal popup; supports submenu (children field) with hover delay 150ms
    RollbackModal/         # Portal modal; reason pills from store.reasonDefinitions; OTHER → text input
    ErrorBoundary/         # Class component — wraps DataList, BatchHistory, Analytics in App.jsx
    Settings/              # Left-sidebar + content layout
      Settings.jsx         # Sidebar nav (General, Paths, Fabrics, Rollback Reasons)
      views/
        GeneralView.jsx    # workstationName only
        PathsView.jsx      # storagePath, xmlPath, customOrderFolderPath
        FabricsView.jsx    # GlobalParams (margins+defaults) + Materials CRUD table
        RollbackReasonsView.jsx # reason label+icon editor; add new reasons

src/shared/
  estimatePrintLength.js        # Used in both electron and UI
                                # Signature: estimatePrintLength(files, config = null)
                                # config = { globals: {...}, fabrics: [...] } — optional DB-backed values
  estimatePrintLength.test.js   # Vitest unit tests — 15 tests
  printWidths.js                # Hardcoded defaults (still used as fallback; DB is primary)
                                # Fixed dims stay hardcoded: SAMPLE 220×200, FQ 670×480, TEA_TOWEL 700×500
  constants.js                  # BATCH_STATUS, FILE_STATUS, PRINTER, CUSTOM_ORDER_STATUS
```

## Workflow
```
INBOX → PARSE FILENAME → UI → SELECT FILES+PRINTER → CREATE BATCH+XML → PRINTFACTORY → PRINT
```
1. Scan `storagePath` (default `O:\SPPrintReadyArtwork`)
2. Parse PDF filenames → extract metadata (product type, material, qty, dimensions)
3. Operator selects files + printer → submit
4. Atomically move files (temp → rename) with rollback on failure
5. Generate XML for PrintFactory to network `xmlPath`

## Views (`activeView` in App.jsx)
| View | Components |
|---|---|
| `"print"` | DataOverviewSection + DataFilters + DataList (wrapped in ErrorBoundary) |
| `"batch"` | BatchHistory (wrapped in ErrorBoundary) |
| `"analytics"` | Analytics (wrapped in ErrorBoundary) |
| `"logs"` | SessionLogs |
| `"settings"` | Settings (sidebar: General / Paths / Fabrics / Rollback Reasons) |
| `"customOrder"` | CustomOrder (CustomOrderCard + CustomOrderHistory) |

## File Types (`parseFileName.js`)
- **LM** — Linear Meter | **FQ** — Fat Quarter | **SAMPLE** — Sample Print
- **CUSHION** — Custom Square Cushion | **TEA_TOWEL** — Custom Tea Towel

Tokenize by `_`, detect CUSHION/TEA_TOWEL by keyword, others by XWD hex token.

**Return shape — CRITICAL (`file` is nested):**
```js
{
  file: { name, ext, dir, fullPath },  // access as item.file.name, NOT item.name
  orderId, customerName, xOfY,
  printTypeCode, printType,
  qty, material, size, width, height,
  status: "READY" | "INVALID",
  errors: [], warnings: []
}
```

## Storage — Two-tier config

**electron-store** (per-machine, `%APPDATA%\ripflow-desktop\config.json`):
- `storagePath`, `xmlPath`, `workstationName`, `customOrderFolderPath`

**ripflow.db** (shared across all PCs via network `storagePath`):
- Operational: `logs`, `held_files`, `rollback_reasons`, `custom_order_history`
- Shared config: `reason_definitions`, `fabric_globals`, `fabrics`

```
storagePath:     O:\SPPrintReadyArtwork       (default)
xmlPath:         \\192.168.0.17\Original_files\SPPrintReadyArtwork
workstationName: os.hostname()               (set on first run)

Derived paths:
  {storagePath}\AUTOMATION_WORKFLOW_COTTON\  ← DGEN
  {storagePath}\AUTOMATION_WORKFLOW_POLY\    ← YOKO/YUMI
  {storagePath}\PRINTED\DD-MM-YYYY\PRINTED_HHMMSS-GROUP-PRINTER\
```

## SQLite (`helpers/db.js`)
Tables: `logs`, `held_files`, `rollback_reasons`, `custom_order_history`, `reason_definitions`, `fabric_globals`, `fabrics`

- `rollback_reasons.file_id = null` → whole batch reason; `= filename-without-ext` → single file
- `logs.workstation` can be NULL in old records — render conditionally
- Indexes: `rollback_reasons(batch_path)`, `rollback_reasons(file_id)`, `logs(timestamp DESC)`
- `getAllLogs` is capped at 500 rows; `addLog` in store trims to 500 entries
- `fabric_globals` and `fabrics` are seeded from `defaultFabrics.js` on first run if tables empty
- `reason_definitions` is populated via one-time migration from electron-store on first run

**All DB functions:** `initDb`, `insertLog`, `getAllLogs`, `clearAllLogs`, `holdFile`, `unholdFile`, `getHeldFiles`, `insertRollbackReason`, `getRollbackReasonsByBatch`, `getRollbackReasonsByFile`, `insertCustomOrder`, `getAllCustomOrders`, `clearCustomOrders`, `getReasonDefinitions`, `setReasonDefinitions`, `migrateReasonDefinitions`, `getFabricGlobals`, `setFabricGlobals`, `getAllFabrics`, `saveFabric`, `deleteFabric`, `setAllFabrics`

## Fabric Config (`fabricCache.js`)
In-memory cache loaded at startup (`loadFabricCache()` called in `ipc/index.js` after `initDb()`).
Invalidated and reloaded after every `fabrics:save`, `fabrics:delete`, `fabrics:setAll`, `fabricGlobals:set`.

```js
loadFabricCache()        // load from DB into memory
invalidateFabricCache()  // clear cache (call before reloading)
getFabricByName(name)    // → fabric object | null
getFabricTypeFromCache(name) // → "Cottons" | "Polyesters" | "Unknown" | null (null = cache not loaded)
getXmlWidthFromCache(name, isPoly) // → number (per-material or global default)
getCachedFabrics()       // → fabric[]
getCachedGlobals()       // → { marginCotton, marginPoly, defaultXmlWidthCotton, ... }
```

**Fallback chain (getMaterialType.js):**
1. fabricCache loaded → use DB result
2. Cache not loaded (before initDb) → fall back to static COTTON_MATERIALS / POLY_MATERIALS sets

**Fallback chain (parseFileName.js `applyLmDimensions`):**
1. `getXmlWidthFromCache(material, isPoly)` → per-material DB value
2. Cache not loaded → `getXmlWidthFromCache` returns global default → falls back to hardcoded `LM_XML_POLY` / `LM_XML_COTTON_DEFAULT`

## Atomic File Move (`createBatch.js`)
VALIDATE → LOCK (`.lock` file) → DESTINATION_STRUCTURE → COPY (pdf-lib p.1) → VERIFY → COMMIT (rename + write `_batch_info.json { originalGroup }`) → DELETE_SOURCE → ROLLBACK on fail

`_batch_info.json`: stores full inbox folder name (`originalGroup`). Used by `batchHistoryHandlers` to find correct rollback target. Without it, falls back to GROUP_NAME_OVERRIDES_REVERSE.

## IPC API (`window.api`)
```js
// Inbox
readFolders() / onReadFoldersProgress(cb) / submitBatch(batch)

// Batch history
readPrintedFolder()
regenerateXml(batchPath)
rollbackBatch({ batchPath, reason: { code, label } })          // object arg, NOT positional
rollbackFile({ filePath, batchPath, reason: { code, label } }) // object arg, NOT positional
deleteBatch(batchPath)
startBatchWatcher() / stopBatchWatcher() / onBatchUpdate(cb)

// Rollback reasons
getRollbackReasonsByBatch(batchPath)  // → { success, data: reason[] }
getRollbackReasonsByFile(fileId)      // → { success, data: reason | null }

// Rollback reason definitions (DB-backed, shared across PCs)
getRollbackDefinitions()                // → { success, data: [{code, label, iconName}] }
setReasonDefinitions(defs)             // → { success }

// Fabric config (DB-backed, shared across PCs)
getFabricGlobals()                     // → { success, data: { marginCotton, marginPoly, defaultXmlWidthCotton, defaultXmlWidthPoly, defaultRollWidthCotton, defaultRollWidthPoly } }
setFabricGlobals(globals)              // → { success }
getFabrics()                           // → { success, data: fabric[] }
saveFabric(oldName, fabric)            // → { success } — handles rename (delete+insert) if name changed
deleteFabric(name)                     // → { success }
setAllFabrics(fabrics)                 // → { success } — bulk replace

// Settings — ALWAYS pass all 4 fields to avoid null overwrite
getSettings()  // → { success, settings: { storagePath, xmlPath, workstationName, customOrderFolderPath } }
setSettings({ storagePath, xmlPath, workstationName, customOrderFolderPath })
selectFolder() // → { success, canceled, path }

// Logs / Held files
getLogs() / clearLogs()
getHeldFiles() / holdFile(fileId) / unholdFile(fileId)

// Files — use IPC, NOT file:// URI (blocked by contextIsolation)
readFileBuffer(filePath)  // → { success, data: base64string }
openPreview(filePath) / openInFolder(filePath)
showConfirm(message)      // → boolean (native Electron dialog)

// Window (frameless)
minimizeWindow() / closeWindow()

// Custom Orders — ALWAYS use customOrderService, never window.api.customOrder directly
customOrder.scanFolder()          // → { success, count }
customOrder.selectCSV()           // → { success, canceled, files: [{name, content}] }
customOrder.importCSVContent(str) // → { success, data: { poNumber, materialName, files, totalMeters, missingCount } }
customOrder.generateXML(group)    // → { success }
customOrder.getHistory()          // → { success, data: order[] }
customOrder.clearHistory()        // → { success }
```

## Zustand Store (`useStore.jsx`)
```js
{
  activeTab, searchQuery, sortOrder, printTypeFilter,
  files, filteredFiles,         // inbox groups
  selectedIds: Set(),           // material lock: cannot mix Cottons + Polyesters
  isRefreshingFiles, lastFilesRefreshAt,
  batchDays, isBatchSubmitting,
  logs: [{ id, timestamp, type, stage, code, message, detail, workstation }],
  heldIds: Set(),               // synced with SQLite via loadHeldFiles() + toggleHold()
  alerts: [{ id, type, title, message }],
  reasonDefinitions: [{code, label, iconName}],  // loaded from DB on startup; fallback to static ROLLBACK_REASONS
  fabricConfig: { globals: {...}, fabrics: [...] } | null,  // loaded from DB on startup
}
```
Key: `getLastBatch(batchDays)` exported helper. `applyFilters()` internal helper.

**Startup load order (App.jsx):**
```js
loadLogsFromDb()        // non-awaited
loadReasonDefinitions() // non-awaited — DB → store.reasonDefinitions
loadFabricConfig()      // non-awaited — DB → store.fabricConfig
await loadHeldFiles()
await refreshFiles(...)
refreshBatchDays()      // non-awaited
```

**DataFilters:** call `loadHeldFiles()` BEFORE `refreshFiles()` — order is critical.

## Print Widths — Hardcoded vs DB
`printWidths.js` values are now **fallbacks only**. DB (`fabric_globals` + `fabrics`) is the primary source.

| Config | DB table | Fallback |
|---|---|---|
| Margins (cotton/poly) | `fabric_globals` | `MARGIN_COTTON=10`, `MARGIN_POLY=5` |
| Default XML widths | `fabric_globals` | `LM_XML_POLY=1420`, `LM_XML_COTTON_DEFAULT=1420` |
| Default roll widths | `fabric_globals` | `LM_ROLL_POLY=1550`, `LM_ROLL_COTTON_DEFAULT=1420` |
| Per-material XML width | `fabrics.xml_width` | `LM_XML_COTTON[name]` map |
| Per-material roll width | `fabrics.roll_width` | `LM_ROLL_COTTON[name]` map |
| Material type routing | `fabrics.type` | static Sets in getMaterialType.js |
| XML flags (velvet/linen/blossom) | `fabrics.is_velvet/is_linen/is_blossom` | string-contains fallback |

**Fixed product dims stay hardcoded** (never user-editable):
- SAMPLE 220×200mm, FQ 670×480mm, TEA_TOWEL 700×500mm

## BatchHistory — Key Behaviors
- Call `stopBatchWatcher()` on unmount
- Click anywhere on batch row to expand/collapse; action buttons use `e.stopPropagation()`
- Whole batch rollback: watcher sends `"removed"` → no manual reload needed
- Single file rollback: watcher fires but only sends event if batch has 0 PDFs left; optimistic update is sufficient for UI — do NOT call `loadData()` after single file rollback
- `loadData` must fetch rollback reasons for: (a) `rolled_back` batches AND (b) `active` batches with any `file.status === "rolled_back"` — skipping (b) breaks file-level badges
- Optimistic updates: set state immediately after `res?.success`, watcher syncs after
- `"new-batch"` watcher event: preserve existing reasons: `rollbackReasons: batch.rollbackReasons ?? b.rollbackReasons` — Windows `fs.watch` can fire mid-optimistic-update
- Reason badge lookup: `file_id === fileId` first, fallback to `file_id === null` (batch-level)
- Hook destructured with prefixes (`isPreviewLoading`, `isPreviewOpen`) to avoid conflict with local `isLoading`
- **Component split**: day-level rendering in `BatchHistory.jsx`; batch header+actions in `BatchRow.jsx`; file row in `FileRow.jsx` — both sub-components import `BatchHistory.module.css` directly
- Watcher race condition handled: `readSingleBatch` wrapped in try/catch; `ENOENT` → sends `"removed"` event

## Rollback Reasons
14 codes: `MISSING_JOB`, `PRINTER_LINES`, `WRONG_SIZE`, `WRONG_MATERIAL`, `FABRIC_FAULT`, `PRESSING_FAULT`, `FABRIC_CREASE`, `GHOSTING`, `LINT_MARK`, `WRONG_COLOURS`, `AUTOMATION_FAULT`, `RERUN`, `ARTWORK_ISSUE`, `OTHER`
- Labels and icons are stored in `reason_definitions` DB table — **shared across all PCs**
- `ROLLBACK_REASONS` in `constants/rollbackReasons.js` is the static fallback only (used before DB loads)
- `WRONG_MATERIAL` displays as "Wrong Fabric" (label changed; code kept for DB backwards-compat)
- `OTHER` → inline portal modal with text input (`window.prompt` returns null in Electron contextIsolation)
- ContextMenu submenu child `onClick`: call `onClose()` BEFORE `child.onClick()` — Electron timing
- New reasons can be added via Settings → Rollback Reasons; immediately available in RollbackModal, BatchHistory, Analytics

## Settings Architecture
Left-sidebar + content-area layout. `Settings.jsx` routes via `SECTIONS` array + `VIEWS` map.

| Section | View | Notes |
|---|---|---|
| General | `GeneralView` | workstationName only |
| Paths | `PathsView` | storagePath, xmlPath, customOrderFolderPath |
| Fabrics | `FabricsView` | Global params + Materials CRUD (DB-backed, shared) |
| Rollback Reasons | `RollbackReasonsView` | label+icon per reason; add/edit; DB-backed, shared |

All views share `SettingsView.module.css` for base layout (`.view`, `.view_header`, etc.).

## GROUP_NAME_OVERRIDES (`createBatchIds.js`)
Maps long group names → short folder names. `resolveOriginalGroup(batchPath, shortGroup)`:
1. Read `_batch_info.json` from batch folder
2. Fallback: `GROUP_NAME_OVERRIDES_REVERSE[shortGroup]`
3. Last fallback: `shortGroup` unchanged

## usePdfPreview Hook
- Module-level LRU Map cache (key: filePath) — capped at 30 entries; instant on repeat opens
- Render scale: 0.75 (not 1.0); canvas released after render (`canvas.width = 0`)
- Returns: `{ openPreview, closePreview, navigate, isOpen, isLoading, imgSrc, error, currentPath, currentIndex, fileList }`
- `PdfPreviewModal` accepts `fileList: [{ path, name }]`; in BatchHistory skip `rolled_back` files
- `DataList` has its own instance — does not share cache/state with BatchHistory instance

## Dev Commands
```bash
npm run dev        # Vite + Electron concurrently (wait-on)
npm run build      # Vite → dist/
npm run lint       # ESLint flat config v9 — separate rules for ui/ and electron/
npm run test       # Vitest — runs src/**/*.test.js (node environment)
npm run test:watch # Vitest watch mode
```

## Critical Rules
1. **Always grep before deleting** — audit reports miss non-obvious imports
2. `parseFileName` returns `file: { name, ext, dir, fullPath }` — use `item.file.name`, not `item.name`
3. `rollbackBatch`/`rollbackFile` take object `{ ..., reason }` — not positional args
4. `setSettings()`: always pass all 4 fields (`storagePath`, `xmlPath`, `workstationName`, `customOrderFolderPath`)
5. Use `notify()` not `setAlert()` — only `notify()` writes to SessionLogs
6. `ripflow.db` lives in `storagePath` — fails if network unavailable; app continues (all db fns guarded)
7. pdfjs-dist **must stay v4** — v5 incompatible with Electron 40 Chromium
8. Load PDF via IPC `readFileBuffer` → base64 → Uint8Array → `pdfjsLib.getDocument({ data })` — NOT `file://`
9. `Badge` component exists but is **unused** in DataList (inline icon tags used instead)
10. `DataDaysCounter` was removed — age rendered inline in DataList; do not recreate
11. **Never call `window.api` directly in components** — always import from `src/ui/services/`
12. **Use `BATCH_STATUS`, `FILE_STATUS`, `PRINTER`, `CUSTOM_ORDER_STATUS` from `src/shared/constants.js`** — never compare against raw strings like `"rolled_back"`, `"active"`, `"complete"`, `"partial"`
13. **All file IPC handlers** use `assertStorageFilePath` — prevents path traversal outside storagePath
14. Vitest tests exist in `src/shared/` — run `npm run test` before shipping changes to `estimatePrintLength.js`
15. **Custom Order CSV import**: `customOrder:importCSV` was removed — use `selectCSV()` (returns `files: [{name, content}]`) then `importCSVContent(content)`. Never pass file paths from renderer to main for reading.
16. **Batch rollback reason**: insert ONE row with `fileId: null` (batch-level). Single file rollback inserts one row with `fileId = filename-stem`. Do not insert per-file rows on batch rollback.
17. **Fabric/reason config is DB-backed and shared** — electron-store holds ONLY machine-specific settings (paths, workstation name). Do NOT store shared config back in electron-store.
18. **fabricCache must be loaded before getMaterialType/parseFileName are called** — `loadFabricCache()` is called in `ipc/index.js` right after `initDb()`. Both functions have static-set fallbacks for the window before DB is ready.
