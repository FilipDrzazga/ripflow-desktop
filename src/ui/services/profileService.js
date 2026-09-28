import { withTimeout } from "@/utils/ipcWithTimeout";

export const getShopProfile = () =>
  withTimeout(window.api.profile.get(), 5_000, "profile:get");
export const setShopProfile = (profile) =>
  withTimeout(window.api.profile.set(profile), 30_000, "profile:set");

// ETAP 3-3. Export and preview wait on a file dialog - the operator may take minutes, so no
// timeout (same as selectFolder / selectCustomOrderCSV). Apply runs a full DB backup over SMB
// before the write, hence the long one.
export const exportShopProfile = () => window.api.profile.export();
export const previewShopProfileImport = () => window.api.profile.importPreview();
export const applyShopProfileImport = (token) =>
  withTimeout(window.api.profile.importApply(token), 120_000, "profile:importApply");
