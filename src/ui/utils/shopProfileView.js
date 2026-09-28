// Settings -> Shop Profile (ETAP 3-4): what the view SAYS, as pure functions - the read-only
// summary of the profile, the confirm text of an import and the notices after export / import.
// Pure for the same reason as shopProfileData.js: the renderer has no rendering harness, so this
// is the only cut of the view that can carry a test. The view itself only wires them to the store,
// the services and notify.

import { PROFILE_CHANGED, STAGE_LABEL, STAGE_COLOR } from "../../shared/constants";
import { PROFILE_STATUS } from "./profileStatus";
import { getPrinterColor, isProfileUnconfigured } from "./shopProfileData";

const FEATURE_LABELS = {
  customOrders: "Custom orders",
  analytics: "Analytics",
  ripErrors: "RIP errors",
  labelPrinting: "Label printing",
  shopify: "Open in Shopify",
  sewing: "Sewing",
};
export const featureLabel = (flag) => FEATURE_LABELS[flag] ?? flag;

const list = (v) => (Array.isArray(v) ? v : []);
const text = (v) => (v === undefined || v === null || v === "" ? "-" : String(v));

const FOLDER_LABELS = {
  ripError: "RIP errors",
  customOrder: "Custom orders",
  printed: "Printed",
};

// A stage of a scanner rule as a chip: its label and colours from the shared constants; a stage
// the app does not know is shown as it is stored, in grey (colour null - the view's fallback).
const stageChip = (stage) => ({
  stage: text(stage),
  label: STAGE_LABEL[stage] ?? text(stage),
  color: STAGE_COLOR[stage] ?? null,
});

// profile -> the cards of Settings -> Shop Profile (ETAP 4, 4-ui-profile; it replaced the text
// rows of profileSections). null -> null: the view says the profile could not be read and never
// shows a guessed one. Shows what is THERE, even a malformed row - this is a window onto the
// stored profile, not a validator: a missing value reads "-", a printer whose colours are not
// valid hex gets color null (getPrinterColor), a feature is on only for a real `true`.
export const profileOverview = (profile) => {
  if (!profile || typeof profile !== "object") return null;
  const features = profile.features && typeof profile.features === "object" ? profile.features : {};
  const folders = profile.folders && typeof profile.folders === "object" ? profile.folders : {};
  const handle = profile.integrations?.shopify?.storeHandle;
  return {
    printers: list(profile.printers).map((p) => ({
      code: text(p?.code),
      materialClass: text(p?.materialClass),
      hotfolder: text(p?.hotfolder),
      color: getPrinterColor(profile, p?.code),
    })),
    materialClasses: list(profile.materialClasses).map((c) => ({
      name: text(c?.name),
      margin: text(c?.margin),
      defaultRollWidth: text(c?.defaultRollWidth),
    })),
    productTypes: list(profile.productTypes).map((t) => ({ code: text(t?.code), width: text(t?.width), height: text(t?.height) })),
    folders: Object.entries(folders).map(([key, value]) => ({
      key,
      label: FOLDER_LABELS[key] ?? key,
      value: value === undefined || value === null || value === "" ? null : String(value),
    })),
    scanRules: list(profile.scanRules).map((r) => ({
      role: text(r?.role),
      from: stageChip(r?.from),
      to: stageChip(r?.to),
      silent: r?.notifyWhenEmpty === false,
    })),
    sewingCompanies: list(profile.sewingCompanies).map(text),
    storeHandle: handle ? String(handle) : null,
    features: Object.keys(FEATURE_LABELS).map((flag) => ({ flag, label: featureLabel(flag), on: features[flag] === true })),
  };
};

// The status badge in the view's header, from the store's load status and the profile. The three
// states are the ones App.jsx already tells apart: failed (the banner about the database), loaded
// with no usable printer (the "not configured" banner, isProfileUnconfigured), and loaded.
export const profileStatusBadge = (status, profile) => {
  if (status === PROFILE_STATUS.FAILED) return { tone: "error", label: "Unreadable" };
  if (status !== PROFILE_STATUS.LOADED || !profile) return { tone: "muted", label: "Loading" };
  if (isProfileUnconfigured(profile)) return { tone: "warning", label: "Not configured" };
  return { tone: "ok", label: "Configured" };
};

