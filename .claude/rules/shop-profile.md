---
paths:
  - "src/electron/helpers/shopProfile*.js"
  - "src/electron/helpers/defaultProfile.js"
  - "src/electron/helpers/migrateShopProfile*.js"
  - "src/electron/helpers/runShopProfileMigration*.js"
  - "src/electron/helpers/db.shopProfile.test.js"
  - "src/electron/helpers/db.migrateShopProfileRow.test.js"
  - "src/electron/ipc/openInShopify*.js"
  - "src/ui/services/profileService.js"
  - "src/ui/utils/featureVisibility*.js"
  - "src/ui/utils/shopProfileData*.js"
  - "src/ui/utils/profileStatus*.js"
  - "src/ui/components/NavBar/**"
  - "src/ui/App.jsx"
---

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
getFolder(name); // profile.folders[name] | null - see "Folder names" below (ETAP 2d)
```

**Folder names (`folders.*`, ETAP 2d).** `getFolder(name)` returns the value only when it is
ONE plain folder name - `isFolderName` from `src/shared/folderName.js`, the SAME check
`createXML.js` applies to `printers[].hotfolder` (moved there in 2d-2, not copied). Profile not
loaded, `folders` missing or not an object, the key absent, or a value with a separator, a dot
or `..` -> `null`. No `DEFAULT_PROFILE` stands in for an unreadable profile (rule 24); what an
effect does with `null` is the caller's decision. Consumers: `ripErrorHandlers.js`
(`folders.ripError`, 2d-3) skips the scan and returns the open errors already in the DB;
`customOrderHandlers.js` (`folders.customOrder`, 2d-4) refuses visibly with
`CUSTOM_ORDER_FOLDER_MISSING` BEFORE creating or writing anything - the operator asked for
that XML, so a silent skip would be wrong there. `folders.printed` has NO consumer on purpose: "PRINTED" is RipFlow's own folder
and lives inside stored `batch_path` values (rule 22) - out of 2d (P19).

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
style: the profile carries the class numbers the fabric layer reads (`getEstimateConfig` takes
them from `getProfile()` since 2g-3b) and the hotfolder names `createXML.js` routes by (2e), so
it has to be in memory first.

**Schema migration (`migrateShopProfile.js` + `runShopProfileMigration.js`).** `schemaVersion`
IS the marker; a pure function per step, frozen data (`SCAN_RULES_2F`, `CLASS_GLOBAL_KEYS_2G`),
compare-and-swap write on the raw row text (`migrateShopProfileRow`), a newer row is refused
and left alone (an older build keeps reading it). **v2 -> v3 (ETAP 2g-3a):** the class numbers
(`margin`, `defaultRollWidth` of Cottons / Polyesters) move into `materialClasses` FROM this
shop's `fabric_globals`, read raw at migration time (`db.getFabricGlobalsRaw`, `null` on any
failure) - never from `DEFAULT_PROFILE` or the fabric seed; the dead `defaultXmlWidth` is
dropped. Unreadable `fabric_globals` BLOCKS the step (`blocked`, logged): the row stays at v2
and the next start tries again. Since 2g-3b the estimator READS the class numbers from the
profile (`estimateConfigFrom`, `src/shared/classGlobals.js`, main and renderer alike).
Pilot with two versions on one DB (variant A, FILIP 2026-09-25): an older build meeting v3
refuses to migrate and keeps reading the row; it still reads the class numbers from
`fabric_globals`, so until every station runs the new version FabricsView writes BOTH (2g-3c,
`saveClassNumbers`: profile first, see "Who supplies the config" in print-xml.md), and nobody
edits class numbers on an old station. FabricsView is the first renderer caller of
`profile:set`; it replaces the WHOLE row, so it patches what `profile:get` returns (the main
process cache, reloaded after every `profile:set`), never the store's copy. The dual write goes once all stations are
upgraded (PRODUCTIZATION).

**`printers[]` consumers in main (ETAP 2e step 2):** `createXML.js` routes a job to
`printers[].hotfolder` through `setPrinterResolver(getPrinterByCode)`, wired right after
`loadShopProfile()` — injected, because `createXML.js` must stay importable without `db.js`
(template tests, golden harness). Unwired, or a printer/profile it cannot find, or a
hotfolder that is not one plain folder name → `ERR_INVALID_PRINTER`, fail-closed.
`customOrderHandlers.js` accepts a printer whose `materialClass` is `Polyesters` (custom
orders are polyester-only). Since step 3, `createBatch.js` runs the same
`getWorkflowFolderName` in its VALIDATE stage, BEFORE any file moves. Renderer printer
LISTS come from the profile since step 3 (`getPrinters` below) and badge COLOURS since
step 4 (`getPrinterColor`, `getMaterialClassColor`); `PRINTER_COLORS` no longer exists.

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
store sets `shopProfile` together with `shopProfileStatus` (`LOADING` → `LOADED` | `FAILED`)
through `resolveProfileResult`: only `success === true` with a non-empty plain object is
`LOADED`; a null, an empty object or anything else is `FAILED` with `shopProfile: null`,
and a `profile:get` timeout (the store's catch) lands on the same failed pair. First renderer consumer (2c): the NavBar
feature filter — `App.jsx` passes `shopProfile` down as a prop and `NavBar` gates Custom
Orders and Analytics through `isViewEnabled` (`src/ui/utils/featureVisibility.js`), a
deliberate fail-closed, strict `=== true` mirror of `getFeature`, because `getFeature`
is main-process only and is not exposed over IPC. `App.jsx` also guards both gated views
in the render and corrects `activeView` back to `"print"` during render (not in an
effect — `react-hooks/set-state-in-effect`). The profile banner reads the STORED status
(`shopProfileStatus === PROFILE_STATUS.FAILED`), not the profile value: `shopProfile` is
null throughout startup, and the status says `LOADING` there instead of looking like a
failure. It replaced an `!isLoading` gate, which was only a timing proxy for "the load
has finished".

**Two renderer-side reader modules, split by the QUESTION they answer** — keep them apart:

- `utils/featureVisibility.js` — "is this feature visible to this client": `isFeatureEnabled(flag, profile)`, `isViewEnabled(viewId, profile)`. Gates.
- `utils/shopProfileData.js` — "what does this client's config contain": `getSewingCompanies(profile)` → `string[]`, `getScanRule(profile, role)` → rule `| null`, `getPrinters(profile)` → `[{ code, materialClass }]` (codes upper-cased and batch-folder-shaped, bad rows dropped; read by DataPrintSelection, the BatchHistory and Analytics filters, CustomOrderCard), `defaultPrinterFor(printers, class)` → the only printer of that class `| null`, `getPrinterColor(profile, code)` → `{ bg, color }` from `printers[].color` (`{ bg, text }`, hex only) `| null` — each of the ten badge components keeps its OWN grey fallback — and `getMaterialClassColor(profile, class)` → the colours of the class's FIRST printer `| null` (Analytics). Data.

Both are pure functions, fail-closed on an unreadable profile, and that shape is not
stylistic: the renderer's profile gates have no standing guard (the rendering harness was
rejected in `50f64c8`), so a pure function is the only cut here that can carry a test at
all. The sentinel differs by return TYPE, deliberately: a LIST answers `[]` ("this shop has
none"), a SINGLE record answers `null` ("no rule for this role") — the same reasoning
`db.getShopProfile` follows. `getScanRule` additionally reads `notifyWhenEmpty` as
`!== false`, which is the one place these two files do NOT mirror each other; see
"Workstation roles" in `.claude/rules/production.md`.

**KNOWN LIMIT:** the profile is loaded once at startup and reloaded only on `profile:set`.
If the DB was unreachable at startup it stays `null` until a restart, even when the NAS
comes back a minute later. `fabricCache` has the identical property — one problem, not
two; tracked under ETAP 4.
