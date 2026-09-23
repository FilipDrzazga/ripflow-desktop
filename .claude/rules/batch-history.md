---
paths:
  - "src/ui/components/BatchHistory/**"
  - "src/ui/utils/batchHistoryPoll*.js"
  - "src/ui/services/batchService.js"
  - "src/electron/ipc/readPrintedFolder*.js"
  - "src/electron/ipc/printedRootSignal.test.js"
  - "src/electron/ipc/normalizeOverrideEntry.test.js"
  - "src/electron/ipc/batchHistoryHandlers*.js"
  - "src/electron/helpers/rollbackFailure*.js"
  - "src/electron/helpers/logOnce*.js"
---

## BatchHistory — Key Behaviors

- Call `stopBatchWatcher()` on unmount
- Click anywhere on batch row to expand/collapse; action buttons use `e.stopPropagation()`
- Whole batch rollback: watcher sends `"removed"` → no manual reload needed. Both the optimistic update and the `"removed"` handler keep `files` in state as `ROLLED_BACK` (with `fileCount: 0`), NOT cleared to `files: []` — this matches `readSingleBatch` (live↔reload parity) so a rolled-back batch stays matchable by search (filter checks `file.name`). Do not revert to `files: []` — that re-breaks search after rollback.
- **`handleConfirmRollbackBatch` is tri-state**: (a) `res.success` → full success (existing optimistic `setDayGroups` + scoped clears); (b) `!success && restoredFiles.length > 0` → **partial** — Warning toast titled "Batch partially rolled back", message `Moved X of Y files.` with `res.userMessage` (the first failed file's OS cause) appended when present; optimistic stage/RIP clear **scoped to moved files only** (`movedStems` = batch stems minus `failedFiles` stems), explicit `refreshFiles()`/`loadData()` because `runMutation` does NOT refresh on `!success`, NO `setDayGroups` (relies on `loadData` painting disk truth: moved→ROLLED_BACK via snapshot masking, stuck→active); (c) total fail (`restoredFiles.length === 0`) → throws to the Error branch. In that branch `errors[]` is empty (the loop, not the outer catch, is what failed), so the toast message prefers `res.userMessage` over the generic "Could not roll back batch.", and threads `res.userCode` (`ERR_ROLLBACK_FAILED`) into the session-log entry.
- Single file rollback: watcher fires but only sends event if batch has 0 PDFs left; optimistic update is sufficient for UI — do NOT call `loadData()` after single file rollback
- `loadData` must fetch rollback reasons for: (a) `rolled_back` batches AND (b) `active` batches with any `file.status === "rolled_back"` — skipping (b) breaks file-level badges
- Optimistic updates: set state immediately after `res?.success`, watcher syncs after
- `"new-batch"` watcher event: preserve existing reasons: `rollbackReasons: batch.rollbackReasons ?? b.rollbackReasons` — Windows `fs.watch` can fire mid-optimistic-update
- Reason badge lookup: `file_id === fileId` first, fallback to `file_id === null` (batch-level)
- Hook destructured with prefixes (`isPreviewLoading`, `isPreviewOpen`) to avoid conflict with local `isLoading`
- **Component split**: day-level rendering in `BatchHistory.jsx`; batch header+actions in `BatchRow.jsx`; file row in `FileRow.jsx` — both sub-components import `BatchHistory.module.css` directly
- Watcher race condition handled: `readSingleBatch` wrapped in try/catch; `ENOENT` → sends `"removed"` event

**Cross-station poll (`utils/batchHistoryPoll.js`, pure + tested).** `fs.watch` on SMB does not report another host's writes, so BatchHistory polls every **30s** (not Production's 15s — each polled day also runs SQLite reads in main): re-enumerate days (`readPrintedDays`), re-read today + the expanded loaded days (`pickDaysToPoll`, cap 3), fold in via `mergePolledDays` (loaded-but-not-read days kept, so load-all is never undone; new days from other stations added as skeletons; deleted days dropped). Also ticks immediately on `visibilitychange → visible`; `shouldTick` **skips while the window is hidden** and enforces a 5s min-gap. One tick at a time (`inFlightRef`); a `mutationEpochRef` bumped at the start of every mutating handler makes a tick whose reads span a mutation **drop its snapshot** (poll cannot repaint a just-rolled-back batch). The poll is also the fallback when the watcher dies — there is no separate degraded-mode interval; the "Live updates paused" toast stays (real-time down, 30s poll continues).

### Lazy-load (Phase 1 + 2)

A full PRINTED scan (35 days / ~580 batches → ~2050 SMB roundtrips) is too slow for startup, submit or view entry. Lazy-load cuts it down.

**`readPrintedFolder.js` structure** — `readSingleBatch` is **unchanged**. The per-day mapping is extracted into `buildDayGroup(dayFolder)` (readdir batches → `readSingleBatch` per batch). Three exports:

