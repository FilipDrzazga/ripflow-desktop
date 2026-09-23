---
paths:
  - "src/electron/ipc/createBatch.js"
  - "src/electron/ipc/submitBatch*.js"
  - "src/electron/helpers/createBatchIds.js"
  - "src/ui/services/fileService.js"
  - "src/electron/ipc/batchHistoryHandlers*.js"
  - "src/electron/ipc/readPrintedFolder.js"
---

## Atomic File Move (`createBatch.js`)

VALIDATE → LOCK (`.lock` file) → DESTINATION_STRUCTURE → COPY (pdf-lib p.1) → VERIFY → COMMIT (rename + write `_batch_info.json { originalGroup, fileGroups, overrides? }`) → DELETE_SOURCE → ROLLBACK on fail

**LOCK stage — stale-lock removal via RENAME, not unlink.** A stale `.lock` (age > `STALE_LOCK_MS` = 90s on the NAS clock via probe file; 5min conservative fallback when the probe fails) is cleared by `removeStaleLock(lockPath)`: `rename(.lock → .lock.dead-<pid>-<ts>)` then `unlink` of that unique name — **NOT** a destructive `unlink(.lock)` by name. Why: two stations racing to clear the SAME stale lock via unlink-by-name could have station B delete station A's freshly-created lock (TOCTOU) → both enter COPY of the same sources → double print. `rename` is source-consuming: exactly one station wins it; the loser gets `ENOENT` → `removeStaleLock` returns `false` → falls through to `open(.lock, "wx")`, where O_EXCL picks the single winner (EEXIST → "Source folder locked"). Both call-sites (NAS-probe branch + 5min fallback) go through `removeStaleLock`. Leftover `.dead-*` (crash between rename and unlink) is inert — never named `.lock`, so it never blocks a batch; NOT swept by `sweepOrphanTemps` (that scans `PRINTED\<day>\` dirs, not inbox source folders).

**Lock body carries a reserved `nonce`.** The fresh lock's JSON is `{ pid, batchId, timestamp, nonce }`; **`nonce` (`crypto.randomUUID()`) is a deliberately dead field** — foundation for future lock-ownership verification (Opcja 2). It is written but **never read today** — do NOT prune it as dead code.

**KNOWN DEBT (deliberate, unfixed):** the lock-release path in `createBatch.js`'s `finally` still does a destructive `unlink(lockRecord.lockPath)` by name — the twin of the TOCTOU fixed above. Process-freeze scenario: a station stalls > 90s (heartbeat stops), another station legitimately claims + recreates the lock, then the frozen station wakes and its `finally` deletes the successor's lock. Consciously NOT fixed — it belongs to the "lock-ownership verification" class (would need a `nonce` re-read before unlink). Recorded as a known decision, not a blind spot.

**COPY is page 1 only — intentional.** `pdf-lib` copies only the first page of each source PDF; pages 2+ are deliberately not preserved (PrintFactory needs only page 1). A rolled-back or regenerated file therefore never carries pages 2+ — by design, not data loss.

`_batch_info.json`: the stable shape written by `createBatch.js` is `{ originalGroup, fileGroups }` — `originalGroup` is the batch-level inbox folder name and `fileGroups` (per-stem inbox folder, always written) lets a mixed-source batch resolve each file to its own group; `overrides` is added ONLY when a manual override/reprint produced entries (`...(Object.keys(overridesMap).length > 0 ? { overrides } : {})`). Used by `batchHistoryHandlers` to find the correct rollback target; without it, falls back to GROUP_NAME_OVERRIDES_REVERSE. It also persists per-file print provenance under `overrides[stem]` = `{ printed: {meters}|{qty}, manual: bool, reprintQty, reprintOriginal }` — written in `createBatch.js` from the `_printed`/`_manual`/`_reprintQty`/`_reprintOriginal` fields set by `fileService.submitBatch` (one entry per file that has an effective printed amount: manual override OR reprint). `readPrintedFolder.js` reads it via `normalizeOverrideEntry` (an **exported** pure fn — `{ printed:{meters}|{qty}, manual, reprintQty, reprintOriginal } | null`), which also accepts the **legacy shape** (`{qty}`|`{meters}`) defensively (treated as `manual:true`, no reprint provenance) and returns `null` for a malformed/empty entry. Group metres (`fixedTotalLengthM`) are computed from `printed` (effective): `printed.meters`→height / `printed.qty`→qty is overlaid onto the parsed file before `estimatePrintLength`, so the BatchHistory header reflects the actually-printed amount, not the parsed original. **`batchHistoryHandlers.regenerateXmlForBatch` imports the SAME `normalizeOverrideEntry`** and applies the identical overlay (`printed.qty`→`qty`, `printed.meters`→`height = round(meters*1000)`), so a regenerated XML reproduces the effective printed amount for both new and legacy `_batch_info.json`. Never read `ov.qty`/`ov.meters` by hand — that misses the `{printed}` shape.

`_rollback_snapshot.json`: written in the batch folder on rollback (`{ rolledBackAt, type: "batch"|"file", files: [] }`). `readSingleBatch` reads it so already-`rolled_back` files still render (with reason badges) even after their PDF has moved back to the inbox.

## GROUP_NAME_OVERRIDES (`createBatchIds.js`)

Maps long group names → short folder names; `GROUP_NAME_OVERRIDES_REVERSE` is its inverse.
The rollback target is resolved in `batchHistoryHandlers.js` (not here) by the pure
`resolveGroupFromInfo(info, shortGroup, stem)`, first hit wins:

1. `info.fileGroups[stem]` — the file's own inbox folder (a mixed-source batch)
2. `info.originalGroup` — the batch-level inbox folder
3. `GROUP_NAME_OVERRIDES_REVERSE[shortGroup]`
4. `shortGroup` unchanged

`info` is the parsed `_batch_info.json`, or `null` when it is missing/corrupt (straight to 3).
Batch rollback reads the file ONCE and calls `resolveGroupFromInfo` per file;
`resolveOriginalGroup(batchPath, shortGroup, stem)` is the async wrapper (read + resolve)
used by the single-file path.

**printGroup resolution (single group)** — `getAliasFromCache(group) ?? GROUP_NAME_OVERRIDES[group] ?? group`. The per-material DB `alias` is **primary**; `GROUP_NAME_OVERRIDES` is the **fallback** (legacy "Neraki" / old batches); raw group name is last. `printGroup` = inbox folder name = material `fabrics.name`. Multi-group batches stay `"SAMPLES"` (unchanged). **The alias shortens only the PRINTED folder + `.xml` filename + `<PhysicalGroup>`/`<Path>` — NOT the PDF filename (intentional).** It is a MAX_PATH mitigation, not elimination.
