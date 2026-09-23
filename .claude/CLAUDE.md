# Zasady krytyczne - obowiazuja zawsze, w kazdej turze

## Uruchomienie

- Plik czatu rotuje sie po datach: chat/RRRR-MM-DD.md
- Agent nie ma pewnego zrodla dzisiejszej daty, wiec FILIP podaje dokladna
  nazwe dzisiejszego pliku czatu w PIERWSZEJ wiadomosci do kazdej sesji
  (tej z "Jestes S1..."). Wzor:

  [ROLA: Jestes S1 - ...] Plik czatu na dzis: chat/RRRR-MM-DD.md.
  Przeczytaj claude/project_state.md i INSTRUKCJA.md, potem ostatni wpis w tym
  pliku, wykonaj co trzeba i ZAPISZ odpowiedz jako nowy wpis w tym samym
  pliku, konczac ja markerem [KONIEC]

- Do czasu az dostaniesz te nazwe, nie zgaduj daty - dopytaj
- Wszystkie TRZY narzedzia (wake.js, pisz.js, czat.ps1) licza nazwe pliku
  raz przy starcie. Po rotacji i po kazdej zmianie doby restartuje sie
  wszystkie trzy - zrestartowanie dwoch konczy sie tym, ze to trzecie pisze
  albo czyta wczorajszy plik i nikt tego nie widzi

## Format wpisu

- Piszesz do pliku czatu na dzisiejsza date (chat/RRRR-MM-DD.md), ktorego
  dokladna sciezke dostajesz w pierwszej wiadomosci od FILIPA, w formacie:
  GODZINA ROLA: tresc
- Twoj raport to JEDEN wpis - jedna linia czasu na poczatku, cala tresc pod nia
- KAZDY wpis konczysz w nowej linii markerem: [KONIEC]
- Bez [KONIEC] nikt nie zostanie obudzony - to nie jest opcjonalne
- Nigdy nie edytujesz cudzych wpisow, tylko dopisujesz swoj na koncu
- Odpowiedz NIE liczy sie, dopoki nie zapiszesz jej do dzisiejszego pliku
  czatu
- Cudze wpisy cytujesz w srodku zdania. Nie przeklejasz cudzego naglowka
  (GODZINA ROLA:) na poczatek linii - dla wake.js wyglada to jak nowy wpis
- Markery CZEKA NA FILIP i WERDYKT licza sie tylko wtedy, gdy zaczynaja linie
  w kolumnie 0 albo stoja zaraz po Twoim naglowku. Cytujac je, zrob wciecie

## Decyzje dla czlowieka

- Gdy potrzebujesz decyzji, recznego testu albo wyboru - NIE umieszczaj tego
  w zwyklym podsumowaniu. Zacznij osobna linie od:
  CZEKA NA FILIP: <czego potrzebujesz>
- Jesli masz kilka pytan, ponumeruj je w tym samym wpisie:
  CZEKA NA FILIP:
  1.  ...
  2.  ...
  3.  ...
      ...
- Po tym wpisie NIC wiecej nie robisz do odpowiedzi
- Zakoncz wpis markerem [KONIEC] tak jak kazdy inny

## Zakonczenie zadania

- S2 KONCZY KAZDA recenzje jedna z dwoch fraz, doslownie:
  WERDYKT: ZATWIERDZONE
  WERDYKT: POPRAWKI
- Bez tej frazy petla sie nie zatrzyma

## Trwaly stan projektu (claude/project_state.md)

- S2, wystawiajac WERDYKT: ZATWIERDZONE, w TYM SAMYM wpisie (przed [KONIEC])
  dopisuje tez zmiany do claude/project_state.md - zwiezle, 3-5 linii: co zrobiono,
  jakie decyzje podjeto, jaki jest nastepny krok
- Przy WERDYKT: POPRAWKI nie ruszasz claude/project_state.md - plik aktualizuje sie
  tylko przy zatwierdzeniu
- Sekcje "## Aktualny stan" i "## Nastepny krok" NADPISUJESZ - maja
  zostawac krotkie i opisywac teraz, a nie historie
- Sekcje "## Decyzje" tylko DOPISUJESZ na koncu (append) - to log
  uzasadnien, kazda linia z data i powodem, nic z niej nie usuwasz
- Aktualizacja claude/project_state.md jest czescia werdyktu, nie osobnym wpisem -
  bez niej recenzja nie jest skonczona
- Linie "Ostatnia aktualizacja: RRRR-MM-DD" na gorze pliku podbijasz, gdy
  dzisiejsza data jest inna niz wpisana. Data, ktorej nikt nie odswieza, myli
  bardziej niz jej brak

-use context7

# RipFlow Desktop — Project Context for Claude

## Overview

**RipFlow Desktop** — Electron + React app automating print workflow for PrintFactory machines.
**Platform:** Windows only (network paths, backslashes) | **Users:** production operators | **Code comments:** English

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
- `src/electron/ipc/createBatch.js` — atomic move + lock (see Atomic File Move).
- `src/electron/ipc/batchHistoryHandlers.js` — rollback / regenerate / delete; `renameNoOverwrite`, `resolveOriginalGroup` (rule 19).
- `src/electron/ipc/readPrintedFolder.js` — the PRINTED reader: `readPrintedDays`, `readPrintedDay`, `readSingleBatch`, `buildDayGroup`, `normalizeOverrideEntry`.
- `src/electron/helpers/fabricCache.js`, `shopProfile.js` — in-memory caches with a `null` "not loaded" sentinel; `getEstimateConfig()` is the one config source for the estimator.
- `src/electron/helpers/validateStoragePath.js` — `assertStorageFilePath` (rule 12); `ipcError.js` — `toIpcError(err, stage, title)`.
- `src/ui/services/` — the only code that touches `window.api` (rule 10).
- `src/ui/utils/notify.js` (rule 5), `hooks/useStageTransition.js` (rule 18), `utils/dayKey.js` (rule 22), `utils/pdfRender.js` (rule 8).
- `src/ui/utils/featureVisibility.js` vs `shopProfileData.js` — two readers split by the question they answer (see Shop Profile).
- `src/shared/` — used by both processes: `estimatePrintLength.js`, `printWidths.js` (fallbacks), `constants.js` (rule 11).
- `golden/`, `scripts/golden/`, `profiles/` — the XML regression net, its harness and the catalogue it feeds on (see Golden XML regression net).

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

`activeView` in `App.jsx` picks the view. `DataList`, `BatchHistory` and `Analytics` are wrapped in `ErrorBoundary`; Custom Orders and Analytics are gated by the shop profile (see Shop Profile).

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
- Shared config: `reason_definitions`, `fabric_globals`, `fabrics`, `shop_profile`

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

Tables: `logs`, `held_files`, `rollback_reasons`, `custom_order_history`, `reason_definitions`, `fabric_globals`, `fabrics`, `shop_profile`, `file_stages`, `file_stage_history`, `reprint_requests`, `rip_errors`

> **Non-`main` tables in the PRODUCTION DB (measured 2026-09-11):** `counters`, `custom_clients` and `custom_order_files` physically exist in Alex's shared `ripflow.db` but are **not referenced anywhere in `main`'s `src/`** (`git grep` in `main` finds only an unrelated code comment mentioning "counters"). They come from `feature/custom-orders-unification`, i.e. a build off that branch once touched the shared DB. Harmless today, origin still to be established — do NOT assume `main` owns them.

- `rollback_reasons.file_id = null` → whole batch reason; `= filename-without-ext` → single file
- `logs.workstation` can be NULL in old records — render conditionally
- `held_files` is keyed by `file_id` (PRIMARY KEY) with an optional `reason` — a **global** hold model (one operator holds a file, everyone sees it; legacy per-workstation rows are migrated to this shape on `initDb`). `file_id` == the inbox item id `${folder}_${filename.pdf}` (same key `readFolders` builds). Rows are **orphan-pruned** on a clean inbox scan (see `pruneOrphanHeldFiles`), because nothing else clears a hold when its file leaves the inbox — `unholdFile` is only ever called by the explicit in-app un-hold toggle (NOT by `createBatch`/rollback)
- Indexes: `rollback_reasons(batch_path)`, `rollback_reasons(file_id)`, `logs(timestamp DESC)`
- `getAllLogs` is capped at 500 rows; `addLog` in store trims to 500 entries
- `fabric_globals` is seeded from `DEFAULT_FABRIC_GLOBALS` on first run; `fabrics` seeding is guarded on `DEFAULT_FABRICS` being non-empty, and it ships empty — a fresh install starts with no materials (Settings > Fabrics or a profile import)
- `fabrics` has an `alias` column (TEXT, nullable) — short path-safe name for the PRINTED folder / XML; empty/NULL alias = full `name` is used
- `reason_definitions` is populated via one-time migration from electron-store on first run
- `rip_errors`: one row per ERRORED FILE (not per xml). `UNIQUE(job_guid, file_id)` — dedup is per (xml, file); a pre-split failure shares one `job_guid` across N files → N rows. Index: `rip_errors(file_id)`

**DB functions:** see `db.js` — exported functions check `if (!db)` and degrade (writes go through `runWrite`, which returns `false`); the deliberate exception is `getShopProfile`, which THROWS without a handle (see Shop Profile). Two more with a contract worth knowing: `pruneOrphanHeldFiles(liveIds)` refuses a non-array or EMPTY `liveIds`, so a failed scan can never wipe `held_files`; `resolveRipErrorsByFile(fileId)` resolves ALL open rows for that file and returns `false` instead of throwing.

