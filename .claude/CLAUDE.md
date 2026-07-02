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
| XML parse | fast-xml-parser 5.x — main process only (RIP-error ingest); generation stays hand-rolled string templates |
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
    getSettings.js         # electron-store: storagePath, xmlPath, workstationName, customOrderFolderPath, workstationRole, labelPrinterName, shippedRetentionDays, batchHistoryEagerDays, labelPrintMode, clientId
                           # NO longer stores reasonDefinitions (migrated to DB on first run)
    getRootPath.js         # Derives all paths from getSettings() — no hardcoded values
    db.js                  # SQLite: all tables; all fns guarded if(!db)
                           # DB errors log via console.error — silent catches removed
    defaultFabrics.js      # Default seed data: 33 cotton + 87 poly materials with widths/flags
    fabricCache.js         # In-memory cache of fabrics+globals; load on startup, invalidate on save
    fabricCache.test.js    # Vitest — getAliasFromCache sanitization (mocks ./db.js)
    createBatchIds.js      # GROUP_NAME_OVERRIDES + GROUP_NAME_OVERRIDES_REVERSE (both exported)
    ipcError.js            # toIpcError(err, stage, title)
    validateStoragePath.js # assertStorageFilePath — validate batchPath/filePath before file ops
    getFileAgeInDays.js    # uses Math.floor (not ceil) — 1h-old file = 0 days, not 1
    parseRipErrorXml.js    # fast-xml-parser; PrintFactory error XML → array of error rows
                           # main process only; Shape A (1 row) vs Shape B (N rows) — see RIP Errors section
  ipc/
    index.js               # Registers all handlers; calls initDb() then loadFabricCache()
                           # Runs one-time migration: reasonDefinitions electron-store → DB
                           # file:read-buffer uses assertStorageFilePath — no path traversal
    createBatch.js         # Atomic file move; stale lock timeout = 60s (not 5min)
    batchHistoryHandlers.js # rollback, regenerateXML, deleteBatch; uses resolveOriginalGroup()
    readPrintedFolder.js   # Reads PRINTED/ tree. Exports: readPrintedFolder (full scan, legacy),
                           #   readPrintedDays (skeletons, enumeration only), readPrintedDay (one day),
                           #   readSingleBatch (unchanged), buildDayGroup (shared per-day mapping)
    createXML.js           # isVelvet/isLinen/isBlossom read from fabricCache (fallback: string-contains)
    ripErrorHandlers.js    # scanRipErrors(): reads {storagePath}\AUTOMATION_WORKFLOW_ERROR, parses *.xml → rip_errors
                           # IPC rip-errors:scan / rip-errors:get

src/ui/
  store/useStore.jsx       # Zustand store — central app state
  hooks/usePdfPreview.js   # PDF → JPEG via pdfjs; module-level Map cache by filePath
  utils/notify.js          # ALWAYS use instead of setAlert() — adds toast + SessionLogs entry
  services/                # IPC abstraction layer — ALWAYS import from here, NOT window.api directly
    batchService.js        # readPrintedFolder, readPrintedDays, readPrintedDay, rollback*, watcher, deleteBatch, regenerateXml
    fileService.js         # readFolders, submitBatch, openPreview, openInFolder, openInShopify, readFileBuffer
    settingsService.js     # getSettings, setSettings, selectFolder
    analyticsService.js    # getRollbackStats, getRollbackDetails, clearRollbackReasons
    systemService.js       # getLogs, clearLogs, hold*, minimizeWindow, closeWindow, showConfirm
    customOrderService.js  # scanCustomOrderFolder, importCSVContent, generateCustomOrderXML,
                           #   getCustomOrderHistory, clearCustomOrderHistory, selectCustomOrderCSV
    reasonDefsService.js   # getRollbackDefinitions, setReasonDefinitions — reads/writes DB via IPC
    fabricService.js       # getFabricGlobals, setFabricGlobals, getFabrics, saveFabric,
                           #   deleteFabric, setAllFabrics
    productionService.js   # getAllStages, getStagesAfter, getStagesByBatch, advanceStage,
                           #   setSewingSent, setSewingReceived, printBatchLabel,
                           #   getAllStageHistory, clearAllProductionStages
    ripErrorService.js     # scanRipErrors, getRipErrors — withTimeout wrappers
  constants/
    printerColors.js       # PRINTER_COLORS: { DGEN, YOKO, YUMI } → { bg, color }
    rollbackReasons.js     # ROLLBACK_REASONS: static fallback only — runtime data comes from DB
    rollbackReasonIcons.js # ICON_MAP, ICON_OPTIONS, resolveIcon(iconName)
    printTypeMap.js        # PRINT_TYPE_MAP: { LM, FQ, SAMPLE, CUSHION, TEA_TOWEL } → { label, Icon, color }
  components/
    Analytics/             # rollback analytics (Details/, Summary/, hooks/)
    BatchHistory/          # day→batch→file tree, real-time watcher, rollback with reasons
      BatchHistory.jsx     # state, handlers, filter logic, day-level rendering (~620 lines)
      BatchRow.jsx         # batch header row + action buttons + file list
      FileRow.jsx          # single file row with badges and context menu
    CustomOrder/           # CSV import workflow for Minerva custom orders
      CustomOrder.jsx      # drag-drop + file picker, imports via customOrderService
      CustomOrderCard.jsx  # per-CSV card: printer toggle, per-file checkbox selection, generate XML button
      CustomOrderHistory.jsx # read-only history list from DB
    DataList/              # Inbox file list; own usePdfPreview instance; 5 fixed-width tag slots
    Production/            # Stage tracking board for in-progress batches
      Production.jsx       # filters, scanner, bulk-select, stage-aware context menu, polling
      ProductionCard.jsx   # single file card: stage pills pipeline, GSAP highlight on scan; dimmed "Awaiting QC" badge in qc view
      ProductionRollbackModal.jsx # rollback modal: per-file reason dropdown + qty_affected input
                           # returns decisions [{fileId, reason, override}]; override = {qty}|{meters}
    ContextMenu/           # Portal popup; supports submenu (children field) with hover delay 150ms
    RipErrorPopover/       # Shared anchored popover (ProductionCard + FileRow); RIP-error detail + Copy
                           # positioning + backdrop-close lifted from ContextMenu (not imported)
    RollbackModal/         # Portal modal; reason pills from store.reasonDefinitions; OTHER → text input
    ErrorBoundary/         # Class component — wraps DataList, BatchHistory, Analytics in App.jsx
    Settings/              # Left-sidebar + content layout
      Settings.jsx         # Sidebar nav (General, Paths, Fabrics, Rollback Reasons, Database, Maintenance, Updates)
      views/
        GeneralView.jsx    # workstationName, workstationRole, shippedRetentionDays, batchHistoryEagerDays
        PathsView.jsx      # storagePath, xmlPath, customOrderFolderPath
        FabricsView.jsx    # GlobalParams (margins+defaults) + Materials CRUD table
        RollbackReasonsView.jsx # reason label+icon editor; add new reasons
        DatabaseView.jsx   # manual DB backup (+ auto-backup on startup)
        MaintenanceView.jsx # clear rollback / custom-order history, clear all production stages
        UpdatesView.jsx    # auto-updater UI (check/install, changelog, clientId channel)

