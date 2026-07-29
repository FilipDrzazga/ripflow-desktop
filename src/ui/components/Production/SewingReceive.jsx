import { useMemo } from "react";
import { LuCheck, LuPackageCheck, LuTrash2, LuScanBarcode, LuMousePointerClick } from "react-icons/lu";
import { HiXMark } from "react-icons/hi2";
import { useStore } from "../../store/useStore";
import { PRODUCTION_STAGE } from "../../../shared/constants";
import { groupByOrder, UNKNOWN_ORDER_KEY, UNKNOWN_ORDER_LABEL } from "../../utils/groupByOrder";
import { notify } from "@/utils/notify";
import ProductionCard from "./ProductionCard";
import PdfThumb from "../PdfThumb/PdfThumb";
import style from "./SewingReceive.module.css";

// Bucket for rows whose sewing_company is null — the column arrived via ALTER TABLE,
// so files sent to sewing before it existed carry no company. Never dropped.
const NO_COMPANY = "__NO_COMPANY__";
const NO_COMPANY_LABEL = "No company";
// An order can have a valid id and still carry no customer name (nullable column).
// That is NOT the unknown-order bucket, so it must not borrow its label.
const NO_NAME_LABEL = "No name";

const batchNameOf = (batchPath) => batchPath?.split(/[/\\]/).pop() ?? "Unknown";
const orderKeyOf = (order) => (order.isUnknown ? UNKNOWN_ORDER_KEY : order.orderId);
const orderTitleOf = (order) => (order.isUnknown ? UNKNOWN_ORDER_LABEL : order.orderId);
const companyOf = (row) => row.sewing_company || NO_COMPANY;

