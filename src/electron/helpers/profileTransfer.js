import { randomUUID } from "crypto";
import { getShopProfileRaw, getAllFileStages, dumpShopProfileBlob, backupDb } from "./db.js";
import { saveShopProfile } from "./saveShopProfile.js";
import { validateShopProfile } from "./validateShopProfile.js";
import { PROFILE_SCHEMA_VERSION } from "./migrateShopProfile.js";
import { PRODUCTION_STAGE } from "../../shared/constants.js";

// ETAP 3-3: the shop profile as a file ("the suitcase") - export, and import in two phases.
// The database stays the only live source; the file is transport for onboarding and a copy.
//
// The renderer never hands over a path or file content (rule 14): main opens the dialog, reads
// or writes the file, and keeps the validated candidate between PREVIEW and APPLY, bound to a
// token. The renderer only ever sends that token back - it cannot swap in a profile it was not
// shown. The dialogs and the file system are injected, so this module is tested with db.js
// mocked and nothing else (ipc/index.js is unreachable from a test).
//
// The import NEVER touches `fabrics` - the catalogue has its own path (setAllFabrics).

// A profile is about a kilobyte; anything this size is not one.
export const MAX_PROFILE_FILE_BYTES = 1024 * 1024;

const today = () => new Date().toISOString().slice(0, 10);

// ONE pending import per process: a second preview replaces the first, and apply consumes it
// whatever the outcome - after a refusal the diff shown is stale and must be computed again.
let pending = null;

// For tests only: forget a pending import between cases.
export const resetPendingImport = () => {
  pending = null;
};

const readStoredProfile = () => {
  const raw = getShopProfileRaw(); // throws when the DB cannot be read
  if (raw === null) return { raw: null, profile: null };
  return { raw, profile: JSON.parse(raw) };
};

// ── export ───────────────────────────────────────────────────────────────────
// The content is the database ROW, not this station's cache: the cache is from startup and may
// be behind a save made elsewhere; the file must say what the shop actually runs on.
export const exportShopProfile = async ({ chooseSavePath, writeFile }) => {
  let stored;
  try {
    stored = readStoredProfile();
  } catch (err) {
    console.error("[profileTransfer] export: could not read the profile:", err);
    return { success: false, error: `Could not read the shop profile: ${err?.message ?? err}` };
  }
  if (!stored.profile) return { success: false, error: "The database has no shop profile to export." };

  const filePath = await chooseSavePath(`shop-profile-${today()}.json`);
  if (!filePath) return { success: true, canceled: true };
  try {
    await writeFile(filePath, JSON.stringify(stored.profile, null, 2) + "\n");
  } catch (err) {
    console.error("[profileTransfer] export: write failed:", err);
    return { success: false, error: `Could not write the file: ${err?.message ?? err}` };
  }
  // Exported as it is, but said out loud when this file would not import back.
  const { errors } = validateShopProfile(stored.profile, { schemaVersion: PROFILE_SCHEMA_VERSION });
  return { success: true, canceled: false, path: filePath, warnings: errors };
};

// ── import, phase 1: preview ─────────────────────────────────────────────────

const printerCodes = (p) => (Array.isArray(p?.printers) ? p.printers.map((x) => x?.code).filter(Boolean) : []);
const companies = (p) => (Array.isArray(p?.sewingCompanies) ? p.sewingCompanies.map((c) => String(c).trim()) : []);
const canonical = (value) =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v,
  );

// What changes between the stored profile and the candidate, in the terms an operator reads.
export const diffProfiles = (current, next) => {
  const changedSections = Object.keys(next).filter((k) => canonical(current?.[k]) !== canonical(next[k]));
  const before = printerCodes(current);
  const after = printerCodes(next);
  const beforeCompanies = companies(current);
  const afterCompanies = companies(next);
  const flags = Object.keys(next.features ?? {});
  const beforeRoles = (current?.scanRules ?? []).map((r) => r?.role);
  const afterRoles = (next.scanRules ?? []).map((r) => r?.role);
  return {
    changedSections,
    printersAdded: after.filter((c) => !before.includes(c)),
    printersRemoved: before.filter((c) => !after.includes(c)),
    sewingCompaniesAdded: afterCompanies.filter((c) => !beforeCompanies.includes(c)),
    sewingCompaniesRemoved: beforeCompanies.filter((c) => !afterCompanies.includes(c)),
    featuresTurnedOn: flags.filter((f) => next.features[f] === true && current?.features?.[f] !== true),
    featuresTurnedOff: flags.filter((f) => next.features[f] !== true && current?.features?.[f] === true),
    scanRolesRemoved: beforeRoles.filter((r) => r && !afterRoles.includes(r)),
  };
};

