import { LuPrinter, LuFlame, LuClipboardCheck, LuScissors, LuPackage, LuTruck } from "react-icons/lu";
import { PRODUCTION_STAGE } from "../../shared/constants";

// Icon per production stage. Lives in src/ui/constants (NOT src/shared/constants.js) —
// STAGE_COLOR is plain data safe for the Electron main process, but these are
// react-icons React components and must never be pulled into the main-process bundle.
// Mirrors printTypeMap.js / rollbackReasonIcons.js, which live here for the same reason.
// The "Sewing" pipeline pill reuses the to_sewing icon (it aggregates to_sewing +
// from_sewing — one physical stage for the operator).
export const STAGE_ICON = {
  [PRODUCTION_STAGE.PRINTED]:   LuPrinter,
  [PRODUCTION_STAGE.HEATPRESS]: LuFlame,
  [PRODUCTION_STAGE.QC]:        LuClipboardCheck,
  [PRODUCTION_STAGE.TO_SEWING]: LuScissors,
  [PRODUCTION_STAGE.PACKED]:    LuPackage,
  [PRODUCTION_STAGE.SHIPPED]:   LuTruck,
};