**`reprint_requests`** (partial reprint tracking): one row per rollback-from-Production event. `qty_affected` REAL — meters for LM, piece count otherwise; `qty_original` = full qty at rollback time. Open = `fulfilled_at IS NULL AND superseded_at IS NULL`. A new rollback of the same file **supersedes** prior open rows (history kept for analytics). `stage:advance` to `packed` calls `fulfillReprintRequests(fileId)`. Index: `reprint_requests(file_id)`. When a Production rollback registers a qty, `rollback_reasons.meters` is estimated from **qty_affected** (LM: meters→height; others: pieces→qty), so Analytics waste (byFabric, Details) is partial-aware with no Analytics-side changes; BatchHistory rollbacks keep full-file meters. `readFolders` attaches `reprintQty`/`reprintQtyOriginal` to inbox file objects from open requests (matched by filename stem); `readSingleBatch` (BatchHistory) **prefers the persisted provenance in `_batch_info`** for reprint, falling back to open requests only when `_batch_info` has none → persistent blue "Reprint" badge in DataList and BatchHistory `FileRow`. **`selectedOverrides` holds ONLY manual operator overrides — never seed it from reprint.** At submit, `fileService.submitBatch` computes `effectiveQty = manualOverride ?? reprintQty ?? parsed`, and only the effective amount drives the printed output (XML `<Copies>`/`<Height>`) and the `_batch_info.json` provenance — `createXML.js` still needs no reprint logic. The Override and Reprint badges are independent and may coexist (Override from `selectedOverrides`, Reprint from open requests / `_batch_info`); never hide the Override badge because it equals `reprintQty`. **Reprints counter (print-view OverviewPanel):** the "Reprints" pill shows `store.openReprints.length`, loaded via `reprint:getOpen` (= `getOpenReprintRequests`, ALL open rows regardless of location) and refreshed on the global 30s poll. It counts every open request — inbox (rolled back, awaiting reprint) **+** in-production (`file_stages`) **+** any **phantom** whose file has left both (no inbox PDF and no `file_stages` row, e.g. a reprint never re-run). A phantom is invisible in every view but still counted, so the pill can legitimately read one higher than the sum of what any single view shows — the count is authoritative against the DB, not a per-view total.

**`rip_errors`** (RIP-error tracking): one row per **errored file**. Columns: `id` TEXT PK (`crypto.randomUUID`), `job_guid` TEXT NOT NULL, `file_id` TEXT NOT NULL (filename stem, matches `file_stages.file_id`), `batch_id`, `nesting_group`, `failed_node`, `error_message`, `document_id` (XWD, nullable backup key), `detected_at` (ISO ingest time), `created_at` (`<Created>` from xml, nullable), `resolved_at` (NULL = open; **set on rollback** by `resolveRipErrorsByFile` — rollback is the only resolve path). `UNIQUE(job_guid, file_id)` + `INSERT OR IGNORE` → a pre-split failure shares one `job_guid` across N files (N rows), and re-scans don't duplicate. The **same `file_id` may hold multiple open errors** (different `job_guid` = distinct events); `getOpenRipErrors` orders `detected_at DESC` and the store keeps only the most recent per file. See **RIP Errors** section.

## Fabric Config (`fabricCache.js`)

In-memory cache loaded at startup (`loadFabricCache()` called in `ipc/index.js` after `initDb()`).
Invalidated and reloaded after every `fabrics:save`, `fabrics:delete`, `fabrics:setAll`, `fabricGlobals:set`.

```js
loadFabricCache(); // load from DB into memory
invalidateFabricCache(); // clear cache (call before reloading)
getFabricByName(name); // → fabric object | null
getFabricTypeFromCache(name); // → "Cottons" | "Polyesters" | "Unknown" | null (null = cache not loaded)
getXmlWidthFromCache(name); // → fabric.xmlWidth | null — no class default, see below
getAliasFromCache(name); // → short path-safe alias | null (null = no/unusable alias or cache not loaded)
getCachedFabrics(); // → fabric[]
getCachedGlobals(); // → { marginCotton, marginPoly, defaultRollWidthCotton, defaultRollWidthPoly, defaultXmlWidth* }
//   the two defaultXmlWidth* keys are DEAD — stored, editable, read by nobody
getEstimateConfig(); // → { globals, fabrics } | null (null = cache not loaded — NEVER { fabrics: [] })
```

**Material class (getMaterialType.js) — there is no fallback, and that is the point:**

1. fabricCache loaded → the catalogue's answer, `"Unknown"` included
2. Cache not loaded (before initDb, or the DB unreachable) → `"Unknown"`

Do not add a static list of fabric names back as a fallback. A guessed class is not a degraded
answer but a wrong one at any shop except
the one the list was copied from. The two causes of `"Unknown"` are told apart where the operator
is actually blocked (`DataPrintSelection`), not here: this function returns a class, and "the DB
could not be read" is not a class.

**Alias sanitization — single gate:** `getAliasFromCache` strips everything outside `[a-zA-Z0-9_-]` (and trims) at the point of use, returning `null` if nothing usable remains. This is the ONE gate, independent of the UI `onChange` — so a dirty alias entering via `setAllFabrics`/import or a hand-edited `ripflow.db` can never reach the PRINTED folder name / `<Path>`.

**XML width in parseFileName.js (`applyLmDimensions`) — a lookup, NOT a chain:**

1. `getXmlWidthFromCache(material)` → `getFabricByName(name)?.xmlWidth`, the per-material value
2. Fabric absent from the catalogue, or the catalogue unreadable → **`null`** plus a warning on the
   file (`Unknown fabric "<name>" - not in the fabric catalogue, so the print width is unknown`).
   `out.width` stays `null` and the operator is stopped in the print view.

**There is no step 3** — no class default, no `?? 1420`. Do not add one back: a second,
degraded answer is exactly what let the two paths disagree on real fabrics. A `null` width
cannot reach the XML — `buildPFJobXML` refuses the job at the source. `parseFileName.js`
imports no `printWidths.js` `LM_XML_*` constants.

## Shop Profile (`shopProfile.js`)

Shop-wide configuration in one JSON blob: printers with their colours and hotfolders,
material classes, product dimensions, folder names, scanner rules, sewing companies,
the Shopify handle and the feature flags. Stored in `shop_profile` (one row, `CHECK id = 1`)
in the SHARED `ripflow.db`, so every station reads the same setup.

**What the profile does NOT carry: the identity of the machine.** `workstationRole`,
`workstationName`, paths and the printer name stay per-machine in electron-store. The
profile answers "how does this shop work", electron-store answers "which station am I".
`scanRules` is the place that makes the split visible: the RULES are shop-wide, the ROLE
that selects one is not (a list of `workstationRoles` in the profile would be a second
source of truth next to `scanRules` — do not add one).

**The pattern is `fabricCache.js`, copied deliberately** — same module-level cache, same
load-on-startup / invalidate-on-write cycle, same sentinel discipline.

```js
loadShopProfile(); // DB → memory; called in registerIpcHandlers BEFORE loadFabricCache
invalidateShopProfile(); // clear (call before reloading)
getProfile(); // null | DEFAULT_PROFILE | the DB row
getPrinters(); // profile.printers, or [] when not loaded / the field is not an array
getPrinterByCode(code); // printer | null — case-insensitive, see the 2e debt
getFeature(name); // boolean, fail-closed, strict === true
```

**Three real states in `db.getShopProfile()`, and only ONE of them yields a value.**
The function has three branches, not two:

1. `if (!db)` → **THROWS** — the DB handle is gone (`initDb` failed, e.g. a dead NAS).
2. `SELECT … LIMIT 1` finds no row → `return null` — a fresh install.
3. `prepare`/`get`/`JSON.parse` throws — a live handle whose read genuinely failed
   (SQLITE_IOERR, corruption, a `data` column that is not valid JSON).

`loadShopProfile` maps a throw to `cachedProfile = null` ("we know nothing") and `null`
to `DEFAULT_PROFILE`. Branch 1 throwing is what makes those two answers mean different
things: **a dead NAS yields `null`, the failure sentinel — never `DEFAULT_PROFILE`.**
`profile:get` then hands the renderer that null, `resolveProfileResult` maps it to
`PROFILE_STATUS.FAILED` (`utils/profileStatus.js`), and `App.jsx` shows the banner.
`DEFAULT_PROFILE` stands in for **branch 2 only** — an absent row on a HEALTHY database.

That substitution is still a real problem, but it is **DEBT 1 (seed vs migration, ETAP 3),
not a defect in the sentinel**: `initDb` seeds `DEFAULT_PROFILE` into every fresh
`shop_profile` table, so client #2 does not get Alex's config transiently during an
outage — they get it as their OWN durable row, indistinguishable from configuration
somebody set on purpose. That row also carries the scan rules that move production stages.

`shopProfile.test.js` cannot cover branch 1: it does `vi.mock("./db.js")`, so the real
guard never executes. `db.shopProfile.test.js` covers it instead, asserting the throw on
both branch 1 and branch 3 against the real module. Whenever `db.js` changes around the
profile, re-read this section against the code before trusting it.

A failed RELOAD also drops a previously loaded profile — serving a stale one quietly is
worse than admitting ignorance.

**`loadShopProfile()` runs BEFORE `loadFabricCache()`** in `registerIpcHandlers`. Not
style: the profile carries the material classes and hotfolder names the fabric layer will
read once those consumers land (ETAP 2), so it has to be in memory first.

**`getFeature` is fail-closed and strict.** No profile means no feature, and only a real
boolean `true` counts — a flag written as `1` or `"true"` by a sloppy import stays off. A
dark button is a worse experience; a live button wired to a config we could not read is a
wrong link or a wrong path.