// What existing production data the change leaves without its configuration: rows of a printer
// that is no longer in the profile (no colour, no filter entry, no hotfolder for a regenerated
// XML), and files at a sewing company that is no longer listed. Counted from file_stages - the
// rows are not changed, only what the views make of them.
export const importImpact = (diff, stageRows) => {
  const rows = Array.isArray(stageRows) ? stageRows : [];
  const byRemovedPrinter = Object.fromEntries(diff.printersRemoved.map((c) => [c, 0]));
  const atRemovedCompany = Object.fromEntries(diff.sewingCompaniesRemoved.map((c) => [c, 0]));
  for (const r of rows) {
    const printer = typeof r?.printer === "string" ? r.printer.toUpperCase() : null;
    if (printer && printer in byRemovedPrinter) byRemovedPrinter[printer] += 1;
    const company = typeof r?.sewing_company === "string" ? r.sewing_company.trim() : null;
    if (company && company in atRemovedCompany && r.stage === PRODUCTION_STAGE.TO_SEWING) atRemovedCompany[company] += 1;
  }
  return { stageRowsCounted: rows.length, byRemovedPrinter, atSewingByRemovedCompany: atRemovedCompany };
};

export const previewShopProfileImport = async ({ chooseOpenPath, readFile, statSize }) => {
  pending = null;
  const filePath = await chooseOpenPath();
  if (!filePath) return { success: true, canceled: true };

  let text;
  try {
    const size = await statSize(filePath);
    if (size > MAX_PROFILE_FILE_BYTES) {
      return { success: true, canceled: false, valid: false, errors: [`The file is ${size} bytes - a shop profile is a few kilobytes.`] };
    }
    text = await readFile(filePath);
  } catch (err) {
    return { success: false, error: `Could not read the file: ${err?.message ?? err}` };
  }

  let candidate;
  try {
    candidate = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (err) {
    return { success: true, canceled: false, valid: false, errors: [`The file is not valid JSON: ${err.message}`] };
  }

  // A file older than this build but not older than the first exported version would be migrated
  // up here (migrateShopProfile STEPS). With v3 the only exportable version there is nothing to
  // run; the validator refuses every other version with its own message.
  const { ok, errors } = validateShopProfile(candidate, { schemaVersion: PROFILE_SCHEMA_VERSION });
  if (!ok) return { success: true, canceled: false, valid: false, errors };

  let stored;
  try {
    stored = readStoredProfile();
  } catch (err) {
    return { success: false, error: `Could not read the current shop profile: ${err?.message ?? err}` };
  }
  const diff = diffProfiles(stored.profile, candidate);
  const impact = importImpact(diff, getAllFileStages());
  const token = randomUUID();
  pending = { token, candidate };
  return {
    success: true,
    canceled: false,
    valid: true,
    token,
    fileName: filePath.split(/[/\\]/).pop(),
    unchanged: diff.changedSections.length === 0,
    diff,
    impact,
  };
};

// ── import, phase 2: apply ───────────────────────────────────────────────────
// 1. the pre-import dump of the stored row - a HARD precondition, like the migration's: without a
//    local copy of what is being replaced there is no way back, so nothing is replaced;
// 2. a full database backup - best effort (it runs over SMB and may fail; the dump already holds
//    the one thing that changes);
// 3. the write through saveShopProfile - the compare-and-swap of 3-1, so an import cannot put a
//    profile over one another station saved after this one loaded. It reloads the cache.
export const applyShopProfileImport = async (token, { workstation }) => {
  const taken = pending;
  pending = null;
  if (!taken || typeof token !== "string" || token !== taken.token) {
    return { success: false, error: "This import is no longer pending. Choose the file again." };
  }

  let raw;
  try {
    raw = getShopProfileRaw();
  } catch (err) {
    return { success: false, error: `Could not read the current shop profile: ${err?.message ?? err}` };
  }
  if (raw === null) return { success: false, error: "The database has no shop profile row. Restart the app before importing." };

  const dump = dumpShopProfileBlob(raw, `${PROFILE_SCHEMA_VERSION}-import`);
  if (!dump?.success) {
    return { success: false, error: `Nothing imported: the copy of the current profile could not be saved (${dump?.error}).` };
  }

  let backup;
  try {
    backup = await backupDb(true);
  } catch (err) {
    backup = { success: false, error: err?.message ?? String(err) };
  }

  const saved = saveShopProfile(taken.candidate, workstation);
  return {
    ...saved,
    dumpPath: dump.path,
    backup: backup?.success ? { success: true, path: backup.path } : { success: false, error: backup?.error ?? "unknown" },
  };
};
