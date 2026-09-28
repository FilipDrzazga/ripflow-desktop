import { withTimeout } from "@/utils/ipcWithTimeout";

// 30s, not 5s (ETAP 4, 4-retry): at startup main is busy with synchronous SQLite work over SMB
// (sweepOrphanTemps, backupDb), and a 5s deadline marked a HEALTHY database's profile as failed
// for the whole session - PRODUCTIZATION case (c). getDbDegraded got the same deadline instead of
// none, so the two startup reads no longer disagree about how long to wait.
export const getShopProfile = () =>
  withTimeout(window.api.profile.get(), 30_000, "profile:get");
// Reopens the database when startup could not, then reloads both caches in main (4-retry).
// initDb on a share that is still gone can block for the SMB timeout, hence the long deadline.
export const reloadShopData = () =>
  withTimeout(window.api.shopData.reload(), 120_000, "shopData:reload");
export const setShopProfile = (profile) =>
  withTimeout(window.api.profile.set(profile), 30_000, "profile:set");

// ETAP 3-3. Export and preview wait on a file dialog - the operator may take minutes, so no
// timeout (same as selectFolder / selectCustomOrderCSV). Apply runs a full DB backup over SMB
// before the write, hence the long one.
export const exportShopProfile = () => window.api.profile.export();
export const previewShopProfileImport = () => window.api.profile.importPreview();
export const applyShopProfileImport = (token) =>
  withTimeout(window.api.profile.importApply(token), 120_000, "profile:importApply");
