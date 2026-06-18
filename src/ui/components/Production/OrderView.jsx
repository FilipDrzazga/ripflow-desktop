import { useMemo, useState } from "react";
import { LuChevronRight, LuChevronDown, LuPackageCheck, LuFileText } from "react-icons/lu";
import { useStore } from "../../store/useStore";
import { PRODUCTION_STAGE, STAGE_LABEL, STAGE_COLOR } from "../../../shared/constants";
import { groupByOrder, ORDER_STAGE_PIPELINE, UNKNOWN_ORDER_LABEL } from "../../utils/groupByOrder";
import { PRINTER_COLORS } from "../../constants/printerColors";
import style from "./Production.module.css";
import ov from "./OrderView.module.css";

// Short labels for stage-count pills — mirrors the Production batch view so the
// two lenses look consistent. Keyed by PRODUCTION_STAGE, never raw strings.
const SHORT_LABEL = {
  [PRODUCTION_STAGE.PRINTED]:     "Print",
  [PRODUCTION_STAGE.HEATPRESS]:   "Press",
  [PRODUCTION_STAGE.QC]:          "QC",
  [PRODUCTION_STAGE.TO_SEWING]:   "Sew Out",
  [PRODUCTION_STAGE.FROM_SEWING]: "Sew In",
  [PRODUCTION_STAGE.PACKED]:      "Pack",
  [PRODUCTION_STAGE.SHIPPED]:     "Ship",
};

const batchNameOf = (batchPath) => batchPath?.split(/[/\\]/).pop() ?? "—";

const StageCountPills = ({ stageCounts }) => (
  <div className={style.batch_group_stages}>
    {ORDER_STAGE_PIPELINE.filter((s) => stageCounts[s] > 0).map((s) => {
      const sc = STAGE_COLOR[s];
      return (
        <span
          key={s}
          className={style.batch_group_stage_pill}
          style={{ backgroundColor: sc?.bg, color: sc?.color }}
        >
          {stageCounts[s]} {SHORT_LABEL[s]}
        </span>
      );
    })}
  </div>
);

const OrderFileRow = ({ row }) => {
  const sc = STAGE_COLOR[row.stage] ?? { bg: "#f0f0f0", color: "#616161" };
  const pc = row.printer ? (PRINTER_COLORS[row.printer] ?? { bg: "#f0f0f0", color: "#616161" }) : null;
  return (
    <div className={ov.file_row}>
      <LuFileText className={ov.file_icon} />
      <span className={ov.file_name}>{row.file_id}</span>
      {row.print_type === "LM"
        ? row.meters != null && <span className={ov.file_qty}>{row.meters}m</span>
        : row.qty != null && <span className={ov.file_qty}>x{row.qty}</span>}
      {row.material && <span className={ov.file_material}>{row.material}</span>}
      <span className={ov.file_batch}>{batchNameOf(row.batch_path)}</span>
      {pc && (
        <span className={ov.file_printer} style={{ backgroundColor: pc.bg, color: pc.color }}>{row.printer}</span>
      )}
      <span className={ov.file_stage} style={{ backgroundColor: sc.bg, color: sc.color }}>
        {STAGE_LABEL[row.stage] ?? row.stage}
      </span>
    </div>
  );
};

const OrderRow = ({ order, expanded, onToggle }) => {
  const Chevron = expanded ? LuChevronDown : LuChevronRight;
  return (
    <div className={ov.order}>
      <button type="button" className={ov.order_header} onClick={onToggle}>
        <Chevron className={ov.chevron} size={16} />
        <span className={`${ov.order_id} ${order.isUnknown ? ov.order_id_unknown : ""}`}>
          {order.isUnknown ? UNKNOWN_ORDER_LABEL : order.orderId}
        </span>
        <span className={ov.order_customer}>{order.customerName ?? "—"}</span>
        <span className={ov.order_count}>{order.totalFiles} file{order.totalFiles !== 1 ? "s" : ""}</span>
        <span className={ov.order_sep} />
        <StageCountPills stageCounts={order.stageCounts} />
        <div className={ov.order_spacer} />
        {/* "All shipped" reflects only the files we currently track inside the
            retention window — NOT true Shopify order completeness (a later stage). */}
        {order.allKnownFilesShipped && (
          <span
            className={ov.shipped_badge}
            title="Every file we currently track for this order has shipped. This is not verified order completeness."
          >
            <LuPackageCheck size={13} />
            All shipped
          </span>
        )}
      </button>
      {expanded && (
        <div className={ov.file_list}>
          {order.files.map((row) => (
            <OrderFileRow key={`${row.batch_path}::${row.file_id}`} row={row} />
          ))}
        </div>
      )}
    </div>
  );
};

const OrderView = ({ searchQuery = "" }) => {
  const productionStages = useStore((s) => s.productionStages);
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const orders = useMemo(
    () => groupByOrder(Object.values(productionStages)),
    [productionStages],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.orderId?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q),
    );
  }, [orders, searchQuery]);

  const toggle = (key) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (filtered.length === 0) {
    return (
      <div className={style.empty_state}>
        <span className={style.empty_text}>No orders match the current filter.</span>
      </div>
    );
  }

  return (
    <div className={ov.list}>
      {filtered.map((order) => {
        const key = order.isUnknown ? "__UNKNOWN_ORDER__" : order.orderId;
        return (
          <OrderRow
            key={key}
            order={order}
            expanded={expandedIds.has(key)}
            onToggle={() => toggle(key)}
          />
        );
      })}
    </div>
  );
};

export default OrderView;
