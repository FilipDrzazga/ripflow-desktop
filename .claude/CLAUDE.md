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
                           # rollbackBatchFromHistory: per-file rename+DB reconcile INSIDE the move loop
                           #   (single-file pattern); best-effort on mid-loop fail → result.failedFiles
                           # renameNoOverwrite (access-check → EEXIST) shared by batch + single-file rollback
                           # regenerateXmlForBatch overlays effective printed amount via
                           #   normalizeOverrideEntry (same gate as readSingleBatch; NOT raw ov.qty/ov.meters)
    readPrintedFolder.js   # Reads PRINTED/ tree. Exports: readPrintedFolder (full scan, legacy),
                           #   readPrintedDays (skeletons, enumeration only), readPrintedDay (one day),
                           #   readSingleBatch (unchanged), buildDayGroup (shared per-day mapping),
                           #   normalizeOverrideEntry (exported — shared by regenerateXmlForBatch)
    normalizeOverrideEntry.test.js # Vitest — 7 cases: new {printed} shape + legacy {qty}|{meters}
                           # mocks db.js/getRootPath.js to break the native import chain (node env)
    createXML.js           # isVelvet/isLinen/isBlossom read from fabricCache (fallback: string-contains)
    ripErrorHandlers.js    # scanRipErrors(): reads {storagePath}\AUTOMATION_WORKFLOW_ERROR, parses *.xml → rip_errors
                           # IPC rip-errors:scan / rip-errors:get

src/ui/
  store/useStore.jsx       # Zustand store — central app state
  hooks/usePdfPreview.js   # Modal preview state only — delegates rendering to utils/pdfRender.js
  hooks/useStageTransition.js # Shared store-core for Production stage moves; classifies IPC
                           #   result vs guarded UPDATE → "applied" | "rejected" | "failed"
  utils/dayKey.js          # Day derivation from batch_path for the Production view:
                           #   dayKeyFromBatchPath / parseDayKey / getDayLabel /
                           #   compareDayKeysDesc / daysSinceDayKey / UNKNOWN_DAY_KEY.
                           #   Pure, no imports — file_stages has NO creation timestamp
                           #   (see Production day grouping below)
  utils/dayKey.test.js     # Vitest — 14 cases: Win/POSIX paths, _N suffix, bad segment,
                           #   Today/Yesterday boundary, unknown-key sorting
  utils/notify.js          # ALWAYS use instead of setAlert() — adds toast + SessionLogs entry
  utils/pdfRender.js       # renderPdfToJpeg(filePath, { targetWidth, scale, quality })
                           #   + clearPdfCache(). Module-level LRU cache (30) keyed by
                           #   path + render params. GlobalWorkerOptions.workerSrc lives
                           #   HERE — every PDF-rendering module imports from this file
                           #   instead of relying on import order for the side effect.
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
    ripErrorService.js     # scanRipErrors, getRipErrors, resolveRipError — withTimeout wrappers
  constants/
    printerColors.js       # PRINTER_COLORS: { DGEN, YOKO, YUMI } → { bg, color }
    rollbackReasons.js     # ROLLBACK_REASONS: static fallback only — runtime data comes from DB
    rollbackReasonIcons.js # ICON_MAP, ICON_OPTIONS, resolveIcon(iconName)
    printTypeMap.js        # PRINT_TYPE_MAP: { LM, FQ, SAMPLE, CUSHION, TEA_TOWEL } → { label, Icon, color }
    viewModes.js           # VIEW_MODE: { BATCHES, ORDERS, RECEIVE } — the viewMode values in
                           #   Production.jsx. RECEIVE is declared ahead of its UI
                           #   (sewing-return lens) and is not reachable yet.
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
                           # all stage moves (single/bulk/scan) go through useStageTransition
                           # day → batch → card grouping; DayGroupHeader + BatchGroupHeader
                           #   both live here (not separate files)
      ProductionCard.jsx   # single file card: stage pills pipeline, GSAP highlight on scan; dimmed "Awaiting QC" badge in qc view
      ProductionRollbackModal.jsx # rollback modal: per-file reason dropdown + qty_affected input
                           # returns decisions [{fileId, reason, override}]; override = {qty}|{meters}
      SewingReceive.jsx    # sewing-return lens; the session state arrives as a prop from
                           # Production.jsx — the component is stateless apart from useMemo
      SewingReceive.module.css
    PdfThumb/              # PdfThumb.jsx + PdfThumb.module.css — page-1 thumbnail in a
                           # fixed 64x64 box (skeleton / img / silent placeholder).
                           # Always renders via renderPdfThumb; errors never notify()
    ContextMenu/           # Portal popup; supports submenu (children field) with hover delay 150ms
    RipErrorPopover/       # Shared anchored popover (ProductionCard + FileRow); RIP-error detail + Copy + Resolved (manual resolve)
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