// The native confirm text for a VALID preview (profile:importPreview). Plain text - showConfirm
// renders no markup. The consequences come first, the safety net and the restart note last.
export const importConfirmMessage = (preview) => {
  const d = preview?.diff ?? {};
  const impact = preview?.impact ?? {};
  // A stale preview never reaches the confirm (staleImportNotice, 4-stale), so no warning here.
  const lines = [`Import the shop profile from "${preview?.fileName ?? "the file"}"?`, ""];
  lines.push(`Changed: ${list(d.changedSections).join(", ") || "nothing"}`);
  if (list(d.printersAdded).length) lines.push(`Printers added: ${d.printersAdded.join(", ")}`);
  for (const code of list(d.printersRemoved)) {
    const n = impact.byRemovedPrinter?.[code] ?? 0;
    lines.push(`Printer removed: ${code} - ${n} production record(s) will show without its colour or filter`);
  }
  if (list(d.sewingCompaniesAdded).length) lines.push(`Sewing companies added: ${d.sewingCompaniesAdded.join(", ")}`);
  for (const name of list(d.sewingCompaniesRemoved)) {
    const n = impact.atSewingByRemovedCompany?.[name] ?? 0;
    lines.push(`Sewing company removed: ${name} - ${n} file(s) are there now`);
  }
  if (list(d.featuresTurnedOn).length) lines.push(`Turned on: ${d.featuresTurnedOn.map(featureLabel).join(", ")}`);
  if (list(d.featuresTurnedOff).length) lines.push(`Turned off: ${d.featuresTurnedOff.map(featureLabel).join(", ")}`);
  if (list(d.scanRolesRemoved).length) lines.push(`Scanner rules removed for: ${d.scanRolesRemoved.join(", ")}`);
  if (Number.isFinite(impact.stageRowsCounted)) lines.push(`(counted over ${impact.stageRowsCounted} production records)`);
  lines.push(
    "",
    "A copy of the current profile and a database backup are made first.",
    "Other stations keep the old profile until they are restarted.",
  );
  return lines.join("\n");
};

// A valid preview on a STALE station (another station saved the profile after this one loaded
// it, or it loaded none): no confirm and no apply - main gave the preview no token (ETAP 4,
// 4-stale). A Warning, not an Error: nothing failed, the import has to be made after a restart.
export const staleImportNotice = (preview) => ({
  type: "Warning",
  title: "Import not possible on this station",
  message: `This station is not running the shop profile the database holds - another station saved it after this one started, or it could not be read at startup. Restart this station, then import "${preview?.fileName ?? "the file"}" again. Nothing was changed.`,
});

// The notice after "Reload shop data" (ETAP 4, 4-retry) - main's answer from shopData:reload
// (helpers/reloadShopData.js). Each cache reports "reloaded" or "missing" (the read failed; the
// cache is empty now, also if it held data before - shop-profile.md).
const CACHE_NAMES = { profile: "shop profile", fabrics: "fabric list" };
export const reloadResultNotice = (res) => {
  if (!res?.success) return { type: "Error", title: "Reload failed", message: res?.error || "Unknown error." };
  if (res.dbOpen === false) {
    return {
      type: "Error",
      title: "Database still unreachable",
      message: "The shared database could not be opened. Check the network connection, then try again.",
    };
  }
  const missing = Object.keys(CACHE_NAMES).filter((k) => res[k] !== "reloaded");
  if (missing.length) {
    return {
      type: "Error",
      title: "Shop data not loaded",
      message: `Could not read the ${missing.map((k) => CACHE_NAMES[k]).join(" and ")}. Try again in a moment.`,
    };
  }
  return {
    type: "Success",
    title: "Shop data reloaded",
    message: res.reopened ? "The database was reconnected; the shop profile and the fabric list are up to date." : "The shop profile and the fabric list are up to date.",
  };
};

// The notice after profile:importApply. PROFILE_CHANGED is a Warning of its own - nothing was
// written on purpose - apart from a failure (the rule 18 split, as in FabricsView).
export const importResultNotice = (res) => {
  if (res?.success) {
    const backupNote = res.backup?.success === false ? ` The database backup failed (${res.backup.error}); the profile copy was made.` : "";
    return {
      type: res.backup?.success === false ? "Warning" : "Success",
      title: "Shop profile imported",
      message: `Restart the other stations so they use it.${backupNote}`,
    };
  }
  if (res?.code === PROFILE_CHANGED) {
    return {
      type: "Warning",
      title: "Profile changed elsewhere",
      message: `${res.error} This station now shows the current profile - choose the file again to import.`,
    };
  }
  return { type: "Error", title: "Import failed", message: res?.error || "Unknown error." };
};

// Validation errors for the view: all of them in the list, the first few in the notice.
export const importErrorsNotice = (errors, shown = 3) => {
  const all = list(errors);
  const more = all.length > shown ? ` (and ${all.length - shown} more below)` : "";
  return {
    type: "Error",
    title: "The profile file was not imported",
    message: all.slice(0, shown).join(" ") + more,
  };
};

export const exportResultNotice = (res) => {
  if (!res?.success) return { type: "Error", title: "Export failed", message: res?.error || "Unknown error." };
  const warnings = list(res.warnings);
  if (warnings.length) {
    return {
      type: "Warning",
      title: "Shop profile exported",
      message: `${res.path} - but it would not import back as it is: ${warnings.join(" ")}`,
    };
  }
  return { type: "Success", title: "Shop profile exported", message: res.path };
};
