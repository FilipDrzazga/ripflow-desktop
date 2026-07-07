import { useCallback } from "react";
import { useStore } from "../store/useStore";

/**
 * Shared core for EVERY Production stage transition (advance / go-back / sewing
 * sent / sewing received / scanner). It interprets the IPC result against the
 * guarded DB UPDATE and applies the optimistic store change ONLY when the DB
 * confirms the row actually moved:
 *
 *   res.success && res.updated  → updateStageInStore + addStageHistoryEntry → "applied"
 *   res.success && !res.updated → guard matched 0 rows (another station already
 *                                 moved the file); store untouched            → "rejected"
 *   !res.success                → IPC/DB write failed (DB/NAS down); store untouched → "failed"
 *
 * Scope is deliberately narrow: this helper owns ONLY the common outcome branch
 * and the two store writes. It does NOT toast, count, or know anything about
 * bulk/scan — those stay in the call-sites, which each keep their own counters
 * and messages.
 *
 * @param {object}  p
 * @param {string}  p.fileId   file_stages.file_id (filename stem)
 * @param {object}  p.row      the current stage row (spread as the optimistic base)
 * @param {string}  p.newStage stage written to both the store row and history entry
 * @param {object}  p.res      raw IPC result: { success, updated? }
 * @param {string}  p.now      ISO timestamp used for updated_at + history
 * @param {object} [p.extra]   extra optimistic fields (sewing_sent_at /
 *                             sewing_company / sewing_received_at) merged onto the row
 * @returns {"applied" | "rejected" | "failed"}
 */
export function useStageTransition() {
  const updateStageInStore = useStore((s) => s.updateStageInStore);
  const addStageHistoryEntry = useStore((s) => s.addStageHistoryEntry);

  return useCallback(
    ({ fileId, row, newStage, res, now, extra }) => {
      if (!res?.success) return "failed";
      if (!res.updated) return "rejected";
      updateStageInStore(fileId, { ...row, stage: newStage, updated_at: now, ...extra });
      addStageHistoryEntry(fileId, newStage, now);
      return "applied";
    },
    [updateStageInStore, addStageHistoryEntry],
  );
}
