import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import { inboxBarData, formatRefreshAgo, TOP_GROUPS_PER_CLASS } from "../../utils/overviewBars";
import GooBar from "./GooBar";
import OthersTooltip from "./OthersTooltip";
import { formatPercentage } from "./formatPercentage";
import { slotLook } from "./barColors";
import style from "./OverviewBars.module.css";

const InboxBar = () => {
  const files = useStore((state) => state.files);
  const fabricConfig = useStore((state) => state.fabricConfig);
  const shopProfile = useStore((state) => state.shopProfile);
  const lastFilesRefreshAt = useStore((state) => state.lastFilesRefreshAt);
  const [now, setNow] = useState(() => Date.now());

  // Shares are of the total LENGTH (metres), not of the file count.
  const { classes, totalLength, fileCount } = useMemo(
    () => inboxBarData(files, shopProfile, fabricConfig),
    [files, shopProfile, fabricConfig],
  );

  useEffect(() => {
    if (!lastFilesRefreshAt) return undefined;
    const intervalId = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(intervalId);
  }, [lastFilesRefreshAt]);

  const segments = useMemo(
    () =>
      classes.flatMap((cls) => {
        const look = slotLook(cls.slot);
        return cls.segments.map((segment, i) => ({
          key: segment.key,
          weight: segment.share,
          value: segment.length,
          color: segment.isOthers ? look.othersColor : look.palette[segment.rank % look.palette.length],
          title: `${cls.name} · ${segment.label} · ~${segment.length} m`,
          breakBefore: i === 0,
        }));
      }),
    [classes],
  );

  return (
    <div className={style.card}>
      <div className={style.card_header}>
        <div className={style.card_heading}>
          <h2 className={style.card_title}>Inbox</h2>
          <span className={style.card_sub}>
            {fileCount} {fileCount === 1 ? "file" : "files"} · refreshed {formatRefreshAgo(lastFilesRefreshAt, now)}
          </span>
        </div>
        <span className={style.card_total}>~{totalLength} m</span>
      </div>

      <GooBar segments={segments} label="Inbox by material class and print group" />

      <div className={style.rows}>
        {classes.map((cls) => {
          const look = slotLook(cls.slot);
          const row = (
            <div className={style.row}>
              <span className={style.row_dot} style={{ backgroundColor: look.accent }} />
              <span className={style.row_name}>{cls.name}</span>
              <span className={style.row_count}>
                {cls.count} {cls.count === 1 ? "file" : "files"}
              </span>
              <span className={style.row_percent}>{formatPercentage(cls.share)}</span>
              <span className={style.row_value} style={{ color: look.accent }}>
                ~{cls.length} m
              </span>
            </div>
          );
          if (cls.groups.length === 0) return <div key={cls.name}>{row}</div>;
          return (
            <OthersTooltip
              key={cls.name}
              title={`${cls.name} · print groups`}
              items={cls.groups.map((g, i) => ({
                ...g,
                color: i < TOP_GROUPS_PER_CLASS ? look.palette[i % look.palette.length] : look.othersColor,
              }))}
            >
              {row}
            </OthersTooltip>
          );
        })}
      </div>
    </div>
  );
};

export default InboxBar;
