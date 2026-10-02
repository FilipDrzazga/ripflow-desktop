// The data behind the three bars of the Print overview (inbox / pipeline / alerts), as pure
// functions: the components draw, nothing here touches the store or the DOM.
//
// Segment keys are STABLE names (class + group name, stage key, alert id) - never an index -
// so an animation layer can tell "the same segment grew" from "a different one took its slot".
// A segment with nothing in it (zero length / zero count) is not a segment at all.

import { estimatePrintLength } from "../../shared/estimatePrintLength";
import { PRODUCTION_STAGE, STAGE_LABEL } from "../../shared/constants";
import { inboxClassSplit } from "./inboxClassSplit";
import { materialClassNames } from "./materialClasses";
import { isFeatureEnabled } from "./featureVisibility";

// Groups drawn as their own segment per class; the rest are folded into one "Others" segment.
export const TOP_GROUPS_PER_CLASS = 3;
export const OTHERS_LABEL = "Others";

const percentOf = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

// ── Inbox ───────────────────────────────────────────────────────────────────────────────

// One class's print groups, longest first (ties keep the inbox order). A class is one material
// type; "Unknown" is every type outside the profile, so its length per group is the sum over
// those types - the same sum inboxClassSplit uses for the row, so shares agree with the rows.
const groupLengths = (groups, types, config) =>
  (groups || [])
    .map((group) => {
      const label = group.printGroup || "Ungrouped";
      const length = types.reduce((sum, type) => {
        const items = (group.items || []).filter((item) => item.materialType === type);
        return items.length ? sum + estimatePrintLength(items, config).fixedTotalLengthM : sum;
      }, 0);
      return { label, length: Number(length.toFixed(2)) };
    })
    .filter((group) => group.length > 0)
    .sort((a, b) => b.length - a.length);

// groups: store.files ([{ printGroup, items }]); profile: store.shopProfile; config:
// store.fabricConfig (rule 23 - passed on to every estimate).
//
// -> { totalLength, fileCount, classes: [{ name, slot, count, length, share, groups, segments }] }
// groups: EVERY group of the class with its share OF THE CLASS (the tooltip list); segments:
// the top groups plus "Others", each with its share of the WHOLE inbox (the bar is one scale).
export const inboxBarData = (groups, profile, config) => {
  const { rows, totalLength, fileCount } = inboxClassSplit(groups, profile, config);
  const known = materialClassNames(profile);
  const allItems = (groups || []).flatMap((g) => g.items || []);
  const otherTypes = [...new Set(allItems.map((i) => i.materialType).filter((t) => !known.includes(t)))];

  const classes = rows.map((row) => {
    const types = row.slot >= 0 ? [row.name] : otherTypes;
    const sorted = groupLengths(groups, types, config);
    const classTotal = sorted.reduce((sum, g) => sum + g.length, 0);
    const top = sorted.slice(0, TOP_GROUPS_PER_CLASS);
    const rest = sorted.slice(TOP_GROUPS_PER_CLASS);

    const segments = top.map((group, rank) => ({
      key: `${row.name}|group|${group.label}`,
      className: row.name,
      slot: row.slot,
      rank,
      label: group.label,
      length: group.length,
      share: percentOf(group.length, totalLength),
      isOthers: false,
    }));
    if (rest.length > 0) {
      const restLength = Number(rest.reduce((sum, g) => sum + g.length, 0).toFixed(2));
      segments.push({
        key: `${row.name}|others`,
        className: row.name,
        slot: row.slot,
        rank: TOP_GROUPS_PER_CLASS,
        label: OTHERS_LABEL,
        length: restLength,
        share: percentOf(restLength, totalLength),
        isOthers: true,
        othersCount: rest.length,
      });
    }

    return {
      ...row,
      groups: sorted.map((g) => ({ ...g, percentage: percentOf(g.length, classTotal) })),
      segments,
    };
  });

  return { totalLength, fileCount, classes };
};

