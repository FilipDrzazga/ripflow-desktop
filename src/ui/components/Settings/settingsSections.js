import { LuSettings2, LuFolderOpen, LuLayers, LuRotateCcw, LuStore, LuDatabase, LuWrench, LuDownload } from "react-icons/lu";

// Settings sidebar (ETAP 4, 4-ui-nav): the sections in three groups, most used first. STATION is
// this machine (electron-store), SHOP is the configuration every station shares (the database),
// SYSTEM is rarely touched and sits at the bottom of the sidebar (`bottom: true`). Only the
// ORDER and the grouping live here; which view a section opens stays in Settings.jsx (VIEWS).
export const SECTION_GROUPS = [
  {
    id: "station",
    title: "Station",
    sections: [
      { id: "general", label: "General", icon: LuSettings2 },
      { id: "paths", label: "Paths", icon: LuFolderOpen },
    ],
  },
  {
    id: "shop",
    title: "Shop",
    sections: [
      { id: "fabrics", label: "Fabrics", icon: LuLayers },
      { id: "rollbackReasons", label: "Rollback Reasons", icon: LuRotateCcw },
      { id: "shopProfile", label: "Shop Profile", icon: LuStore },
    ],
  },
  {
    id: "system",
    title: "System",
    bottom: true,
    sections: [
      { id: "updates", label: "Updates", icon: LuDownload },
      { id: "database", label: "Database", icon: LuDatabase },
      { id: "maintenance", label: "Maintenance", icon: LuWrench },
    ],
  },
];

export const DEFAULT_SECTION = SECTION_GROUPS[0].sections[0].id;

export const sectionIds = () => SECTION_GROUPS.flatMap((g) => g.sections.map((s) => s.id));
