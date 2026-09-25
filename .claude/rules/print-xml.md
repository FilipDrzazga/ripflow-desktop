---
paths:
  - "src/electron/helpers/parseFileName*.js"
  - "src/electron/helpers/getMaterialType.js"
  - "src/electron/helpers/fabricCache*.js"
  - "src/electron/helpers/defaultFabrics.js"
  - "src/electron/helpers/materialClassSource.test.js"
  - "src/electron/ipc/createXML.js"
  - "src/electron/ipc/materialClassGate.test.js"
  - "src/electron/ipc/submitBatch.js"
  - "src/electron/ipc/customOrderHandlers.js"
  - "src/shared/estimatePrintLength*.js"
  - "src/shared/printWidths.js"
  - "src/ui/components/Settings/views/FabricsView.jsx"
  - "src/ui/services/fabricService.js"
  - "scripts/golden/**"
  - "golden/**"
  - "profiles/**"
---

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

## Print Widths — Hardcoded vs DB

`printWidths.js` values are **fallbacks only — with one live exception**. DB (`fabric_globals` +
`fabrics`) is the primary source everywhere the table below says so. The exception is the
custom-order XML builder `helpers/customOrderXml.js` (moved out of `customOrderHandlers.js` in
ETAP 2d-1, byte for byte), which imports `LM_XML_POLY` and writes it straight into the XML as
`<Width>${LM_XML_POLY}</Width>`, next to a hardcoded `<MaterialType>Polyesters</MaterialType>` — not a
fallback, a live literal. It is NOT in the golden net; its baseline is the full expected text in
`customOrderXml.test.js` (closes hole (b) in the Etap 2 gate). The builder is pure - the handler
passes `customOrderFolderPath` (settings) and `nestingId` (randomUUID) in.

| Config                           | DB table                                  | Fallback                                           |
| -------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| Margins (cotton/poly)            | `fabric_globals`                          | `MARGIN_COTTON=10`, `MARGIN_POLY=5`                |
| Default XML widths               | `fabric_globals` — **DEAD, zero readers** | none                                               |
| Default roll widths              | `fabric_globals`                          | `LM_ROLL_POLY=1550`, `LM_ROLL_COTTON_DEFAULT=1420` |
| Per-material XML width           | `fabrics.xml_width`                       | **none — `null`, and the job is refused**          |
| Per-material roll width          | `fabrics.roll_width`                      | the class width above (map removed in 2g-2)        |
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

**Fixed product dims come from the shop profile**, not from code: `resolveProductDims` in
`parseFileName.js` reads `profile.productTypes[]` (`{ code, width, height }`, shape-checked per
row) from the `shopConfig` the CALLER passes — the parser never imports the profile. Alex's seed
(`defaultProfile.js`): SAMPLE 220×200mm, FQ 670×480mm, TEA_TOWEL 700×500mm. With no profile, a
malformed list or no row for the code, it falls back to `BUILT_IN_DIMS` = the `DIMS_*` constants
in `printWidths.js` (same numbers) — the undecided degraded path of rule 24. No Settings UI edits
them today.

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
read "not loaded" as "loaded and empty". `null` keeps the degraded path on the class defaults in
`printWidths.js`. Same sentinel discipline as `cachedFabrics === null` everywhere else in that file.
Never build `{ globals: getCachedGlobals(), fabrics: getCachedFabrics() }` by hand.

**Degraded paths.** `xmlWidth` has none (see Fabric Config: `null` and the job is refused).
`rollWidth` still does, and since ETAP 2g-2 it is the CLASS width only: with no config
`getRollWidth` answers `LM_ROLL_COTTON_DEFAULT` (1420) for every cotton and `LM_ROLL_POLY` (1550)
for every polyester. The per-fabric map `LM_ROLL_COTTON` (Alex's 33 names) is gone - four fabrics
used to differ there (Hector Linen 1460, Organic Blossom Muslin Gauze 1270, Organic Stratos /
Nimbus Linen 1370) and now get the class width on this path, the same move as `0bf8aa6` made for
the class. The golden harness always feeds `fabricCache` a full catalogue, so the `null` path
executes in the net zero times (hole (a) in the Etap 2 gate): it is pinned by unit tests
(`estimatePrintLength.degraded.test.js`, `materialClassSource.test.js`), never by the golden net.

### Golden XML regression net (`golden/` + `scripts/golden/`)

70 real batches, anonymised, rendered by the **production** `buildPFJobXML` and stored as the
byte-for-byte baseline. Run it after ANY change that could touch print-length maths or the XML
template:

```bash
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron scripts/golden/compare-golden.mjs
# 0 differences across 70 batches
```

- Offline and reproducible: inputs come from `golden/_inputs.json`, and `scripts/golden/stub-db.mjs`
  feeds `fabricCache` from `profiles/fashion-formula-fabrics.json` and the shop profile from
  `DEFAULT_PROFILE` — the harness NEVER opens the live `ripflow.db` (`initDb()` writes, and the
  baseline must not depend on one machine). Because a profile is always present, the no-profile
  `BUILT_IN_DIMS` path runs zero times in the net, exactly like the `null`-cache path above (Degraded paths).
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