src/shared/
  estimatePrintLength.js        # Used in both electron and UI
                                # Signature: estimatePrintLength(files, config = null)
                                # config = { globals: {...}, fabrics: [...] } — optional DB-backed values
  estimatePrintLength.test.js   # Vitest unit tests — 15 tests
  printWidths.js                # Hardcoded defaults (still used as fallback; DB is primary)
                                # Fixed dims stay hardcoded: SAMPLE 220×200, FQ 670×480, TEA_TOWEL 700×500
  constants.js                  # BATCH_STATUS, FILE_STATUS, PRINTER, CUSTOM_ORDER_STATUS
                               # PRODUCTION_STAGE, STAGE_NEXT, STAGE_PREV, STAGE_LABEL, STAGE_COLOR
                               # QC_ACTION, SEWING_SUGGESTED_TYPES (["CUSHION", "TEA_TOWEL"]) — kept for backward-compat; no longer used in UI after QCModal removal (like REJECTED/OVERRIDDEN)
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
| `"settings"` | Settings (sidebar: General / Paths / Fabrics / Rollback Reasons / Database / Maintenance / Updates) |
| `"customOrder"` | CustomOrder (CustomOrderCard + CustomOrderHistory) |
| `"production"` | Production (ProductionCard + ProductionRollbackModal) |

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
- `storagePath`, `xmlPath`, `workstationName`, `customOrderFolderPath`, `workstationRole`, `labelPrinterName`, `shippedRetentionDays`, `batchHistoryEagerDays`, `labelPrintMode`, `clientId`
- `batchHistoryEagerDays` — per-machine, default 7, min 1; how many most-recent days BatchHistory eager-loads (rest are lazy skeletons, loaded on expand)

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
Tables: `logs`, `held_files`, `rollback_reasons`, `custom_order_history`, `reason_definitions`, `fabric_globals`, `fabrics`, `file_stages`, `file_stage_history`, `reprint_requests`, `rip_errors`

- `rollback_reasons.file_id = null` → whole batch reason; `= filename-without-ext` → single file
- `logs.workstation` can be NULL in old records — render conditionally
- `held_files` is keyed by `file_id` (PRIMARY KEY) with an optional `reason` — a **global** hold model (one operator holds a file, everyone sees it; legacy per-workstation rows are migrated to this shape on `initDb`). `file_id` == the inbox item id `${folder}_${filename.pdf}` (same key `readFolders` builds). Rows are **orphan-pruned** on a clean inbox scan (see `pruneOrphanHeldFiles`), because nothing else clears a hold when its file leaves the inbox — `unholdFile` is only ever called by the explicit in-app un-hold toggle (NOT by `createBatch`/rollback)
- Indexes: `rollback_reasons(batch_path)`, `rollback_reasons(file_id)`, `logs(timestamp DESC)`
- `getAllLogs` is capped at 500 rows; `addLog` in store trims to 500 entries
- `fabric_globals` and `fabrics` are seeded from `defaultFabrics.js` on first run if tables empty
- `fabrics` has an `alias` column (TEXT, nullable) — short path-safe name for the PRINTED folder / XML; empty/NULL alias = full `name` is used
- `reason_definitions` is populated via one-time migration from electron-store on first run
- `rip_errors`: one row per ERRORED FILE (not per xml). `UNIQUE(job_guid, file_id)` — dedup is per (xml, file); a pre-split failure shares one `job_guid` across N files → N rows. Index: `rip_errors(file_id)`

**All DB functions:** `initDb`, `insertLog`, `getAllLogs`, `clearAllLogs`, `holdFile`, `unholdFile`, `getHeldFiles`, `pruneOrphanHeldFiles` (DELETE `held_files` rows whose `file_id` ∉ the passed live-inbox id set; the diff runs in main so only the small orphan set hits the DELETE; refuses a non-array/EMPTY `liveIds` so a failed/empty scan can never wipe the table), `insertRollbackReason`, `getRollbackReasonsByBatch`, `getRollbackReasonsByFile`, `insertCustomOrder`, `getAllCustomOrders`, `clearCustomOrders`, `deleteCustomOrder` (hard `DELETE … WHERE id = ?` for a single history row; returns the `run` result so `.changes` is inspectable), `getReasonDefinitions`, `setReasonDefinitions`, `migrateReasonDefinitions`, `getFabricGlobals`, `setFabricGlobals`, `getAllFabrics`, `saveFabric`, `deleteFabric`, `setAllFabrics`, `ensureFabricAliasColumn` (idempotent `ALTER TABLE fabrics ADD COLUMN alias` in `initDb`, wrapped in try/catch — safe when several PCs start against the shared DB), `insertReprintRequest`, `getOpenReprintRequests`, `getOpenReprintRequestsByFileIds`, `fulfillReprintRequests`, `getReprintRequests`, `clearAllReprintRequests`, `clearAllRollbackReasons`, `getRollbackStats`, `getRollbackDetails`, `getLatestRollbackReasonsForFileIds`, `clearAllFileStages`, `backupDb`, `cleanupShippedStages`, `insertRipError` (INSERT OR IGNORE), `getOpenRipErrors` (`resolved_at IS NULL`, ORDER BY `detected_at DESC`), `getRipErrorsByFileIds`, `resolveRipErrorsByFile` (UPDATE … SET `resolved_at` WHERE `file_id=?` AND `resolved_at IS NULL` → resolves ALL open rows for a file_id; called on rollback)

**`reprint_requests`** (partial reprint tracking): one row per rollback-from-Production event. `qty_affected` REAL — meters for LM, piece count otherwise; `qty_original` = full qty at rollback time. Open = `fulfilled_at IS NULL AND superseded_at IS NULL`. A new rollback of the same file **supersedes** prior open rows (history kept for analytics). `stage:advance` to `packed` calls `fulfillReprintRequests(fileId)`. Index: `reprint_requests(file_id)`. When a Production rollback registers a qty, `rollback_reasons.meters` is estimated from **qty_affected** (LM: meters→height; others: pieces→qty), so Analytics waste (byFabric, Details) is partial-aware with no Analytics-side changes; BatchHistory rollbacks keep full-file meters. `readFolders` attaches `reprintQty`/`reprintQtyOriginal` to inbox file objects from open requests (matched by filename stem); `readSingleBatch` (BatchHistory) **prefers the persisted provenance in `_batch_info`** for reprint, falling back to open requests only when `_batch_info` has none → persistent blue "Reprint" badge in DataList and BatchHistory `FileRow`. **`selectedOverrides` holds ONLY manual operator overrides — it is no longer seeded from reprint** (the old seeding loop in `refreshFiles` was removed). At submit, `fileService.submitBatch` computes `effectiveQty = manualOverride ?? reprintQty ?? parsed`, and only the effective amount drives the printed output (XML `<Copies>`/`<Height>`) and the `_batch_info.json` provenance — `createXML.js` still needs no reprint logic. The Override and Reprint badges are independent and may coexist (Override from `selectedOverrides`, Reprint from open requests / `_batch_info`); the old masking that hid the Override badge while it equalled `reprintQty` was removed. **Reprints counter (print-view OverviewPanel):** the "Reprints" pill shows `store.openReprints.length`, loaded via `reprint:getOpen` (= `getOpenReprintRequests`, ALL open rows regardless of location) and refreshed on the global 30s poll. It counts every open request — inbox (rolled back, awaiting reprint) **+** in-production (`file_stages`) **+** any **phantom** whose file has left both (no inbox PDF and no `file_stages` row, e.g. a reprint never re-run). A phantom is invisible in every view but still counted, so the pill can legitimately read one higher than the sum of what any single view shows — the count is authoritative against the DB, not a per-view total.

