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