**LOCK stage — stale-lock removal via RENAME, not unlink.** A stale `.lock` (age > `STALE_LOCK_MS` = 90s on the NAS clock via probe file; 5min conservative fallback when the probe fails) is cleared by `removeStaleLock(lockPath)`: `rename(.lock → .lock.dead-<pid>-<ts>)` then `unlink` of that unique name — **NOT** a destructive `unlink(.lock)` by name. Why: two stations racing to clear the SAME stale lock via unlink-by-name could have station B delete station A's freshly-created lock (TOCTOU) → both enter COPY of the same sources → double print. `rename` is source-consuming: exactly one station wins it; the loser gets `ENOENT` → `removeStaleLock` returns `false` → falls through to `open(.lock, "wx")`, where O_EXCL picks the single winner (EEXIST → "Source folder locked"). Both call-sites (NAS-probe branch + 5min fallback) go through `removeStaleLock`. Leftover `.dead-*` (crash between rename and unlink) is inert — never named `.lock`, so it never blocks a batch; NOT swept by `sweepOrphanTemps` (that scans `PRINTED\<day>\` dirs, not inbox source folders).

**Lock body carries a reserved `nonce`.** The fresh lock's JSON is `{ pid, batchId, timestamp, nonce }`; **`nonce` (`crypto.randomUUID()`) is a deliberately dead field** — foundation for future lock-ownership verification (Opcja 2). It is written but **never read today** — do NOT prune it as dead code.

**KNOWN DEBT (deliberate, unfixed):** the lock-release path in `finally` (~`createBatch.js:481`) still does a destructive `unlink(lockRecord.lockPath)` by name — the twin of the TOCTOU fixed above. Process-freeze scenario: a station stalls > 90s (heartbeat stops), another station legitimately claims + recreates the lock, then the frozen station wakes and its `finally` deletes the successor's lock. Consciously NOT fixed — it belongs to the "lock-ownership verification" class (would need a `nonce` re-read before unlink). Recorded as a known decision, not a blind spot.

**COPY is page 1 only — intentional.** `pdf-lib` copies only the first page of each source PDF; pages 2+ are deliberately not preserved (PrintFactory needs only page 1). A rolled-back or regenerated file therefore never carries pages 2+ — by design, not data loss.

`_batch_info.json`: stores full inbox folder name (`originalGroup`). Used by `batchHistoryHandlers` to find correct rollback target. Without it, falls back to GROUP_NAME_OVERRIDES_REVERSE. It also persists per-file print provenance under `overrides[stem]` = `{ printed: {meters}|{qty}, manual: bool, reprintQty, reprintOriginal }` — written in `createBatch.js` from the `_printed`/`_manual`/`_reprintQty`/`_reprintOriginal` fields set by `fileService.submitBatch` (one entry per file that has an effective printed amount: manual override OR reprint). `readPrintedFolder.js` reads it via `normalizeOverrideEntry` (an **exported** pure fn — `{ printed:{meters}|{qty}, manual, reprintQty, reprintOriginal } | null`), which also accepts the **legacy shape** (`{qty}`|`{meters}`) defensively (treated as `manual:true`, no reprint provenance) and returns `null` for a malformed/empty entry. Group metres (`fixedTotalLengthM`) are computed from `printed` (effective): `printed.meters`→height / `printed.qty`→qty is overlaid onto the parsed file before `estimatePrintLength`, so the BatchHistory header reflects the actually-printed amount, not the parsed original. **`batchHistoryHandlers.regenerateXmlForBatch` imports the SAME `normalizeOverrideEntry`** and applies the identical overlay (`printed.qty`→`qty`, `printed.meters`→`height = round(meters*1000)`), so a regenerated XML reproduces the effective printed amount for both new and legacy `_batch_info.json` — no longer the old hand-rolled `ov.qty`/`ov.meters` read (which missed the new `{printed}` shape).

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
ripErrors.resolve(fileId) // → { success } | { success:false, error } ("rip-errors:resolve") — manual resolve; resolves ALL open rows for the file_id

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
- `resolveRipError(fileId)` → `{ success, error? }` — the manual resolve path (popover "Resolved" button). Writes to the DB via `ripErrorService.resolveRipError` FIRST and calls `removeRipError(fileId)` only on `success`, so a failed write leaves the badge in place. Returns the outcome to the UI and never notifies itself.

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

**viewMode goes through `VIEW_MODE`, never a bare string** (`constants/viewModes.js`: `BATCHES` | `ORDERS` | `RECEIVE`). `Production.jsx` is the only consumer; all three lenses are live (see **Sewing Receive Lens** below for `RECEIVE`).
- **`handleScan` no longer forces the lens.** It flips `ORDERS → BATCHES` (so the scan result is visible instead of silently mutating the hidden Batches state) and leaves `BATCHES`/`RECEIVE` alone. Written as a functional `setViewMode` updater so `viewMode` stays OUT of the `useCallback` deps (reading it directly would re-create the callback on every lens switch and re-point `handleScanRef`).
- **The `RECEIVE` branch inside `handleScan` sits ABOVE the `workstationRole` blocks and returns early** — it calls `addBatchToSessionRef.current(batchPath)` and nothing else. This ordering is a **data-safety requirement, not tidiness**: below it live the role branches, so at a QC station a scan performed while unpacking a sewing delivery would advance that batch's `heatpress` files to `qc`. The current lens is read through `viewModeRef` because putting `viewMode` in `handleScan`'s deps would re-create the callback and re-point `handleScanRef` on every tab switch.
- **A file-level scan in `RECEIVE`** returns a "Scan a batch barcode" warning instead of clearing filters and scrolling the hidden Batches lens — that lens works batch by batch.
- **Scan from the search box is a whitelist** — `viewMode !== BATCHES && viewMode !== RECEIVE → return`. Deny is the default **on purpose**: `handleScan` MUTATES the DB (per `workstationRole` it advances stages), so a future fourth lens must not inherit access to a state-changing path merely by existing. Do not flip this back to a blacklist (`=== ORDERS`).

