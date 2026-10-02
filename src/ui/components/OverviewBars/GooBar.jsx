import style from "./OverviewBars.module.css";

// One bar of the overview: rounded segments side by side, widths proportional to `weight`.
// Static for now - the gooey filter and the animations land in bary-2, on this same markup.
//   segments: [{ key, weight, color, title, breakBefore? }]  (stable key, weight > 0)
// breakBefore widens the gap in front of a segment (the start of the next class).
const GooBar = ({ segments, label }) => {
  return (
    <div className={style.bar} role="img" aria-label={label}>
      {segments.length === 0 ? (
        <span className={style.bar_empty} />
      ) : (
        segments.map((segment) => (
          <span
            key={segment.key}
            className={`${style.bar_segment} ${segment.breakBefore ? style.bar_segment_break : ""}`.trim()}
            style={{ flexGrow: segment.weight, background: segment.color }}
            title={segment.title}
          />
        ))
      )}
    </div>
  );
};

export default GooBar;
