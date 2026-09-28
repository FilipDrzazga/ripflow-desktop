// Settings -> Shop Profile (ETAP 3-4): what the view SAYS, as pure functions - the read-only
// summary of the profile, the confirm text of an import and the notices after export / import.
// Pure for the same reason as shopProfileData.js: the renderer has no rendering harness, so this
// is the only cut of the view that can carry a test. The view itself only wires them to the store,
// the services and notify.

import { PROFILE_CHANGED } from "../../shared/constants";

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

// profile -> [{ title, rows: string[] }], in the order the view shows them. null -> [] (the view
// says the profile could not be read; it never shows a guessed one). Shows what is THERE, even a
// malformed row - this is a window onto the stored profile, not a validator.
export const profileSections = (profile) => {
  if (!profile || typeof profile !== "object") return [];
  const features = profile.features && typeof profile.features === "object" ? profile.features : {};
  const folders = profile.folders && typeof profile.folders === "object" ? profile.folders : {};
  const handle = profile.integrations?.shopify?.storeHandle;
  return [
    {
      title: "Printers",
      rows: list(profile.printers).map((p) => `${text(p?.code)} - ${text(p?.materialClass)}, hotfolder ${text(p?.hotfolder)}`),
    },
    {
      title: "Material classes",
      rows: list(profile.materialClasses).map(
        (c) => `${text(c?.name)} - margin ${text(c?.margin)} mm, default roll width ${text(c?.defaultRollWidth)} mm`,
      ),
    },
    {
      title: "Product types",
      rows: list(profile.productTypes).map((t) => `${text(t?.code)} - ${text(t?.width)} x ${text(t?.height)} mm`),
    },
    { title: "Folders", rows: Object.entries(folders).map(([k, v]) => `${k}: ${text(v)}`) },
    {
      title: "Scanner rules",
      rows: list(profile.scanRules).map(
        (r) => `${text(r?.role)}: ${text(r?.from)} -> ${text(r?.to)}${r?.notifyWhenEmpty === false ? " (silent when nothing to move)" : ""}`,
      ),
    },
    { title: "Sewing companies", rows: list(profile.sewingCompanies).map(text) },
    { title: "Shopify store", rows: [handle ? String(handle) : "not set"] },
    { title: "Features", rows: Object.keys(FEATURE_LABELS).map((f) => `${featureLabel(f)}: ${features[f] === true ? "on" : "off"}`) },
  ];
};

// The native confirm text for a VALID preview (profile:importPreview). Plain text - showConfirm
// renders no markup. The consequences come first, the safety net and the restart note last.
export const importConfirmMessage = (preview) => {
  const d = preview?.diff ?? {};
  const impact = preview?.impact ?? {};
  const lines = [`Import the shop profile from "${preview?.fileName ?? "the file"}"?`, ""];
  if (preview?.stationStale) {
    lines.push(
      "WARNING: the profile on this station is older than the one in the database (another station saved it). The import will be refused - restart this station first.",
      "",
    );
  }
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
  message: `The shop profile was changed on another station after this one loaded it. Restart this station, then import "${preview?.fileName ?? "the file"}" again. Nothing was changed.`,
});

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
