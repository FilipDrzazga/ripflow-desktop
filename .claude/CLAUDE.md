-use context7

# RipFlow Desktop — Project Context for Claude

## Overview

**RipFlow Desktop** — Electron + React app automating print workflow for PrintFactory machines.
**Platform:** Windows only (network paths, backslashes) | **Users:** production operators | **Code:** English only — identifiers, comments, UI/log/error strings; Polish found in code you edit is translated in the same change (Polish letters and control characters fail `npm run lint`: `eslint-rules/no-polish-or-control.js`)

## Stack

Versions live in `package.json` — not repeated here. What the manifest does not say:

- **Electron** — frameless window, starts maximized; DEV loads Vite on 5173, PROD `dist/index.html`.
- **Vite** — port 5173 `strictPort`, alias `@` → `./src/ui`.
- **Zustand** with `subscribeWithSelector`; **CSS Modules** + `global.css` (`--navbar-width: 104px`).
- **pdf-lib** copies page 1 only. **pdfjs-dist must stay v4** — v5 breaks in Electron 40 Chromium.
- **fast-xml-parser** — main process only (RIP-error ingest); XML generation stays hand-rolled string templates.
- **electron-store** — machine-specific settings only (paths, workstation identity; see Storage).
- **better-sqlite3** → `ripflow.db` in **storagePath** (NOT userData) — shared across all PCs.

## Key Files

Only the files whose role the name does not tell, or that carry a rule. Anything else: Glob / grep.

- `src/electron/helpers/parseFileName.js` — the filename parser, core logic; change with extreme care (golden net + `parseFileName.test.js`).
- `src/electron/ipc/createBatch.js` — atomic move + lock (see `.claude/rules/create-batch.md`).
- `src/electron/ipc/batchHistoryHandlers.js` — rollback / regenerate / delete; `renameNoOverwrite`, `resolveOriginalGroup` (rule 19).
- `src/electron/ipc/readPrintedFolder.js` — the PRINTED reader: `readPrintedDays`, `readPrintedDay`, `readSingleBatch`, `buildDayGroup`, `normalizeOverrideEntry`.
- `src/electron/helpers/fabricCache.js`, `shopProfile.js` — in-memory caches with a `null` "not loaded" sentinel; `getEstimateConfig()` is the one config source for the estimator.
- `src/electron/helpers/validateStoragePath.js` — `assertStorageFilePath` (rule 12); `ipcError.js` — `toIpcError(err, stage, title)`.
- `src/ui/services/` — the only code that touches `window.api` (rule 10).
- `src/ui/utils/notify.js` (rule 5), `hooks/useStageTransition.js` (rule 18), `utils/dayKey.js` (rule 22), `utils/pdfRender.js` (rule 8).
- `src/ui/utils/featureVisibility.js` vs `shopProfileData.js` — two readers split by the question they answer (see `.claude/rules/shop-profile.md`).
- `src/shared/` — used by both processes: `estimatePrintLength.js`, `printWidths.js` (fallbacks), `constants.js` (rule 11).
- `golden/`, `scripts/golden/`, `profiles/` — the XML regression net, its harness and the catalogue it feeds on (see "Golden XML regression net" in `.claude/rules/print-xml.md`).

## Topic rules (`.claude/rules/`)

Detail per area lives in path-scoped rule files. Each loads only when a file matching its
`paths:` frontmatter is READ with the Read tool. Output of `git show`, `grep` or `cat` does
NOT load anything — when you review or change an area through the shell, open its rule
file yourself first.

| File                | Area                                                             |
| ------------------- | ---------------------------------------------------------------- |
| `production.md`     | Production board, stage transitions, scanner, Sewing Receive lens |
| `batch-history.md`  | BatchHistory, lazy-load, cross-station poll, PRINTED diagnostics  |
| `create-batch.md`   | atomic move, lock, `_batch_info.json`, `GROUP_NAME_OVERRIDES`     |
| `print-xml.md`      | file types, fabric config, print widths, BUG 4, golden net        |
| `shop-profile.md`   | shop profile cache, sentinel states, feature gates                |
| `rip-errors.md`     | RIP-error ingest, parser shapes, badges, resolve paths            |
| `custom-order.md`   | Custom Order CSV import and per-file selection                    |
| `pdf.md`            | `pdfRender.js`, thumbnails, preview hook                          |
| `database.md`       | SQLite tables and their contracts                                 |
| `productization.md` | `PRODUCTIZATION.md` ticking, gates, mutation proof, test rules    |

## Workflow

```
INBOX → PARSE FILENAME → UI → SELECT FILES+PRINTER → CREATE BATCH+XML → PRINTFACTORY → PRINT
```