- `readPrintedFolder()` — composed from `buildDayGroup`; **identical result** to before (+ additive `dayFolder`/`loaded:true` on each day object). Legacy full scan.
- `readPrintedDays()` — enumeration only (`readdir` root + each day, ZERO `readFile`/DB); returns sorted-desc skeletons `{ dayFolder, date, label, totalBatches, totalFiles:null, batches:[], loaded:false }`. Each per-day `readdir` is wrapped in try/catch → a bad day (ENOENT/EPERM/…) becomes a `totalBatches:0` skeleton instead of sinking the whole enumeration.
- `readPrintedDay(dayFolder)` — one day's full content via `buildDayGroup` (`loaded:true`).

**`refreshBatchDays` (store; startup + after submit)** — loads ONLY the newest day (`readPrintedDays` → `readPrintedDay(days[0])`), sets `batchDays = [newestDay]`. Sole consumer outside BatchHistory's mirror is `LastBatchCard`/`getLastBatch`, which only needs the newest active batch. `getLastBatch` returns `null` gracefully when the newest day has no batches (option a — empty card, never descends to older days). No more full scan here.

**`loadData`** — `readPrintedDays()` → skeletons; eager-loads the most-recent N days (`batchHistoryEagerDays`, default 7) via `readPrintedDay` → `attachReasonsToDay`; older days stay as skeletons. `attachReasonsToDay(day)` is the second-pass reasons fetch extracted from `loadData` (`needsReasons` = batch `ROLLED_BACK` or any file `ROLLED_BACK` → `getRollbackReasonsByBatch`), reused in `loadData` and `toggleDay` (and, until 0b4b04b, `reloadLoadedDays`).

**`toggleDay`** — first expand of a skeleton (`loaded === false`) → `readPrintedDay(day.dayFolder)` → `attachReasonsToDay` → merge by `dayFolder` (`loaded:true`); per-day spinner while loading; idempotent (skips if already loaded or a fetch is in flight via `loadingDays`). The fetch is fired **outside** the `setExpandedDays` updater (StrictMode-safe — no double fetch).

**`filteredDayGroups`** — filter clause `(day.loaded === false && !q) || day.batches.length > 0 || expandedDays.has(day.date)`. The `&& !q` means skeletons stay visible only while **browsing** (no query); under an active search they are hidden (their full `totalBatches` pill would otherwise masquerade as a match) — load-all-on-search loads them instead (see below). A loaded, collapsed day emptied by search is still dropped. The `expandedDays.has(day.date)` clause means a day the user explicitly expanded does NOT vanish from the filtered list after lazy-load even with zero query matches (without it, expanding a skeleton under an active search made the day disappear). `expandedDays` MUST be in the `useMemo` deps of `filteredDayGroups`, otherwise the filter won't recompute on expand/collapse. When an expanded day is `loaded:true`, has 0 filtered batches, and a search is active, the render shows "No matches in this day" instead of an empty header. `day_pill` is null-aware: a skeleton shows just the batch count (no `· N files`, no `null`), rendered dimmed/dashed.

**Empty-state (global) is 3-way under an active search** (`searchQuery.trim()` non-empty, `filteredDayGroups.length === 0`): (a) load-all still in progress (`isSearchLoadingMore`) → spinner + "Searching older days…"; (b) finished with 0 matches → "No results found." (a full-history result, since load-all pulls in the whole history — do not reintroduce a "no results in loaded days" wording); (c) matches → list renders. With no query it's unchanged ("No results found." for an active printer filter, else "No batches yet."). `isSearchLoadingMore` = search active AND (`dayGroups.some(d => d.loaded !== true)` OR `loadingDays.size > 0`).