**`rip_errors`** (RIP-error tracking): one row per **errored file**. Columns: `id` TEXT PK (`crypto.randomUUID`), `job_guid` TEXT NOT NULL, `file_id` TEXT NOT NULL (filename stem, matches `file_stages.file_id`), `batch_id`, `nesting_group`, `failed_node`, `error_message`, `document_id` (XWD, nullable backup key), `detected_at` (ISO ingest time), `created_at` (`<Created>` from xml, nullable), `resolved_at` (NULL = open; **set on rollback** by `resolveRipErrorsByFile` — rollback is the only resolve path). `UNIQUE(job_guid, file_id)` + `INSERT OR IGNORE` → a pre-split failure shares one `job_guid` across N files (N rows), and re-scans don't duplicate. The **same `file_id` may hold multiple open errors** (different `job_guid` = distinct events); `getOpenRipErrors` orders `detected_at DESC` and the store keeps only the most recent per file. See **RIP Errors** section.

## Fabric Config (`fabricCache.js`)
In-memory cache loaded at startup (`loadFabricCache()` called in `ipc/index.js` after `initDb()`).
Invalidated and reloaded after every `fabrics:save`, `fabrics:delete`, `fabrics:setAll`, `fabricGlobals:set`.

```js
loadFabricCache()        // load from DB into memory
invalidateFabricCache()  // clear cache (call before reloading)
getFabricByName(name)    // → fabric object | null
getFabricTypeFromCache(name) // → "Cottons" | "Polyesters" | "Unknown" | null (null = cache not loaded)
getXmlWidthFromCache(name, isPoly) // → number (per-material or global default)
getAliasFromCache(name)  // → short path-safe alias | null (null = no/unusable alias or cache not loaded)
getCachedFabrics()       // → fabric[]
getCachedGlobals()       // → { marginCotton, marginPoly, defaultXmlWidthCotton, ... }
```

**Fallback chain (getMaterialType.js):**
1. fabricCache loaded → use DB result
2. Cache not loaded (before initDb) → fall back to static COTTON_MATERIALS / POLY_MATERIALS sets

**Alias sanitization — single gate:** `getAliasFromCache` strips everything outside `[a-zA-Z0-9_-]` (and trims) at the point of use, returning `null` if nothing usable remains. This is the ONE gate, independent of the UI `onChange` — so a dirty alias entering via `setAllFabrics`/import or a hand-edited `ripflow.db` can never reach the PRINTED folder name / `<Path>`.

**Fallback chain (parseFileName.js `applyLmDimensions`):**
1. `getXmlWidthFromCache(material, isPoly)` → per-material `fabric.xmlWidth` from the cache
2. No per-material match (or cache not loaded) → global default from `getCachedGlobals()` (`defaultXmlWidthPoly` / `defaultXmlWidthCotton`), which falls back to `DEFAULT_FABRIC_GLOBALS` (`defaultFabrics.js`) when the cache is empty, with a final `?? 1420`. parseFileName.js no longer imports `printWidths.js` `LM_XML_*` constants (removed in lint cleanup).

## Atomic File Move (`createBatch.js`)
VALIDATE → LOCK (`.lock` file) → DESTINATION_STRUCTURE → COPY (pdf-lib p.1) → VERIFY → COMMIT (rename + write `_batch_info.json { originalGroup, overrides? }`) → DELETE_SOURCE → ROLLBACK on fail

**COPY is page 1 only — intentional.** `pdf-lib` copies only the first page of each source PDF; pages 2+ are deliberately not preserved (PrintFactory needs only page 1). A rolled-back or regenerated file therefore never carries pages 2+ — by design, not data loss.

`_batch_info.json`: stores full inbox folder name (`originalGroup`). Used by `batchHistoryHandlers` to find correct rollback target. Without it, falls back to GROUP_NAME_OVERRIDES_REVERSE. It also persists per-file print provenance under `overrides[stem]` = `{ printed: {meters}|{qty}, manual: bool, reprintQty, reprintOriginal }` — written in `createBatch.js` from the `_printed`/`_manual`/`_reprintQty`/`_reprintOriginal` fields set by `fileService.submitBatch` (one entry per file that has an effective printed amount: manual override OR reprint). `readPrintedFolder.js` reads it via `normalizeOverrideEntry`, which also accepts the **legacy shape** (`{qty}`|`{meters}`) defensively (treated as `manual:true`, no reprint provenance). Group metres (`fixedTotalLengthM`) are computed from `printed` (effective): `printed.meters`→height / `printed.qty`→qty is overlaid onto the parsed file before `estimatePrintLength`, so the BatchHistory header reflects the actually-printed amount, not the parsed original.

`_rollback_snapshot.json`: written in the batch folder on rollback (`{ rolledBackAt, type: "batch"|"file", files: [] }`). `readSingleBatch` reads it so already-`rolled_back` files still render (with reason badges) even after their PDF has moved back to the inbox.