1. Scan `storagePath` (default `O:\SPPrintReadyArtwork`)
2. Parse PDF filenames → extract metadata (product type, material, qty, dimensions)
3. Operator selects files + printer → submit
4. Atomically move files (temp → rename) with rollback on failure
5. Generate XML for PrintFactory to network `xmlPath`

## Views

`activeView` in `App.jsx` picks the view. `DataList`, `BatchHistory` and `Analytics` are wrapped in `ErrorBoundary`; Custom Orders and Analytics are gated by the shop profile (see `.claude/rules/shop-profile.md`).

## Storage — Two-tier config

**electron-store** (per-machine, `%APPDATA%\ripflow-desktop\config.json`):

- `storagePath`, `xmlPath`, `workstationName`, `customOrderFolderPath`, `workstationRole`, `labelPrinterName`, `shippedRetentionDays`, `batchHistoryEagerDays`, `labelPrintMode`, `clientId`
- `batchHistoryEagerDays` — per-machine, default 7, min 1; how many most-recent days BatchHistory eager-loads (rest are lazy skeletons, loaded on expand)

**ripflow.db** (shared across all PCs via network `storagePath`):

- Operational: `logs`, `held_files`, `rollback_reasons`, `custom_order_history`
- Shared config: `reason_definitions`, `fabric_globals`, `fabrics`, `shop_profile`

```
storagePath:     O:\SPPrintReadyArtwork       (default)
xmlPath:         \\192.168.0.17\Original_files\SPPrintReadyArtwork
workstationName: os.hostname()               (set on first run)

Derived paths (hotfolders = printers[].hotfolder in the shop profile; Alex's values):
  {storagePath}\AUTOMATION_WORKFLOW_COTTON\  ← DGEN
  {storagePath}\AUTOMATION_WORKFLOW_POLY\    ← YOKO/YUMI
  {storagePath}\PRINTED\DD-MM-YYYY\PRINTED_HHMMSS-GROUP-PRINTER\
```

## IPC API (`window.api`)

`preload.js` is the source of the API and `src/ui/services/` the only caller (rule 10). The contracts that are easy to get wrong:

- `rollbackBatch({ batchPath, reason })` / `rollbackFile({ filePath, batchPath, reason, reprint? })` take an OBJECT (rule 3). `reprint: { qtyAffected, qtyOriginal }` is passed by Production rollbacks only and inserts a `reprint_requests` row (meters for LM, pieces otherwise).
- `setSettings()` — spread the full settings first, then override (rule 4).
- PDFs are read through `readFileBuffer` (base64), never a `file://` URI — blocked by contextIsolation.
- `profile.get()` returns `data: null` when the DB was unreadable at startup — not a default profile.
- `showConfirm(message)` is the native dialog; `window.prompt` returns null under contextIsolation.

## Zustand Store (`useStore.jsx`)

The state shape is in the file. What it does not say:

- `selectedIds` enforces the material lock: Cottons and Polyesters cannot be mixed in one selection.
- `fabricConfig` and `shopProfile` are `null` until loaded — a sentinel, never an empty object.
- `ripErrors` holds ONE row per file, the most recent (the DB may hold several open errors per file). It is FILLED only by `loadRipErrors`, called only from the effect in `App.jsx` gated on `isFeatureEnabled("ripErrors", shopProfile)`; the rollback paths only remove from it — an empty map therefore means "feature off", "profile unreadable" OR "no errors", so any UI that renders at zero needs its own feature check.
- `resolveRipError(fileId)` writes to the DB FIRST and drops the badge only on `success`; it never notifies (the popover does).
- `removeStageFromStore` / `removeRipError` / `clearRipErrorsForFiles` are the optimistic clears after a rollback; the next poll reconciles.
- **Startup (`App.jsx`): `await loadHeldFiles()` BEFORE `await refreshFiles()`** — the same order applies in `DataFilters`. The rest of the startup loads are not awaited.

## Rollback Reasons

14 codes: `MISSING_JOB`, `PRINTER_LINES`, `WRONG_SIZE`, `WRONG_MATERIAL`, `FABRIC_FAULT`, `PRESSING_FAULT`, `FABRIC_CREASE`, `GHOSTING`, `LINT_MARK`, `WRONG_COLOURS`, `AUTOMATION_FAULT`, `RERUN`, `ARTWORK_ISSUE`, `OTHER`

- Labels and icons are stored in `reason_definitions` DB table — **shared across all PCs**
- `ROLLBACK_REASONS` in `constants/rollbackReasons.js` is the static fallback only (used before DB loads)
- `WRONG_MATERIAL` displays as "Wrong Fabric" (label changed; code kept for DB backwards-compat)
- `OTHER` → inline portal modal with text input (`window.prompt` returns null in Electron contextIsolation)
- ContextMenu submenu child `onClick`: call `onClose()` BEFORE `child.onClick()` — Electron timing
- New reasons can be added via Settings → Rollback Reasons; immediately available in RollbackModal, BatchHistory, Analytics