**Load-all-on-search** — while a search is active, unloaded skeleton days are pulled in via the existing `loadDayContent` so search spans the **whole** history (e.g. an order number / `ON` that only appears in an old day's filename), not just the eager head. Trigger: a `useEffect([searchQuery])` (deps intentionally `[searchQuery]` only via `eslint-disable-line` — `loadDayContent` is stable, and adding `dayGroups` would re-fire on every merge) with a **350 ms debounce** (`"3"→"3p"→"3pa"` collapses to one sweep). The sweep is **sequential + progressive**: it snapshots the skeleton `dayFolder`s at start, then `await loadDayContent(df)` one by one — each merge flips `loaded:false→true` and `filteredDayGroups` recomputes, so matches surface as days arrive. A `cancelled` flag (set in the effect cleanup) **aborts** the sweep on query change/clear, checked after every await; `loadAllRunningRef` guards against overlapping sweeps. A footer-spinner "Searching older days…" (`.search_loading_more`) shows when there are already matches above but the rest is still loading. After loading, days stay `loaded:true` — **natural cache**: clearing the search does NOT unload them, and the next search won't re-pull (guard: `dayGroupsRef.current.every(d => d.loaded === true)` → return); the only reset is a manual Refresh / `loadData` (rebuilds skeletons beyond the eager head). **Accepted edge** (see the comment above the `loadAllRunningRef` guard in `runLoadAll`): if the query changes while a sweep is mid-await on a slow SMB, the new trigger may hit `running === true` and skip, so load-all won't finish for the new query until the next query change — rare (debounce collapses typing), non-blocking (re-type resumes), consciously left as-is.

**Watcher loaded-aware (Phase 2b)** — day key unified on `dayFolder` (`date === dayFolder` by format):

- `new-file` / `removed` skip days where `loaded !== true` (skeletons untouched — ends the global `totalFiles` zeroing).
- `new-batch` on an existing skeleton is a no-op (content arrives on expand); on a loaded day it merges as before; a watcher-created new day is built with `dayFolder` + `loaded:true`.
- **Degraded mode**: a lost watcher does not start its own interval — the always-on 30s cross-station poll (above) is the fallback. `dayGroupsRef`/`expandedDaysRef` hold the current state so the tick reads a fresh list (stale-closure-safe).

## PRINTED read diagnostics (`ipc/readPrintedFolder.js`)

BatchHistory reads the PRINTED tree from DISK (the DB only enriches). Three disk-read
failures each leave a trace, while the **return value is unchanged** (this is
diagnostics, not a behaviour change):

| code                       | type    | when                                                                                                                      | function still returns               |
| -------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `PRINTED_ROOT_UNREACHABLE` | error   | `access(printedRoot)` throws (in `readPrintedFolder` and `readPrintedDays`)                                               | `success:true`, empty data           |
| `PRINTED_DAY_UNREADABLE`   | error   | a day's `readdir` throws (the `readPrintedDays` skeleton catch, and `buildDayGroup` which then re-throws into `errors[]`) | skeleton `totalBatches:0` / re-throw |
| `BATCH_FOLDER_SKIPPED`     | warning | a directory fails `parseBatchFolderName` / `BATCH_FOLDER_RE` (in `buildDayGroup` and the `readPrintedDays` count)         | folder skipped                       |

**`PRINTED_ROOT_UNREACHABLE` also raises an operator BANNER** (the log entry is unchanged
and stays). `readPrintedFolder.js` keeps a module-level flag, `getPrintedRootUnreachable()`
as its snapshot, and an injected sink (`setPrintedRootSink`, wired in `main.js` beside
`setDbErrorSink`) that emits `printed:unreachable` / `printed:reachable` **once per
transition** — never per read, because `readPrintedDays` runs on every BatchHistory mount,
after every submit and on the 30s poll. The renderer subscribes in `App.jsx`
(`onPrintedRootUnreachable` / `onPrintedRootReachable` → `store.printedRootUnreachable`)
and pulls a startup snapshot via `checkPrintedRoot()` (`printed:get-unreachable`), the twin
of `checkDbDegraded`. **The banner is suppressed while the DB banner is up** — a dead NAS
raises both and the second line adds nothing; a PRINTED folder gone on a healthy share
raises this one alone, which is the case no other signal shows. **Both readers' RETURN
VALUES are unchanged** — the signal sits beside the read (pinned by
`printedRootSignal.test.js`). The renderer half has no test: there is no rendering harness
(rejected in `50f64c8`).

**The banner's WORDING carries both causes because the code cannot tell them apart.**
`access()` answers `ENOENT` the same way for "the share is gone" and for "nothing has been
printed on this installation yet", and nothing creates `PRINTED` before the first
BatchHistory mount (`startWatcher`) or the first submit (`createBatch`) — while
`refreshBatchDays` reads at startup. So it fires on a FRESH INSTALL. Creating the folder at
startup to silence it was **rejected**: the folder would come back empty, the batches would
still be invisible, and `access()` would stop failing — silence in the one case the banner
exists for. So the wording changes, not the condition: it deliberately does not tell anyone
to check the network, because on a fresh installation that instruction is wrong.

- **`logOnce` (`helpers/logOnce.js`)** — one module instance keyed by folder path; a given
  key logs again only after a **1-hour** window (`createLogOnce({ windowMs })`). Not
  "once per session": the app runs 24/7 and a share can fail, recover, and fail again
  hours later. No map size cap — keys are folder paths, bounded by the share (~1600 batch
  folders measured). This exists because `readPrintedDays` runs on every BatchHistory mount
  and after every submit, from three stations, into the SHARED SQLite log.
- **`insertLog` is skipped while the DB is degraded** (`getDbDegraded()`), console only:
  `insertLog` is a synchronous better-sqlite3 write and must not pile onto a hung SMB share.
  It is also wrapped so a logging failure never breaks the read.
- **Station name is injected**, not imported: `setDiagWorkstationResolver(fn)` is called from
  `index.js` with `() => getSettings().workstationName ?? null`. `readPrintedFolder.js` must
  not import `getSettings` (electron-store) — that would pull the electron chain into
  `normalizeOverrideEntry.test.js`. A resolver (not a value) because the name can change in
  Settings mid-session; it matters because a real failure mode is ONE station seeing
  different data, and the station name is what makes that visible in the shared log.
- **Loose files in a day dir are NOT logged** — only directories that fail the batch regex.
  Volume of `BATCH_FOLDER_SKIPPED` on the live share was measured at 0.
