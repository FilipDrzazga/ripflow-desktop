import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { HiMagnifyingGlass, HiXMark } from "react-icons/hi2";
import { LuArrowRight, LuArrowLeft, LuScissors, LuRefreshCw, LuCornerUpLeft, LuEye, LuListTree, LuPackageCheck } from "react-icons/lu";
import { useStore } from "../../store/useStore";
import { STAGE_LABEL, STAGE_SHORT_LABEL, STAGE_NEXT, STAGE_PREV, PRODUCTION_STAGE, STAGE_COLOR } from "../../../shared/constants";
import {
  advanceStage,
  setSewingSent,
  setSewingReceived,
  printBatchLabel,
} from "../../services/productionService";
import { rollbackFile } from "../../services/batchService";
import { openInFolder as openInFolderApi, openInShopify as openInShopifyApi } from "../../services/fileService";
import { getSettings } from "../../services/settingsService";
import { notify } from "@/utils/notify";
import { usePdfPreview } from "../../hooks/usePdfPreview";
import { useStageTransition } from "../../hooks/useStageTransition";
import { PRINTER_COLORS } from "../../constants/printerColors";
import { VIEW_MODE } from "../../constants/viewModes";
import { UNKNOWN_ORDER_KEY } from "../../utils/groupByOrder";
import ContextMenu from "../ContextMenu/ContextMenu";
import PdfPreviewModal from "../PdfPreviewModal/PdfPreviewModal";
import ProductionCard from "./ProductionCard";
import RipErrorPopover from "../RipErrorPopover/RipErrorPopover";
import ProductionRollbackModal from "./ProductionRollbackModal";
import OrderView from "./OrderView";
import SewingReceive from "./SewingReceive";
import style from "./Production.module.css";

const FILTER_TABS = [
  { key: "all",                        label: "All" },
  { key: PRODUCTION_STAGE.PRINTED,     label: STAGE_LABEL.printed },
  { key: PRODUCTION_STAGE.HEATPRESS,   label: "Press" },
  { key: PRODUCTION_STAGE.QC,          label: STAGE_LABEL.qc },
  { key: PRODUCTION_STAGE.TO_SEWING,   label: "Sew Out" },
  { key: PRODUCTION_STAGE.PACKED,      label: STAGE_LABEL.packed },
  { key: PRODUCTION_STAGE.SHIPPED,     label: STAGE_LABEL.shipped },
];

const POLL_INTERVAL = 15_000;

const STAGE_PIPELINE_ORDER = [
  PRODUCTION_STAGE.PRINTED, PRODUCTION_STAGE.HEATPRESS, PRODUCTION_STAGE.QC,
  PRODUCTION_STAGE.TO_SEWING, PRODUCTION_STAGE.PACKED, PRODUCTION_STAGE.SHIPPED,
];

// Distinct operator feedback for the two non-success stage-transition outcomes —
// they are two different states and must never be merged into one message.
// "rejected": the guarded UPDATE matched 0 rows because another station already
// moved the file — a normal race, NOT an error → Warning (AlertsHost has no
// "Info" style, so Info would render red like an error; Warning is amber).
// "failed": the IPC/DB write itself failed (shared DB/NAS down) → Error.
const notifyStageRejected = (n) =>
  notify({
    type: "Warning",
    title: "Already moved",
    message: `${n} file${n === 1 ? "" : "s"} already moved by another station.`,
  });

const notifyStageFailed = (n) =>
  notify({
    type: "Error",
    title: "Save failed",
    message: `${n} file${n === 1 ? "" : "s"} could not be saved — check connection.`,
  });

const batchNameOf = (batchPath) => batchPath?.split(/[/\\]/).pop() ?? "Unknown";

const BatchGroupHeader = ({ batchPath, rows, selectedFileIds, onSelectAll }) => {
  const batchName = batchPath?.split(/[/\\]/).pop() ?? "Unknown";
  const printerMatch = batchName.match(/-(DGEN|YOKO|YUMI)$/i);
  const printer = printerMatch ? printerMatch[1].toUpperCase() : null;
  const pc = printer ? (PRINTER_COLORS[printer] ?? { bg: "#f0f0f0", color: "#616161" }) : null;
  const stageCounts = {};
  for (const r of rows) stageCounts[r.stage] = (stageCounts[r.stage] ?? 0) + 1;
  const allSelected = rows.length > 0 && rows.every((r) => selectedFileIds.has(r.file_id));
  return (
    <div className={style.batch_group_header}>
      <span className={style.batch_group_name}>{batchName}</span>
      {pc && <span className={style.batch_group_printer} style={{ backgroundColor: pc.bg, color: pc.color }}>{printer}</span>}
      <span className={style.batch_group_count}>{rows.length} file{rows.length !== 1 ? "s" : ""}</span>
      <span className={style.batch_group_sep} />
      <div className={style.batch_group_stages}>
        {STAGE_PIPELINE_ORDER.filter((s) => stageCounts[s] > 0).map((s) => {
          const sc = STAGE_COLOR[s];
          return (
            <span key={s} className={style.batch_group_stage_pill} style={{ backgroundColor: sc?.bg, color: sc?.color }}>
              {stageCounts[s]} {STAGE_SHORT_LABEL[s]}
            </span>
          );
        })}
      </div>
      <button type="button" className={style.batch_group_select_btn} onClick={() => onSelectAll(rows)}>
        {allSelected ? "Deselect" : "Select All"}
      </button>
    </div>
  );
};