## IPC API (`window.api`)
```js
// Inbox
readFolders() / onReadFoldersProgress(cb) / submitBatch(batch)

// Batch history
readPrintedFolder()          // full PRINTED tree (legacy full scan; BatchHistory now uses readPrintedDays + readPrintedDay — see BatchHistory lazy-load below)
readPrintedDays()            // day skeletons: { dayFolder, date, label, totalBatches, totalFiles:null, batches:[], loaded:false } — enumeration only (readdir), ZERO readFile/DB; per-day try/catch (a bad day → skeleton totalBatches:0)
readPrintedDay(dayFolder)    // one day's full content (loaded:true); reuses readSingleBatch via buildDayGroup
regenerateXml(batchPath)
rollbackBatch({ batchPath, reason: { code, label } })          // object arg, NOT positional
rollbackFile({ filePath, batchPath, reason: { code, label }, reprint? }) // object arg, NOT positional
//   reprint: { qtyAffected, qtyOriginal } — Production rollbacks only; inserts a reprint_requests
//   row (meters for LM, pieces otherwise). BatchHistory rollbacks never pass it.
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
getFabrics()                           // → { success, data: fabric[] } — fabric = { name, type, xmlWidth, rollWidth, isVelvet, isLinen, isBlossom, alias }
saveFabric(oldName, fabric)            // → { success } — handles rename (delete+insert) if name changed
deleteFabric(name)                     // → { success }
setAllFabrics(fabrics)                 // → { success } — bulk replace

// Settings — ALWAYS spread allSettings before overriding individual fields to avoid null overwrite
getSettings()  // → { success, settings: { storagePath, xmlPath, workstationName, customOrderFolderPath, workstationRole, labelPrinterName, shippedRetentionDays, batchHistoryEagerDays, labelPrintMode, clientId } }
setSettings({ storagePath, xmlPath, workstationName, customOrderFolderPath, workstationRole, labelPrinterName, shippedRetentionDays, batchHistoryEagerDays, labelPrintMode, clientId })
//   batchHistoryEagerDays — per-machine, default 7, min 1; BatchHistory eager-loads the last N days (rest lazy)
selectFolder() // → { success, canceled, path }

// Logs / Held files
getLogs() / clearLogs()
getHeldFiles() / holdFile(fileId) / unholdFile(fileId)
pruneOrphanHolds(liveIds)  // "hold:pruneOrphans" — DELETE held_files rows whose file_id ∉ liveIds (orphaned holds).
//   Called by refreshFiles ONLY on a clean, complete scan (res.success && warnings.length === 0),
//   off fresh res.data ids (`${folder}_${filename}`), with an empty-inbox guard. Fixes an inflated Hold count.

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
customOrder.deleteOrder(id)       // → { success } — hard DELETE of a single history entry by id (PK)

// Production stages — use productionService, never window.api.stage directly
stage.getAll()                                         // → { success, data: stageRow[] }
stage.getAfter(since)                                  // → { success, data: stageRow[] }
stage.getByBatch(batchPath)                            // → { success, data: stageRow[] }
stage.advance(fileId, newStage, expectedStage)         // → { success }
stage.setSewingSent(fileId, expectedStage, company)    // → { success }
stage.setSewingReceived(fileId, expectedStage)         // → { success }
stage.getAllHistory()                                   // → { success, data: historyRow[] }
stage.clearAll()                                       // → { success }

// Label printing
label.printBatch({ batchName, totalMeters }) // → { success } — labelPrinter.js uses only batchName + totalMeters

// RIP errors — use ripErrorService, never window.api.ripErrors directly
ripErrors.scan() // → { success, data: ripErrorRow[] } ("rip-errors:scan") — scan AUTOMATION_WORKFLOW_ERROR/, parse + persist, return open errors
ripErrors.get()  // → { success, data: ripErrorRow[] } ("rip-errors:get")  — open errors only, no scan

// System
getAppVersion()  // → version string ("app:getVersion")
backupDb()       // → { success, path, skipped } ("db:backup") — manual; also auto-runs on each startup

// Auto-updater (electron-updater) — use updateService, never window.api.update directly
update.check() / update.install()
update.onAvailable(cb) / update.onProgress(cb) / update.onReady(cb) / update.onNotAvailable(cb) / update.onError(cb)
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
  productionStages: {},         // fileId → stageRow ({ file_id, stage, batch_path, order_id, customer_name, ... })
  stageHistory: {},             // fileId → [{ stage, entered_at }] — append-only per transition
  ripErrors: {},                // fileId → ripErrorRow (open only; most-recent wins per file)
}
```

**Production store actions:**
- `loadAllStages()` — full reload from DB into `productionStages`
- `loadStagesAfter(since)` → `{ success: bool }` — incremental poll; merges updates
- `loadStagesForBatch(batchPath)` — merge single batch rows (used by BatchHistory)
- `updateStageInStore(fileId, stageRow)` — optimistic single update
- `removeStageFromStore(fileId)` — remove on rollback (also clears stageHistory entry)
- `loadAllStageHistory()` — load full history; groups by fileId
- `addStageHistoryEntry(fileId, stage, enteredAt)` — optimistic append
- `clearAllStages()` — dev/admin reset; clears both `productionStages` and `stageHistory`
Key: `getLastBatch(batchDays)` exported helper. `applyFilters()` internal helper.

**RIP-error store action:**
- `loadRipErrors()` → `{ success: bool }` — calls `ripErrorService.scanRipErrors()`, maps rows into `ripErrors` keyed `fileId → row` (open only). DECISION: one row per file — most recent wins (DB may hold multiple open errors per file; the store/badge surfaces only the latest). Driven by a global 30s poll in `App.jsx` (initial load in the startup effect), session-wide so badges stay fresh in both views.
- `removeRipError(fileId)` / `clearRipErrorsForFiles(ids)` — optimistic removal from `ripErrors` after a rollback resolves the file's errors (badge + batch-header count clear at once; the next poll reconciles). Mirrors `removeStageFromStore`.

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

## Production — Key Behaviors
DB tables: `file_stages` (one row per active file), `file_stage_history` (append-only per stage transition).

**Stages pipeline:** `printed → heatpress → qc → packed → shipped` (or with sewing: `qc → to_sewing → [Receive → packed] → shipped`)
`STAGE_NEXT` / `STAGE_PREV` maps are the source of truth — use them, never hardcode transitions.
**`FROM_SEWING` is legacy** (like `REJECTED`/`OVERRIDDEN`): kept in `constants.js` (incl. `STAGE_NEXT.from_sewing → packed`) so old rows still render and a file can be pushed there manually via `STAGE_NEXT`, but it is **no longer an active routing target** — "Receive from sewing" now lands directly in `packed`. No filter tab / pipeline-order entry for it (display-only lookups in `ProductionCard`/`groupByOrder` stay).
**Receive completes reprints** — because Receive is now the entry to `packed`, the `stage:setSewingReceived` handler calls `fulfillReprintRequests(fileId)` on success (mirrors `stage:advance → packed`).

**Rollback = physical file move to inbox** — calling `rollbackFile` automatically calls `clearFileStage(fileId)` in `batchHistoryHandlers.js`. No separate DB cleanup needed. The card disappears from Production UI via `removeStageFromStore(fileId)`.

**No REJECTED stage in UI** — "Rollback to inbox" is the only destructive action for any non-shipped file. REJECTED/OVERRIDDEN constants remain in code for DB backward compatibility only.

**Polling** — `POLL_INTERVAL = 15s`; `loadStagesAfter(since)` returns `{ success: bool }`. Update `lastPollAt` only on success so a network failure retries the same window on the next tick.

**Workstation roles** (`workstationRole` in electron-store, per-machine):
- `"cotton"` — scanner advances `printed → heatpress` (stops at `heatpress`, like polyester; the cotton roll heat-press has no scanner, so the QC station completes `heatpress → qc`)
- `"polyester"` — scanner advances `printed → heatpress`
- `"rollpress"` — scanner advances `heatpress → qc`
- `"qc"` — scanning a batch code advances **all** of that batch's `heatpress` files to `qc` (batch-level `heatpress → qc`; no modal). If no files are at `heatpress`, the scan only filters the view to the batch. Manual per-file Pass/Receive/Send to Sewing/Go back/Rollback via selection + context menu still applies.
- `""` (default) — scanner only filters view to scanned batch

**Scanner input** — `e.ctrlKey || e.metaKey || e.altKey` keys ignored to avoid contaminating barcode buffer. Buffer flushed after 100ms idle; fires on Enter if buffer > 5 chars. Search box Enter key also routes to handleScan when value matches a batch name, file_id, or batch path. File-level scan (matching file_id) clears filters, scrolls to card, highlights it for 1.5s via GSAP.

**"Awaiting QC" visual state** — in the `qc` role view, files still at the `heatpress` stage render dimmed (lowered opacity, dashed border) with an "Awaiting QC" badge (colored from `STAGE_COLOR[HEATPRESS]`). `heatpress` itself signals "not yet arrived at QC" — there is **no** separate DB stage/field for awaiting; `ProductionCard` receives an `awaitingQc` prop computed in `Production.jsx` as `workstationRole === "qc" && row.stage === HEATPRESS`. Scanning the batch code at the QC station advances these `heatpress` files to `qc` (clearing the "Awaiting QC" state).

