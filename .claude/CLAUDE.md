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
| Settings | electron-store → `%APPDATA%\ripflow-desktop\config.json` |
| DB | better-sqlite3 → `ripflow.db` in **storagePath** (NOT userData) |

## Key Files
```
src/electron/
  main.js                  # Frameless window, starts maximized, DEV:5173 PROD:dist/index.html
  preload.js               # IPC bridge → window.api
  helpers/
    parseFileName.js       # CORE LOGIC 600+ lines — change with extreme care
    getMaterialType.js     # material → "Cottons" | "Polyesters" | "Unknown"
    getSettings.js         # electron-store: storagePath, xmlPath, workstationName
    getRootPath.js         # Derives all paths from getSettings() — no hardcoded values
    db.js                  # SQLite: logs, held_files, rollback_reasons; all fns guarded if(!stmt)
    createBatchIds.js      # GROUP_NAME_OVERRIDES + GROUP_NAME_OVERRIDES_REVERSE (both exported)
    ipcError.js            # toIpcError(err, stage, title)
    validateStoragePath.js # assertStorageFilePath — validate batchPath/filePath before file ops
  ipc/
    index.js               # Registers all handlers; calls initDb() first
    createBatch.js         # Atomic file move with rollback — TRANSACTION
    batchHistoryHandlers.js # rollback, regenerateXML, deleteBatch; uses resolveOriginalGroup()
    readPrintedFolder.js   # Reads PRINTED/ tree

src/ui/
  store/useStore.jsx       # Zustand store — central app state
  hooks/usePdfPreview.js   # PDF → JPEG via pdfjs; module-level Map cache by filePath
  utils/notify.js          # ALWAYS use instead of setAlert() — adds toast + SessionLogs entry
  constants/
    printerColors.js       # PRINTER_COLORS: { DGEN, YOKO, YUMI } → { bg, color }
    rollbackReasons.js     # ROLLBACK_REASONS: 11 reasons; OTHER has special text-input behavior
  components/
    Analytics/             # NEW (untracked) — rollback analytics (Details/, Summary/, hooks/)
    BatchHistory/          # day→batch→file tree, real-time watcher, rollback with reasons
    DataList/              # Inbox file list; own usePdfPreview instance; 5 fixed-width tag slots
    ContextMenu/           # Portal popup; supports submenu (children field) with hover delay 150ms
    RollbackModal/         # Portal modal; 11 reason pills; OTHER → text input; Enter/Esc keys

src/shared/
  estimatePrintLength.js   # Used in both electron and UI
  printWidths.js           # Roll widths + fixed product dimensions
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
| `"print"` | DataOverviewSection + DataFilters + DataList |
| `"batch"` | BatchHistory |
| `"logs"` | SessionLogs |
| `"settings"` | Settings |

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

## Storage Paths
Never hardcode — always read from `getSettings()` via `getRootPath.js`.
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
Tables: `logs`, `held_files`, `rollback_reasons`
- `rollback_reasons.file_id = null` → whole batch reason; `= filename-without-ext` → single file
- `logs.workstation` can be NULL in old records — render conditionally
- Schema migration: `ALTER TABLE logs ADD COLUMN workstation TEXT` in try/catch (idempotent)

Functions: `initDb`, `insertLog`, `getAllLogs`, `clearAllLogs`, `holdFile`, `unholdFile`, `getHeldFiles`, `insertRollbackReason`, `getRollbackReasonsByBatch`, `getRollbackReasonsByFile`

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

// Settings — ALWAYS pass all 3 fields to avoid null overwrite
getSettings()  // → { success, settings: { storagePath, xmlPath, workstationName } }
setSettings({ storagePath, xmlPath, workstationName })  // validates paths via fs.promises.access
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
}
```
Key: `getLastBatch(batchDays)` exported helper. `applyFilters()` internal helper.

**DataFilters:** call `loadHeldFiles()` BEFORE `refreshFiles()` — order is critical.

