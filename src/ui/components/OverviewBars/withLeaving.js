// What a bar has on screen: the current segments plus the ones that just left (weight 0, flagged
// `leaving`), each kept right after the segment that preceded it, so GooBar can shrink them out
// before they unmount. `rendered` is what was on screen before (its leaving entries stay).
export const withLeaving = (rendered, segments) => {
  const current = new Set(segments.map((segment) => segment.key));
  const merged = [...segments];
  rendered.forEach((segment, i) => {
    if (current.has(segment.key)) return;
    const before = i === 0 ? -1 : merged.findIndex((s) => s.key === rendered[i - 1].key);
    merged.splice(before + 1, 0, { ...segment, weight: 0, value: 0, leaving: true });
  });
  return merged;
};

// True when two segment lists draw the same bar. A poll hands GooBar a NEW array with the same
// content every 30 s; without this check each one re-runs the effect and records one more tween
// in the GSAP context, which keeps every tween until the view unmounts.
export const sameSegments = (a, b) =>
  a.length === b.length &&
  a.every((segment, i) => {
    const other = b[i];
    return (
      segment.key === other.key &&
      segment.weight === other.weight &&
      segment.value === other.value &&
      segment.color === other.color &&
      segment.title === other.title &&
      !!segment.breakBefore === !!other.breakBefore
    );
  });