**Day grouping (BATCHES lens)** — cards are grouped `day → batch → card`. The day layer is built **always**; the batch layer only when `isGrouped` (`groupingEnabled && (stageFilter === "all" || batchFilter)`), otherwise the day renders its cards flat. This is the point of the feature: the day must survive both the "Groups" toggle and the stage tabs.
- **The day comes from `batch_path`, never from a timestamp.** `file_stages` has **NO** creation column — `updated_at` is rewritten on every stage transition, so it is the shipping/last-move time, not the print day. The day is the `PRINTED\DD-MM-YYYY\` segment (`batch_path.split(/[/\\]/).at(-2)`), read through `dayKeyFromBatchPath` (`utils/dayKey.js`). Same key BatchHistory groups by → both views agree on "the day". `withLocalBatchPath` (main) only re-roots the path, so the day/batch segments survive verbatim. Rows with no parsable day fall into the exported `UNKNOWN_DAY_KEY` bucket, sorted last — never dropped.
- **`collapsedDays`, not `expandedDays`** (the inverse of BatchHistory): Production is the live board, so everything is open by default and a day arriving later from the 15s poll shows up open with no auto-expand logic. Never flip this to an expanded-set — that would collapse every newly polled day.
- **Sorting is now explicit and must stay so.** Days `compareDayKeysDesc`; batches inside a day by folder name descending (the shared `PRINTED_HHMMSS` prefix makes a lexicographic compare a time compare). Before this, the view had **no** sort at all — order came from `productionStages` key order, which drifts as polling merges rows.
- **The scanner must clear `dayFilter` and expand the target day** — both in the batch branch (before `setBatchFilter`) and the file branch (**before** the `requestAnimationFrame`). A card inside a collapsed day is not in the DOM, so `querySelector` finds nothing and the scroll + 1.5s highlight silently do nothing.
- **Stale pill** — `daysSinceDayKey(dayKey)`, shown from 2 days and only while the day still holds a file with `stage !== SHIPPED` (a fully shipped day is finished, not stuck). Amber ≥ `STALE_DAYS_WARN` (3), red ≥ `STALE_DAYS_ALERT` (7).
- **Day filter chip** — `dayFilter` narrows `filtered` AND `countableRows` (so the stage-tab counts do not lie), renders next to the Batch chip in `filter_bar`, and is in the selection-clearing effect's deps alongside `batchFilter`/`stageFilter`.
- **`DayGroupHeader` has no "Select All"** — bulk selection stays a batch-level action (`BatchGroupHeader`), so the day header carries only the chevron, date, label, counts, stale pill and the filter button. Do not re-add it.
- **CSS**: `.batch_group` is now nested inside `.day_body`. `.batch_group .card:nth-child(2)` / `:last-child` are descendant selectors, so they still hold — do NOT rewrite them as child selectors. `.day_header` is `position: sticky` inside `.cards_wrapper`; batch headers stay non-sticky on purpose. The day bar is **dark** (`--bg-black`, the token Analytics/Details headers already use) because the day is the OUTERMOST group: it has to outrank the batch header (`--bg-grey`) and the white cards. It was light at first and visually sank below the rows nested inside it — keep the day darker than the batch header. Its text/border colours are `rgb(255 255 255 / …)` overlays; the warn/alert stale pills deliberately keep their LIGHT backgrounds so they jump off the dark bar.
- **KNOWN LIMIT (retention):** `cleanupShippedStages` purges on `updated_at`, i.e. time-since-shipped, so a batch printed weeks ago but marked shipped yesterday survives and shows up as an old day with a red stale pill. Print-day-based retention is a separate, not-yet-made decision.

**Stages pipeline:** `printed → heatpress → qc → packed → shipped` (or with sewing: `qc → to_sewing → [Receive → packed] → shipped`)
`STAGE_NEXT` / `STAGE_PREV` maps are the source of truth — use them, never hardcode transitions.
**`FROM_SEWING` is legacy** (like `REJECTED`/`OVERRIDDEN`): kept in `constants.js` (incl. `STAGE_NEXT.from_sewing → packed`) so old rows still render and a file can be pushed there manually via `STAGE_NEXT`, but it is **no longer an active routing target** — "Receive from sewing" now lands directly in `packed`. No filter tab / pipeline-order entry for it (display-only lookups in `ProductionCard`/`groupByOrder` stay).
**Receive completes reprints** — because Receive is now the entry to `packed`, the `stage:setSewingReceived` handler calls `fulfillReprintRequests(fileId)` on success (mirrors `stage:advance → packed`).

**Rollback = physical file move to inbox** — calling `rollbackFile` automatically calls `clearFileStage(fileId)` in `batchHistoryHandlers.js`. No separate DB cleanup needed. The card disappears from Production UI via `removeStageFromStore(fileId)`. **Batch rollback reconciles the DB PER FILE inside the move loop** — `clearFileStage` + `resolveRipErrorsByFile` + `insertRollbackReason` run right after each successful `rename`, NOT collectively after the loop. A mid-loop rename failure therefore never leaves live `file_stages` / open `rip_errors` for files still physically in PRINTED; it is best-effort (continues past a failed file) and returns `result.failedFiles` (`[{ name, error }]`).

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

**Optimistic updates — via `useStageTransition` (`hooks/useStageTransition.js`)** — EVERY stage transition (single/bulk/scan) routes its store write through `applyStageTransition({ fileId, row, newStage, res, now, extra? })`, which classifies the IPC result against the **guarded DB UPDATE** (`WHERE file_id=? AND stage=expectedStage`, returning `{ updated: changes>0 }`): `res.success && res.updated` → `updateStageInStore` + `addStageHistoryEntry`, returns `"applied"`; `res.success && !res.updated` → store untouched, `"rejected"` (guard matched 0 rows — another station already moved the file); `!res.success` → store untouched, `"failed"` (DB/NAS down). **The store is touched ONLY on `"applied"`** — a stale `updated:false` no longer fakes a transition + phantom `stageHistory` entry (the old bug: call-sites checked only `res.success`). Optional `extra` merges sewing fields (`sewing_sent_at`/`sewing_company`/`sewing_received_at`) onto the optimistic row; `newStage` is always the stage written to both the row and the history entry. No `loadAllStages()` reload needed after single actions. The helper owns ONLY this core — it does NOT toast/count/know bulk-vs-scan; call-sites keep their own counters + messages.

**Handler `updated` plumbing** — all three DB fns (`advanceFileStage`/`setSewingSent`/`setSewingReceived`) return `{ updated }`; `stage:advance` always forwarded it, and `stage:setSewingSent`/`stage:setSewingReceived` now forward `updated: result.updated` too (previously returned bare `{ success:true }`, dropping it). `success:true` is still returned regardless of whether a row changed — `updated` is the ONLY signal that distinguishes a real move from a guard rejection.

**`rejected` vs `failed` surfaced separately (NEVER merged)** — single handlers (`handleAdvance`/`GoBack`/`Sewing`/`Receive`) skip the store on non-applied and show `notifyStageRejected(1)` (Warning) or `notifyStageFailed(1)` (Error). Bulk (4×) + scan (4×) tally three counters (`count`/`rejected`/`failed`) and after the loop emit each non-empty one: `count>0` success toast, `rejected>0` amber "already moved by another station", `failed>0` red "check connection". `rejected` uses `type:"Warning"` (NOT `Info` — `AlertsHost.alertTypes` has no Info entry, so Info falls back to `alertTypes[0]`=Error/red). The `rollpress` scan branch keeps its own `advancedIds` Set (its success message reads `.size`) instead of a `count` — left in the call-site by design; it also dropped its old blanket "Advance failed" early-return so rejected/failed are reported apart there too.

**Stage counts in tabs** — when `batchFilter` is active, tab counts reflect only that batch's files.

**Context menu** — stage-aware across the WHOLE selection (`selectedFileIds`; falls back to the clicked row when selection is empty). A stage action shows only when valid for EVERY target file (common availability). Order — stage actions first, then a separator, then tools:
- **Pass** (advance per `STAGE_NEXT`; `from_sewing → packed`) — every file has `STAGE_NEXT[stage]` and `stage` ∉ {`TO_SEWING`, `SHIPPED`}. Label: "Pass to {STAGE_LABEL[next]}" when all on one stage, else "Pass to next stage". Single → `handleAdvance`, bulk → `handleBulkAdvance`.
- **Receive from sewing** (`to_sewing → packed`, `setSewingReceived`) — every file `stage === TO_SEWING`. Lands directly in `packed` (skips `from_sewing`) and fulfills open reprints. Single → `handleReceive`, bulk → `handleBulkReceive`.
- **Send to Sewing ▸** (submenu Olya | Vagabond, `setSewingSent`) — every file `stage === QC`. Single → `handleSewing`, bulk → `handleBulkSewing`.
- **Go back** (per `STAGE_PREV`) — every file has `STAGE_PREV[stage]`.
- **Rollback** — every file has `batch_path` and `stage !== SHIPPED`; opens `ProductionRollbackModal`.
- ── separator ── then tools (always operate on the clicked row): **Reprint Label** (`printBatchLabel`, aggregates batch material + total meters from store), **Quick Preview**, **Open in Folder**, **Open in Shopify** (`openInShopify(orderId)` from fileService).
- **Show in Orders** — also in the tools group, but **consciously operates on the selection** (exception to the "tools always operate on the clicked row" rule above). Maps the target rows (selection when the clicked row is in it, else the clicked row) → `order_id` → order key, using the SAME logic as `groupByOrder.js`. The unknown-order key comes from the **exported `UNKNOWN_ORDER_KEY`** (`groupByOrder.js`), imported by both `Production.jsx` and `OrderView.jsx` — one definition, zero hand-copied literals. `groupByOrder.js` exports `groupByOrder`, `ORDER_STAGE_PIPELINE`, `UNKNOWN_ORDER_LABEL` and `UNKNOWN_ORDER_KEY`. Clears `search`, switches `viewMode → VIEW_MODE.ORDERS`, and signals `OrderView` via `focusOrders={ keys, nonce }` (the `nonce` makes a repeat click on the same order re-fire the effect). `OrderView` expands all keys and scroll+highlights the first one (`data-order-key` on the `OrderRow` root; amber `.order_highlight`, no GSAP). A scan on the Orders lens pulls the view back to Batches — known interaction, not a bug (see the viewMode note below).

## Sewing Receive Lens
`viewMode === VIEW_MODE.RECEIVE` (`SewingReceive.jsx` + `SewingReceive.module.css`). The operator unpacks a parcel returned from a sewing company: they scan the barcodes of the batches that went out, then work order by order. Receiving an item is `to_sewing → packed`.

**The batch basket is CUMULATIVE** — one parcel usually collects several dispatches, so a scan **adds** a batch to the session instead of replacing the list. A repeat scan of the same batch is rejected with a warning; a batch with zero `to_sewing` rows is rejected too (nothing to receive).

**Session state lives in `Production.jsx`, not in `SewingReceive.jsx`** — `session = { batchPaths, receivedInSession, companyFilter, activeOrderKey }`, passed down with `setSession`. This is a fix, not a preference: when the state lived in the component, every lens switch unmounted it and lost the session, while the surviving `scanSignal` prop re-fired its effect on the next mount and **re-added the last batch** — including right after "Clear session". The whole signal mechanism (`scanSignal` + `nonce`) is **gone**; `handleScan` calls `addBatchToSessionRef.current(batchPath)` directly. The session describes one physical unpacking in progress, so it is **never persisted** — not to the store, not to the DB, not to electron-store.

**`sessionRows`** = rows from the basket's batches where `stage === TO_SEWING` **OR** `receivedInSession.has(file_id)`. The second clause is load-bearing: a received item moves to `packed` and would drop out of a plain `to_sewing` filter, so the order would vanish from the list at the exact moment it was received, taking its "N/M" badge and the progress counter with it.

**ONE receive implementation: `receiveFiles` in `Production.jsx`.** Both entry points go through it — the buttons inside `SewingReceive` (via the `onReceive` prop) and the "Receive" context-menu item. `isReceivingRef` is the **actual** guard; the `isReceiving` state only drives `disabled`, because two clicks in the same tick would both read the stale state value. **`undoReceiveFiles` shares that same ref** — undo and receive block each other, since they mutate the same rows.

**Undo receive deliberately avoids `STAGE_PREV`** — `STAGE_PREV[packed]` is `qc`, which would push the file into quality control instead of back to the sewing company. It uses `advanceStage(fileId, TO_SEWING, PACKED)`.

**KNOWN DEBT:** receiving calls `fulfillReprintRequests(fileId)` and stepping the stage back does **not** reopen that request. A later re-receive simply fulfills it again — harmless. `sewing_received_at` also stays in the DB and is overwritten on the next receive.

**The RECEIVE context menu is its own branch in `contextMenuOptions` with an early return** — the pipeline actions (Pass / Send to sewing / Go back) do not apply while unpacking. Targeting and common availability are copied 1:1 from the BATCHES branch: act on the whole selection when the clicked row belongs to it, else on that row. **"Receive"** requires `stage === TO_SEWING` on EVERY target. **"Undo receive"** requires `receivedInSession.has(file_id)` **AND** `stage === PACKED` — the session ledger alone would keep offering the undo after another station moved the file past `packed`. Tools (Shopify / Preview / Open in Folder) operate on the clicked row, as in BATCHES. **"Rollback"** operates on the WHOLE selection (`setRollbackTargets(receiveTargets)`), not on the clicked row — same as in BATCHES. It is the one destructive action in the lens and the only one that moves files on disk.

**Sewing-company filter** — chips are built **dynamically** from `sewing_company` across `sessionRows`, never hardcoded (it is free text set at dispatch). A `"No company"` bucket covers NULL rows (the column arrived via ALTER TABLE). Chips are hidden entirely when there is only one company. The progress counter is scoped to the **active filter**, not the whole session.

**The items column reuses `ProductionCard`** — hover, Reprint / RIP Error / Override badges and the stage pills come along for free, so the lens stays visually consistent with Batches. Consequence: **there is no per-row receive button** — click selects, right-click → Receive, plus "Receive all" in the order header. Selection reuses `selectedFileIds` from `Production.jsx` (one selection state in the view) and is cleared on `viewMode` change and on `session.activeOrderKey` change, because a selection carried across would act on files no longer on screen.

**Notify wording says "item(s)", not "file(s)"** like `notifyStageRejected`/`notifyStageFailed` — a deliberate split: the operator is counting pieces in a parcel, not files. Two sources of text for the same DB condition, on purpose.

**Thumbnails (`PdfThumb`)** — the items column passes `thumbnail={<PdfThumb filePath={...} />}` to `ProductionCard`. The prop is a **slot**: a ready-made element, never a boolean or a path, so `ProductionCard` never learns about pdfjs or file paths. Batches does not pass it, renders nothing extra and pays for **zero** SMB reads. A card that got a thumbnail grows via the explicit `.card_with_thumb` class (the base `.card` is a fixed 44px row and a 64px tile does not fit) — an explicit class rather than `:has(> .card_thumb)`, so the geometry does not depend on DOM shape and stays visible to anyone reading `ProductionCard.jsx`. **Render failures are SILENT**: a grey `LuFileText` placeholder with the reason in `title`, `console.error`, and **no `notify()`** — roughly 8% of `to_sewing` rows currently fail with `ERR_PATH_NOT_ALLOWED` from the unrelated storage-root format problem, which would mean several red toasts on every order click. `PdfThumb` cancels through a `cancelled` flag checked AFTER the await and clears the previous image on `filePath` change, so a ~850 ms render never lands under the wrong card. Thumbnails load only for the ACTIVE order (2-3 items) — that is the laziness; there is deliberately no IntersectionObserver and no prefetch.

**KNOWN DEBT:** the `` `${batch_path}\\${file_id}.pdf` `` path pattern now appears in **4 places** (3× `Production.jsx`, 1× `SewingReceive.jsx`). To be extracted in a change of its own — deliberately not mixed into a feature commit.

## BatchHistory — Key Behaviors
- Call `stopBatchWatcher()` on unmount
- Click anywhere on batch row to expand/collapse; action buttons use `e.stopPropagation()`
- Whole batch rollback: watcher sends `"removed"` → no manual reload needed. Both the optimistic update and the `"removed"` handler keep `files` in state as `ROLLED_BACK` (with `fileCount: 0`), NOT cleared to `files: []` — this matches `readSingleBatch` (live↔reload parity) so a rolled-back batch stays matchable by search (filter checks `file.name`). Do not revert to `files: []` — that re-breaks search after rollback.
- **`handleConfirmRollbackBatch` is tri-state**: (a) `res.success` → full success (existing optimistic `setDayGroups` + scoped clears); (b) `!success && restoredFiles.length > 0` → **partial** — Warning toast "Przeniesiono X z Y", optimistic stage/RIP clear **scoped to moved files only** (`movedStems` = batch stems minus `failedFiles` stems), explicit `refreshFiles()`/`loadData()` because `runMutation` does NOT refresh on `!success`, NO `setDayGroups` (relies on `loadData` painting disk truth: moved→ROLLED_BACK via snapshot masking, stuck→active); (c) total fail → throws to the Error branch.
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

**Store** — `ripErrors {}` keyed `fileId → row`, open-only, most-recent-wins (one file may hold multiple open DB rows; the store/badge surface the latest). Actions: `loadRipErrors()`, `removeRipError(fileId)` / `clearRipErrorsForFiles(ids)` (optimistic clear on rollback), `resolveRipError(fileId)` (manual resolve — DB write first, store clear only on success).

**UI — badges** — red **"RIP Error"** badge (`LuTriangleAlert`) per file in BOTH `ProductionCard` and BatchHistory `FileRow`, shown when `store.ripErrors[stem]` exists (stem = `file.name.replace(/\.[^.]+$/,"")`). Both rows stay presentational — `Production.jsx` and `BatchRow.jsx` (already store subscribers) read `ripErrors` and pass the `ripError` prop down (mirrors how reprint/stageRow reach the rows). `BatchRow` also shows a **batch-header count badge** `"N RIP Error(s)"` (non-interactive) = this batch's files ∩ `ripErrors` with the same stem derivation → header count == expanded file-badge count by construction. Red palette `#FEF2F2` / `rgba(220,38,38,.4)` / `#DC2626`.