## Print Widths (`shared/printWidths.js`)
- Cotton roll (estimation): **1420mm** — NOT 1450mm (old docs wrong); margin 10mm
- `LM_ROLL_POLY = 1550mm` (estimation) ≠ `LM_XML_POLY = 1420mm` (XML `<Width>` field) — intentionally different, do not swap
- Fixed dims: SAMPLE 220×200mm, FQ 670×480mm, TEA_TOWEL 700×500mm

## BatchHistory — Key Behaviors
- Call `stopBatchWatcher()` on unmount
- Click anywhere on batch row to expand/collapse; action buttons use `e.stopPropagation()`
- Whole batch rollback: watcher sends `"removed"` → no manual reload needed
- Single file rollback: watcher does NOT fire → call `loadData()` manually
- `loadData` must fetch rollback reasons for: (a) `rolled_back` batches AND (b) `active` batches with any `file.status === "rolled_back"` — skipping (b) breaks file-level badges
- Optimistic updates: set state immediately after `res?.success`, watcher syncs after
- `"new-batch"` watcher event: preserve existing reasons: `rollbackReasons: batch.rollbackReasons ?? b.rollbackReasons` — Windows `fs.watch` can fire mid-optimistic-update
- Reason badge lookup: `file_id === fileId` first, fallback to `file_id === null` (batch-level)
- Hook destructured with prefixes (`isPreviewLoading`, `isPreviewOpen`) to avoid conflict with local `isLoading`

## Rollback Reasons
11 codes: `MISSING_JOB`, `PRINTER_LINES`, `WRONG_SIZE`, `WRONG_MATERIAL`, `FABRIC_FAULT`, `PRESSING_FAULT`, `FABRIC_CREASE`, `GHOSTING`, `LINT_MARK`, `WRONG_COLOURS`, `OTHER`
- `OTHER` → inline portal modal with text input (`window.prompt` returns null in Electron contextIsolation)
- ContextMenu submenu child `onClick`: call `onClose()` BEFORE `child.onClick()` — Electron timing

## GROUP_NAME_OVERRIDES (`createBatchIds.js`)
Maps long group names → short folder names. `resolveOriginalGroup(batchPath, shortGroup)`:
1. Read `_batch_info.json` from batch folder
2. Fallback: `GROUP_NAME_OVERRIDES_REVERSE[shortGroup]`
3. Last fallback: `shortGroup` unchanged

## usePdfPreview Hook
- Module-level Map cache (key: filePath) — instant on repeat opens
- Returns: `{ openPreview, closePreview, navigate, isOpen, isLoading, imgSrc, error, currentPath, currentIndex, fileList }`
- `PdfPreviewModal` accepts `fileList: [{ path, name }]`; in BatchHistory skip `rolled_back` files
- `DataList` has its own instance — does not share cache/state with BatchHistory instance

## Dev Commands
```bash
npm run dev    # Vite + Electron concurrently (wait-on)
npm run build  # Vite → dist/
npm run lint   # ESLint flat config v9 — separate rules for ui/ and electron/
```

## Critical Rules
1. **Always grep before deleting** — audit reports miss non-obvious imports
2. `parseFileName` returns `file: { name, ext, dir, fullPath }` — use `item.file.name`, not `item.name`
3. `rollbackBatch`/`rollbackFile` take object `{ ..., reason }` — not positional args
4. `setSettings()`: always pass all 3 fields (`storagePath`, `xmlPath`, `workstationName`)
5. Use `notify()` not `setAlert()` — only `notify()` writes to SessionLogs
6. `ripflow.db` lives in `storagePath` — fails if network unavailable; app continues (all db fns guarded)
7. pdfjs-dist **must stay v4** — v5 incompatible with Electron 40 Chromium
8. Load PDF via IPC `readFileBuffer` → base64 → Uint8Array → `pdfjsLib.getDocument({ data })` — NOT `file://`
9. `Badge` component exists but is **unused** in DataList (inline icon tags used instead)
10. `DataDaysCounter` was removed — age rendered inline in DataList; do not recreate
11. No automated tests in project