**Multi-select & bulk actions** — click card to toggle select; `BatchGroupHeader` "Select All" toggles whole batch. The context menu drives all bulk actions (see Context menu below). Selection cleared on filter/batch change. **Bulk Pass / Receive preserve the selection** — `handleBulkAdvance` / `handleBulkReceive` keep every selected file that still exists in the store (dropping only ones that vanished) instead of clearing, so chained bulk stage moves keep working on the same set; `ContextMenu` `onClose` only closes the menu (no longer clears selection). Deliberate full-clear stays in `handleRollbackDecisions`, `handleBulkGoBack`, `handleBulkSewing`.

**Rollback collects qty_affected** — context-menu rollback (single + bulk) opens `ProductionRollbackModal` (reason dropdown + qty input per file, defaults to full qty; OTHER → inline text). It passes `reprint: { qtyAffected, qtyOriginal }` to `rollbackFile` → `insertReprintRequest` in `batchHistoryHandlers.js` (new request supersedes prior open ones for the file).

**Reprint badge** — `productionHandlers.js` `withReprint(rows)` enriches stage rows with `reprint_qty`/`reprint_original` from open `reprint_requests` (matched by `file_id` = filename stem) on **all three return paths** (`stage:getAll`/`stage:getByBatch`/`stage:getAfter`), so polling keeps the badge alive. `ProductionCard` renders a blue Reprint badge (`Reprint: X of Y` when `reprint_original !== reprint_qty`); the Override badge stays **manual-only** (`meters_override`/`qty_override`, set only by manual overrides after the override/reprint split — a pure reprint no longer sets `*_override`, so no false Override badge). Both badges may coexist. The reprint badge disappears once the file reaches `packed` (`fulfillReprintRequests` → request no longer open). `FileRow` and `ProductionCard` Override badges carry the `Override: ` prefix.

**Grouping** — `groupingEnabled` toggle (default on). When on and `stageFilter === "all"` or `batchFilter` active: cards grouped by `batch_path` under `BatchGroupHeader` showing stage-count pills and printer badge.

**Optimistic updates** — all stage transitions call `updateStageInStore` + `addStageHistoryEntry` immediately after IPC success. No `loadAllStages()` reload needed after single actions.

**Stage counts in tabs** — when `batchFilter` is active, tab counts reflect only that batch's files.

**Context menu** — stage-aware across the WHOLE selection (`selectedFileIds`; falls back to the clicked row when selection is empty). A stage action shows only when valid for EVERY target file (common availability). Order — stage actions first, then a separator, then tools:
- **Pass** (advance per `STAGE_NEXT`; `from_sewing → packed`) — every file has `STAGE_NEXT[stage]` and `stage` ∉ {`TO_SEWING`, `SHIPPED`}. Label: "Pass to {STAGE_LABEL[next]}" when all on one stage, else "Pass to next stage". Single → `handleAdvance`, bulk → `handleBulkAdvance`.
- **Receive from sewing** (`to_sewing → packed`, `setSewingReceived`) — every file `stage === TO_SEWING`. Lands directly in `packed` (skips `from_sewing`) and fulfills open reprints. Single → `handleReceive`, bulk → `handleBulkReceive`.
- **Send to Sewing ▸** (submenu Olya | Vagabond, `setSewingSent`) — every file `stage === QC`. Single → `handleSewing`, bulk → `handleBulkSewing`.
- **Go back** (per `STAGE_PREV`) — every file has `STAGE_PREV[stage]`.
- **Rollback** — every file has `batch_path` and `stage !== SHIPPED`; opens `ProductionRollbackModal`.
- ── separator ── then tools (always operate on the clicked row): **Reprint Label** (`printBatchLabel`, aggregates batch material + total meters from store), **Quick Preview**, **Open in Folder**, **Open in Shopify** (`openInShopify(orderId)` from fileService).
- **Show in Orders** — also in the tools group, but **consciously operates on the selection** (exception to the "tools always operate on the clicked row" rule above). Maps the target rows (selection when the clicked row is in it, else the clicked row) → `order_id` → order key, using the SAME logic as `groupByOrder.js` (the `"__UNKNOWN_ORDER__"` literal is **hardcoded and manually kept in sync** with `groupByOrder.js:41` — NOT an exported constant; only `UNKNOWN_ORDER_LABEL` is exported). Clears `search`, switches `viewMode → "orders"`, and signals `OrderView` via `focusOrders={ keys, nonce }` (the `nonce` makes a repeat click on the same order re-fire the effect). `OrderView` expands all keys and scroll+highlights the first one (`data-order-key` on the `OrderRow` root; amber `.order_highlight`, no GSAP). Scanner forcing `viewMode → "batches"` pulls the view back to Batches on the next scan — known interaction, not a bug.

## BatchHistory — Key Behaviors
- Call `stopBatchWatcher()` on unmount
- Click anywhere on batch row to expand/collapse; action buttons use `e.stopPropagation()`
- Whole batch rollback: watcher sends `"removed"` → no manual reload needed. Both the optimistic update and the `"removed"` handler keep `files` in state as `ROLLED_BACK` (with `fileCount: 0`), NOT cleared to `files: []` — this matches `readSingleBatch` (live↔reload parity) so a rolled-back batch stays matchable by search (filter checks `file.name`). Do not revert to `files: []` — that re-breaks search after rollback.
- Single file rollback: watcher fires but only sends event if batch has 0 PDFs left; optimistic update is sufficient for UI — do NOT call `loadData()` after single file rollback
- `loadData` must fetch rollback reasons for: (a) `rolled_back` batches AND (b) `active` batches with any `file.status === "rolled_back"` — skipping (b) breaks file-level badges
- Optimistic updates: set state immediately after `res?.success`, watcher syncs after
- `"new-batch"` watcher event: preserve existing reasons: `rollbackReasons: batch.rollbackReasons ?? b.rollbackReasons` — Windows `fs.watch` can fire mid-optimistic-update
- Reason badge lookup: `file_id === fileId` first, fallback to `file_id === null` (batch-level)
- Hook destructured with prefixes (`isPreviewLoading`, `isPreviewOpen`) to avoid conflict with local `isLoading`
- **Component split**: day-level rendering in `BatchHistory.jsx`; batch header+actions in `BatchRow.jsx`; file row in `FileRow.jsx` — both sub-components import `BatchHistory.module.css` directly
- Watcher race condition handled: `readSingleBatch` wrapped in try/catch; `ENOENT` → sends `"removed"` event

### Lazy-load (Phase 1 + 2)
The full PRINTED scan (35 days / ~580 batches → ~2050 SMB roundtrips) used to run at startup, after every submit, and on every view entry. Lazy-load cuts it down.

**`readPrintedFolder.js` structure** — `readSingleBatch` is **unchanged**. The per-day mapping is extracted into `buildDayGroup(dayFolder)` (readdir batches → `readSingleBatch` per batch). Three exports:
- `readPrintedFolder()` — composed from `buildDayGroup`; **identical result** to before (+ additive `dayFolder`/`loaded:true` on each day object). Legacy full scan.
- `readPrintedDays()` — enumeration only (`readdir` root + each day, ZERO `readFile`/DB); returns sorted-desc skeletons `{ dayFolder, date, label, totalBatches, totalFiles:null, batches:[], loaded:false }`. Each per-day `readdir` is wrapped in try/catch → a bad day (ENOENT/EPERM/…) becomes a `totalBatches:0` skeleton instead of sinking the whole enumeration.
- `readPrintedDay(dayFolder)` — one day's full content via `buildDayGroup` (`loaded:true`).