**UI — popover (`RipErrorPopover/`)** — clicking the per-**file** badge opens one shared anchored popover (state owned by each view, portaled to `document.body` at the call site like `ContextMenu`). Positioning (anchor edge-flip clamp) + backdrop close (`onPointerDown → onClose`) are **lifted from `ContextMenu` (not imported)**; z-index 2999/3000. Shows Error message / failed node / time (local `formatRipTime`, `HH:MM DD/MM/YYYY` — no shared date helper exists) / file_id, plus a **Copy** button → `navigator.clipboard.writeText` (pattern mirrors `SessionLogs.jsx`) writing the 5-line block (`RIP Error` / `File:` / `Error:` / `Node:` / `Time:`), label `Copy → Copied! → revert ~1.5s` (timeout cleared on unmount). Badge `onClick` + popover interior `stopPropagation` so a click never expands the BatchHistory row or toggles the ProductionCard selection. The **batch-header count badge is NOT clickable**.

**Resolve lifecycle — TWO paths.** (1) **Rollback (automatic):** `rollbackFile` → `resolveRipErrorsByFile(stem)` using the SAME stem key as `clearFileStage`; `rollbackBatch` loops it over `pdfNames` stems (**not** `batch_path` — `rip_errors.batch_id` is the XML BatchId string, so per-stem is the correct key). Runs only on rollback **success**. The store optimistically drops the stem(s) at every rollback-success site (Production `handleRollbackDecisions`; BatchHistory bulk/single/batch handlers — batch uses `dayGroupsRef.current` for the batch's file stems) so badges + header count clear instantly; the 30s poll reconciles against the DB (resolved rows excluded by `getOpenRipErrors`). (2) **Manual (deliberate, from the UI):** a **"Resolved"** button in `RipErrorPopover` next to Copy — for an error the operator has dealt with WITHOUT returning the file to the inbox (job re-sent, RIP queue cleared). Path: `RipErrorPopover` → `store.resolveRipError(fileId)` → `ripErrorService.resolveRipError` → IPC `rip-errors:resolve` → the SAME `resolveRipErrorsByFile`. Both paths resolve **ALL** open rows for that `file_id`.

**`rip-errors:resolve` reads the `runWrite` return value, NOT a try/catch.** `resolveRipErrorsByFile` never throws — it returns `false` when the DB is unavailable or the write fails. The handler derives `success` **from that boolean** (`false` → `toIpcError` with `DB_WRITE_FAILED`); relying on the absence of an exception would report `success:true` against a dead DB and the store would drop the badge of an error still open in the DB. The store calls `removeRipError(fileId)` **only** on `success` — a failed write leaves the badge in place and the popover open for a retry. The store does NOT notify; the toasts (Success / Error) belong to the popover.

**`RipErrorPopover` receives the row, not a `fileId`.** `error.file_id` is already the stem; the displayed `fileId` carries a `"—"` fallback, so the backend key is `rawFileId` (non-empty string or `null`) — the button is `disabled` when it is `null`.

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

## pdfRender.js — shared PDF rendering
`src/ui/utils/pdfRender.js` owns the whole renderer-side PDF path: IPC read → base64 → `Uint8Array` → `pdfjsLib.getDocument` → page 1 → canvas → JPEG data URL. **`pdfjsLib.GlobalWorkerOptions.workerSrc` is set here**, so any module that renders a PDF gets the worker by importing from this file rather than depending on `usePdfPreview` happening to be imported first.

```js
renderPdfToJpeg(filePath, { targetWidth = null, scale = 0.75, quality = 0.85 })  // → JPEG data URL
renderPdfThumb(filePath)   // → JPEG data URL at THUMB_WIDTH 160 / THUMB_QUALITY 0.5, QUEUED
clearPdfCache()            // drop every cached render, both maps (manual re-testing / tests)
```

**ALWAYS render thumbnails through `renderPdfThumb`.** `renderPdfToJpeg` with a `targetWidth` is the lower layer and is **not serialised** — reaching for it directly silently loses the queue and lets several ~850 ms main-thread renders collide.

- **`targetWidth` wins over `scale`** — when given, the scale is derived as `targetWidth / page.getViewport({ scale: 1 }).width` and the `scale` argument is ignored. Without it, `scale` is used directly.
- **Cache key encodes the REQUEST, not the resolved scale**: `` `${filePath}|${targetWidth != null ? `w${targetWidth}` : `s${scale}`}|${quality}` ``. Deliberate — the resolved scale is only known after `getDocument` + `getPage(1)`, i.e. after exactly the work the cache exists to skip, so keying on it would make the cache useless in `targetWidth` mode. For a given file the `targetWidth → scale` mapping is deterministic, so the request descriptor identifies the output image just as uniquely. A 200px thumbnail and a full preview of the same file therefore can never serve or evict each other.
- **Two separate LRU caches**, because the payloads differ by two orders of magnitude: `previewCache` (30 entries, several MB each) and `thumbCache` (200 entries, ~15 KB each, ≈3 MB total). Scrolling through thumbnails can no longer flush the previews. `clearPdfCache()` empties both. The LRU get/set pair is one shared helper, not duplicated per map — reading refreshes recency, so eviction is least-recently-USED, not FIFO.
- **In-flight de-duplication** — `inFlight: Map` keyed exactly like the caches. A second caller asking for the same key while the first render is running gets the SAME promise instead of a second multi-MB SMB read (React StrictMode double-mounts, several cards asking at once). The entry is removed in `finally`, **including on rejection** — otherwise every later caller would inherit the failure instead of retrying. A failed render is likewise **never cached**.
- **`pdf.destroy()` runs in `finally`**, strictly after `page.render` settled — never before, which would tear the document down mid-render. A failing destroy is caught and logged so it cannot mask the render result. Canvas is released too (`canvas.width = 0`).
- **A concurrency-1 queue, for `renderPdfThumb` ONLY.** Rendering blocks the renderer's main thread (~400 ms for a 14 MB file), so parallel thumbnails freeze the UI in bursts. `renderPdfToJpeg` is deliberately **not** queued: a preview opened by hand must not wait behind a backlog of tiles. A `thumbCache` hit short-circuits the queue entirely and never joins the tail.
- Covered by `pdfRender.test.js` (node env, pdfjs + fileService mocked): de-duplication, cache isolation, LRU order, failure-not-cached, in-flight cleanup on failure, destroy lifecycle, queue serialisation.

## usePdfPreview Hook
- **Does not render any more** — it owns modal state only and delegates to `renderPdfToJpeg`, passing `PREVIEW_SCALE` 0.75 and `PREVIEW_QUALITY` 0.85 **explicitly** (pinned to the hook, so a future change to the module defaults cannot silently alter the preview)
- Shares the module-level LRU cache in `pdfRender.js` with every other caller
- Returns: `{ openPreview, closePreview, navigate, isOpen, isLoading, imgSrc, error, currentPath, currentIndex, fileList }`
- `PdfPreviewModal` accepts `fileList: [{ path, name }]`; in BatchHistory skip `rolled_back` files
- `DataList` has its own instance — separate hook state, but the render cache is shared (a file previewed in DataList opens instantly in BatchHistory)

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
8. Load PDF via IPC `readFileBuffer` → base64 → Uint8Array → `pdfjsLib.getDocument({ data })` — NOT `file://`. That path lives in **`src/ui/utils/pdfRender.js`** and belongs there — call `renderPdfToJpeg` instead of re-implementing it (re-implementing also means re-setting `GlobalWorkerOptions.workerSrc`).
9. `DataDaysCounter` was removed — age rendered inline in DataList; do not recreate
10. **Never call `window.api` directly in components** — always import from `src/ui/services/`
11. **Use constants from `src/shared/constants.js`** — never compare against raw strings. Covers: `BATCH_STATUS`, `FILE_STATUS`, `PRINTER`, `CUSTOM_ORDER_STATUS`, `PRODUCTION_STAGE`, `STAGE_NEXT`, `STAGE_PREV`, `STAGE_LABEL`, `STAGE_COLOR`, `QC_ACTION`, `SEWING_SUGGESTED_TYPES`
12. **All file IPC handlers** use `assertStorageFilePath` — prevents path traversal outside storagePath
13. Vitest tests exist in `src/shared/` — run `npm run test` before shipping changes to `estimatePrintLength.js`
14. **Custom Order CSV import**: `customOrder:importCSV` was removed — use `selectCSV()` (returns `files: [{name, content}]`) then `importCSVContent(content)`. Never pass file paths from renderer to main for reading.
15. **Rollback reason rows**: both batch and single-file rollbacks insert **one row per PDF** with `fileId = filename-stem`. Never use `fileId: null` for new rows — it breaks DataList inbox badges. Existing null rows in DB are handled by the `?? batch.rollbackReasons?.[0]` fallback in BatchRow and FileRow.
16. **Fabric/reason config is DB-backed and shared** — electron-store holds ONLY machine-specific settings (paths, workstation name). Do NOT store shared config back in electron-store.
17. **fabricCache must be loaded before getMaterialType/parseFileName are called** — `loadFabricCache()` is called in `ipc/index.js` right after `initDb()`. Both functions have static-set fallbacks for the window before DB is ready.
18. **Every Production stage transition MUST go through `useStageTransition`** — never hand-roll an optimistic `updateStageInStore`/`addStageHistoryEntry` off `res.success` alone. The guarded UPDATE returns `updated:false` when another station already moved the file; touching the store on `success` (ignoring `updated`) re-introduces the phantom-transition bug in the new call-site. Route via `applyStageTransition(...)`, act only on `"applied"`, and report `"rejected"` (Warning) apart from `"failed"` (Error). Any new stage handler in the DB/IPC layer must also return `{ updated }` for the helper to read.
19. **Batch rollback reconciles the DB per file after each successful `rename` — never collectively after the loop.** A collective `clearFileStagesByBatch`/reason-insert past the move loop desyncs `file_stages`/`rip_errors` from disk when a rename fails mid-loop (files still in PRINTED but marked cleared). Every rename in a rollback path goes through `renameNoOverwrite` — **never bare `fs.rename`**: on Windows a silent overwrite destroys a full inbox original, because the PRINTED copy is page-1-only. It refuses the overwrite (EEXIST) and surfaces it — no collision/suffix logic.
20. **`viewMode` values go exclusively through `VIEW_MODE`** (`src/ui/constants/viewModes.js`) — never a bare `"batches"`/`"orders"`/`"receive"` string, in a comparison or an assignment. Note that `"batches"` also occurs as plain UI text elsewhere (e.g. the BatchHistory day-pill plural) — that is not a viewMode value and is not covered by this rule.
21. **Every stage move in the Receive lens goes through the SAME `receiveFiles`/`undoReceiveFiles` in `Production.jsx`.** Do not add a second receive path inside `SewingReceive.jsx` — one lived there and was merged away precisely because two loops mutating the same rows have to be kept in agreement by hand, and the first change to receive logic would have been applied to only one of them. `SewingReceive` receives the implementation as the `onReceive` prop; the context menu calls it directly.
22. **"The day a file entered production" is derived from `batch_path`, never from a `file_stages` timestamp.** The table has no creation column and `updated_at` moves on every stage transition — using it as a day silently reports the last stage move instead. Go through `dayKeyFromBatchPath` (`src/ui/utils/dayKey.js`); do not hand-roll another `split(/[/\\]/).at(-2)`. Any new day-aware UI must also keep the scanner contract: clear `dayFilter` and expand the target day before scrolling to a card.
