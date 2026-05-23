import {
  LuFileX,
  LuPrinter,
  LuRuler,
  LuLayers,
  LuZap,
  LuThermometer,
  LuWaves,
  LuGhost,
  LuSparkles,
  LuPalette,
  LuEllipsis,
} from "react-icons/lu";

export const ROLLBACK_REASONS = [
  { code: "MISSING_JOB",    label: "Missing job",     icon: LuFileX },
  { code: "PRINTER_LINES",  label: "Printer lines",   icon: LuPrinter },
  { code: "WRONG_SIZE",     label: "Wrong size",      icon: LuRuler },
  { code: "WRONG_MATERIAL", label: "Wrong material",  icon: LuLayers },
  { code: "FABRIC_FAULT",   label: "Fabric Fault",    icon: LuZap },
  { code: "PRESSING_FAULT", label: "Pressing Fault",  icon: LuThermometer },
  { code: "FABRIC_CREASE",  label: "Fabric Crease",   icon: LuWaves },
  { code: "GHOSTING",       label: "Ghosting",        icon: LuGhost },
  { code: "LINT_MARK",      label: "Lint Mark",       icon: LuSparkles },
  { code: "WRONG_COLOURS",  label: "Wrong Colours",   icon: LuPalette },
  { code: "OTHER",          label: "Other...",        icon: LuEllipsis },
];