**`refreshBatchDays` (store; startup + after submit)** — loads ONLY the newest day (`readPrintedDays` → `readPrintedDay(days[0])`), sets `batchDays = [newestDay]`. Sole consumer outside BatchHistory's mirror is `LastBatchCard`/`getLastBatch`, which only needs the newest active batch. `getLastBatch` returns `null` gracefully when the newest day has no batches (option a — empty card, never descends to older days). No more full scan here.

**`loadData`** — `readPrintedDays()` → skeletons; eager-loads the most-recent N days (`batchHistoryEagerDays`, default 7) via `readPrintedDay` → `attachReasonsToDay`; older days stay as skeletons. `attachReasonsToDay(day)` is the second-pass reasons fetch extracted from `loadData` (`needsReasons` = batch `ROLLED_BACK` or any file `ROLLED_BACK` → `getRollbackReasonsByBatch`), reused in `loadData`, `toggleDay`, and `reloadLoadedDays`.

**`toggleDay`** — first expand of a skeleton (`loaded === false`) → `readPrintedDay(day.dayFolder)` → `attachReasonsToDay` → merge by `dayFolder` (`loaded:true`); per-day spinner while loading; idempotent (skips if already loaded or a fetch is in flight via `loadingDays`). The fetch is fired **outside** the `setExpandedDays` updater (StrictMode-safe — no double fetch).

**`filteredDayGroups`** — filter clause `(day.loaded === false && !q) || day.batches.length > 0 || expandedDays.has(day.date)`. The `&& !q` means skeletons stay visible only while **browsing** (no query); under an active search they are hidden (their full `totalBatches` pill would otherwise masquerade as a match) — load-all-on-search loads them instead (see below). A loaded, collapsed day emptied by search is still dropped. The `expandedDays.has(day.date)` clause means a day the user explicitly expanded does NOT vanish from the filtered list after lazy-load even with zero query matches (without it, expanding a skeleton under an active search made the day disappear). `expandedDays` MUST be in the `useMemo` deps of `filteredDayGroups`, otherwise the filter won't recompute on expand/collapse. When an expanded day is `loaded:true`, has 0 filtered batches, and a search is active, the render shows "No matches in this day" instead of an empty header. `day_pill` is null-aware: a skeleton shows just the batch count (no `· N files`, no `null`), rendered dimmed/dashed.