**`DEFAULT_PROFILE` lives in `defaultProfile.js`, not in `db.js`** — same split as
`defaultFabrics.js`. `db.js` is the edge these tests mock (`vi.mock("./db.js")` replaces
the WHOLE module), so a constant imported from there would have to be faked too, and
"no row falls back to the default" would be asserting against the fake.

**IPC is its own pair, never bolted onto `settings:set`**: `profile:get` / `profile:set`.
`settings:set` writes per-machine values to electron-store; the profile is shop-wide and
lives in the shared DB. `profile:set` repeats the `fabrics:save` cycle (write, invalidate,
reload) and reloads even after a FAILED write, so the cache mirrors what the DB holds
rather than what was attempted. `profile:get` returns `null` when the DB was unreachable
at startup instead of substituting a default that would read as a real profile.

**First consumer: `openInShopify.js`** — the store handle comes ONLY from
`integrations.shopify.storeHandle`; there is **no `DEFAULT_PROFILE` fallback** (it would
send another shop's operator into Alex's Shopify admin). The handler is gated fail-closed:
`getFeature("shopify")` off — which includes an unreadable profile — → `SHOPIFY_DISABLED`;
flag on but a missing/blank handle → `MISSING_STORE_HANDLE`. A visible failure, never a
substituted shop.

**Renderer**: `store.shopProfile` (null until loaded, exactly like `fabricConfig`), loaded
by `loadShopProfile()` in the App startup effect via `services/profileService.js`. The
store checks `res.data` as well as `res.success`, so a null from main does not overwrite
the sentinel with something that looks loaded. First renderer consumer (2c): the NavBar
feature filter — `App.jsx` passes `shopProfile` down as a prop and `NavBar` gates Custom
Orders and Analytics through `isViewEnabled` (`src/ui/utils/featureVisibility.js`), a
deliberate fail-closed, strict `=== true` mirror of `getFeature`, because `getFeature`
is main-process only and is not exposed over IPC. `App.jsx` also guards both gated views
in the render and corrects `activeView` back to `"print"` during render (not in an
effect — `react-hooks/set-state-in-effect`). The profile banner is gated on
`!isLoading`: `shopProfile` is null throughout startup, so an ungated banner would fire
on every normal launch.

**Two renderer-side reader modules, split by the QUESTION they answer** — keep them apart:

- `utils/featureVisibility.js` — "is this feature visible to this client": `isFeatureEnabled(flag, profile)`, `isViewEnabled(viewId, profile)`. Gates.
- `utils/shopProfileData.js` — "what does this client's config contain": `getSewingCompanies(profile)` → `string[]`, `getScanRule(profile, role)` → rule `| null`. Data.