## Settings Architecture

`Settings.jsx` routes through a `SECTIONS` array + `VIEWS` map; every view shares `SettingsView.module.css`. Per-machine values (General, Paths) go to electron-store; Fabrics and Rollback Reasons are shared DB config (rule 16). The fabric alias field sanitises on `onChange`, but the real gate is `getAliasFromCache` (see Fabric Config in `.claude/rules/print-xml.md`).

## Dev Commands

```bash
npm run dev        # Vite + Electron concurrently (wait-on)
npm run build      # Vite → dist/
npm run lint       # ESLint flat config v9 — separate rules for ui/ and electron/

# Release (claude/RUNBOOK-WDROZENIE.md, section 3) — NOT `npm run build:dist`, which publishes a FULL release at once
node scripts/release/release.mjs build             # tagged HEAD -> installer copied out of dist/ + SHA256SUMS
node scripts/release/release.mjs publish [--full]  # a PRE-release unless --full; --dry-run on both
npm run test       # Vitest — runs every *.test.js: src/** and eslint-rules/ (node environment)
npm run test:watch # Vitest watch mode

# Golden XML regression net (.claude/rules/print-xml.md) — offline, reads golden/_inputs.json, never the live DB
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/golden/compare-golden.mjs
```

**Dev sandbox (`src/electron/sandboxBoot.js` + `helpers/sandboxGuard.js`).** Run from the repo (`!app.isPackaged`), the app moves `userData` to `<home>\ripflow-sandbox\userData` (first import of `main.js`, before the settings Store exists) and seeds `config.json` with storage/xml/custom folders inside `<home>\ripflow-sandbox`.
Plain `npm run dev` is therefore safe on a production station — it does not share `%APPDATA%\ripflow-desktop` (the LIVE station config) with the installed app.
`main.js` refuses to start while `findUnsafeSettings` reports any path setting outside the sandbox (UNC, `O:`, or anything else); delete the sandbox `config.json` to re-seed.
Label printing and `update:check`/`update:install` are no-ops in the sandbox; the installed build is unchanged.
Data by hand: copy a file from `%APPDATA%\ripflow-desktop\backups\` to `<sandbox>\storage\ripflow.db` (REAL customer data - keep it local), and create `<sandbox>\storage\PRINTED\<dd-mm-yyyy>\PRINTED_hhmmss-GROUP-DGEN\` folders manually.
A local sandbox does NOT reproduce SMB's blindness to other hosts' writes: `fs.watch` sees them.

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
11. **Use constants from `src/shared/constants.js`** — never compare against raw strings. Covers: `BATCH_STATUS`, `FILE_STATUS`, `CUSTOM_ORDER_STATUS`, `PRODUCTION_STAGE`, `STAGE_NEXT`, `STAGE_PREV`, `STAGE_LABEL`, `STAGE_COLOR`, `QC_ACTION`, `SEWING_SUGGESTED_TYPES`. Printer codes are NOT a constant: they are shop-profile data (`printers[]`, ETAP 2e) — read them through `getPrinterByCode` (main) or `getPrinters` / `getPrinterColor` (`utils/shopProfileData.js`), and the code of a batch through `printerOfBatch` (`src/shared/batchFolderName.js`).
12. **All file IPC handlers** use `assertStorageFilePath` — prevents path traversal outside storagePath
13. Vitest tests exist in `src/shared/` — run `npm run test` before shipping changes to `estimatePrintLength.js`
14. **Custom Order CSV import**: `customOrder:importCSV` was removed — use `selectCSV()` (returns `files: [{name, content}]`) then `importCSVContent(content)`. Never pass file paths from renderer to main for reading.
15. **Rollback reason rows**: both batch and single-file rollbacks insert **one row per PDF** with `fileId = filename-stem`. Never use `fileId: null` for new rows — it breaks DataList inbox badges. Existing null rows in DB are handled by the `?? batch.rollbackReasons?.[0]` fallback in BatchRow and FileRow.
16. **Fabric/reason config is DB-backed and shared** — electron-store holds ONLY machine-specific settings (paths, workstation name). Do NOT store shared config back in electron-store. This is one direction of a two-way split; **see rule 25** for the other, which keeps the machine's own identity OUT of the shared profile.
17. **fabricCache must be loaded before getMaterialType/parseFileName are called** — `loadFabricCache()` is called in `ipc/index.js` right after `initDb()`. There is NO static fallback for the window before the DB is ready: `getMaterialType` answers `"Unknown"` and `parseFileName` leaves the LM width `null` with an "Unknown fabric" warning, so the job is refused rather than guessed.
18. **Every Production stage transition MUST go through `useStageTransition`** — never hand-roll an optimistic `updateStageInStore`/`addStageHistoryEntry` off `res.success` alone. The guarded UPDATE returns `updated:false` when another station already moved the file; touching the store on `success` (ignoring `updated`) re-introduces the phantom-transition bug in the new call-site. Route via `applyStageTransition(...)`, act only on `"applied"`, and report `"rejected"` (Warning) apart from `"failed"` (Error). Any new stage handler in the DB/IPC layer must also return `{ updated }` for the helper to read.
19. **Batch rollback reconciles the DB per file after each successful `rename` — never collectively after the loop.** A collective `clearFileStagesByBatch`/reason-insert past the move loop desyncs `file_stages`/`rip_errors` from disk when a rename fails mid-loop (files still in PRINTED but marked cleared). Every rename in a rollback path goes through `renameNoOverwrite` — **never bare `fs.rename`**: on Windows a silent overwrite destroys a full inbox original, because the PRINTED copy is page-1-only. It refuses the overwrite (EEXIST) and surfaces it — no collision/suffix logic.
20. **`viewMode` values go exclusively through `VIEW_MODE`** (`src/ui/constants/viewModes.js`) — never a bare `"batches"`/`"orders"`/`"receive"` string, in a comparison or an assignment. Note that `"batches"` also occurs as plain UI text elsewhere (e.g. the BatchHistory day-pill plural) — that is not a viewMode value and is not covered by this rule.
21. **Every stage move in the Receive lens goes through the SAME `receiveFiles`/`undoReceiveFiles` in `Production.jsx`.** Do not add a second receive path inside `SewingReceive.jsx` — one lived there and was merged away precisely because two loops mutating the same rows have to be kept in agreement by hand, and the first change to receive logic would have been applied to only one of them. `SewingReceive` receives the implementation as the `onReceive` prop; the context menu calls it directly.
22. **"The day a file entered production" is derived from `batch_path`, never from a `file_stages` timestamp.** The table has no creation column and `updated_at` moves on every stage transition — using it as a day silently reports the last stage move instead. Go through `dayKeyFromBatchPath` (`src/ui/utils/dayKey.js`); do not hand-roll another `split(/[/\\]/).at(-2)`. Any new day-aware UI must also keep the scanner contract: clear `dayFilter` and expand the target day before scrolling to a card.
23. **Every `estimatePrintLength` / `estimateMaterialLengthByGroups` call passes a config** — `getEstimateConfig()` in the main process, `store.fabricConfig` in the renderer (third argument for `estimateMaterialLengthByGroups`). A call site that omits it silently reverts to the `printWidths.js` fallbacks and re-splits the app between two sets of numbers, which is exactly the bug BUG 4 closed. `getEstimateConfig()` must keep returning `null` — never `{ fabrics: [] }` — when the cache is not loaded: an empty array is truthy and drags the estimator into its DB branch with an empty catalog. Run the golden net after any change here.
24. **The shop profile is read through `shopProfile.js`, never from `db.getShopProfile()` directly** — the helper owns the sentinel, and a call site that reads the DB itself would have to re-derive "not loaded vs no row vs failed" and would get it wrong. `getProfile()` returning `null` means the DB was unreachable. No consumer may substitute `DEFAULT_PROFILE` (another shop's data) for it. A consumer that performs an EFFECT fails closed: gated effects go through `getFeature`, which is `false` with no profile; an effect the operator asked for explicitly refuses visibly (`openInShopify.js`: `SHOPIFY_DISABLED` / `MISSING_STORE_HANDLE`). `parseFileName.js` is the one deliberate exception still open: with no profile (`shopConfig` null) it degrades to the built-in `DIMS_*` product dimensions — an undecided behaviour, see the comment above `BUILT_IN_DIMS`. Do not turn it into a refusal without that decision; it changes the XML at a station whose NAS is down. Any new profile field must reach a consumer in the same change or the next one — `fabricConfig` sat unread for months and that was BUG 4.
25. **Shared config carries RULES, the machine carries its IDENTITY — they join by key, never by merging.** The mirror image of rule 16. `shop_profile` says what a role DOES (`scanRules[].from/to`); electron-store says which role THIS PC is (`workstationRole`). Moving the identity into the profile would make one shared row decide what a specific machine on the shop floor is, and moving the rules into electron-store would leave every station free to invent its own workflow. A list of legal roles is neither, so it belongs to neither — do not add one to the profile.
