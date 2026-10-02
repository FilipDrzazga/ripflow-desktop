// Colours of the overview bars. The class palettes moved here from the two cards they used to
// live in (the Inbox split and the per-class breakdown); slot 0 = the blues Cottons always had,
// slot 1 = the violets of Polyesters, slot -1 = files of no class of the profile (amber).
// palette: the top groups of a class, strongest first; othersColor: its folded "Others".
const SLOT_LOOKS = [
  { accent: "#2e7fd6", palette: ["#2e7fd6", "#4d9de8", "#78b8ef"], othersColor: "#b9dbf7" },
  { accent: "#7c4ff0", palette: ["#6a3de8", "#8f6bef", "#b298f5"], othersColor: "#ddd0fa" },
];
const UNKNOWN_LOOK = { accent: "#E0A32E", palette: ["#E0A32E", "#EDB84A", "#F2C55C"], othersColor: "#f7e1ad" };

export const slotLook = (slot) => (slot >= 0 ? SLOT_LOOKS[slot] ?? UNKNOWN_LOOK : UNKNOWN_LOOK);

// Alert chips: the same tints the status pills had.
export const ALERT_LOOK = {
  rip: { bar: "#dc2626", bg: "#fef2f2", color: "#dc2626" },
  hold: { bar: "#e0a32e", bg: "#fef3c7", color: "#b45309" },
  reprint: { bar: "#9a9ea8", bg: "var(--bg-grey)", color: "var(--text-secondary)" },
};
