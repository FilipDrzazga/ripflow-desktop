import {
  LuFileX, LuPrinter, LuRuler, LuLayers, LuZap, LuThermometer,
  LuWaves, LuGhost, LuSparkles, LuPalette, LuEllipsis, LuBot,
  LuRefreshCw, LuImageOff, LuTriangleAlert, LuBan, LuScissors,
  LuDroplets, LuFlame, LuPackageX, LuWrench, LuCircleX, LuCircleOff,
  LuStar, LuSearch,
} from "react-icons/lu";

export const ICON_MAP = {
  LuFileX, LuPrinter, LuRuler, LuLayers, LuZap, LuThermometer,
  LuWaves, LuGhost, LuSparkles, LuPalette, LuEllipsis, LuBot,
  LuRefreshCw, LuImageOff, LuTriangleAlert, LuBan, LuScissors,
  LuDroplets, LuFlame, LuPackageX, LuWrench, LuCircleX, LuCircleOff,
  LuStar, LuSearch,
};

export const resolveIcon = (iconName) => ICON_MAP[iconName] ?? null;

export const ICON_OPTIONS = [
  { name: "LuPrinter",       component: LuPrinter },
  { name: "LuWaves",         component: LuWaves },
  { name: "LuGhost",         component: LuGhost },
  { name: "LuZap",           component: LuZap },
  { name: "LuFlame",         component: LuFlame },
  { name: "LuDroplets",      component: LuDroplets },
  { name: "LuLayers",        component: LuLayers },
  { name: "LuScissors",      component: LuScissors },
  { name: "LuSparkles",      component: LuSparkles },
  { name: "LuThermometer",   component: LuThermometer },
  { name: "LuPalette",       component: LuPalette },
  { name: "LuImageOff",      component: LuImageOff },
  { name: "LuStar",          component: LuStar },
  { name: "LuSearch",        component: LuSearch },
  { name: "LuRuler",         component: LuRuler },
  { name: "LuBot",           component: LuBot },
  { name: "LuWrench",        component: LuWrench },
  { name: "LuRefreshCw",     component: LuRefreshCw },
  { name: "LuFileX",         component: LuFileX },
  { name: "LuPackageX",      component: LuPackageX },
  { name: "LuTriangleAlert", component: LuTriangleAlert },
  { name: "LuCircleX",      component: LuCircleX },
  { name: "LuBan",           component: LuBan },
  { name: "LuCircleOff",     component: LuCircleOff },
  { name: "LuEllipsis",      component: LuEllipsis },
];