// The receiving session lives in Production.jsx — this component would otherwise
// lose it every time the operator switches lens (it unmounts). The receive
// mutation lives there too (onReceive), shared with the context-menu item, so
// there is exactly one implementation of it.
const SewingReceive = ({
  session,
  setSession,
  onReceive,
  isReceiving,
  selectedFileIds,
  onSelect,
  onRipBadgeClick,
  onContextMenu,
}) => {
  const productionStages = useStore((s) => s.productionStages);
  // Read straight from the store, exactly like productionStages — no reason to
  // push these down as props from the parent just to reach ProductionCard.
  const stageHistory = useStore((s) => s.stageHistory);
  const ripErrors = useStore((s) => s.ripErrors);

  const { batchPaths, receivedInSession, companyFilter, activeOrderKey } = session;

  // ─── Session data ─────────────────────────────────────────────────────────

  // A received file moves to "packed" and would drop out of a plain to_sewing
  // filter — which would make the order vanish from the list at the exact moment
  // it was received, taking its "2/3" badge and the progress counter with it.
  // Keeping session-received files in scope is what makes the list stable.
  const sessionRows = useMemo(() => {
    if (batchPaths.length === 0) return [];
    const inSession = new Set(batchPaths);
    return Object.values(productionStages).filter(
      (r) =>
        inSession.has(r.batch_path) &&
        (r.stage === PRODUCTION_STAGE.TO_SEWING || receivedInSession.has(r.file_id)),
    );
  }, [productionStages, batchPaths, receivedInSession]);

  // Built from the data, never hardcoded — sewing companies are free text set at
  // dispatch time, not a fixed enum.
  const companies = useMemo(() => {
    const seen = new Set(sessionRows.map(companyOf));
    const named = [...seen].filter((c) => c !== NO_COMPANY).sort((a, b) => a.localeCompare(b));
    return seen.has(NO_COMPANY) ? [...named, NO_COMPANY] : named;
  }, [sessionRows]);

  const filteredRows = useMemo(
    () => (companyFilter ? sessionRows.filter((r) => companyOf(r) === companyFilter) : sessionRows),
    [sessionRows, companyFilter],
  );

  const orders = useMemo(() => groupByOrder(filteredRows), [filteredRows]);

  const activeOrder = useMemo(
    () => orders.find((o) => orderKeyOf(o) === activeOrderKey) ?? null,
    [orders, activeOrderKey],
  );

  const receivedCountOf = (order) =>
    order.files.filter((f) => receivedInSession.has(f.file_id)).length;

  // Progress is scoped to the active company filter, not the whole session.
  const progressDone = filteredRows.filter((r) => receivedInSession.has(r.file_id)).length;
  const progressTotal = filteredRows.length;
  const progressComplete = progressTotal > 0 && progressDone === progressTotal;

  // ─── Receive ──────────────────────────────────────────────────────────────
  // Thin wrappers over the single implementation passed in from Production.jsx.

  const handleReceiveOrder = (order) =>
    onReceive(order.files.filter((f) => f.stage === PRODUCTION_STAGE.TO_SEWING).map((f) => f.file_id));

  // No per-row receive wrapper any more: ProductionCard carries no action button,
  // so a single item is received through the context menu (which routes to the
  // same onReceive).

  // ─── Session management ───────────────────────────────────────────────────

  const handleRemoveBatch = (batchPath) => {
    const alreadyReceived = sessionRows.filter(
      (r) => r.batch_path === batchPath && receivedInSession.has(r.file_id),
    ).length;
    if (alreadyReceived > 0) {
      // Removing from the session is a view operation — it cannot and must not
      // undo a stage move. "Undo receive" in the context menu does that.
      notify({
        type: "Warning",
        title: "Batch removed from session",
        message: `${alreadyReceived} item(s) already received - removing the batch does not undo that.`,
      });
    }
    setSession((s) => ({ ...s, batchPaths: s.batchPaths.filter((p) => p !== batchPath) }));
  };

  const handleClearSession = () =>
    setSession({
      batchPaths: [],
      receivedInSession: new Set(),
      companyFilter: null,
      activeOrderKey: null,
    });

  const setCompanyFilter = (company) => setSession((s) => ({ ...s, companyFilter: company }));
  const setActiveOrderKey = (key) => setSession((s) => ({ ...s, activeOrderKey: key }));

  // ─── Render ───────────────────────────────────────────────────────────────

  if (batchPaths.length === 0) {
    return (
      <div className={style.empty_state}>
        <LuScanBarcode size={32} />
        <span className={style.empty_text}>Scan a batch barcode to start receiving.</span>
      </div>
    );
  }

  return (
    <div className={style.wrapper}>
      <div className={style.toolbar}>
        <div className={style.toolbar_row}>
          <span className={style.toolbar_label}>Session:</span>
          <div className={style.batch_chips}>
            {batchPaths.map((bp) => (
              <span key={bp} className={style.batch_chip}>
                {batchNameOf(bp)}
                <button
                  type="button"
                  className={style.chip_remove}
                  onClick={() => handleRemoveBatch(bp)}
                  title="Remove batch from session"
                >
                  <HiXMark />
                </button>
              </span>
            ))}
          </div>
          <button type="button" className={style.ghost_btn} onClick={handleClearSession}>
            <LuTrash2 size={13} />
            Clear session
          </button>
          <span className={`${style.progress} ${progressComplete ? style.progress_done : ""}`}>
            {progressDone} of {progressTotal}
          </span>
        </div>

        {companies.length > 1 && (
          <div className={style.toolbar_row}>
            <span className={style.toolbar_label}>Sewing:</span>
            <button
              type="button"
              className={`${style.company_chip} ${companyFilter === null ? style.company_chip_active : ""}`}
              onClick={() => setCompanyFilter(null)}
            >
              All
            </button>
            {companies.map((c) => (
              <button
                key={c}
                type="button"
                className={`${style.company_chip} ${companyFilter === c ? style.company_chip_active : ""}`}
                onClick={() => setCompanyFilter(c)}
              >
                {c === NO_COMPANY ? NO_COMPANY_LABEL : c}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={style.columns}>
        <div className={style.column}>
          <span className={style.column_title}>Orders ({orders.length})</span>
          {orders.length === 0 ? (
            <span className={style.hint}>No items in this session.</span>
          ) : (
            orders.map((order) => {
              const key = orderKeyOf(order);
              const received = receivedCountOf(order);
              const done = received === order.totalFiles;
              return (
                <button
                  key={key}
                  type="button"
                  className={`${style.order} ${activeOrderKey === key ? style.order_active : ""} ${done ? style.order_done : ""}`}
                  onClick={() => setActiveOrderKey(key)}
                >
                  <span className={style.order_main}>
                    <span
                      className={`${style.order_id} ${order.isUnknown ? style.order_id_unknown : ""}`}
                    >
                      {orderTitleOf(order)}
                    </span>
                    <span className={style.order_customer}>
                      {order.customerName ?? NO_NAME_LABEL}
                    </span>
                  </span>
                  <span className={`${style.order_badge} ${done ? style.order_badge_done : ""}`}>
                    {done && <LuCheck size={12} />}
                    {received}/{order.totalFiles}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className={style.column}>
          <span className={style.column_title}>
            {activeOrder ? `Items (${activeOrder.totalFiles})` : "Items"}
          </span>
          {!activeOrder ? (
            <div className={`${style.empty_state} ${style.empty_state_page_centered}`}>
              <LuMousePointerClick size={32} />
              <span className={style.hint}>Select an order from the list on the left.</span>
            </div>
          ) : (
            <div className={style.panel}>
              <div className={style.panel_header}>
                <span className={style.panel_title}>{orderTitleOf(activeOrder)}</span>
                <span className={style.panel_sub}>
                  {activeOrder.customerName ?? NO_NAME_LABEL}
                </span>
                <button
                  type="button"
                  className={style.receive_all_btn}
                  disabled={
                    isReceiving ||
                    !activeOrder.files.some((f) => f.stage === PRODUCTION_STAGE.TO_SEWING)
                  }
                  onClick={() => handleReceiveOrder(activeOrder)}
                >
                  <LuPackageCheck size={14} />
                  Receive all
                </button>
              </div>
              <div className={style.card_list}>
                {activeOrder.files.map((row) => (
                  <ProductionCard
                    key={row.file_id}
                    stage={row}
                    history={stageHistory[row.file_id] ?? []}
                    highlighted={false}
                    selected={selectedFileIds.has(row.file_id)}
                    awaitingQc={false}
                    ripError={ripErrors[row.file_id]}
                    // Only the ACTIVE order's items are on screen (usually 2-3),
                    // which is laziness enough — no observer, no prefetch.
                    thumbnail={<PdfThumb filePath={`${row.batch_path}\\${row.file_id}.pdf`} />}
                    onRipBadgeClick={onRipBadgeClick}
                    onSelect={onSelect}
                    onContextMenu={onContextMenu}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SewingReceive;