// "refreshed x ago" text of the Inbox header; now = Date.now() from a ticking caller.
export const formatRefreshAgo = (lastRefreshAt, now) => {
  if (!lastRefreshAt) return "not available";
  const refreshedAt = new Date(lastRefreshAt).getTime();
  if (Number.isNaN(refreshedAt)) return "not available";

  const minutes = Math.floor(Math.max(0, now - refreshedAt) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
};

// ── Pipeline ────────────────────────────────────────────────────────────────────────────

// The current-state chain, left to right. "Sewing" is ONE physical stage for the operator:
// to_sewing + from_sewing, keyed by to_sewing. Shipped is a daily FLOW, not a state - it is
// returned apart and never becomes a segment of the chain.
export const PIPELINE_STAGES = [
  { key: PRODUCTION_STAGE.PRINTED, label: STAGE_LABEL.printed },
  { key: PRODUCTION_STAGE.HEATPRESS, label: STAGE_LABEL.heatpress },
  { key: PRODUCTION_STAGE.QC, label: STAGE_LABEL.qc },
  { key: PRODUCTION_STAGE.TO_SEWING, label: "Sewing" },
  { key: PRODUCTION_STAGE.PACKED, label: STAGE_LABEL.packed },
];

const isSameDay = (iso, ref) => {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
};

// productionStages: { [fileId]: { stage } }; stageHistory: { [fileId]: [{ stage, entered_at }] }.
// Shipped today comes from the append-only history (productionStages loses shipped rows to
// retention cleanup), each file counted once even with several shipped entries.
export const pipelineBarData = (productionStages, stageHistory, now = new Date()) => {
  const counts = {};
  for (const row of Object.values(productionStages || {})) {
    counts[row.stage] = (counts[row.stage] ?? 0) + 1;
  }
  counts[PRODUCTION_STAGE.TO_SEWING] =
    (counts[PRODUCTION_STAGE.TO_SEWING] ?? 0) + (counts[PRODUCTION_STAGE.FROM_SEWING] ?? 0);

  let shippedToday = 0;
  for (const entries of Object.values(stageHistory || {})) {
    if (entries.some((e) => e.stage === PRODUCTION_STAGE.SHIPPED && e.entered_at && isSameDay(e.entered_at, now))) {
      shippedToday++;
    }
  }

  const stages = PIPELINE_STAGES.map(({ key, label }) => ({ key, label, count: counts[key] ?? 0 }));
  const total = stages.reduce((sum, s) => sum + s.count, 0);
  return {
    stages,
    total,
    segments: stages.filter((s) => s.count > 0).map((s) => ({ key: s.key, label: s.label, count: s.count, share: percentOf(s.count, total) })),
    shippedToday,
  };
};

// ── Alerts ──────────────────────────────────────────────────────────────────────────────

export const ALERT_ID = { RIP: "rip", HOLD: "hold", REPRINT: "reprint" };

// ripErrors: { [fileId]: row }; heldIds: Set; openReprints: array. The RIP entry is the one
// that needs its own gate: every other RIP-error surface empties by itself when the poll is
// off, but a chip renders at zero too - without the gate a shop that did not buy the feature
// would stare at a permanent "RIP errors 0". isFeatureEnabled is fail-closed: an unreadable
// profile hides it as well.
export const alertsBarData = ({ ripErrors, heldIds, openReprints, shopProfile }) => {
  const items = [
    ...(isFeatureEnabled("ripErrors", shopProfile)
      ? [{ id: ALERT_ID.RIP, label: "RIP errors", count: Object.keys(ripErrors || {}).length }]
      : []),
    { id: ALERT_ID.HOLD, label: "Hold", count: heldIds?.size ?? 0 },
    { id: ALERT_ID.REPRINT, label: "Reprints", count: openReprints?.length ?? 0 },
  ];
  const total = items.reduce((sum, a) => sum + a.count, 0);
  return {
    items,
    total,
    segments: items.filter((a) => a.count > 0).map((a) => ({ key: a.id, label: a.label, count: a.count, share: percentOf(a.count, total) })),
  };
};