**Empty-state (global) is 3-way under an active search** (`searchQuery.trim()` non-empty, `filteredDayGroups.length === 0`): (a) load-all still in progress (`isSearchLoadingMore`) → spinner + "Searching older days…"; (b) finished with 0 matches → "No results found." (the old scoped "No results in loaded days. Clear search to browse older days." wording is **removed** — load-all now pulls in the whole history, so it's a full-history result, not a scoped one); (c) matches → list renders. With no query it's unchanged ("No results found." for an active printer filter, else "No batches yet."). `isSearchLoadingMore` = search active AND (`dayGroups.some(d => d.loaded !== true)` OR `loadingDays.size > 0`).

**Load-all-on-search** — while a search is active, unloaded skeleton days are pulled in via the existing `loadDayContent` so search spans the **whole** history (e.g. an order number / `ON` that only appears in an old day's filename), not just the eager head. Trigger: a `useEffect([searchQuery])` (deps intentionally `[searchQuery]` only via `eslint-disable-line` — `loadDayContent` is stable, and adding `dayGroups` would re-fire on every merge) with a **350 ms debounce** (`"3"→"3p"→"3pa"` collapses to one sweep). The sweep is **sequential + progressive**: it snapshots the skeleton `dayFolder`s at start, then `await loadDayContent(df)` one by one — each merge flips `loaded:false→true` and `filteredDayGroups` recomputes, so matches surface as days arrive. A `cancelled` flag (set in the effect cleanup) **aborts** the sweep on query change/clear, checked after every await; `loadAllRunningRef` guards against overlapping sweeps. A footer-spinner "Searching older days…" (`.search_loading_more`) shows when there are already matches above but the rest is still loading. After loading, days stay `loaded:true` — **natural cache**: clearing the search does NOT unload them, and the next search won't re-pull (guard: `dayGroupsRef.current.every(d => d.loaded === true)` → return); the only reset is a manual Refresh / `loadData` (rebuilds skeletons beyond the eager head). **Accepted edge** (see the comment above the `loadAllRunningRef` guard in `runLoadAll`): if the query changes while a sweep is mid-await on a slow SMB, the new trigger may hit `running === true` and skip, so load-all won't finish for the new query until the next query change — rare (debounce collapses typing), non-blocking (re-type resumes), consciously left as-is.

**Watcher loaded-aware (Phase 2b)** — day key unified on `dayFolder` (`date === dayFolder` by format):
- `new-file` / `removed` skip days where `loaded !== true` (skeletons untouched — ends the global `totalFiles` zeroing).
- `new-batch` on an existing skeleton is a no-op (content arrives on expand); on a loaded day it merges as before; a watcher-created new day is built with `dayFolder` + `loaded:true`.
- **Degraded mode**: the fallback interval calls `reloadLoadedDays()` (re-reads only `loaded:true` days via `readPrintedDay` → merge), NOT the full `readPrintedFolder`. `dayGroupsRef` holds the current `dayGroups` so the interval reads a fresh list (stale-closure-safe).

## Custom Order — Key Behaviors
Per-file checkbox selection inside a `CustomOrderCard`, so an operator can exclude specific files from a single imported CSV batch before generating its XML.

**State is card-local, not lifted.** `selectedFiles` is a `Set` of `fileName` (from the CSV row), held in `CustomOrderCard.jsx`'s own `useState` — it is NOT lifted to `CustomOrder.jsx` (which only owns the `csvGroups` array) and NOT persisted to the DB or `custom_order_history`. Scope is exactly one imported CSV / one card.

**Default-all-selected on import** — a `useEffect` keyed on `group.isParsing` populates `selectedFiles` with every `fileName` the moment parsing finishes (`isParsing: true → false`). Because `onRefresh` (rescan) never flips `isParsing` back to `true`, this effect does not re-run on refresh — existing checkbox choices survive a rescan. **Known edge case:** a `fileName` that only appears for the first time after a rescan/refresh is NOT auto-selected (starts unchecked) — this is intentional, not a bug.

**Checkbox UX** — reuses `ProductionCard`'s span+`LuCheck` pattern (a styled `<span>` toggled via `onClick`, not a native `<input>`), styled with `.card_checkbox` / `.card_checkbox_checked` in `CustomOrderCard.module.css` (copied from `Production.module.css`). `checkboxLocked = isGenerating || isGenerated` disables and dims it (`.card_checkbox_disabled`) once a card starts or finishes generating — mirrors the existing printer-toggle disable pattern, and prevents `selectedTotalMeters` from ever drifting from what was actually sent to `generateXML` and logged to `custom_order_history`.

**`selectedTotalMeters` replaces `totalMeters`** in the card's header pill and footer, recalculated live on every checkbox toggle. It sums `metersToprint` over selected files using the SAME found-agnostic rule the original `totalMeters` always used (missing files still inflate the total). **This pre-existing quirk is unchanged by this feature** — selection only filters by what's checked, it does not also filter out missing files from the total. Don't miscredit this feature with fixing it.

**Generate payload is filtered** — `handleGenerate` builds `files: files.filter(f => selectedFiles.has(f.fileName))` and `totalMeters: selectedTotalMeters` before calling `generateCustomOrderXML`. Deselected files never reach the IPC layer, so they never appear in the generated XML `<Documents>` or in the `custom_order_history` row for that order (no IPC/handler changes were needed — the main-process side already only ever saw whatever `files` array the renderer sent it).

**Empty-selection guard** — clicking Generate with `selectedFiles.size === 0` is blocked with a `notify()` warning (same pattern as the existing "no printer selected" guard) and returns before calling `generateCustomOrderXML`.

**Found/missing shown by filename colour, not icons** — the check/cross icon column was removed from the file row; instead the filename span gets `.file_name_found` (green `#05c95d`) or `.file_name_missing` (red `#ef4444`) based on `file.found`. Both hex values are the file's own pre-existing tokens (`#05c95d` from `.dot_ready`, `#ef4444` already used by `.header_missing`/`.footer_missing`) — no new colour tokens were introduced, and there is no `--success`/`--error` CSS var in `global.css` to prefer instead.

**Whole-row click toggles selection** — the `<tr>` itself carries the `onClick` that calls `toggleFileSelection`, gated by `checkboxLocked` (`isGenerating || isGenerated`) at the row level (`.file_row_locked`, cursor `not-allowed` + dimmed, with hover suppressed via `.file_row.file_row_locked:hover`) — a locked row is fully non-interactive, not just its checkbox. The checkbox `<span>` keeps its own `onClick`/`role`/`tabIndex`/`onKeyDown` for direct/keyboard use, but calls `e.stopPropagation()` before toggling — without it, a direct click on the checkbox would bubble into the row's `onClick` and fire the toggle twice, silently cancelling itself out.

**`suggestion` + Fuse fuzzy-matching removed from `customOrderMatcher.js`** — `matchFiles` used to attach a `suggestion` (closest fuzzy match via `fuse.js`) to unmatched rows, but nothing ever read it (not `CustomOrderCard.jsx`, not `generateXML`, not `custom_order_history`, not `CustomOrderHistory.jsx`) — confirmed by a full-codebase grep before removal. `matchFiles` is now a plain `cachedFileNames.includes(file.fileName)` check per row. **`fuse.js` is now unused anywhere in RipFlow** but is still listed in `package.json` — pruning the dependency itself is a separate, not-yet-made decision.

**Batch/file icon convention** — `LuLayers` marks batch/order-level rows: the `CustomOrderCard` header icon (next to the material name) and the `CustomOrderHistory` row icon (next to `order.materialName`) both use it, consistent with the Batch nav tab's icon. `LuFileText` marks an individual file — reused from `DataList`'s per-filename icon (same icon, same `.file_icon` sizing), placed between the checkbox and the filename text in `CustomOrderCard`'s expanded row. `file_name_wrap` is a row flex (not column) specifically so this icon sits beside the name rather than above it.

**Rounded, inset row hover** — a `<tr>` ignores `border-radius` even under `border-collapse: separate` (a `<tr>` doesn't establish its own clippable paint box the way a block element does), so the hover fill can't be rounded on the row itself. The hover background lives on the `<td>`s instead (`.file_row:hover td`), with the radius applied only to the outer corners (`:first-child` / `:last-child`, 14px — reused from `DataList`'s `.list_item` radius). `.file_table` carries its own horizontal gutter (`padding: 0 16px`) so that fill sits inset from the card edge rather than touching it, mirroring how `DataList` insets its rounded hover via padding on the `<ul>` ancestor (`.list_items`) rather than the row itself.

**Even row-internal spacing** — checkbox → file icon → filename now step at a consistent 10px each: `.cell_checkbox`'s left padding, the filename column's left padding (targeted via the structural `.file_row td:nth-child(2)` — no dedicated class needed, the row always renders exactly 3 fixed `<td>`s), and `file_name_wrap`'s flex `gap` are all `10px`.

## RIP Errors
Surfaces PrintFactory job failures on the affected files. PrintFactory drops a per-failed-job pair into `{storagePath}\AUTOMATION_WORKFLOW_ERROR\`: `<name>.tif` (ignored) + `<name>.xml` (parsed). Because the workflow has a Split node (`SplitOn=Document`), each failed document gets its own xml with its own `<JobGUID>`. New dependency: **fast-xml-parser** (main process only). Folder name has ONE source of truth: `RIP_ERROR_FOLDER` + `getRipErrorRootPath()` in `getRootPath.js`.

**Parser (`parseRipErrorXml.js`)** — `fast-xml-parser` (`attributeNamePrefix:"@_"`, `ignoreAttributes:false`, entity-decoding on). Returns an **ARRAY** of error rows; never throws (missing → null, malformed/non-error → `[]`, logged).
- **Detection:** any node `WorkflowResult="Fail"` OR `Job.WFState` has `@_Error`; else `[]`.
- **errorMessage** = `WFState@Error` (fallback: the Journal entry carrying `@_Error`). **failedNode** = that Journal entry's `@_Process` (Shape B → `"Hotfolder"`).
- **Two shapes:**
  - **Shape A** (failure AFTER split, common): a job-level `<Documents>` (`parsed.Job.Documents`, distinct from the RipFlowJob one) is **present** → **ONE** row; failed file = stem of job-level `<Name>`.
  - **Shape B** (failure BEFORE split, e.g. input missing): **no** job-level `<Documents>` → one row per `<Document>` under `parsed.Job.ProcessNodes.XML.RipFlowJob.Documents`.
- **Real-structure notes (don't re-derive wrongly):** the true Job root is `parsed.Job`; `RipFlowJob` is at `Job.ProcessNodes.XML.RipFlowJob` (**NOT** a direct child of `Job`). `documentId` (XWD) is taken from the filename stem (regex `/XWD[0-9a-f]+/i`), **NOT** from `UserData.DocumentId` (absent/inconsistent across PF exports); it's a nullable backup key.
- **KNOWN LIMIT:** the Shape A/B discriminator rests solely on presence of a job-level `<Documents>`. Verified on three real shapes only (Layout-fail / File-not-found / OK). Other failing nodes (Split, Nester, Resize, StepRepeat) are **NOT** yet verified — a pre-split failure that still emits a job-level `<Documents>` would be misread as Shape A. Revisit if a real export contradicts this.

**Ingest + poll** — `ripErrorHandlers.js` `scanRipErrors()` reads `{storagePath}\AUTOMATION_WORKFLOW_ERROR` (via `getRipErrorRootPath`, sibling of `PRINTED/`, never hardcoded), filters `*.xml` only (ignores the `.tif`), `parseRipErrorXml` + `insertRipError` per row (INSERT OR IGNORE dedup on `(job_guid, file_id)`), per-file try/catch (one bad xml can't sink the scan), missing folder → no-op `{success:true,data:[]}`, returns `getOpenRipErrors()`. IPC `rip-errors:scan` / `rip-errors:get` → `window.api.ripErrors` → `ripErrorService`. **Global 30s poll in `App.jsx`** (`loadRipErrors`; initial load in the startup effect) runs the whole session regardless of `activeView`, so badges stay fresh in both views.

**Store** — `ripErrors {}` keyed `fileId → row`, open-only, most-recent-wins (one file may hold multiple open DB rows; the store/badge surface the latest). Actions: `loadRipErrors()`, `removeRipError(fileId)` / `clearRipErrorsForFiles(ids)` (optimistic clear on rollback).

**UI — badges** — red **"RIP Error"** badge (`LuTriangleAlert`) per file in BOTH `ProductionCard` and BatchHistory `FileRow`, shown when `store.ripErrors[stem]` exists (stem = `file.name.replace(/\.[^.]+$/,"")`). Both rows stay presentational — `Production.jsx` and `BatchRow.jsx` (already store subscribers) read `ripErrors` and pass the `ripError` prop down (mirrors how reprint/stageRow reach the rows). `BatchRow` also shows a **batch-header count badge** `"N RIP Error(s)"` (non-interactive) = this batch's files ∩ `ripErrors` with the same stem derivation → header count == expanded file-badge count by construction. Red palette `#FEF2F2` / `rgba(220,38,38,.4)` / `#DC2626`.

**UI — popover (`RipErrorPopover/`)** — clicking the per-**file** badge opens one shared anchored popover (state owned by each view, portaled to `document.body` at the call site like `ContextMenu`). Positioning (anchor edge-flip clamp) + backdrop close (`onPointerDown → onClose`) are **lifted from `ContextMenu` (not imported)**; z-index 2999/3000. Shows Error message / failed node / time (local `formatRipTime`, `HH:MM DD/MM/YYYY` — no shared date helper exists) / file_id, plus a **Copy** button → `navigator.clipboard.writeText` (pattern mirrors `SessionLogs.jsx`) writing the 5-line block (`RIP Error` / `File:` / `Error:` / `Node:` / `Time:`), label `Copy → Copied! → revert ~1.5s` (timeout cleared on unmount). Badge `onClick` + popover interior `stopPropagation` so a click never expands the BatchHistory row or toggles the ProductionCard selection. The **batch-header count badge is NOT clickable**.

**Resolve lifecycle** — rollback is the ONLY resolve path (a file returns to the inbox only via rollback; manual resolve intentionally not built). `rollbackFile` → `resolveRipErrorsByFile(stem)` using the SAME stem key as `clearFileStage`; `rollbackBatch` loops it over `pdfNames` stems (**not** `batch_path` — `rip_errors.batch_id` is the XML BatchId string, so per-stem is the correct key). Runs only on rollback **success**; resolves **ALL** open rows for that `file_id`. The store optimistically drops the stem(s) at every rollback-success site (Production `handleRollbackDecisions`; BatchHistory bulk/single/batch handlers — batch uses `dayGroupsRef.current` for the batch's file stems) so badges + header count clear instantly; the 30s poll reconciles against the DB (resolved rows excluded by `getOpenRipErrors`).

**PrintFactory side (operational context):** a single Export node wired to every workflow port writes the per-failed-job `<name>.tif` + `<name>.xml` into `AUTOMATION_WORKFLOW_ERROR/`. The Export uses `Content=Layout` + Export XML (Document/Original was abandoned — it couldn't access the `PRINTED/` pdf). RipFlow reads only the `*.xml`. **TIFF cleanup is out of scope for RipFlow** — a separate scheduled task should prune old TIFFs; RipFlow never deletes from the shared share.

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
| General | `GeneralView` | workstationName, workstationRole, shippedRetentionDays, batchHistoryEagerDays (per-machine; eager-load days default 7, min 1) |
| Paths | `PathsView` | storagePath, xmlPath, customOrderFolderPath |
| Fabrics | `FabricsView` | Global params + Materials CRUD (DB-backed, shared); per-material "Alias (skrót w ścieżce XML)" field with `onChange` sanitization (`[a-zA-Z0-9_-]`) — empty = full name |
| Rollback Reasons | `RollbackReasonsView` | label+icon per reason; add/edit; DB-backed, shared |
| Database | `DatabaseView` | manual `backupDb`; auto-backup on startup, last 7 days kept |
| Maintenance | `MaintenanceView` | clear rollback history / custom-order history / all production stages (destructive) |
| Updates | `UpdatesView` | auto-updater: check/install, progress, changelog, app version, `clientId` release channel |

All views share `SettingsView.module.css` for base layout (`.view`, `.view_header`, etc.).

## GROUP_NAME_OVERRIDES (`createBatchIds.js`)
Maps long group names → short folder names. `resolveOriginalGroup(batchPath, shortGroup)`:
1. Read `_batch_info.json` from batch folder
2. Fallback: `GROUP_NAME_OVERRIDES_REVERSE[shortGroup]`
3. Last fallback: `shortGroup` unchanged

**printGroup resolution (single group)** — `getAliasFromCache(group) ?? GROUP_NAME_OVERRIDES[group] ?? group`. The per-material DB `alias` is **primary**; `GROUP_NAME_OVERRIDES` is the **fallback** (legacy "Neraki" / old batches); raw group name is last. `printGroup` = inbox folder name = material `fabrics.name`. Multi-group batches stay `"SAMPLES"` (unchanged). **The alias shortens only the PRINTED folder + `.xml` filename + `<PhysicalGroup>`/`<Path>` — NOT the PDF filename (intentional).** It is a MAX_PATH mitigation, not elimination.

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
4. `setSettings()`: always spread `allSettings` first then override changed fields — avoids null overwrite of `workstationRole`, `labelPrinterName`, etc.
5. Use `notify()` not `setAlert()` — only `notify()` writes to SessionLogs
6. `ripflow.db` lives in `storagePath` — fails if network unavailable; app continues (all db fns guarded)
7. pdfjs-dist **must stay v4** — v5 incompatible with Electron 40 Chromium
8. Load PDF via IPC `readFileBuffer` → base64 → Uint8Array → `pdfjsLib.getDocument({ data })` — NOT `file://`
9. `DataDaysCounter` was removed — age rendered inline in DataList; do not recreate
10. **Never call `window.api` directly in components** — always import from `src/ui/services/`
11. **Use constants from `src/shared/constants.js`** — never compare against raw strings. Covers: `BATCH_STATUS`, `FILE_STATUS`, `PRINTER`, `CUSTOM_ORDER_STATUS`, `PRODUCTION_STAGE`, `STAGE_NEXT`, `STAGE_PREV`, `STAGE_LABEL`, `STAGE_COLOR`, `QC_ACTION`, `SEWING_SUGGESTED_TYPES`
12. **All file IPC handlers** use `assertStorageFilePath` — prevents path traversal outside storagePath
13. Vitest tests exist in `src/shared/` — run `npm run test` before shipping changes to `estimatePrintLength.js`
14. **Custom Order CSV import**: `customOrder:importCSV` was removed — use `selectCSV()` (returns `files: [{name, content}]`) then `importCSVContent(content)`. Never pass file paths from renderer to main for reading.
15. **Rollback reason rows**: both batch and single-file rollbacks insert **one row per PDF** with `fileId = filename-stem`. Never use `fileId: null` for new rows — it breaks DataList inbox badges. Existing null rows in DB are handled by the `?? batch.rollbackReasons?.[0]` fallback in BatchRow and FileRow.
16. **Fabric/reason config is DB-backed and shared** — electron-store holds ONLY machine-specific settings (paths, workstation name). Do NOT store shared config back in electron-store.
17. **fabricCache must be loaded before getMaterialType/parseFileName are called** — `loadFabricCache()` is called in `ipc/index.js` right after `initDb()`. Both functions have static-set fallbacks for the window before DB is ready.