const Production = () => {
  const productionStages    = useStore((s) => s.productionStages);
  const loadAllStages       = useStore((s) => s.loadAllStages);
  const loadStagesAfter     = useStore((s) => s.loadStagesAfter);
  const removeStageFromStore = useStore((s) => s.removeStageFromStore);
  const refreshFiles        = useStore((s) => s.refreshFiles);
  const loadAllStageHistory  = useStore((s) => s.loadAllStageHistory);
  const stageHistory         = useStore((s) => s.stageHistory);
  const ripErrors            = useStore((s) => s.ripErrors);
  const removeRipError       = useStore((s) => s.removeRipError);

  // Shared store-core for every stage transition — applies the optimistic store
  // update + history entry ONLY when the DB confirms the row actually moved
  // (res.updated), and classifies the outcome as applied/rejected/failed.
  const applyStageTransition = useStageTransition();

  // Which lens is on screen — see VIEW_MODE for the available lenses.
  const [viewMode,       setViewMode]       = useState(VIEW_MODE.BATCHES);
  // handleScan needs the CURRENT lens, but adding viewMode to its deps would
  // re-create the callback and re-point handleScanRef on every tab switch. A ref
  // gives the read without the dependency.
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  // Receiving session for the Receive lens. It lives HERE, not inside
  // SewingReceive, because that component unmounts the moment the operator looks
  // at another lens — a session held there would be lost on every tab switch.
  const [session, setSession] = useState({
    batchPaths: [],
    receivedInSession: new Set(),
    companyFilter: null,
    activeOrderKey: null,
  });

  // Re-assigned on every render so it always closes over the current session and
  // store. handleScan reaches it through the ref instead of taking it as a
  // dependency — same reason as viewModeRef.
  const addBatchToSessionRef = useRef(null);
  addBatchToSessionRef.current = (batchPath) => {
    if (session.batchPaths.includes(batchPath)) {
      notify({ type: "Warning", title: "Batch already in session", message: batchNameOf(batchPath) });
      return;
    }
    const pending = Object.values(productionStages).filter(
      (r) => r.batch_path === batchPath && r.stage === PRODUCTION_STAGE.TO_SEWING,
    );
    if (pending.length === 0) {
      notify({ type: "Warning", title: "Nothing at sewing in this batch", message: batchNameOf(batchPath) });
      return;
    }
    // notify stays OUTSIDE the setter — StrictMode invokes updaters twice.
    setSession((s) => ({ ...s, batchPaths: [...s.batchPaths, batchPath] }));
    notify({
      type: "Success",
      title: "Batch added to session",
      message: `${batchNameOf(batchPath)} - ${pending.length} item(s) to receive.`,
    });
  };
  // Focus signal for the Orders lens: { keys, nonce } — "Show in Orders" sets it so
  // OrderView expands + scrolls to those orders. nonce makes repeat clicks re-fire.
  const [focusOrders,    setFocusOrders]    = useState(null);
  const [stageFilter,    setStageFilter]    = useState("all");
  const [search,         setSearch]         = useState("");
  const searchInputRef = useRef(null);
  const [batchFilter,    setBatchFilter]    = useState(null);
  const [workstationRole, setWorkstationRole] = useState("");
  const [isLoading,      setIsLoading]      = useState(false);

  const lastPollAt = useRef(null);

  const [isRefreshing,  setIsRefreshing]  = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const handleScanRef = useRef(null);

  // Multi-select for bulk rollback
  const [selectedFileIds, setSelectedFileIds] = useState(new Set());

  const [contextMenu, setContextMenu] = useState(null);
  const [rollbackTargets, setRollbackTargets] = useState(null); // stageRow[] → ProductionRollbackModal
  const [ripPopover, setRipPopover] = useState(null); // { error, x, y } → RipErrorPopover

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      loadAllStages(),
      loadAllStageHistory(),
      getSettings().then((res) => {
        if (!cancelled && res?.success) setWorkstationRole(res.settings.workstationRole ?? "");
      }),
    ]).finally(() => {
      if (!cancelled) {
        lastPollAt.current = new Date().toISOString();
        setIsLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [loadAllStages, loadAllStageHistory]);

  // Poll for changes — only advance lastPollAt on success so a network failure retries the same window
  useEffect(() => {
    const id = setInterval(async () => {
      if (!lastPollAt.current) return;
      const since = lastPollAt.current;
      const result = await loadStagesAfter(since);
      if (result?.success !== false) {
        lastPollAt.current = new Date().toISOString();
      }
    }, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [loadStagesAfter]);

  // ─── Action handlers ───────────────────────────────────────────────────────

  const handleAdvance = async (fileId) => {
    const row = productionStages[fileId];
    if (!row) return;
    const newStage = STAGE_NEXT[row.stage];
    if (!newStage) return;
    const now = new Date().toISOString();
    const res = await advanceStage(fileId, newStage, row.stage);
    const outcome = applyStageTransition({ fileId, row, newStage, res, now });
    if (outcome === "rejected") notifyStageRejected(1);
    else if (outcome === "failed") notifyStageFailed(1);
  };

  const handleGoBack = async (fileId) => {
    const row = productionStages[fileId];
    if (!row) return;
    const prevStage = STAGE_PREV[row.stage];
    if (!prevStage) return;
    const now = new Date().toISOString();
    const res = await advanceStage(fileId, prevStage, row.stage);
    const outcome = applyStageTransition({ fileId, row, newStage: prevStage, res, now });
    if (outcome === "rejected") notifyStageRejected(1);
    else if (outcome === "failed") notifyStageFailed(1);
  };

  const handleSewing = async (fileId, sewingCompany) => {
    const row = productionStages[fileId];
    if (!row) return;
    const now = new Date().toISOString();
    const res = await setSewingSent(fileId, row.stage, sewingCompany ?? null);
    const outcome = applyStageTransition({
      fileId, row, newStage: PRODUCTION_STAGE.TO_SEWING, res, now,
      extra: { sewing_sent_at: now, sewing_company: sewingCompany ?? null },
    });
    if (outcome === "rejected") notifyStageRejected(1);
    else if (outcome === "failed") notifyStageFailed(1);
  };

  const handleReceive = async (fileId) => {
    const row = productionStages[fileId];
    if (!row || row.stage !== PRODUCTION_STAGE.TO_SEWING) return;
    const now = new Date().toISOString();
    const res = await setSewingReceived(fileId, PRODUCTION_STAGE.TO_SEWING);
    const outcome = applyStageTransition({
      fileId, row, newStage: PRODUCTION_STAGE.PACKED, res, now,
      extra: { sewing_received_at: now },
    });
    if (outcome === "rejected") notifyStageRejected(1);
    else if (outcome === "failed") notifyStageFailed(1);
  };

  // ─── Receive lens actions (driven by the context menu) ────────────────────

  // useState drives the disabled attribute in SewingReceive; the ref is the
  // ACTUAL guard. Two clicks in one tick both read the old state value before
  // React re-renders, so state alone cannot stop a second loop from starting.
  const [isReceiving, setIsReceiving] = useState(false);
  const isReceivingRef = useRef(false);

  // THE receive implementation for the Receive lens. Both entry points — the
  // buttons inside SewingReceive and the "Receive" context-menu item — call this
  // one function, so the two can never drift apart.
  const receiveFiles = async (ids) => {
    if (isReceivingRef.current || ids.length === 0) return;
    isReceivingRef.current = true;
    setIsReceiving(true);
    let count = 0, rejected = 0, failed = 0;
    const appliedIds = [];
    try {
      for (const id of ids) {
        const r = productionStages[id];
        if (!r || r.stage !== PRODUCTION_STAGE.TO_SEWING) continue;
        const now = new Date().toISOString();
        const res = await setSewingReceived(id, PRODUCTION_STAGE.TO_SEWING);
        const outcome = applyStageTransition({
          fileId: id, row: r, newStage: PRODUCTION_STAGE.PACKED, res, now,
          extra: { sewing_received_at: now },
        });
        if (outcome === "applied") { count++; appliedIds.push(id); }
        else if (outcome === "rejected") rejected++;
        else failed++;
      }
    } finally {
      isReceivingRef.current = false;
      setIsReceiving(false);
    }

    // Only confirmed moves enter the session ledger — a rejected or failed file
    // is still physically at the sewing company as far as we know.
    if (appliedIds.length > 0) {
      setSession((s) => ({
        ...s,
        receivedInSession: new Set([...s.receivedInSession, ...appliedIds]),
      }));
    }

    if (count > 0) {
      notify({ type: "Success", title: "Received from sewing", message: `${count} item(s) received.` });
    }
    if (rejected > 0) {
      notify({
        type: "Warning",
        title: "Already moved",
        message: `${rejected} item(s) already moved by another station.`,
      });
    }
    if (failed > 0) {
      notify({
        type: "Error",
        title: "Save failed",
        message: `${failed} item(s) could not be saved — check connection.`,
      });
    }
  };

  // KNOWN DEBT: receiving ran fulfillReprintRequests(fileId) and stepping the
  // stage back does NOT reopen that request — a later re-receive simply fulfills
  // it again, which is harmless. sewing_received_at also stays in the DB and is
  // overwritten on the next receive.
  const undoReceiveFiles = async (ids) => {
    if (isReceivingRef.current || ids.length === 0) return;
    isReceivingRef.current = true;
    setIsReceiving(true);
    let count = 0, rejected = 0, failed = 0;
    const appliedIds = [];
    try {
      for (const id of ids) {
        const r = productionStages[id];
        if (!r) continue;
        const now = new Date().toISOString();
        // Deliberately NOT STAGE_PREV: STAGE_PREV[packed] is qc, which would push
        // the file into quality control instead of back to the sewing company.
        const res = await advanceStage(id, PRODUCTION_STAGE.TO_SEWING, PRODUCTION_STAGE.PACKED);
        const outcome = applyStageTransition({
          fileId: id, row: r, newStage: PRODUCTION_STAGE.TO_SEWING, res, now,
        });
        if (outcome === "applied") { count++; appliedIds.push(id); }
        else if (outcome === "rejected") rejected++;
        else failed++;
      }
    } finally {
      isReceivingRef.current = false;
      setIsReceiving(false);
    }

    if (appliedIds.length > 0) {
      setSession((s) => {
        const next = new Set(s.receivedInSession);
        for (const id of appliedIds) next.delete(id);
        return { ...s, receivedInSession: next };
      });
    }

    if (count > 0) {
      notify({ type: "Success", title: "Receive undone", message: `${count} item(s) sent back to sewing.` });
    }
    if (rejected > 0) {
      notify({
        type: "Warning",
        title: "Already moved",
        message: `${rejected} item(s) already moved by another station.`,
      });
    }
    if (failed > 0) {
      notify({
        type: "Error",
        title: "Save failed",
        message: `${failed} item(s) could not be saved — check connection.`,
      });
    }
  };

  const handleReprintLabel = async (fileId) => {
    const row = productionStages[fileId];
    if (!row) return;
    const stageRows = Object.values(productionStages);
    const batchPath = row.batch_path;
    const batchName = batchPath?.split(/[/\\]/).pop() ?? "";
    const printerMatch = batchName.match(/-(DGEN|YOKO|YUMI)$/i);
    const printer = printerMatch ? printerMatch[1].toUpperCase() : "UNKNOWN";
    const batchRows = stageRows.filter((r) => r.batch_path === batchPath);
    const materials = [...new Set(batchRows.map((r) => r.material).filter(Boolean))];
    const material = materials.length === 1 ? materials[0] : "Mixed";
    const totalMeters = batchRows.reduce((sum, r) => sum + (r.meters ?? 0), 0);
    const res = await printBatchLabel({ batchPath, batchName, printer, fileCount: batchRows.length, material, totalMeters: Number(totalMeters.toFixed(2)) });
    if (res?.success) {
      notify({ type: "Success", title: "Label sent", message: batchName });
    } else {
      notify({ type: "Error", title: "Label print failed", message: res?.error ?? "Unknown error" });
    }
  };

  // decisions: [{ fileId, reason, override }] from ProductionRollbackModal.
  // override ({ qty } | { meters }) becomes the reprint request's qty_affected.
  const handleRollbackDecisions = async (decisions) => {
    setRollbackTargets(null);
    let successCount = 0;
    let failCount = 0;
    let timedOut = 0;
    const rolledBackIds = [];
    for (const { fileId, reason, override } of decisions) {
      const row = useStore.getState().productionStages[fileId];
      if (!row?.batch_path) { failCount++; continue; }
      const filePath = `${row.batch_path}\\${fileId}.pdf`;
      const qtyAffected = override?.meters ?? override?.qty ?? null;
      // qtyOriginal must match qtyAffected's unit: this run's meters for LM, pieces otherwise
      const qtyOriginal = override?.meters != null
        ? (row.meters_override ?? row.meters ?? null)
        : (row.qty_override ?? row.qty ?? null);
      try {
        const res = await rollbackFile({
          filePath,
          batchPath: row.batch_path,
          reason,
          ...(qtyAffected != null ? { reprint: { qtyAffected, qtyOriginal } } : {}),
        });
        if (res?.success) {
          removeStageFromStore(fileId);
          removeRipError(fileId);
          rolledBackIds.push(fileId);
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        // Timeout means the op keeps running in main — count it apart, never fail the loop.
        if (err?.timedOut) timedOut++;
        else failCount++;
      }
    }
    setSelectedFileIds(new Set());

    // A rolled-back file leaves productionStages entirely — drop it from the
    // receiving session too, or its id lingers there orphaned.
    if (rolledBackIds.length > 0) {
      setSession((s) => {
        const next = new Set(s.receivedInSession);
        for (const id of rolledBackIds) next.delete(id);
        return { ...s, receivedInSession: next };
      });
    }

    // Once, after the loop: in-progress ops get a single warning + one state refresh.
    if (timedOut > 0) {
      notify({ type: "Warning", title: "Operations still in progress", message: `${timedOut} operation(s) taking longer than expected — refreshing state.` });
      await refreshFiles();
      loadAllStages();
    }

    if (failCount === 0 && successCount > 0) {
      notify({ type: "Success", title: "Rolled back", message: `${successCount} file(s) returned to inbox.` });
    } else if (successCount > 0) {
      notify({ type: "Warning", title: "Partially rolled back", message: `${successCount} succeeded, ${failCount} failed.` });
    } else if (failCount > 0) {
      notify({ type: "Error", title: "Rollback failed", message: `${failCount} file(s) could not be rolled back.` });
    }
    if (successCount > 0) refreshFiles();
  };

  const {
    openPreview, closePreview, navigate: navigatePreview,
    isOpen: isPreviewOpen, isLoading: isPreviewLoading,
    imgSrc: previewImgSrc, error: previewError,
    currentPath: previewCurrentPath, currentIndex: previewCurrentIndex, fileList: previewFileList,
  } = usePdfPreview();

  const handleOpenPreview = (row) => {
    const filePath = `${row.batch_path}\\${row.file_id}.pdf`;
    const batchFileList = Object.values(productionStages)
      .filter((r) => r.batch_path === row.batch_path)
      .map((r) => ({ path: `${r.batch_path}\\${r.file_id}.pdf`, name: `${r.file_id}.pdf` }));
    openPreview(filePath, batchFileList);
  };

  const handleOpenInFolder = async (path) => {
    const res = await openInFolderApi(path);
    if (!res?.success) {
      const err = res?.errors?.[0];
      notify(
        { type: err?.type || "Error", title: err?.title || "Open folder failed", message: err?.message || "Could not open folder." },
        { stage: "app", code: "OPEN_FOLDER_FAILED" },
      );
    }
  };

  const handleOpenInShopify = async (orderId) => {
    if (!orderId) {
      notify({ type: "Warning", title: "No order number", message: "No order number for this file." },
        { stage: "app", code: "SHOPIFY_NO_ORDER_ID" });
      return;
    }
    const res = await openInShopifyApi(orderId);
    if (!res?.success) {
      const err = res?.errors?.[0];
      notify(
        { type: err?.type || "Error", title: err?.title || "Open in Shopify failed", message: err?.message || "Could not open Shopify order." },
        { stage: "app", code: "OPEN_SHOPIFY_FAILED" },
      );
    }
  };

  // ─── Multi-select ─────────────────────────────────────────────────────────

  const toggleProductionSelect = useCallback((fileId) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const [groupingEnabled, setGroupingEnabled] = useState(true);

  const handleSelectBatch = useCallback((rows) => {
    const ids = rows.map((r) => r.file_id);
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      const allAlreadySelected = ids.every((id) => next.has(id));
      if (allAlreadySelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadAllStages(), loadAllStageHistory()]);
      lastPollAt.current = new Date().toISOString();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleBulkGoBack = async () => {
    const ids = [...selectedFileIds];
    let count = 0, rejected = 0, failed = 0;
    for (const id of ids) {
      const r = productionStages[id];
      if (!r) continue;
      const prevStage = STAGE_PREV[r.stage];
      if (!prevStage) continue;
      const now = new Date().toISOString();
      const res = await advanceStage(id, prevStage, r.stage);
      const outcome = applyStageTransition({ fileId: id, row: r, newStage: prevStage, res, now });
      if (outcome === "applied") count++;
      else if (outcome === "rejected") rejected++;
      else failed++;
    }
    setSelectedFileIds(new Set());
    if (count > 0) notify({ type: "Success", title: "Moved back", message: `${count} file(s) moved back.` });
    if (rejected > 0) notifyStageRejected(rejected);
    if (failed > 0) notifyStageFailed(failed);
  };

  const handleBulkAdvance = async () => {
    const ids = [...selectedFileIds];
    let count = 0, rejected = 0, failed = 0;
    for (const id of ids) {
      const r = productionStages[id];
      if (!r) continue;
      const newStage = STAGE_NEXT[r.stage];
      if (!newStage) continue;
      const now = new Date().toISOString();
      const res = await advanceStage(id, newStage, r.stage);
      const outcome = applyStageTransition({ fileId: id, row: r, newStage, res, now });
      if (outcome === "applied") count++;
      else if (outcome === "rejected") rejected++;
      else failed++;
    }
    // Keep the selection on files that survive in the store (advanced files stay
    // selected so the operator can act on them again); drop any that vanished.
    setSelectedFileIds((prev) => {
      const next = new Set();
      for (const id of prev) if (productionStages[id]) next.add(id);
      return next;
    });
    if (count > 0) notify({ type: "Success", title: `${count} file${count > 1 ? "s" : ""} moved`, message: "Moved to next stage." });
    if (rejected > 0) notifyStageRejected(rejected);
    if (failed > 0) notifyStageFailed(failed);
  };

  const handleBulkReceive = async () => {
    const ids = [...selectedFileIds];
    let count = 0, rejected = 0, failed = 0;
    for (const id of ids) {
      const r = productionStages[id];
      if (!r || r.stage !== PRODUCTION_STAGE.TO_SEWING) continue;
      const now = new Date().toISOString();
      const res = await setSewingReceived(id, PRODUCTION_STAGE.TO_SEWING);
      const outcome = applyStageTransition({
        fileId: id, row: r, newStage: PRODUCTION_STAGE.PACKED, res, now,
        extra: { sewing_received_at: now },
      });
      if (outcome === "applied") count++;
      else if (outcome === "rejected") rejected++;
      else failed++;
    }
    // Keep the selection on files that survive in the store; drop any that vanished.
    setSelectedFileIds((prev) => {
      const next = new Set();
      for (const id of prev) if (productionStages[id]) next.add(id);
      return next;
    });
    if (count > 0) notify({ type: "Success", title: "Received from sewing", message: `${count} file(s) received.` });
    if (rejected > 0) notifyStageRejected(rejected);
    if (failed > 0) notifyStageFailed(failed);
  };

  const handleBulkSewing = async (sewingCompany) => {
    const ids = [...selectedFileIds];
    let count = 0, rejected = 0, failed = 0;
    for (const id of ids) {
      const r = productionStages[id];
      if (!r || r.stage !== PRODUCTION_STAGE.QC) continue;
      const now = new Date().toISOString();
      const res = await setSewingSent(id, PRODUCTION_STAGE.QC, sewingCompany ?? null);
      const outcome = applyStageTransition({
        fileId: id, row: r, newStage: PRODUCTION_STAGE.TO_SEWING, res, now,
        extra: { sewing_sent_at: now, sewing_company: sewingCompany ?? null },
      });
      if (outcome === "applied") count++;
      else if (outcome === "rejected") rejected++;
      else failed++;
    }
    setSelectedFileIds(new Set());
    if (count > 0) notify({ type: "Success", title: "Sent to sewing", message: `${count} file(s) sent to ${sewingCompany}.` });
    if (rejected > 0) notifyStageRejected(rejected);
    if (failed > 0) notifyStageFailed(failed);
  };

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedFileIds(new Set());
  }, [batchFilter, stageFilter]);

  // Same idea across lenses: a selection carried between lenses, or between
  // orders inside the Receive lens, would act on files the operator can no
  // longer see on screen.
  useEffect(() => {
    setSelectedFileIds(new Set());
  }, [viewMode, session.activeOrderKey]);

  // ─── Scanner ───────────────────────────────────────────────────────────────

  const handleScan = useCallback(async (value) => {
    // A scan acts on the Batches lens (filter/scroll/highlight). From the Orders
    // lens, flip back first so the result is actually visible instead of silently
    // mutating the hidden Batches state. The Receive lens owns its own scan
    // handling, so a scan must NOT pull the operator out of it. Already on
    // Batches → no-op. Functional updater so viewMode stays out of the deps.
    setViewMode((mode) => (mode === VIEW_MODE.ORDERS ? VIEW_MODE.BATCHES : mode));

    const isBatchPath = value.includes("\\") || value.includes("/");

    let resolvedBatchPath = null;
    if (isBatchPath) {
      resolvedBatchPath = value;
    } else {
      const nameMatch = Object.values(productionStages).find(
        (r) => r.batch_path?.split(/[/\\]/).pop() === value,
      );
      if (nameMatch) {
        resolvedBatchPath = nameMatch.batch_path;
      } else if (/^\d{6}$/.test(value)) {
        const tsMatch = Object.values(productionStages).find(
          (r) => r.batch_path?.split(/[/\\]/).pop().startsWith(`PRINTED_${value}`),
        );
        if (tsMatch) resolvedBatchPath = tsMatch.batch_path;
      }
    }

    if (resolvedBatchPath) {
      const batchFiles = Object.values(productionStages).filter((s) => s.batch_path === resolvedBatchPath);

      if (batchFiles.length === 0) {
        notify({ type: "Error", title: "Not found", message: `Batch not found: ${resolvedBatchPath.split(/[/\\]/).pop()}` });
        return;
      }

      // Receive lens: a scan adds the batch to the receiving session and NOTHING
      // else. This MUST stay above the role logic below — otherwise scanning at a
      // QC station while unpacking a sewing delivery would advance that batch's
      // heatpress files to qc.
      if (viewModeRef.current === VIEW_MODE.RECEIVE) {
        addBatchToSessionRef.current?.(resolvedBatchPath);
        return;
      }

      setBatchFilter(resolvedBatchPath);

      if (workstationRole === "cotton") {
        const targets = batchFiles.filter((f) => f.stage === PRODUCTION_STAGE.PRINTED);
        if (targets.length === 0) {
          notify({ type: "Warning", title: "Nothing to advance", message: "No files at Printed stage in this batch." });
          return;
        }
        const now = new Date().toISOString();
        let count = 0, rejected = 0, failed = 0;
        for (const f of targets) {
          const res = await advanceStage(f.file_id, PRODUCTION_STAGE.HEATPRESS, PRODUCTION_STAGE.PRINTED);
          const outcome = applyStageTransition({ fileId: f.file_id, row: f, newStage: PRODUCTION_STAGE.HEATPRESS, res, now });
          if (outcome === "applied") count++;
          else if (outcome === "rejected") rejected++;
          else failed++;
        }
        if (count > 0) notify({ type: "Success", title: `${count} file${count > 1 ? "s" : ""} moved`, message: "Moved to Heat Press" });
        if (rejected > 0) notifyStageRejected(rejected);
        if (failed > 0) notifyStageFailed(failed);
        return;
      }

      if (workstationRole === "polyester") {
        const targets = batchFiles.filter((f) => f.stage === PRODUCTION_STAGE.PRINTED);
        if (targets.length === 0) {
          notify({ type: "Warning", title: "Nothing to advance", message: "No files at Printed stage in this batch." });
          return;
        }
        const now = new Date().toISOString();
        let count = 0, rejected = 0, failed = 0;
        for (const f of targets) {
          const res = await advanceStage(f.file_id, PRODUCTION_STAGE.HEATPRESS, PRODUCTION_STAGE.PRINTED);
          const outcome = applyStageTransition({ fileId: f.file_id, row: f, newStage: PRODUCTION_STAGE.HEATPRESS, res, now });
          if (outcome === "applied") count++;
          else if (outcome === "rejected") rejected++;
          else failed++;
        }
        if (count > 0) notify({ type: "Success", title: `${count} file${count > 1 ? "s" : ""} moved`, message: "Moved to Heat Press" });
        if (rejected > 0) notifyStageRejected(rejected);
        if (failed > 0) notifyStageFailed(failed);
        return;
      }

      if (workstationRole === "rollpress") {
        const targets = batchFiles.filter((f) => f.stage === PRODUCTION_STAGE.HEATPRESS);
        if (targets.length === 0) {
          notify({ type: "Warning", title: "Nothing to advance", message: "No files at Heat Press stage in this batch." });
          return;
        }
        const now = new Date().toISOString();
        // This branch keeps its own advancedIds Set (its success message reads the
        // .size) instead of a plain counter — left in the call-site per design;
        // the helper only owns the store-core. rejected/failed still tracked apart.
        const advancedIds = new Set();
        let rejected = 0, failed = 0;
        for (const f of targets) {
          const res = await advanceStage(f.file_id, PRODUCTION_STAGE.QC, f.stage);
          const outcome = applyStageTransition({ fileId: f.file_id, row: f, newStage: PRODUCTION_STAGE.QC, res, now });
          if (outcome === "applied") advancedIds.add(f.file_id);
          else if (outcome === "rejected") rejected++;
          else failed++;
        }
        if (advancedIds.size > 0) notify({ type: "Success", title: "Advanced to QC", message: `${advancedIds.size} file(s) moved to QC.` });
        if (rejected > 0) notifyStageRejected(rejected);
        if (failed > 0) notifyStageFailed(failed);
        return;
      }

      if (workstationRole === "qc") {
        // Cotton roll heat-press has no scanner — the QC station completes the
        // heatpress → qc transition for the whole batch on scan. Manual
        // Pass/Rollback via the context menu still applies per file.
        const targets = batchFiles.filter((f) => f.stage === PRODUCTION_STAGE.HEATPRESS);
        if (targets.length === 0) return; // scan only filters the view to the batch
        const now = new Date().toISOString();
        let count = 0, rejected = 0, failed = 0;
        for (const f of targets) {
          const res = await advanceStage(f.file_id, PRODUCTION_STAGE.QC, PRODUCTION_STAGE.HEATPRESS);
          const outcome = applyStageTransition({ fileId: f.file_id, row: f, newStage: PRODUCTION_STAGE.QC, res, now });
          if (outcome === "applied") count++;
          else if (outcome === "rejected") rejected++;
          else failed++;
        }
        if (count > 0) notify({ type: "Success", title: `${count} file${count > 1 ? "s" : ""} moved`, message: "Moved to QC" });
        if (rejected > 0) notifyStageRejected(rejected);
        if (failed > 0) notifyStageFailed(failed);
        return;
      }

      // workstationRole === "" (default): scan only filters the view to the batch
      // (setBatchFilter above). No auto-advance, no modal.
      return;
    }

    // The Receive lens works batch by batch — a file-level scan has no meaning
    // there, so say so instead of silently filtering the hidden Batches lens.
    if (viewModeRef.current === VIEW_MODE.RECEIVE) {
      notify({
        type: "Warning",
        title: "Scan a batch barcode",
        message: "In the Receive lens scan a batch barcode, not a file.",
      });
      return;
    }

    // File-level scan — scroll and highlight the card
    const row = productionStages[value];
    if (!row) {
      notify({ type: "Error", title: "Not found", message: `Order not found: ${value}` });
      return;
    }
    setStageFilter("all");
    setBatchFilter(null);
    setSearch("");
    setHighlightedId(value);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-file-id="${CSS.escape(value)}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    setTimeout(() => setHighlightedId(null), 1500);
    notify({ type: "Success", title: "Order found", message: `${row.order_id ?? value}` });
  }, [productionStages, workstationRole, applyStageTransition]);

  useEffect(() => {
    handleScanRef.current = handleScan;
  }, [handleScan]);

  useEffect(() => {
    let buffer = "";
    let timer = null;
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      clearTimeout(timer);
      if (e.key === "Enter") {
        if (buffer.length > 5) handleScanRef.current?.(buffer.trim());
        buffer = "";
        return;
      }
      if (e.key.length === 1) buffer += e.key;
      timer = setTimeout(() => { buffer = ""; }, 100);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ─── Filtering ────────────────────────────────────────────────────────────

  const allRows = Object.values(productionStages);

  const filtered = allRows.filter((row) => {
    if (batchFilter && row.batch_path !== batchFilter) return false;
    if (stageFilter !== "all" && row.stage !== stageFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return row.order_id?.toLowerCase().includes(q) || row.customer_name?.toLowerCase().includes(q);
    }
    return true;
  });

  // Tab counts reflect the current batch filter when active
  const countableRows = batchFilter ? allRows.filter((r) => r.batch_path === batchFilter) : allRows;
  const counts = Object.fromEntries(
    FILTER_TABS.map((tab) => [
      tab.key,
      tab.key === "all" ? countableRows.length : countableRows.filter((r) => r.stage === tab.key).length,
    ]),
  );
  const isGrouped = groupingEnabled && (stageFilter === "all" || batchFilter !== null);

  const groupedBatches = useMemo(() => {
    const map = new Map();
    for (const row of filtered) {
      const key = row.batch_path ?? "__no_batch__";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return [...map.entries()];
  }, [filtered]);

  // ─── Context menu options (memoized) ─────────────────────────────────────

  const contextMenuOptions = useMemo(() => {
    if (!contextMenu) return [];
    const row = contextMenu.row;
    const fileId = row.file_id;
    const batchPath = row.batch_path;
    const filePath = batchPath ? `${batchPath}\\${fileId}.pdf` : null;

    // The Receive lens gets its own, deliberately different menu — the
    // stage-pipeline actions below (Pass / Send to sewing / Go back / bulk
    // selection) do not apply while unpacking a delivery.
    if (viewMode === VIEW_MODE.RECEIVE) {
      // Same targeting rule as the Batches branch below: act on the whole
      // selection when the clicked row belongs to it, otherwise on that row.
      const isBulkReceive = selectedFileIds.size > 0 && selectedFileIds.has(fileId);
      const receiveTargets = isBulkReceive
        ? [...selectedFileIds].map((id) => productionStages[id]).filter(Boolean)
        : [row];
      const receiveCount = receiveTargets.length;
      const receiveIds = receiveTargets.map((r) => r.file_id);

      // Common availability, like the Batches branch: an action shows only when
      // it is valid for EVERY target.
      const canReceive = receiveCount > 0
        && receiveTargets.every((r) => r.stage === PRODUCTION_STAGE.TO_SEWING);
      // Both conditions: the session ledger alone would keep offering the undo
      // after another station moved the file past packed — the guarded UPDATE
      // would then reject it and the operator would only find out post-click.
      const canUndoReceive = receiveCount > 0 && receiveTargets.every(
        (r) => session.receivedInSession.has(r.file_id) && r.stage === PRODUCTION_STAGE.PACKED,
      );
      const canRollbackReceive = receiveCount > 0 && receiveTargets.every(
        (r) => r.batch_path && r.stage !== PRODUCTION_STAGE.SHIPPED,
      );

      const receiveItems = [];
      if (canReceive) {
        receiveItems.push({
          id: "receive",
          label: receiveCount > 1 ? `Receive ${receiveCount} files` : "Receive",
          icon: <LuPackageCheck size={14} />,
          advance: true,
          onClick: () => { setContextMenu(null); receiveFiles(receiveIds); },
        });
      }
      if (canUndoReceive) {
        receiveItems.push({
          id: "undo-receive",
          label: receiveCount > 1 ? `Undo receive for ${receiveCount} files` : "Undo receive",
          icon: <LuArrowLeft size={14} />,
          onClick: () => { setContextMenu(null); undoReceiveFiles(receiveIds); },
        });
      }
      if (receiveItems.length > 0) receiveItems.push({ id: "sep-receive", separator: true });

      receiveItems.push({
        id: "shopify",
        label: "Open in Shopify",
        onClick: () => { setContextMenu(null); handleOpenInShopify(row.order_id); },
      });
      if (filePath) {
        receiveItems.push({
          id: "preview",
          label: "Quick Preview",
          icon: <LuEye size={14} />,
          onClick: () => { setContextMenu(null); handleOpenPreview(row); },
        });
      }
      if (batchPath) {
        receiveItems.push({
          id: "folder",
          label: "Open in Folder",
          onClick: () => { setContextMenu(null); handleOpenInFolder(batchPath); },
        });
      }
      if (canRollbackReceive) {
        receiveItems.push({
          id: "rollback",
          label: receiveCount > 1 ? `Rollback ${receiveCount} files` : "Rollback this file",
          icon: <LuCornerUpLeft size={14} />,
          danger: true,
          onClick: () => {
            setContextMenu(null);
            const rows = receiveTargets.filter((r) => r?.batch_path);
            if (rows.length > 0) setRollbackTargets(rows);
          },
        });
      }
      return receiveItems;
    }

    // Stage-aware: when files are selected, the menu reflects the WHOLE selection;
    // otherwise it falls back to the clicked row. An action shows only when it is
    // valid for EVERY target file (common availability).
    const isBulk = selectedFileIds.size > 0 && selectedFileIds.has(fileId);
    const targetRows = isBulk
      ? [...selectedFileIds].map((id) => productionStages[id]).filter(Boolean)
      : [row];
    const count = targetRows.length;

    const stages = new Set(targetRows.map((r) => r.stage));
    const allSameStage = stages.size === 1;
    const onlyStage = allSameStage ? [...stages][0] : null;

    const canPass = count > 0 && targetRows.every(
      (r) => STAGE_NEXT[r.stage] && r.stage !== PRODUCTION_STAGE.TO_SEWING && r.stage !== PRODUCTION_STAGE.SHIPPED,
    );
    const canReceive  = count > 0 && targetRows.every((r) => r.stage === PRODUCTION_STAGE.TO_SEWING);
    const canSew      = count > 0 && targetRows.every((r) => r.stage === PRODUCTION_STAGE.QC);
    const canGoBack   = count > 0 && targetRows.every((r) => STAGE_PREV[r.stage]);
    const canRollback = count > 0 && targetRows.every((r) => r.batch_path && r.stage !== PRODUCTION_STAGE.SHIPPED);

    const items = [];

    // ── Stage actions ──
    if (canPass) {
      items.push({
        id: "advance",
        label: allSameStage ? `Pass to ${STAGE_LABEL[STAGE_NEXT[onlyStage]]}` : "Pass to next stage",
        icon: <LuArrowRight size={14} />,
        advance: true,
        onClick: () => {
          setContextMenu(null);
          if (isBulk) handleBulkAdvance();
          else handleAdvance(fileId);
        },
      });
    }
    if (canReceive) {
      items.push({
        id: "receive",
        label: "Receive from sewing",
        icon: <LuArrowRight size={14} />,
        advance: true,
        onClick: () => {
          setContextMenu(null);
          if (isBulk) handleBulkReceive();
          else handleReceive(fileId);
        },
      });
    }
    if (canSew) {
      items.push({
        id: "sewing",
        label: "Send to Sewing",
        icon: <LuScissors size={14} />,
        children: [
          { id: "sewing-olya",     label: "Olya",     onClick: () => { if (isBulk) handleBulkSewing("Olya"); else handleSewing(fileId, "Olya"); } },
          { id: "sewing-vagabond", label: "Vagabond", onClick: () => { if (isBulk) handleBulkSewing("Vagabond"); else handleSewing(fileId, "Vagabond"); } },
        ],
      });
    }
    if (canGoBack) {
      items.push({
        id: "go-back",
        label: allSameStage ? `Back to ${STAGE_LABEL[STAGE_PREV[onlyStage]]}` : "Go back",
        icon: <LuArrowLeft size={14} />,
        onClick: () => {
          setContextMenu(null);
          if (isBulk) handleBulkGoBack();
          else handleGoBack(fileId);
        },
      });
    }
    if (canRollback) {
      items.push({
        id: "rollback",
        label: count > 1 ? `Rollback ${count} files` : "Rollback this file",
        icon: <LuCornerUpLeft size={14} />,
        danger: true,
        onClick: () => {
          setContextMenu(null);
          const rows = targetRows.filter((r) => r?.batch_path);
          if (rows.length > 0) setRollbackTargets(rows);
        },
      });
    }

    if (items.length > 0) items.push({ id: "sep-tools", separator: true });

    // ── Tools (always operate on the clicked row) ──
    if (batchPath) {
      items.push({
        id: "reprint-label",
        label: "Reprint Label",
        icon: <LuRefreshCw size={14} />,
        amber: true,
        onClick: () => { setContextMenu(null); handleReprintLabel(fileId); },
      });
    }
    if (filePath) {
      items.push({
        id: "preview",
        label: "Quick Preview",
        icon: <LuEye size={14} />,
        onClick: () => { setContextMenu(null); handleOpenPreview(row); },
      });
    }
    if (batchPath) {
      items.push({
        id: "folder",
        label: "Open in Folder",
        onClick: () => { setContextMenu(null); handleOpenInFolder(batchPath); },
      });
    }
    items.push({
      id: "shopify",
      label: "Open in Shopify",
      onClick: () => { setContextMenu(null); handleOpenInShopify(row.order_id); },
    });

    // "Show in Orders" deliberately operates on the SELECTION (like the stage
    // actions above), not just the clicked row — the exception to the "tools
    // operate on the clicked row" rule. It flips to the Orders lens and asks
    // OrderView to expand + scroll to every selected file's order.
    if (targetRows.length > 0) {
      // Same key logic as groupByOrder: trimmed order_id, else the unknown bucket
      // (UNKNOWN_ORDER_KEY is imported from groupByOrder.js — one definition).
      const orderKeys = [...new Set(
        targetRows.map((r) =>
          (typeof r?.order_id === "string" && r.order_id.trim() !== "")
            ? r.order_id.trim()
            : UNKNOWN_ORDER_KEY,
        ),
      )];
      items.push({
        id: "show-in-orders",
        label: "Show in Orders",
        icon: <LuListTree size={14} />,
        onClick: () => {
          setContextMenu(null);
          setSearch(""); // clear search so the order isn't filtered out in OrderView
          setViewMode(VIEW_MODE.ORDERS);
          setFocusOrders({ keys: orderKeys, nonce: Date.now() });
        },
      });
    }

    return items;
  }, [contextMenu, selectedFileIds, productionStages, viewMode, session]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={style.container}>

      <div className={style.top_section}>
      <div className={style.topbar}>
        <h2 className={style.title}>Production</h2>

        {/* Lens toggle: batch/stage view vs read-only order-centric view */}
        <div className={style.tabs}>
          <button
            type="button"
            className={`${style.tab} ${viewMode === VIEW_MODE.BATCHES ? style.tab_active : ""}`}
            onClick={() => setViewMode(VIEW_MODE.BATCHES)}
          >
            Batches
          </button>
          <button
            type="button"
            className={`${style.tab} ${viewMode === VIEW_MODE.ORDERS ? style.tab_active : ""}`}
            onClick={() => setViewMode(VIEW_MODE.ORDERS)}
          >
            Orders
          </button>
          <button
            type="button"
            className={`${style.tab} ${viewMode === VIEW_MODE.RECEIVE ? style.tab_active : ""}`}
            onClick={() => setViewMode(VIEW_MODE.RECEIVE)}
          >
            Receive
          </button>
        </div>

        {viewMode === VIEW_MODE.BATCHES && <div className={style.topbar_sep} />}

        {viewMode === VIEW_MODE.BATCHES && (
          <div className={style.tabs}>
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`${style.tab} ${stageFilter === tab.key ? style.tab_active : ""}`}
                onClick={() => setStageFilter(tab.key)}
              >
                {tab.label}
                {counts[tab.key] > 0 && <span className={style.tab_count}>{counts[tab.key]}</span>}
              </button>
            ))}
          </div>
        )}

        <div className={style.topbar_right}>
          {viewMode === VIEW_MODE.BATCHES && (
            <>
              <label className={style.group_toggle}>
                <input
                  type="checkbox"
                  checked={groupingEnabled}
                  onChange={(e) => setGroupingEnabled(e.target.checked)}
                  className={style.group_toggle_checkbox}
                />
                Groups
              </label>
              <div className={style.topbar_right_sep} />
            </>
          )}
          <div className={style.search_wrapper}>
            <HiMagnifyingGlass className={style.search_icon} />
            <input
              ref={searchInputRef}
              className={style.search_input}
              placeholder="Search order ID or customer... (Enter to scan)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                // Whitelist, not blacklist: handleScan MUTATES the DB — depending on
                // workstationRole it advances file stages. A future fourth lens must
                // not reach that state-changing path just by existing, so deny is the
                // default and each lens is opted in explicitly.
                if (viewMode !== VIEW_MODE.BATCHES && viewMode !== VIEW_MODE.RECEIVE) return;
                const val = search.trim();
                if (val.length <= 5) return;
                const isBatchName = Object.values(productionStages).some(
                  (r) => r.batch_path?.split(/[/\\]/).pop() === val
                );
                const isFileId = !!productionStages[val];
                const isBatchPath = val.includes("\\") || val.includes("/");
                if (isBatchName || isFileId || isBatchPath) {
                  handleScan(val);
                  setSearch("");
                }
              }}
            />
            {search && (
              <button
                className={style.search_clear}
                type="button"
                onClick={() => {
                  setSearch("");
                  searchInputRef.current?.focus();
                }}
              >
                <HiXMark />
              </button>
            )}
          </div>
          <button type="button" className={style.refresh_btn} onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? <span className={style.spinner} /> : <LuRefreshCw size={15} />}
          </button>
        </div>
      </div>

      {viewMode === VIEW_MODE.BATCHES && batchFilter && (
        <div className={style.filter_bar}>
          <span className={style.filter_bar_label}>Batch:</span>
          <button type="button" className={style.batch_chip} onClick={() => setBatchFilter(null)}>
            {batchFilter.split(/[/\\]/).pop()} ×
          </button>
        </div>
      )}
      </div>

      <div className={style.cards_wrapper}>
        {/* Receive owns its own empty/loading states — it must not fall through
            into the Batches-lens isLoading / filtered.length branches below. */}
        {viewMode === VIEW_MODE.RECEIVE ? (
          <SewingReceive
            session={session}
            setSession={setSession}
            onReceive={receiveFiles}
            isReceiving={isReceiving}
            selectedFileIds={selectedFileIds}
            onSelect={toggleProductionSelect}
            onRipBadgeClick={(error, x, y) => setRipPopover({ error, x, y })}
            onContextMenu={(r, x, y) => setContextMenu({ row: r, x, y })}
          />
        ) : viewMode === VIEW_MODE.ORDERS ? (
          <OrderView searchQuery={search} focusOrders={focusOrders} />
        ) : isLoading && allRows.length === 0 ? (
          <div className={style.loading_state}>
            <div className={style.loading_spinner} />
          </div>
        ) : filtered.length === 0 ? (
          <div className={style.empty_state}>
            <span className={style.empty_text}>No jobs match the current filter.</span>
          </div>
        ) : isGrouped ? (
          groupedBatches.map(([batchPath, rows]) => (
            <div key={batchPath} className={style.batch_group}>
              <BatchGroupHeader
                batchPath={batchPath}
                rows={rows}
                selectedFileIds={selectedFileIds}
                onSelectAll={handleSelectBatch}
              />
              {rows.map((row) => (
                <ProductionCard
                  key={row.file_id}
                  stage={row}
                  history={stageHistory[row.file_id] ?? []}
                  highlighted={highlightedId === row.file_id}
                  selected={selectedFileIds.has(row.file_id)}
                  awaitingQc={workstationRole === "qc" && row.stage === PRODUCTION_STAGE.HEATPRESS}
                  ripError={ripErrors[row.file_id]}
                  onRipBadgeClick={(error, x, y) => setRipPopover({ error, x, y })}
                  onSelect={toggleProductionSelect}
                  onContextMenu={(r, x, y) => setContextMenu({ row: r, x, y })}
                />
              ))}
            </div>
          ))
        ) : (
          filtered.map((row) => (
            <ProductionCard
              key={row.file_id}
              stage={row}
              history={stageHistory[row.file_id] ?? []}
              highlighted={highlightedId === row.file_id}
              selected={selectedFileIds.has(row.file_id)}
              awaitingQc={workstationRole === "qc" && row.stage === PRODUCTION_STAGE.HEATPRESS}
              ripError={ripErrors[row.file_id]}
              onRipBadgeClick={(error, x, y) => setRipPopover({ error, x, y })}
              onSelect={toggleProductionSelect}
              onContextMenu={(r, x, y) => setContextMenu({ row: r, x, y })}
            />
          ))
        )}
      </div>

      <PdfPreviewModal
        isOpen={isPreviewOpen}
        isLoading={isPreviewLoading}
        imgSrc={previewImgSrc}
        error={previewError}
        currentPath={previewCurrentPath}
        currentIndex={previewCurrentIndex}
        fileList={previewFileList}
        onClose={closePreview}
        onNavigate={navigatePreview}
      />

      {/* Context menu */}
      {contextMenu && createPortal(
        <ContextMenu
          id="production-context-menu"
          anchorX={contextMenu.x}
          anchorY={contextMenu.y}
          onClose={() => setContextMenu(null)}
          options={contextMenuOptions}
        />,
        document.body,
      )}

      {/* RIP-error detail popover (anchored to the clicked file badge) */}
      {ripPopover && createPortal(
        <RipErrorPopover
          error={ripPopover.error}
          anchorX={ripPopover.x}
          anchorY={ripPopover.y}
          onClose={() => setRipPopover(null)}
        />,
        document.body,
      )}

      {/* Rollback modal (reason + qty affected) */}
      {rollbackTargets && (
        <ProductionRollbackModal
          rows={rollbackTargets}
          onConfirm={handleRollbackDecisions}
          onCancel={() => setRollbackTargets(null)}
        />
      )}

    </div>
  );
};

export default Production;