Both are pure functions, fail-closed on an unreadable profile, and that shape is not
stylistic: the renderer's profile gates have no standing guard (the rendering harness was
rejected in `50f64c8`), so a pure function is the only cut here that can carry a test at
all. The sentinel differs by return TYPE, deliberately: a LIST answers `[]` ("this shop has
none"), a SINGLE record answers `null` ("no rule for this role") — the same reasoning
`db.getShopProfile` follows. `getScanRule` additionally reads `notifyWhenEmpty` as
`!== false`, which is the one place these two files do NOT mirror each other; see
Workstation roles.

**KNOWN LIMIT:** the profile is loaded once at startup and reloaded only on `profile:set`.
If the DB was unreachable at startup it stays `null` until a restart, even when the NAS
comes back a minute later. `fabricCache` has the identical property — one problem, not
two; tracked under ETAP 4.

## Atomic File Move (`createBatch.js`)

VALIDATE → LOCK (`.lock` file) → DESTINATION_STRUCTURE → COPY (pdf-lib p.1) → VERIFY → COMMIT (rename + write `_batch_info.json { originalGroup, overrides? }`) → DELETE_SOURCE → ROLLBACK on fail

**LOCK stage — stale-lock removal via RENAME, not unlink.** A stale `.lock` (age > `STALE_LOCK_MS` = 90s on the NAS clock via probe file; 5min conservative fallback when the probe fails) is cleared by `removeStaleLock(lockPath)`: `rename(.lock → .lock.dead-<pid>-<ts>)` then `unlink` of that unique name — **NOT** a destructive `unlink(.lock)` by name. Why: two stations racing to clear the SAME stale lock via unlink-by-name could have station B delete station A's freshly-created lock (TOCTOU) → both enter COPY of the same sources → double print. `rename` is source-consuming: exactly one station wins it; the loser gets `ENOENT` → `removeStaleLock` returns `false` → falls through to `open(.lock, "wx")`, where O_EXCL picks the single winner (EEXIST → "Source folder locked"). Both call-sites (NAS-probe branch + 5min fallback) go through `removeStaleLock`. Leftover `.dead-*` (crash between rename and unlink) is inert — never named `.lock`, so it never blocks a batch; NOT swept by `sweepOrphanTemps` (that scans `PRINTED\<day>\` dirs, not inbox source folders).

**Lock body carries a reserved `nonce`.** The fresh lock's JSON is `{ pid, batchId, timestamp, nonce }`; **`nonce` (`crypto.randomUUID()`) is a deliberately dead field** — foundation for future lock-ownership verification (Opcja 2). It is written but **never read today** — do NOT prune it as dead code.

**KNOWN DEBT (deliberate, unfixed):** the lock-release path in `createBatch.js`'s `finally` still does a destructive `unlink(lockRecord.lockPath)` by name — the twin of the TOCTOU fixed above. Process-freeze scenario: a station stalls > 90s (heartbeat stops), another station legitimately claims + recreates the lock, then the frozen station wakes and its `finally` deletes the successor's lock. Consciously NOT fixed — it belongs to the "lock-ownership verification" class (would need a `nonce` re-read before unlink). Recorded as a known decision, not a blind spot.

**COPY is page 1 only — intentional.** `pdf-lib` copies only the first page of each source PDF; pages 2+ are deliberately not preserved (PrintFactory needs only page 1). A rolled-back or regenerated file therefore never carries pages 2+ — by design, not data loss.

`_batch_info.json`: the stable shape written by `createBatch.js` is `{ originalGroup, fileGroups }` — `originalGroup` is the batch-level inbox folder name and `fileGroups` (per-stem inbox folder, always written) lets a mixed-source batch resolve each file to its own group; `overrides` is added ONLY when a manual override/reprint produced entries (`...(Object.keys(overridesMap).length > 0 ? { overrides } : {})`). Used by `batchHistoryHandlers` to find the correct rollback target; without it, falls back to GROUP_NAME_OVERRIDES_REVERSE. It also persists per-file print provenance under `overrides[stem]` = `{ printed: {meters}|{qty}, manual: bool, reprintQty, reprintOriginal }` — written in `createBatch.js` from the `_printed`/`_manual`/`_reprintQty`/`_reprintOriginal` fields set by `fileService.submitBatch` (one entry per file that has an effective printed amount: manual override OR reprint). `readPrintedFolder.js` reads it via `normalizeOverrideEntry` (an **exported** pure fn — `{ printed:{meters}|{qty}, manual, reprintQty, reprintOriginal } | null`), which also accepts the **legacy shape** (`{qty}`|`{meters}`) defensively (treated as `manual:true`, no reprint provenance) and returns `null` for a malformed/empty entry. Group metres (`fixedTotalLengthM`) are computed from `printed` (effective): `printed.meters`→height / `printed.qty`→qty is overlaid onto the parsed file before `estimatePrintLength`, so the BatchHistory header reflects the actually-printed amount, not the parsed original. **`batchHistoryHandlers.regenerateXmlForBatch` imports the SAME `normalizeOverrideEntry`** and applies the identical overlay (`printed.qty`→`qty`, `printed.meters`→`height = round(meters*1000)`), so a regenerated XML reproduces the effective printed amount for both new and legacy `_batch_info.json`. Never read `ov.qty`/`ov.meters` by hand — that misses the `{printed}` shape.

`_rollback_snapshot.json`: written in the batch folder on rollback (`{ rolledBackAt, type: "batch"|"file", files: [] }`). `readSingleBatch` reads it so already-`rolled_back` files still render (with reason badges) even after their PDF has moved back to the inbox.

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

## Print Widths — Hardcoded vs DB

`printWidths.js` values are **fallbacks only — with one live exception**. DB (`fabric_globals` +
`fabrics`) is the primary source everywhere the table below says so. The exception is
`customOrderHandlers.js`, which imports `LM_XML_POLY` and writes it straight into the custom-order
XML as `<Width>${LM_XML_POLY}</Width>`, next to a hardcoded `<MaterialType>Polyesters</MaterialType>` — not a fallback,
a live literal, and one with no golden baseline (hole (b) in the Etap 2 gate).

| Config                           | DB table                                  | Fallback                                           |
| -------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| Margins (cotton/poly)            | `fabric_globals`                          | `MARGIN_COTTON=10`, `MARGIN_POLY=5`                |
| Default XML widths               | `fabric_globals` — **DEAD, zero readers** | none                                               |
| Default roll widths              | `fabric_globals`                          | `LM_ROLL_POLY=1550`, `LM_ROLL_COTTON_DEFAULT=1420` |
| Per-material XML width           | `fabrics.xml_width`                       | **none — `null`, and the job is refused**          |
| Per-material roll width          | `fabrics.roll_width`                      | `LM_ROLL_COTTON[name]` map                         |
| Material type routing            | `fabrics.type`                            | **none — `"Unknown"`, and the job is refused**     |
| XML flags (velvet/linen/blossom) | `fabrics.is_velvet/is_linen/is_blossom`   | string-contains fallback                           |

**`<MaterialType>` cannot leave as `Unknown`** — `assertKnownMaterialClass` in
`createXML.js` refuses the job at the source, beside `assertPrintableDimensions` and
**after** it (code `ERR_UNKNOWN_MATERIAL_CLASS`; a fabric outside the catalogue fails both
and keeps the width message it has today). The RIP cannot accept the value; none of the 70
golden baselines carries it. The gate refuses a **missing** class — blank, or the literal
`Unknown` in any case — and deliberately **not** a class outside a list: a whitelist would
put the class names back into the code 2g/2h is emptying of them, and a third class is an
open possibility. A foreign `type` string (a hand-edited row, or an import via
`setAllFabrics` — Settings cannot produce one, its class is a two-button toggle) therefore
still renders. Pinned by `materialClassGate.test.js`.

**Fixed product dims stay hardcoded** (never user-editable):

- SAMPLE 220×200mm, FQ 670×480mm, TEA_TOWEL 700×500mm

### Who supplies the config

`estimatePrintLength(files, config)` and `estimateMaterialLengthByGroups(groups, materialType, config)`
take the DB values as an **optional** argument, and EVERY call site passes one (rule 23). A call site
that omits it runs on the `printWidths.js` constants while the rest of the app runs on the DB — a
split brain in which a Settings edit reaches some outputs (the rollback waste in Analytics) and not
others (the XML, the batch label, the BatchHistory header, the inbox estimates). That split was BUG 4.
A Settings edit reaching the XML is therefore **intended**.

- **main process** → `getEstimateConfig()` from `fabricCache.js` (`createXML.js`, `submitBatch.js`,
  `readPrintedFolder.js`, `batchHistoryHandlers.js` ×2)
- **renderer** → `store.fabricConfig` (`useStore.applySort`, `DataList`,
  `PrintMaterialBreakdownCard`, `ProductionOverviewCard` — the last one passes it **third**, after
  `materialType`)

**`getEstimateConfig()` returns `null`, never `{ fabrics: [] }`, when the cache is not loaded.** An
empty array is truthy, so the estimator would take its DB branch with an empty catalog and silently
lose the per-material roll widths from `LM_ROLL_COTTON`. `null` keeps the degraded path on
`printWidths.js`. Same sentinel discipline as `cachedFabrics === null` everywhere else in that file.
Never build `{ globals: getCachedGlobals(), fabrics: getCachedFabrics() }` by hand.

**Degraded paths.** `xmlWidth` has none (see Fabric Config: `null` and the job is refused).
`rollWidth` still does: `estimatePrintLength`'s `getRollWidth` falls back to
`LM_ROLL_COTTON[name] ?? LM_ROLL_COTTON_DEFAULT` (poly: `LM_ROLL_POLY`) with no config. To check that
the two answers agree, load `profiles/fashion-formula-fabrics.json` and compare each row's
`rollWidth` against that fallback — never trust a recorded result without re-running it. The golden
harness always feeds `fabricCache` a full catalogue, so the `null` path executes in the net zero
times (hole (a) in the Etap 2 gate): cover it with a unit test (`materialClassSource.test.js`),
never with the golden net. ETAP 2h (moving the maps into the profile) removes the second answer.

### Golden XML regression net (`golden/` + `scripts/golden/`)

70 real batches, anonymised, rendered by the **production** `buildPFJobXML` and stored as the
byte-for-byte baseline. Run it after ANY change that could touch print-length maths or the XML
template:

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/golden/compare-golden.mjs
# 0 differences across 70 batches
```

- Offline and reproducible: inputs come from `golden/_inputs.json`, and `scripts/golden/stub-db.mjs`
  feeds `fabricCache` from `profiles/fashion-formula-fabrics.json` — the harness NEVER opens the
  live `ripflow.db` (`initDb()` writes, and the baseline must not depend on one machine).
- Customer names, order numbers and XWD ids are pseudonymised **at the source**; mappings are derived
  from sorted distinct values, so a re-capture reproduces an identical baseline.
- Only three things are masked before diffing: the random UUID in `<NestingGroup>`, the same UUID
  inside `<LogisticGroup>`, and the path root. **The `_Nm` metre suffix is compared byte for byte** —
  that is the whole point of the net.
- **Never regenerate the baseline to make a diff go away.** A difference is a finding: decide
  fix-vs-regression first, with a manual calculation, then re-capture only if the new value is
  provably the correct one.
- The golden net does NOT see the six non-XML consumers. For those, compare
  `estimatePrintLength(items)` against `estimatePrintLength(items, config)` over real rows at file,
  material-group and batch level — the shapes the different consumers actually use.

## Production — Key Behaviors

DB tables: `file_stages` (one row per active file), `file_stage_history` (append-only per stage transition).

**viewMode goes through `VIEW_MODE`, never a bare string** (`constants/viewModes.js`: `BATCHES` | `ORDERS` | `RECEIVE`). `Production.jsx` is the only consumer; all three lenses are live (see **Sewing Receive Lens** below for `RECEIVE`).

- **`handleScan` does not force the lens.** It flips `ORDERS → BATCHES` (so the scan result is visible instead of silently mutating the hidden Batches state) and leaves `BATCHES`/`RECEIVE` alone. Written as a functional `setViewMode` updater so `viewMode` stays OUT of the `useCallback` deps (reading it directly would re-create the callback on every lens switch and re-point `handleScanRef`).
- **The `RECEIVE` branch inside `handleScan` sits ABOVE the `workstationRole` blocks and returns early** — it calls `addBatchToSessionRef.current(batchPath)` and nothing else. This ordering is a **data-safety requirement, not tidiness**: below it live the role branches, so at a QC station a scan performed while unpacking a sewing delivery would advance that batch's `heatpress` files to `qc`. The current lens is read through `viewModeRef` because putting `viewMode` in `handleScan`'s deps would re-create the callback and re-point `handleScanRef` on every tab switch.
- **A file-level scan in `RECEIVE`** returns a "Scan a batch barcode" warning instead of clearing filters and scrolling the hidden Batches lens — that lens works batch by batch.
- **Scan from the search box is a whitelist** — `viewMode !== BATCHES && viewMode !== RECEIVE → return`. Deny is the default **on purpose**: `handleScan` MUTATES the DB (per `workstationRole` it advances stages), so a future fourth lens must not inherit access to a state-changing path merely by existing. Do not flip this back to a blacklist (`=== ORDERS`).

**Day grouping (BATCHES lens)** — cards are grouped `day → batch → card`. The day layer is built **always**; the batch layer only when `isGrouped` (`groupingEnabled && (stageFilter === "all" || batchFilter)`), otherwise the day renders its cards flat. This is the point of the feature: the day must survive both the "Groups" toggle and the stage tabs.

- **The day comes from `batch_path`, never from a timestamp.** `file_stages` has **NO** creation column — `updated_at` is rewritten on every stage transition, so it is the shipping/last-move time, not the print day. The day is the `PRINTED\DD-MM-YYYY\` segment (`batch_path.split(/[/\\]/).at(-2)`), read through `dayKeyFromBatchPath` (`utils/dayKey.js`). Same key BatchHistory groups by → both views agree on "the day". `withLocalBatchPath` (main) only re-roots the path, so the day/batch segments survive verbatim. Rows with no parsable day fall into the exported `UNKNOWN_DAY_KEY` bucket, sorted last — never dropped.
- **Topbar toggles are buttons, not checkboxes** — "Groups" and collapse-all share `.toolbar_btn`, whose geometry matches `.refresh_btn` exactly so the three read as one row of equal controls. Groups carries its on/off state as `.toolbar_btn_active` (the same filled-dark treatment the lens toggle uses) plus `aria-pressed`. Note BatchHistory has its own, unrelated `.collapse_btn` in its own module — collapse-only, no expand — and CSS Modules keep the two scoped apart.
- **Collapse-all / expand-all** — one button next to the "Groups" toggle, flipping on `allDaysCollapsed`: while any rendered day is open it collapses everything, once all are collapsed it reopens them. It is scoped to `groupedDays`, i.e. what is on screen, so under an active day filter it acts on that day alone. Consistent with the inverse-set model below, a day that arrives from the poll AFTER a collapse-all shows up expanded — it was never in the set.
- **`collapsedDays`, not `expandedDays`** (the inverse of BatchHistory): Production is the live board, so everything is open by default and a day arriving later from the 15s poll shows up open with no auto-expand logic. Never flip this to an expanded-set — that would collapse every newly polled day.
- **Sorting is explicit and must stay so.** Days `compareDayKeysDesc`; batches inside a day by folder name descending (the shared `PRINTED_HHMMSS` prefix makes a lexicographic compare a time compare). Without it, order comes from `productionStages` key order, which drifts as polling merges rows.
- **The scanner must clear `dayFilter` and expand the target day** — both in the batch branch (before `setBatchFilter`) and the file branch (**before** the `requestAnimationFrame`). A card inside a collapsed day is not in the DOM, so `querySelector` finds nothing and the scroll + 1.5s highlight silently do nothing.
- **Stale pill** — `daysSinceDayKey(dayKey)`, shown from 2 days and only while the day still holds a file with `stage !== SHIPPED` (a fully shipped day is finished, not stuck). Amber ≥ `STALE_DAYS_WARN` (3), red ≥ `STALE_DAYS_ALERT` (7).
- **Day filter chip** — `dayFilter` narrows `filtered` AND `countableRows` (so the stage-tab counts do not lie), renders next to the Batch chip in `filter_bar`, and is in the selection-clearing effect's deps alongside `batchFilter`/`stageFilter`.
- **`DayGroupHeader` has no "Select All"** — bulk selection stays a batch-level action (`BatchGroupHeader`), so the day header carries only the chevron, date, label, counts, stale pill and the filter button. Do not re-add it.
- **CSS**: `.batch_group` is nested inside `.day_body`. `.batch_group .card:nth-child(2)` / `:last-child` are descendant selectors, so they still hold — do NOT rewrite them as child selectors. `.day_header` is `position: sticky` inside `.cards_wrapper`; batch headers stay non-sticky on purpose. **The day is separated by an accent rule + type scale, not by a tonal step**: `--bg-grey-light` background, `border-radius: 12px` (one step above the cards' 10px), a 4px `border-left` in `--bg-black`, and a 20px/700 date. Everything sits on **one row** — chevron, date, `Today`/`Yesterday` label, batch/file counts, stale pill — 46px tall, `flex-wrap` as the narrow-window fallback. `.batch_group_header` is untouched (`--bg-grey`). The day is deliberately the LIGHTER of the two headers, so the whole separation rests on the accent border, the type scale and the row height — trim any one of them and the day header sinks back into the list, which is exactly the problem this styling exists to solve. All four corners are rounded, not just the top, because the bar is sticky and floats over the cards while scrolling.
- **KNOWN LIMIT (retention):** `cleanupShippedStages` purges on `updated_at`, i.e. time-since-shipped, so a batch printed weeks ago but marked shipped yesterday survives and shows up as an old day with a red stale pill. **Print-day-based retention was considered and REJECTED (2026-09-21).** `cleanupShippedStages` deletes only rows whose `stage = 'shipped'`, so a file that gets stuck mid-pipeline is never purged, however long it sits there. Retention counted from the print day would purge exactly that file — one that never shipped — which is the worse failure of the two. The old day with a red pill is a cosmetic annoyance; silently deleting the stage row of work still in progress is not.

**"Stuck" tab (backlog lens)** — `STUCK_TAB_KEY` (`"stuck"`) is a `FILTER_TABS` entry that is **not a stage**. Every other tab key is compared straight against `row.stage`, so — exactly like `"all"` — it needs an explicit branch in **both** `filtered` and `counts`; adding one and forgetting the other yields a tab that filters but shows no count, or counts but shows everything.

- **Staleness here is time since the file last MOVED, from `file_stages.updated_at`** — a different question from the day header's "N days in production" (time since it was _printed_, from `batch_path`). Both numbers can be on screen at once and they mean different things. `updated_at` is rewritten by every stage transition and set at insert, so for a file that never moved it equals the submit time. It already rides on every row (`SELECT *` in the stage handlers) and `useStageTransition` refreshes it optimistically, so a file leaves the backlog the instant it is passed on — no waiting for the 15s poll. That optimistic write is what test 3 in the plan exercises; if a future handler stops setting `updated_at`, the Stuck tab silently goes stale.
- `STUCK_DAYS` = 3 (matching `STALE_DAYS_WARN`); the badge turns red at `STALE_DAYS_ALERT`. `idleDaysOf` uses `Math.floor` like `getFileAgeInDays` — moved 23h ago is 0 days idle. A row with a missing/unparsable `updated_at` degrades to "moved today" and can never enter the backlog.
- **`shipped` is the only excluded stage** — finished work, and the bulk of the table, so counting it would drown the tab. `to_sewing` is deliberately included: on real data it contributes 2 rows, not a flood.
- **The Stuck tab is the ONE place that reverses day order** (`compareDayKeysAsc`), because it is a backlog list and the worst offenders belong on top. `compareDayKeysAsc` is a real function, not `.reverse()` of the desc sort — reversing would drag `UNKNOWN_DAY_KEY` to the top instead of leaving it last.
- `idleDays`/`idleAlert` are computed in `Production.jsx` and passed as props; `ProductionCard` never reads a clock or learns the threshold, same contract as `awaitingQc`/`ripError`. `SewingReceive` passes neither, so the badge does not appear there.

**Scroll anchoring across filter changes (`hooks/useScrollAnchor.js`)** — keeps the operator's place when filtering. Without it: narrowing the list shrinks the content, the browser **clamps `scrollTop`** to the new `scrollHeight` and the old value is lost; clearing the filter grows the content back but `scrollTop` stays clamped. An empty result is the worst case — the list is replaced by a short `.empty_state`, forcing 0.

- **An anchor, not a remembered `scrollTop`** — the pixel offset is meaningless once the content height changed. The hook records WHICH row was at the top of the viewport plus how far into it we were (`{ fileId, dayKey, offset }`), then puts that row back at the same offset. Primary anchor is `data-file-id` (already on every card, also used by the scan path); the fallback is `data-day-key` on `.day_group`, for when the anchored card is not in the new DOM (another stage tab, a collapsed day). Neither found → the view is left alone, never a blind jump.
- **The restore reads the anchor captured under the PREVIOUS filter**, and that single rule produces both wanted behaviours: applying a filter tries to hold the same row in view, clearing it returns to the row just worked on. The hook takes a `filterKey` string; a change to it means "restore", a stable value means "keep capturing".
- **An empty capture must not clear the anchor.** When no card is in the DOM the hook keeps the previous value — that is precisely the "filter with no matches → clear it" path where the anchor is about to be needed.
- **`collapsedDays` is deliberately NOT in `filterKey`** — collapsing a day is done while looking at that spot, so pulling the scroll back afterwards would fight the operator.
- **`useLayoutEffect`, not `requestAnimationFrame`** — rAF would let one frame paint at the wrong offset, which reads as a jump. The scan path keeps its own rAF `scrollIntoView` and wins over the restore because it runs later.
- **`.cards_wrapper` carries `overflow-anchor: none`** — Chromium's built-in scroll anchoring corrects `scrollTop` on its own; two mechanisms correcting the same thing are non-deterministic.
- **"You were here" accent** — the hook's optional third argument reports the file id it landed on, and `Production.jsx` flashes that card via `restoredId` → `ProductionCard`'s `restored` prop → `.card_restored` for `RESTORE_FLASH_MS` (1500ms). Same amber pair and 0.4s fade as the Orders lens `.order_highlight`, deliberately softer than the scan's GSAP flash. **The RING is the load-bearing half**: the scan flash leaves an inline `background-color` on any card it has touched and an inline style beats a class, but `box-shadow` is untouched by it. Reported only when the restore actually moved the view (`MIN_REPORT_DELTA` 8px) and never for the day-level fallback — otherwise a card already in place would flash on every keystroke.

**Stage-filter tab UI** — the count is the content, the label is the caption: the number comes first at 22px/700 and the tab has no border, shadow or filled active pill. Active state is a single 3px underline that **slides** between tabs.

- **`.stage_tab*` and `.tab*` are two different controls in the same file.** `.tab` / `.tab_active` still dress the LENS toggle (Batches / Orders / Receive), which has no indicator element — restyling `.tab` for the filters would leave the lens toggle with no active state at all. Keep them separate.
- **The underline is positioned by GSAP** (`x` / `y` / `width`; `left`/`top` stay 0 so the transform is the only source of truth). `y` rather than `bottom`, because `.stage_tabs` can wrap to a second row.
- **First paint vs tab switch is decided by DOM-node identity** (`positionedNodeRef`), not a boolean: the tabs unmount whenever the lens leaves `BATCHES`, and a boolean would let a remounted indicator animate in from `x:0/width:0`. Node identity distinguishes a fresh mount (`gsap.set`) from a switch (`gsap.to`).
- **`countsKey` (a joined string) is a dependency, not `counts`** — the numbers ARE the tab widths, so a changed count must re-measure the underline; `counts` is a fresh object every render and would fire the effect endlessly.
- **Zero counts are rendered**, dimmed to 0.35 opacity — hiding them would leave a bare label and break the number-first alignment. Only the active tab gets full-strength ink; with eight large numbers in a row, darkening them all flattens the hierarchy and buries Stuck.
- Stuck is set apart by a vertical rule (`.stage_tab_sep`) and keeps its amber number and amber underline regardless of which tab is active.

**Stages pipeline:** `printed → heatpress → qc → packed → shipped` (or with sewing: `qc → to_sewing → [Receive → packed] → shipped`)
`STAGE_NEXT` / `STAGE_PREV` maps are the source of truth — use them, never hardcode transitions.
**`FROM_SEWING` is legacy** (like `REJECTED`/`OVERRIDDEN`): kept in `constants.js` (incl. `STAGE_NEXT.from_sewing → packed`) so old rows still render and a file can be pushed there manually via `STAGE_NEXT`, but it is **not an active routing target** — "Receive from sewing" lands directly in `packed`. No filter tab / pipeline-order entry for it (display-only lookups in `ProductionCard`/`groupByOrder` stay).
**Receive completes reprints** — because Receive is the entry to `packed`, the `stage:setSewingReceived` handler calls `fulfillReprintRequests(fileId)` on success (mirrors `stage:advance → packed`).

**Rollback = physical file move to inbox** — calling `rollbackFile` automatically calls `clearFileStage(fileId)` in `batchHistoryHandlers.js`. No separate DB cleanup needed. The card disappears from Production UI via `removeStageFromStore(fileId)`. **Batch rollback reconciles the DB PER FILE inside the move loop** — `clearFileStage` + `resolveRipErrorsByFile` + `insertRollbackReason` run right after each successful `rename`, NOT collectively after the loop. A mid-loop rename failure therefore never leaves live `file_stages` / open `rip_errors` for files still physically in PRINTED; it is best-effort (continues past a failed file) and returns `result.failedFiles`, where each entry carries the **raw OS fields** `{ name, src, dest, code, errno, syscall, message }` (primitives — `toIpcError` keeps `code`/`message` but drops `errno`/`syscall`/the paths, and an `Error` does not survive `JSON.stringify`). The `rollback-batch-history` IPC handler attaches `userMessage`/`userCode` (one app code `ERR_ROLLBACK_FAILED`, cause text from `describeRollbackFailure`) and assembles its session-log entry through the **single pure builder `buildRollbackBatchLog(result, workstation)` in `helpers/rollbackFailure.js`** — the ONE place the entry is shaped, pinned by a test so the failure detail cannot silently regress to an empty `{ errors: [] }`. On failure the detail is the full `summarizeRollbackResult` (counts + the per-file OS codes + the `errors[]` channel); on success it is `{ restoredFiles }`. `errors` (whole-operation failure, outer catch) and `failedFiles` (per-file loop failure) are two channels, not a duplicate — `errors` stays `[]` whenever the loop is what failed. **The operator message does NOT diagnose**: it names the file, the OS code and the syscall, and what to CHECK, never a cause — ENOENT here follows a successful `mkdir(destDir)` so "folder not found" would usually be false, and a failed rename on Windows is usually a locked file, not a server permission problem (both hypotheses were disproved on a real incident — do not reintroduce them in operator text).

**No REJECTED stage in UI** — "Rollback to inbox" is the only destructive action for any non-shipped file. REJECTED/OVERRIDDEN constants remain in code for DB backward compatibility only.

**Polling** — `POLL_INTERVAL = 15s`; `loadStagesAfter(since)` returns `{ success: bool }`. Update `lastPollAt` only on success so a network failure retries the same window on the next tick.

**Workstation roles — the scanner is DRIVEN BY `profile.scanRules[]`, not by branches.** The role is the KEY, the rule is the behaviour, and the two live in different places on purpose: `workstationRole` stays per-machine in electron-store (it is the identity of THIS PC), the rules come from the shared shop profile.

`getScanRule(shopProfile, workstationRole)` (`utils/shopProfileData.js`) returns `{ role, from, to, notifyWhenEmpty }` or `null`. On a rule: filter the scanned batch's rows to `stage === from`, advance each to `to`. **Do not add a role branch back** — a new station is a new row in `scanRules`, and a station whose role has no row simply does not move anything.

Alex's four rows, as seeded (`defaultProfile.js`) — the domain knowledge behind them, which is NOT implementation detail:

- `cotton` / `polyester` — `printed → heatpress`. Both stop at `heatpress`: **the cotton roll heat-press has no scanner**, so the QC station is what completes `heatpress → qc`. That is why the two rows are identical and why cotton does not run straight to `qc`.
- `rollpress` — `heatpress → qc`.
- `qc` — `heatpress → qc` at batch level, no modal. Manual per-file Pass/Receive/Send to Sewing/Go back/Rollback via selection + context menu still applies.

**Three ways to end up with no rule, and only ONE of them is silent:**

1. `workstationRole === ""` — the default station. Scan filters the view and nothing else, **silently**: it never moved anything, so a toast on every scan would be noise about a setting nobody set.
2. a role, but `shopProfile` is `null` — warns, `"Scan rules unavailable"`.
3. a role the profile does not define — warns, `"Role not in scan rules"`, naming the role. Same shape as the shopify flag left on with an empty store handle, but on the operator's PHYSICAL input, which is why it warns: a scan that silently does nothing is indistinguishable from a reader that did not fire.

**`notifyWhenEmpty` is FROZEN DEBT, not a feature** — it exists so the QC station keeps its long-standing silence when a scanned batch holds nothing at `from`; the other three warn. It is read as **`!== false`, NOT `=== true`**. That is deliberately not `getFeature`'s mirror: there the closed direction withholds a FEATURE, here it withholds a WARNING, and silence on the scanner is the risk this cut closes. Only a literal `false` quiets a station; the string `"false"` out of a JSON round-trip warns.

**Scanner input** — `e.ctrlKey || e.metaKey || e.altKey` keys ignored to avoid contaminating barcode buffer. Buffer flushed after 100ms idle; fires on Enter if buffer > 5 chars. Search box Enter key also routes to handleScan when value matches a batch name, file_id, or batch path. File-level scan (matching file_id) clears filters, scrolls to card, highlights it for 1.5s via GSAP.

**"Awaiting QC" visual state** — in the `qc` role view, files still at the `heatpress` stage render dimmed (lowered opacity, dashed border) with an "Awaiting QC" badge (colored from `STAGE_COLOR[HEATPRESS]`). `heatpress` itself signals "not yet arrived at QC" — there is **no** separate DB stage/field for awaiting; `ProductionCard` receives an `awaitingQc` prop computed in `Production.jsx` as `workstationRole === "qc" && row.stage === HEATPRESS`. Scanning the batch code at the QC station advances these `heatpress` files to `qc` (clearing the "Awaiting QC" state). **That formula was deliberately NOT derived from `scanRules` in 2f** — `rollpress` and `qc` carry identical `from`/`to` (`heatpress → qc`), so deriving the badge from the rule would light it on the rollpress station too, where "awaiting QC" is meaningless. The badge asks "am I the QC station", the rule asks "what does a scan do here"; they coincide today and are not the same question. Do not "simplify" this into a `scanRule.from` comparison.

**Multi-select & bulk actions** — click card to toggle select; `BatchGroupHeader` "Select All" toggles whole batch. The context menu drives all bulk actions (see Context menu below). Selection cleared on filter/batch change. **Bulk Pass / Receive preserve the selection** — `handleBulkAdvance` / `handleBulkReceive` keep every selected file that still exists in the store (dropping only ones that vanished) instead of clearing, so chained bulk stage moves keep working on the same set; `ContextMenu` `onClose` only closes the menu (it does not clear selection). Deliberate full-clear stays in `handleRollbackDecisions`, `handleBulkGoBack`, `handleBulkSewing`.

**Rollback collects qty_affected** — context-menu rollback (single + bulk) opens `ProductionRollbackModal` (reason dropdown + qty input per file, defaults to full qty; OTHER → inline text). It passes `reprint: { qtyAffected, qtyOriginal }` to `rollbackFile` → `insertReprintRequest` in `batchHistoryHandlers.js` (new request supersedes prior open ones for the file).

**Reprint badge** — `productionHandlers.js` `withReprint(rows)` enriches stage rows with `reprint_qty`/`reprint_original` from open `reprint_requests` (matched by `file_id` = filename stem) on **all three return paths** (`stage:getAll`/`stage:getByBatch`/`stage:getAfter`), so polling keeps the badge alive. `ProductionCard` renders a blue Reprint badge (`Reprint: X of Y` when `reprint_original !== reprint_qty`); the Override badge stays **manual-only** (`meters_override`/`qty_override`, set only by manual overrides — a pure reprint never sets `*_override`, so no false Override badge). Both badges may coexist. The reprint badge disappears once the file reaches `packed` (`fulfillReprintRequests` → request no longer open). `FileRow` and `ProductionCard` Override badges carry the `Override: ` prefix.

**Grouping** — `groupingEnabled` toggle (default on). When on and `stageFilter === "all"` or `batchFilter` active: cards grouped by `batch_path` under `BatchGroupHeader` showing stage-count pills and printer badge.

**Optimistic updates — via `useStageTransition` (`hooks/useStageTransition.js`)** — EVERY stage transition (single/bulk/scan) routes its store write through `applyStageTransition({ fileId, row, newStage, res, now, extra? })`, which classifies the IPC result against the **guarded DB UPDATE** (`WHERE file_id=? AND stage=expectedStage`, returning `{ updated: changes>0 }`): `res.success && res.updated` → `updateStageInStore` + `addStageHistoryEntry`, returns `"applied"`; `res.success && !res.updated` → store untouched, `"rejected"` (guard matched 0 rows — another station already moved the file); `!res.success` → store untouched, `"failed"` (DB/NAS down). **The store is touched ONLY on `"applied"`** — checking only `res.success` would let a stale `updated:false` fake a transition + a phantom `stageHistory` entry. Optional `extra` merges sewing fields (`sewing_sent_at`/`sewing_company`/`sewing_received_at`) onto the optimistic row; `newStage` is always the stage written to both the row and the history entry. No `loadAllStages()` reload needed after single actions. The helper owns ONLY this core — it does NOT toast/count/know bulk-vs-scan; call-sites keep their own counters + messages.

**Handler `updated` plumbing** — all three DB fns (`advanceFileStage`/`setSewingSent`/`setSewingReceived`) return `{ updated }`; all three IPC handlers (`stage:advance`/`stage:setSewingSent`/`stage:setSewingReceived`) forward `updated: result.updated`. `success:true` is still returned regardless of whether a row changed — `updated` is the ONLY signal that distinguishes a real move from a guard rejection.

**`rejected` vs `failed` surfaced separately (NEVER merged)** — single handlers (`handleAdvance`/`GoBack`/`Sewing`/`Receive`) skip the store on non-applied and show `notifyStageRejected(1)` (Warning) or `notifyStageFailed(1)` (Error). Bulk (4×) + the scan engine (1×, see below) tally three counters (`count`/`rejected`/`failed`) and after the loop emit each non-empty one: `count>0` success toast, `rejected>0` amber "already moved by another station", `failed>0` red "check connection". `rejected` uses `type:"Warning"` (NOT `Info` — `AlertsHost.alertTypes` has no Info entry, so Info falls back to `alertTypes[0]`=Error/red). The scan side is **one** engine (see Workstation roles above), so it tallies the same three counters once.

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

**Session state lives in `Production.jsx`, not in `SewingReceive.jsx`** — `session = { batchPaths, receivedInSession, companyFilter, activeOrderKey }`, passed down with `setSession`. Not a preference: state inside the component is lost on every lens switch (unmount), and a signal prop re-fires on the next mount and **re-adds the last batch** — even right after "Clear session". So there is no signal prop: `handleScan` calls `addBatchToSessionRef.current(batchPath)` directly. The session describes one physical unpacking in progress, so it is **never persisted** — not to the store, not to the DB, not to electron-store.

**`sessionRows`** = rows from the basket's batches where `stage === TO_SEWING` **OR** `receivedInSession.has(file_id)`. The second clause is load-bearing: a received item moves to `packed` and would drop out of a plain `to_sewing` filter, so the order would vanish from the list at the exact moment it was received, taking its "N/M" badge and the progress counter with it.

**ONE receive implementation: `receiveFiles` in `Production.jsx`.** Both entry points go through it — the buttons inside `SewingReceive` (via the `onReceive` prop) and the "Receive" context-menu item. `isReceivingRef` is the **actual** guard; the `isReceiving` state only drives `disabled`, because two clicks in the same tick would both read the stale state value. **`undoReceiveFiles` shares that same ref** — undo and receive block each other, since they mutate the same rows.

**Undo receive deliberately avoids `STAGE_PREV`** — `STAGE_PREV[packed]` is `qc`, which would push the file into quality control instead of back to the sewing company. It uses `advanceStage(fileId, TO_SEWING, PACKED)`.

**KNOWN DEBT:** receiving calls `fulfillReprintRequests(fileId)` and stepping the stage back does **not** reopen that request. A later re-receive simply fulfills it again — harmless. `sewing_received_at` also stays in the DB and is overwritten on the next receive.

**The RECEIVE context menu is its own branch in `contextMenuOptions` with an early return** — the pipeline actions (Pass / Send to sewing / Go back) do not apply while unpacking. Targeting and common availability are copied 1:1 from the BATCHES branch: act on the whole selection when the clicked row belongs to it, else on that row. **"Receive"** requires `stage === TO_SEWING` on EVERY target. **"Undo receive"** requires `receivedInSession.has(file_id)` **AND** `stage === PACKED` — the session ledger alone would keep offering the undo after another station moved the file past `packed`. Tools (Shopify / Preview / Open in Folder) operate on the clicked row, as in BATCHES. **"Rollback"** operates on the WHOLE selection (`setRollbackTargets(receiveTargets)`), not on the clicked row — same as in BATCHES. It is the one destructive action in the lens and the only one that moves files on disk.

**Sewing-company filter** — chips are built **dynamically** from `sewing_company` across `sessionRows`, never hardcoded (it is free text set at dispatch). A `"No company"` bucket covers NULL rows (the column arrived via ALTER TABLE). Chips are hidden entirely when there is only one company. The progress counter is scoped to the **active filter**, not the whole session.

**The items column reuses `ProductionCard`** — hover, Reprint / RIP Error / Override badges and the stage pills come along for free, so the lens stays visually consistent with Batches. Consequence: **there is no per-row receive button** — click selects, right-click → Receive, plus "Receive all" in the order header. Selection reuses `selectedFileIds` from `Production.jsx` (one selection state in the view) and is cleared on `viewMode` change and on `session.activeOrderKey` change, because a selection carried across would act on files no longer on screen.

**Notify wording says "item(s)", not "file(s)"** like `notifyStageRejected`/`notifyStageFailed` — a deliberate split: the operator is counting pieces in a parcel, not files. Two sources of text for the same DB condition, on purpose.

**Thumbnails (`PdfThumb`)** — the items column passes `thumbnail={<PdfThumb filePath={...} />}` to `ProductionCard`. The prop is a **slot**: a ready-made element, never a boolean or a path, so `ProductionCard` never learns about pdfjs or file paths. Batches does not pass it, renders nothing extra and pays for **zero** SMB reads. A card that got a thumbnail grows via the explicit `.card_with_thumb` class (the base `.card` is a fixed 44px row and a 64px tile does not fit) — an explicit class rather than `:has(> .card_thumb)`, so the geometry does not depend on DOM shape and stays visible to anyone reading `ProductionCard.jsx`. **Render failures are SILENT**: a grey `LuFileText` placeholder with the reason in `title`, `console.error`, and **no `notify()`** — roughly 8% of `to_sewing` rows currently fail with `ERR_PATH_NOT_ALLOWED` from the unrelated storage-root format problem, which would mean several red toasts on every order click. `PdfThumb` cancels through a `cancelled` flag checked AFTER the await and clears the previous image on `filePath` change, so a ~850 ms render never lands under the wrong card. Thumbnails load only for the ACTIVE order (2-3 items) — that is the laziness; there is deliberately no IntersectionObserver and no prefetch.

**KNOWN DEBT:** the `` `${batch_path}\\${file_id}.pdf` `` path pattern is hand-built in several places across `Production.jsx` and `SewingReceive.jsx` — count with `git grep -nE 'file_id\}\.pdf|fileId\}\.pdf' -- src/ui`. To be extracted in a change of its own — deliberately not mixed into a feature commit.

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

## Custom Order — Key Behaviors

Per-file checkbox selection inside a `CustomOrderCard`, so an operator can exclude specific files from a single imported CSV batch before generating its XML.

**State is card-local, not lifted.** `selectedFiles` is a `Set` of `fileName` (from the CSV row), held in `CustomOrderCard.jsx`'s own `useState` — it is NOT lifted to `CustomOrder.jsx` (which only owns the `csvGroups` array) and NOT persisted to the DB or `custom_order_history`. Scope is exactly one imported CSV / one card.

**Default-all-selected on import** — a `useEffect` keyed on `group.isParsing` populates `selectedFiles` with every `fileName` the moment parsing finishes (`isParsing: true → false`). Because `onRefresh` (rescan) never flips `isParsing` back to `true`, this effect does not re-run on refresh — existing checkbox choices survive a rescan. **Known edge case:** a `fileName` that only appears for the first time after a rescan/refresh is NOT auto-selected (starts unchecked) — this is intentional, not a bug.

**Checkbox UX** — reuses `ProductionCard`'s span+`LuCheck` pattern (a styled `<span>` toggled via `onClick`, not a native `<input>`), styled with `.card_checkbox` / `.card_checkbox_checked` in `CustomOrderCard.module.css` (copied from `Production.module.css`). `checkboxLocked = isGenerating || isGenerated` disables and dims it (`.card_checkbox_disabled`) once a card starts or finishes generating — mirrors the existing printer-toggle disable pattern, and prevents `selectedTotalMeters` from ever drifting from what was actually sent to `generateXML` and logged to `custom_order_history`.

**`selectedTotalMeters` replaces `totalMeters`** in the card's header pill and footer, recalculated live on every checkbox toggle. It sums `metersToprint` over selected files using the SAME found-agnostic rule the original `totalMeters` always used (missing files still inflate the total). **This pre-existing quirk is unchanged by this feature** — selection only filters by what's checked, it does not also filter out missing files from the total. Don't miscredit this feature with fixing it.

**Generate payload is filtered** — `handleGenerate` builds `files: files.filter(f => selectedFiles.has(f.fileName))` and `totalMeters: selectedTotalMeters` before calling `generateCustomOrderXML`. Deselected files never reach the IPC layer, so they never appear in the generated XML `<Documents>` or in the `custom_order_history` row for that order (no IPC/handler changes were needed — the main-process side already only ever saw whatever `files` array the renderer sent it).

**Empty-selection guard** — clicking Generate with `selectedFiles.size === 0` is blocked with a `notify()` warning (same pattern as the existing "no printer selected" guard) and returns before calling `generateCustomOrderXML`.

**Found/missing shown by filename colour, not icons** — the filename span gets `.file_name_found` (green `#05c95d`) or `.file_name_missing` (red `#ef4444`) based on `file.found`. Both hex values are the file's own pre-existing tokens (`#05c95d` from `.dot_ready`, `#ef4444` already used by `.header_missing`/`.footer_missing`) — there is no `--success`/`--error` CSS var in `global.css` to prefer instead.

**Whole-row click toggles selection** — the `<tr>` itself carries the `onClick` that calls `toggleFileSelection`, gated by `checkboxLocked` (`isGenerating || isGenerated`) at the row level (`.file_row_locked`, cursor `not-allowed` + dimmed, with hover suppressed via `.file_row.file_row_locked:hover`) — a locked row is fully non-interactive, not just its checkbox. The checkbox `<span>` keeps its own `onClick`/`role`/`tabIndex`/`onKeyDown` for direct/keyboard use, but calls `e.stopPropagation()` before toggling — without it, a direct click on the checkbox would bubble into the row's `onClick` and fire the toggle twice, silently cancelling itself out.

**`matchFiles` (`customOrderMatcher.js`) is a plain `cachedFileNames.includes(file.fileName)` check per row** — no fuzzy matching and no `suggestion` field (nothing ever read it). `fuse.js` is not a dependency; the `fuse` hits in `package-lock.json` are `@electron/fuses`, unrelated.

**Batch/file icon convention** — `LuLayers` marks batch/order-level rows: the `CustomOrderCard` header icon (next to the material name) and the `CustomOrderHistory` row icon (next to `order.materialName`) both use it, consistent with the Batch nav tab's icon. `LuFileText` marks an individual file — reused from `DataList`'s per-filename icon (same icon, same `.file_icon` sizing), placed between the checkbox and the filename text in `CustomOrderCard`'s expanded row. `file_name_wrap` is a row flex (not column) specifically so this icon sits beside the name rather than above it.

**Rounded, inset row hover** — a `<tr>` ignores `border-radius` even under `border-collapse: separate` (a `<tr>` doesn't establish its own clippable paint box the way a block element does), so the hover fill can't be rounded on the row itself. The hover background lives on the `<td>`s instead (`.file_row:hover td`), with the radius applied only to the outer corners (`:first-child` / `:last-child`, 14px — reused from `DataList`'s `.list_item` radius). `.file_table` carries its own horizontal gutter (`padding: 0 16px`) so that fill sits inset from the card edge rather than touching it, mirroring how `DataList` insets its rounded hover via padding on the `<ul>` ancestor (`.list_items`) rather than the row itself.

**Even row-internal spacing** — checkbox → file icon → filename step at a consistent 10px each: `.cell_checkbox`'s left padding, the filename column's left padding (targeted via the structural `.file_row td:nth-child(2)` — no dedicated class needed, the row always renders exactly 3 fixed `<td>`s), and `file_name_wrap`'s flex `gap` are all `10px`.

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

**Ingest + poll** — `ripErrorHandlers.js` `scanRipErrors()` reads `{storagePath}\AUTOMATION_WORKFLOW_ERROR` (via `getRipErrorRootPath`, sibling of `PRINTED/`, never hardcoded), filters `*.xml` only (ignores the `.tif`), `parseRipErrorXml` + `insertRipError` per row (INSERT OR IGNORE dedup on `(job_guid, file_id)`), per-file try/catch (one bad xml can't sink the scan), missing folder → no-op `{success:true,data:[]}`, returns `getOpenRipErrors()`. IPC `rip-errors:scan` / `rip-errors:get` → `window.api.ripErrors` → `ripErrorService`. **Global 30s poll in `App.jsx`** (`loadRipErrors`) runs the whole session regardless of `activeView`, so badges stay fresh in both views — but only while `isFeatureEnabled("ripErrors", shopProfile)` is true: it lives in its own effect keyed on that flag, NOT in the startup sequence (there the profile has not resolved yet, and the fail-closed flag would skip the scan for the whole session).

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

`Settings.jsx` routes through a `SECTIONS` array + `VIEWS` map; every view shares `SettingsView.module.css`. Per-machine values (General, Paths) go to electron-store; Fabrics and Rollback Reasons are shared DB config (rule 16). The fabric alias field sanitises on `onChange`, but the real gate is `getAliasFromCache` (see Fabric Config).

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
- **Two separate LRU caches**, because the payloads differ by two orders of magnitude: `previewCache` (30 entries, several MB each) and `thumbCache` (200 entries, ~15 KB each, ≈3 MB total). Scrolling through thumbnails cannot flush the previews. `clearPdfCache()` empties both. The LRU get/set pair is one shared helper, not duplicated per map — reading refreshes recency, so eviction is least-recently-USED, not FIFO.
- **In-flight de-duplication** — `inFlight: Map` keyed exactly like the caches. A second caller asking for the same key while the first render is running gets the SAME promise instead of a second multi-MB SMB read (React StrictMode double-mounts, several cards asking at once). The entry is removed in `finally`, **including on rejection** — otherwise every later caller would inherit the failure instead of retrying. A failed render is likewise **never cached**.
- **`pdf.destroy()` runs in `finally`**, strictly after `page.render` settled — never before, which would tear the document down mid-render. A failing destroy is caught and logged so it cannot mask the render result. Canvas is released too (`canvas.width = 0`).
- **A concurrency-1 queue, for `renderPdfThumb` ONLY.** Rendering blocks the renderer's main thread (~400 ms for a 14 MB file), so parallel thumbnails freeze the UI in bursts. `renderPdfToJpeg` is deliberately **not** queued: a preview opened by hand must not wait behind a backlog of tiles. A `thumbCache` hit short-circuits the queue entirely and never joins the tail.
- Covered by `pdfRender.test.js` (node env, pdfjs + fileService mocked): de-duplication, cache isolation, LRU order, failure-not-cached, in-flight cleanup on failure, destroy lifecycle, queue serialisation.

## usePdfPreview Hook

- **Does not render** — it owns modal state only and delegates to `renderPdfToJpeg`, passing `PREVIEW_SCALE` 0.75 and `PREVIEW_QUALITY` 0.85 **explicitly** (pinned to the hook, so a future change to the module defaults cannot silently alter the preview)
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

# Golden XML regression net (see below) — offline, reads golden/_inputs.json, never the live DB
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
11. **Use constants from `src/shared/constants.js`** — never compare against raw strings. Covers: `BATCH_STATUS`, `FILE_STATUS`, `PRINTER`, `CUSTOM_ORDER_STATUS`, `PRODUCTION_STAGE`, `STAGE_NEXT`, `STAGE_PREV`, `STAGE_LABEL`, `STAGE_COLOR`, `QC_ACTION`, `SEWING_SUGGESTED_TYPES`
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

## Productization Tracking (PRODUCTIZATION.md)

Progress on the multi-tenant / decoupling work is tracked in `PRODUCTIZATION.md`
(repo root). Claude Code maintains it so Filip does not tick boxes by hand.

Rules:

1. Tick a box `[ ]` -> `[x]` ONLY after Filip has confirmed the step passed its full
   gate (npm run test green with ZERO modifications to existing tests - see rule 7 for
   what "modification" means, npm run lint
   clean, golden-diff XML byte-for-byte, raw git diff reviewed) AND the step is
   committed. Never tick on "code written" or "works on my machine" - `[x]` means
   "safe in Alex's production".
   The expected test count is NOT frozen here: it moves every time a step adds a test
   file, and a stale number in this file would be read as the target. Take it from the
   baseline block at the top of `PRODUCTIZATION.md` (ETAP 0), and measure the actual
   baseline yourself before starting work. What is invariant is the SHAPE of the gate:
   the count may only ever go UP, and never because an existing test was edited.
2. Claude Code does NOT self-approve. The tick happens on Filip's explicit "gate
   passed, commit it", not when Claude Code judges the work done.
3. The checklist update is a SEPARATE commit from the code change (same discipline as
   version/changelog). ASCII-only message, e.g.
   `docs(productization): mark BUG 1 (clientId in settings:set) done`.
4. Use the right status marker, do not collapse them:
   `[ ]` todo | `[~]` in progress | `[x]` done+gated | `[!]` blocked (external dep)
   | `[=]` consciously frozen (waiting on real client #2). Frozen != todo.
5. If a step reveals new sub-tasks, add them as new `[ ]` lines under the same stage
   rather than silently expanding an existing box - the list must stay auditable.
6. Mutation proof, and what it is owed to. The principle stands unchanged: a test that
   passes whenever some other test passes is decoration. What changes is how that is
   PROVEN, because proving it per-assert costs more than it returns.
   - The proof is owed to every GATE PATH, not to every assert: gate open, gate closed,
     the flag NAME, and the interaction with any condition the gate was ANDed into.
     One mutation per path, applied ALONE and reverted before the next.
   - A mutation that kills more than one test is a signal to build a DISCRIMINATING
     mutation, never a verdict that a test is decoration. A mutation can remove a
     different defect than the one under study - `if (false && getFeature(...))`
     short-circuits the call away, so a test pinning the flag name legitimately dies
     with it. Only once no discriminating mutation can be constructed is the test
     decoration.
   - Diagnostic tests and harness guards - the ones asserting that the registration,
     import or mock worked at all - STAY deliberately and have NO corpse of their own,
     with a comment saying so and why. They earn their place when five tests fail at
     once and exactly one of them says why.
   - HOW THE RUN IS DRIVEN, not just what it proves. Mutations go onto a COPY of the
     file: `cp <file> <file>.pristine` before the round, ONE mutation, run, then
     `cp <file>.pristine <file>` and confirm with `diff -q` BEFORE the next mutation.
     Never revert with `git checkout -- <file>`. On work that is not yet committed
     that command reverts to HEAD and deletes the whole new implementation, and the
     symptom is a screen of FAILING TESTS - a false mutation signal indistinguishable
     from a real corpse, since both look like "the mutation killed something". The PRISTINE confirmation
     is what makes the next mutation's result mean anything: a round whose revert was
     never verified proves nothing about the round after it.
7. What "do not modify existing tests" protects, and where it stops. An existing test
   file has two layers and they are NOT governed by the same rule.
   - EXECUTABLE CONTENT is untouchable: assertions, mocks, fixtures, imports, test
     names, `it.each` rows, the shape of a helper. A failing test after a change is a
     STOP, never an invitation to edit it - that is the whole point of the rule.
   - COMMENTS fall under the documentation rule instead: they must be TRUE, and a false
     one is worse than none. Fixing a comment goes in its OWN commit, typed `docs`,
     never bundled with code, and the proof it carries is the test count before and
     after being identical plus a diff in which every changed line begins with `//`.
     The reason for the split, written down so the next request does not arrive as "it is
     only a mock": the rule exists to stop an unintended behaviour change from being
     masked by an edited expectation. A comment cannot mask anything, because it does not
     execute. A mock can, so a mock is executable content and stays untouchable.
8. Mutations belong in the file that WAS broken, not only in the new clean module.
   A round of 16 mutations against a freshly written pure helper, with zero against the
   producer, the handler and the UI, looks like proof and establishes nothing about the
   defect under study. The question a mutation answers is "would this test have caught
   the thing that actually went wrong", so it has to be applied where that thing lived.
9. A test, a field or a sentinel has to earn its place against a state that can really
   occur, and a state that resolves an incident is never optional.
   - A test for an IMPOSSIBLE state is not caution, it is noise: a `null` vs `[]`
     sentinel test written for a producer that always returns an array was deleted for
     this reason.
   - The mirror case is not symmetric. A field that would have ANSWERED a real incident
     is mandatory even when its absence is technically defensible: `workstation: null`
     in the read diagnostics was arguable on its own terms and wrong on the merits,
     because the whole incident was ONE station seeing different data from the others.
10. A report without the raw diff is not a report. Whoever reviews the work reads the
    diff, not a description of it - a description is exactly the layer where an
    unintended change hides. This is also why a number arrives with the command that
    produced it: both rules exist so the reader can re-derive the claim instead of
    trusting it.
