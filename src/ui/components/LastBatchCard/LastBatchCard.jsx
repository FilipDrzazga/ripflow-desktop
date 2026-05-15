import { useMemo } from "react";
import { LuLayers, LuClock } from "react-icons/lu";
import { useStore, getLastBatch } from "../../store/useStore";
import { estimatePrintLength } from "../../../shared/estimatePrintLength";
import style from "./LastBatchCard.module.css";
import { PRINTER_COLORS } from "../../constants/printerColors";

const parseTimeFromName = (name) => {
  const parts = name.split("_");
  if (parts.length < 2) return null;
  const timeStr = parts[1].split("-")[0];
  if (timeStr.length < 6) return null;
  return `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}`;
};

const formatTimestamp = (batch, day) => {
  const time = parseTimeFromName(batch.name);
  if (!time) return day.date;
  if (day.label === "Today") return `Today, ${time}`;
  if (day.label === "Yesterday") return `Yesterday, ${time}`;
  return day.date;
};

const LastBatchCard = () => {
  const batchDays = useStore((state) => state.batchDays);
  const isBatchSubmitting = useStore((state) => state.isBatchSubmitting);
  const result = useMemo(() => getLastBatch(batchDays), [batchDays]);

  const printLength = useMemo(() => {
    if (!result) return null;
    return estimatePrintLength(result.batch.files);
  }, [result]);

  if (!result) {
    return (
      <div className={style.card}>
        <div className={style.card_content}>
          <div className={style.card_header}>
            <span className={style.card_header_title}>Last batch</span>
            {isBatchSubmitting && <span className={style.spinner} />}
          </div>
          <div className={style.empty_state}>
            <span className={style.empty_state_text}>No batches yet</span>
          </div>
        </div>
      </div>
    );
  }

  const { batch, day } = result;
  const printerColors = PRINTER_COLORS[batch.printer] || { bg: "#f0f0f0", color: "#555" };
  const timestamp = formatTimestamp(batch, day);

  return (
    <div className={style.card}>
      <div className={style.card_content}>
        <div className={style.card_header}>
          <span className={style.card_header_title}>Last batch</span>
          <div className={style.header_right}>
            {isBatchSubmitting && <span className={style.spinner} />}
            {!isBatchSubmitting && (
              <span
                className={style.printer_badge}
                style={{ backgroundColor: printerColors.bg, color: printerColors.color }}
              >
                {batch.printer}
              </span>
            )}
          </div>
        </div>

        <div className={style.stats_row}>
          <div className={style.stat_item}>
            <LuLayers className={style.stat_icon} />
            <span className={style.stat_value}>{batch.fileCount}</span>
            <span className={style.stat_label}>{batch.fileCount === 1 ? "file" : "files"}</span>
          </div>
          {printLength && printLength.fixedTotalLengthM > 0 && (
            <div className={style.stat_item}>
              <span className={style.stat_value}>{printLength.fixedTotalLengthM}</span>
              <span className={style.stat_label}>m</span>
            </div>
          )}
        </div>

        <div className={style.card_footer}>
          <LuClock className={style.card_footer_icon} />
          <div className={style.card_footer_body}>
            <span className={style.card_footer_timestamp}>{timestamp}</span>
            <span className={style.card_footer_name} title={batch.name}>{batch.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LastBatchCard;
