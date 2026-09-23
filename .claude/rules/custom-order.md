---
paths:
  - "src/ui/components/CustomOrder/**"
  - "src/ui/services/customOrderService.js"
  - "src/electron/ipc/customOrderHandlers.js"
  - "src/electron/helpers/customOrderMatcher.js"
  - "src/electron/helpers/parseCustomOrderCSV.js"
---

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
