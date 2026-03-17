import { useEffect, useState } from "react";
import style from "./ProductionPrintCard.module.css";
import { useStore } from "../../store/useStore";
import { FiClock, FiInbox } from "react-icons/fi";

const PRINT_TYPE_CONFIG = [
  { label: "LM", code: "LM" },
  { label: "FQ", code: "FQ" },
  { label: "SAMPLE", code: "SAMPLE" },
  { label: "TT", code: "TEA_TOWEL" },
  { label: "CUSHION", code: "CUSHION" },
];

const formatElapsedTime = (timestamp) => {
  if (!timestamp) return "No scan yet";

  const elapsedMs = Date.now() - new Date(timestamp).getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));

  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours} h ago`;

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} d ago`;
};

const ProductionPrintCard = () => {
  const store = useStore();
  const allItems = store.files.flatMap((group) => group.items);
  const [elapsedLabel, setElapsedLabel] = useState(() => formatElapsedTime(store.lastFilesRefreshAt));

  const counts = {
    LM: 0,
    FQ: 0,
    SAMPLE: 0,
    TEA_TOWEL: 0,
    CUSHION: 0,
  };

  allItems.forEach((item) => {
    if (item.printTypeCode in counts) {
      counts[item.printTypeCode] += 1;
    }
  });

  useEffect(() => {
    setElapsedLabel(formatElapsedTime(store.lastFilesRefreshAt));

    if (!store.lastFilesRefreshAt) return undefined;

    const intervalId = window.setInterval(() => {
      setElapsedLabel(formatElapsedTime(store.lastFilesRefreshAt));
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, [store.lastFilesRefreshAt]);

  return (
    <div className={style.card_container}>
      <div className={style.card}>
        <div className={style.card_header}>
          <FiInbox className={style.card_icon} />
          <p className={style.card_title}>Inbox</p>
          <p className={style.card_subtitle}>{allItems.length}</p>
        </div>
      </div>
    </div>

    //   {/* <div className={style.card_total_badge}>
    //       <span className={style.card_total_label}>Total</span>
    //       <strong className={style.card_total_value}>{allItems.length}</strong>
    //     </div> */}

    //   {/* <div className={style.stats_grid}>
    //     {PRINT_TYPE_CONFIG.map(({ label, code }) => (
    //       <div key={code} className={style.stat_tile}>
    //         <span className={style.stat_label}>{label}</span>
    //         <strong className={style.stat_value}>{counts[code]}</strong>
    //       </div>
    //     ))}
    //   </div>

    //   <div className={style.card_footer}>
    //     <div className={style.refresh_row}>
    //       <FiClock className={style.card_clock_icon} size={16} />
    //       <span className={style.refresh_label}>Last scan refresh</span>
    //     </div>
    //     <strong className={style.refresh_value}>{elapsedLabel}</strong> */}
    //   {/* </div> */}
  );
};

export default ProductionPrintCard;
