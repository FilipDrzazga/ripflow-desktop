import { useState } from "react";
import { useStore } from "../store/useStore";
import { previewShopProfileImport, applyShopProfileImport } from "../services/profileService";
import { showConfirm } from "../services/systemService";
import { notify } from "@/utils/notify";
import { importConfirmMessage, staleImportNotice, importResultNotice, importErrorsNotice } from "@/utils/shopProfileView";

// The shop-profile file import - two-phase: main opens the dialog and previews, the operator confirms
// the diff, main applies with the token (see .claude/rules/shop-profile.md). ONE implementation for
// Settings > Shop Profile and the first-run wizard (ETAP 4, 4-wizard) - two copies would drift apart
// the first time the import changes.
// -> { importing, importErrors, runImport }
export const useProfileImport = () => {
  const loadShopProfile = useStore((s) => s.loadShopProfile);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState([]);

  const runImport = async () => {
    setImporting(true);
    setImportErrors([]);
    try {
      const preview = await previewShopProfileImport();
      if (preview?.canceled) return;
      if (!preview?.success) {
        notify({ type: "Error", title: "Import failed", message: preview?.error || "Unknown error." });
        return;
      }
      if (!preview.valid) {
        setImportErrors(preview.errors ?? []);
        notify(importErrorsNotice(preview.errors));
        return;
      }
      if (preview.unchanged) {
        notify({ type: "Info", title: "Nothing to import", message: "The file holds the same profile as the database." });
        return;
      }
      if (preview.stationStale) {
        notify(staleImportNotice(preview));
        return;
      }
      if (!(await showConfirm(importConfirmMessage(preview)))) return;

      const res = await applyShopProfileImport(preview.token);
      // Main reloaded its cache whatever happened (the new profile, or the one that refused it);
      // loadShopProfile sets shopProfile + shopProfileStatus in ONE set() from that cache.
      await loadShopProfile();
      notify(importResultNotice(res));
    } catch (err) {
      // a timeout on apply: the write may or may not have landed - show what is there now
      await loadShopProfile();
      notify({ type: "Error", title: "Import failed", message: `${err?.message || "Unknown error."} The view now shows what the database holds.` });
    } finally {
      setImporting(false);
    }
  };

  return { importing, importErrors, runImport };
};
