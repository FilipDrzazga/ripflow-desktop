import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "./store/useStore";
import "./styles/global.css";
import styles from "./App.module.css";
import DataList from "./components/DataList/DataList";
import DataFilters from "./components/DataFilters/DataFilters";
import StartupLoader from "./components/StartupLoader/StartupLoader";
import DataPrintSelection from "./components/DataPrintSelection/DataPrintSelection";
import DataOverviewSection from "./components/DataOverviewSection/DataOverviewSection";
import AlertsHost from "./components/AlertsHost/AlertsHost";
import NavBar from "./components/NavBar/NavBar";
import TitleBar from "./components/TitleBar/TitleBar";
import BatchHistory from "./components/BatchHistory/BatchHistory";
import SessionLogs from "./components/SessionLogs/SessionLogs";
import Settings from "./components/Settings/Settings";
import Analytics from "./components/Analytics/Analytics";
import ErrorBoundary from "./components/ErrorBoundary/ErrorBoundary";
import CustomOrder from "./components/CustomOrder/CustomOrder";
import Production from "./components/Production/Production";
import { onDbError, onDbRecovered, onPrintedRootUnreachable, onPrintedRootReachable, onPowerPaused } from "./services/systemService";
import { isFeatureEnabled, isViewEnabled } from "./utils/featureVisibility";
import { isProfileUnconfigured } from "./utils/shopProfileData";
import { reloadResultNotice } from "./utils/shopProfileView";
import InboxWatchPill from "./components/InboxWatchPill/InboxWatchPill";
import { PROFILE_STATUS } from "./utils/profileStatus";
import { notify } from "./utils/notify";
import { getSettings } from "./services/settingsService";
import { missingRequiredPaths } from "../shared/requiredPaths";
import SetupWizard from "./components/SetupWizard/SetupWizard";

const RIP_ERROR_POLL_INTERVAL = 30_000;
const INBOX_WATCH_INTERVAL = 30_000;

const App = () => {
  const refreshFiles = useStore((state) => state.refreshFiles);
  const probePrintedRoot = useStore((state) => state.probePrintedRoot);
  const loadLogsFromDb = useStore((state) => state.loadLogsFromDb);
  const loadHeldFiles = useStore((state) => state.loadHeldFiles);
  const loadReasonDefinitions = useStore((state) => state.loadReasonDefinitions);
  const loadFabricConfig = useStore((state) => state.loadFabricConfig);
  const loadShopProfile = useStore((state) => state.loadShopProfile);
  const loadRipErrors = useStore((state) => state.loadRipErrors);
  const loadAllStages = useStore((state) => state.loadAllStages);
  const loadAllStageHistory = useStore((state) => state.loadAllStageHistory);
  const loadStagesAfter = useStore((state) => state.loadStagesAfter);
  const loadOpenReprints = useStore((state) => state.loadOpenReprints);
  const shopProfile = useStore((state) => state.shopProfile);
  const shopProfileStatus = useStore((state) => state.shopProfileStatus);
  const dbDegraded = useStore((state) => state.dbDegraded);
  const setDbDegraded = useStore((state) => state.setDbDegraded);
  const pollingPaused = useStore((state) => state.pollingPaused);
  const setPollingPaused = useStore((state) => state.setPollingPaused);
  const checkDbDegraded = useStore((state) => state.checkDbDegraded);
  const printedRootUnreachable = useStore((state) => state.printedRootUnreachable);
  const setPrintedRootUnreachable = useStore((state) => state.setPrintedRootUnreachable);
  const checkPrintedRoot = useStore((state) => state.checkPrintedRoot);
  const reloadShopData = useStore((state) => state.reloadShopData);
  const checkInbox = useStore((state) => state.checkInbox);
  const inboxNewCount = useStore((state) => state.inboxWatch.added.length);
  const [shopDataReloading, setShopDataReloading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState("print");
  // In the store, not local state (4-wizard-c): refreshFiles reads it to drop its own
  // "Paths not set" toast while the wizard is open.
  const showSetup = useStore((state) => state.setupWizardOpen);
  const setShowSetup = useStore((state) => state.setSetupWizardOpen);
  // Bumped when the wizard saves the paths: Settings (open behind it) read the settings once
  // on mount, so without a remount its views would keep the old, blank paths and their Save
  // would answer "Both paths are required" after "Set up later".
  const [settingsKey, setSettingsKey] = useState(0);
  // A profile that arrives late (or one that turns a feature off) can pull the view the
  // operator is standing on out from under them — send them back to "print" instead of
  // leaving a blank main area. Written during render, not in an effect: React re-runs
  // this render before committing, so the forbidden view is never painted at all, and
  // the guards on the two gated views below close the same hole structurally.
  if (!isViewEnabled(activeView, shopProfile)) setActiveView("print");
  // RIP errors have no NavBar tab to filter out — their entries are the per-file badge in
  // Production and BatchHistory, the batch-header counter, the popover behind those badges
  // and the print-view Attention chip. Read the WARNING on the gated effect below before
  // adding another one: an empty store.ripErrors is not a gate.
  const ripErrorsEnabled = isFeatureEnabled("ripErrors", shopProfile);
  const startupFinishedRef = useRef(false);
  const safetyTimerRef = useRef(null);
  // Watermark for the incremental stage poll below. Seeded at startup right after the
  // base loadAllStages(), so the 30s poll only pulls rows changed since then.
  const lastStagePollAt = useRef(null);

  // Idempotent startup teardown. Normal path: StartupLoader animates to 100% and calls
  // this via onDone. Safety net: the 30s timer below calls it if readFolders hangs on a
  // dead network mount (where progress=100 never fires). Whichever runs first wins.
  const finishStartup = useCallback(() => {
    if (startupFinishedRef.current) return;
    startupFinishedRef.current = true;
    clearTimeout(safetyTimerRef.current);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    // Hard safety net ONLY for a hung scan (dead O: mount). Generous 30s so a slow-but-
    // alive scan is never cut short. The happy path closes via StartupLoader → onDone.
    safetyTimerRef.current = setTimeout(finishStartup, 30000);

    const fetchFolders = async () => {
      // ETAP 2h-3: with no storage or XML path the main process refuses every path-based
      // call (getRootPath.js) and opens no database. Since ETAP 4 (4-wizard) the first-run
      // wizard says why and walks through paths -> profile -> folders; Settings opens behind
      // it, so "Set up later" lands where the paths are set (src/shared/requiredPaths.js).
      // Awaited before the inbox scan below (4-wizard-c), so the wizard flag is set before
      // the scan's "Paths not set" error arrives; the loads in between still run in parallel.
      const pathsCheck = getSettings()
        .then((res) => {
          if (res?.success && missingRequiredPaths(res.settings).length > 0) {
            setShowSetup(true);
            setActiveView("settings");
          }
        })
        .catch((err) => console.error("[startup] getSettings failed:", err));
      loadLogsFromDb();
      loadReasonDefinitions();
      loadFabricConfig();
      loadShopProfile();
      // loadRipErrors() is deliberately NOT here — see the gated effect below. At this
      // point loadShopProfile() has not resolved, so the flag would read fail-closed and
      // the scan would be skipped for the whole session.
      // Full base load of production data so the print-view overview bars have real
      // counts immediately (cheap SQLite reads, NOT SMB scans). The 30s poll below only
      // fetches incremental changes, so this initial full load is required — without it
      // the bars would show zeros until the first tick / a Production visit.
      loadAllStages();
      loadAllStageHistory();
      loadOpenReprints();
      lastStagePollAt.current = new Date().toISOString();
      checkDbDegraded();
      checkPrintedRoot();
      await pathsCheck;
      await loadHeldFiles();
      await refreshFiles({
        successTitle: "Folders loaded",
        successMessage: "The folder data has been successfully loaded.",
      });
      probePrintedRoot();
    };
    fetchFolders();

    return () => clearTimeout(safetyTimerRef.current);
  }, [refreshFiles, probePrintedRoot, loadLogsFromDb, loadHeldFiles, loadReasonDefinitions, loadFabricConfig, loadShopProfile, loadAllStages, loadAllStageHistory, loadOpenReprints, finishStartup, checkDbDegraded, checkPrintedRoot, setShowSetup]);

  // RIP-error scan + poll, gated on features.ripErrors. It sits in its own effect keyed on
  // the resolved flag rather than in the startup sequence above: the profile answers after
  // startup fires, so the initial scan has to wait for it, and keying on the flag means it
  // runs in the frame the profile arrives. This effect is the ONLY writer of
  // store.ripErrors, so gating it here keeps the map empty for a shop without the feature
  // and for a profile that could not be read at all.
  //
  // WARNING — the emptiness of that map is NOT the gate, it only looks like one. An empty
  // ripErrors means "feature off", "profile unreadable" AND "zero errors right now": one
  // value carrying three meanings, the exact trap as null vs [] elsewhere in this codebase.
  // It hides an entry only because every current consumer renders NOTHING at zero. Any new
  // UI entry that renders at zero — a counter, a tile, a dimmed pill, a filter tab, an
  // empty-state line — is visible to a client who did not buy the feature and MUST take its
  // own isFeatureEnabled("ripErrors", shopProfile) at its call site. The Attention chip
  // (utils/overviewBars.js alertsBarData) is the precedent for that, not an exception to it.
  useEffect(() => {
    // ETAP 4 (4-power): no poll while the station sleeps or is locked; the first load after
    // the pause runs at once, like at startup.
    if (!ripErrorsEnabled || pollingPaused) return;
    loadRipErrors();
    const id = setInterval(loadRipErrors, RIP_ERROR_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [ripErrorsEnabled, pollingPaused, loadRipErrors]);

  // Global 30s poll — keeps the print-view overview bar counts fresh session-wide,
  // independent of activeView. Production stages fetch incrementally via loadStagesAfter
  // (watermark advanced only on success, so a network failure retries the same window);
  // open reprints re-load in full (small set) so the count self-heals after a transient
  // startup failure and picks up mid-session rollbacks. Initial full loads fire in the
  // startup effect above.
  useEffect(() => {
    if (pollingPaused) return; // ETAP 4 (4-power); the watermark catches up on the next tick
    const id = setInterval(async () => {
      loadOpenReprints();
      if (lastStagePollAt.current) {
        const since = lastStagePollAt.current;
        const result = await loadStagesAfter(since);
        if (result?.success !== false) lastStagePollAt.current = new Date().toISOString();
      }
    }, RIP_ERROR_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [pollingPaused, loadStagesAfter, loadOpenReprints]);

  // ETAP 4 (4-inbox): the light look at the inbox every 30 s, session-wide (the NavBar counter
  // works from any view). Names only - it tells, it never refreshes the list (store.checkInbox).
  useEffect(() => {
    if (pollingPaused) return; // ETAP 4 (4-power)
    const id = setInterval(() => checkInbox(), INBOX_WATCH_INTERVAL);
    return () => clearInterval(id);
  }, [pollingPaused, checkInbox]);

  // ETAP 4 (4-power): main says when the station sleeps / locks and when it is back.
  useEffect(() => onPowerPaused((payload) => setPollingPaused(payload?.paused === true)), [setPollingPaused]);

  // DB degraded banner: main emits db:error/db:recovered only on state transition.
  useEffect(() => {
    const offError = onDbError(() => setDbDegraded(true));
    const offRecovered = onDbRecovered(() => setDbDegraded(false));
    return () => { offError?.(); offRecovered?.(); };
  }, [setDbDegraded]);

  // PRINTED root banner: same transition-only contract as the DB pair. Its own effect
  // rather than a second pair inside the one above, so neither subscription can be torn
  // down by a change in the other's dependency.
  useEffect(() => {
    const offUnreachable = onPrintedRootUnreachable(() => setPrintedRootUnreachable(true));
    const offReachable = onPrintedRootReachable(() => setPrintedRootUnreachable(false));
    return () => { offUnreachable?.(); offReachable?.(); };
  }, [setPrintedRootUnreachable]);

  return (
    <div className={styles.app}>
      <TitleBar />
      <AlertsHost />
      {dbDegraded && (
        <div className={styles.db_banner} role="alert">
          Database unavailable — changes may not be saved. Check the network connection.
        </div>
      )}
      {/* A missing PRINTED folder and an empty one render identically - "no batches".
          The banner is what tells the operator which of the two they are looking at.
          Suppressed while the DB banner is up: a dead NAS raises both, and the second
          line would carry no information the first one does not already carry. A PRINTED
          folder that is gone on a healthy share raises this one alone, which is the case
          nothing else in the app can show.

          THE WORDING NAMES BOTH CAUSES BECAUSE THE CODE CANNOT TELL THEM APART. access()
          answers ENOENT the same way for "the share is gone" and for "nothing has been
          printed on this installation yet", and nothing creates PRINTED before the first
          BatchHistory mount or the first submit - so a brand new client would be told to
          check a network that is perfectly healthy. Creating the folder at startup to
          silence it was REJECTED: the folder would come back empty, the batches would
          still be invisible, and access() would stop failing - trading a false alarm for
          silence in the very case this banner exists for. So the sentence is what
          changed, not the condition. */}
      {printedRootUnreachable && !dbDegraded && (
        <div className={styles.db_banner} role="alert">
          Printed folder not found — no batch history to show. Normal before the first print;
          otherwise the shared folder is unreachable.
        </div>
      )}
      {/* Reads the stored status, not the profile value. The !isLoading gate this
          replaces was a timing proxy for "the load has finished" — the status says so
          outright, and stays "loading" during startup instead of looking like failure. */}
      {shopProfileStatus === PROFILE_STATUS.FAILED && (
        <div className={styles.db_banner} role="alert">
          Shop profile could not be loaded — some features are hidden.
          {/* ETAP 4 (4-retry): the same reload as Settings > Shop Profile, no restart needed. */}
          <button
            className={styles.banner_btn}
            disabled={shopDataReloading}
            onClick={async () => {
              setShopDataReloading(true);
              try {
                notify(reloadResultNotice(await reloadShopData()));
              } finally {
                setShopDataReloading(false);
              }
            }}
          >
            {shopDataReloading ? "Retrying…" : "Retry"}
          </button>
        </div>
      )}
      {/* ETAP 3-6: a fresh install seeds an empty profile - no printer, every feature off. */}
      {shopProfileStatus === PROFILE_STATUS.LOADED && isProfileUnconfigured(shopProfile) && (
        <div className={styles.db_banner} role="alert">
          Shop profile not configured — nothing can be printed yet. Import the profile in Settings &gt; Shop Profile.
        </div>
      )}
      {isLoading && <StartupLoader onDone={finishStartup} />}
      {!isLoading && (
        <div className={styles.body}>
          <NavBar activeView={activeView} onViewChange={setActiveView} shopProfile={shopProfile} badges={{ print: inboxNewCount }} />
          <main className={styles.content}>
            {activeView === "print" && (
              <>
                <DataOverviewSection onNavigate={setActiveView} />
                <DataFilters />
                <InboxWatchPill />
                <ErrorBoundary>
                  <DataList />
                </ErrorBoundary>
              </>
            )}
            {activeView === "batch" && (
              <ErrorBoundary>
                <BatchHistory />
              </ErrorBoundary>
            )}
            {activeView === "analytics" && isViewEnabled("analytics", shopProfile) && (
              <ErrorBoundary>
                <Analytics />
              </ErrorBoundary>
            )}
            {activeView === "production" && (
              <ErrorBoundary>
                <Production />
              </ErrorBoundary>
            )}
            {activeView === "customOrder" && isViewEnabled("customOrder", shopProfile) && <CustomOrder />}
            {activeView === "logs" && <SessionLogs />}
            {activeView === "settings" && <Settings key={settingsKey} />}
          </main>
          <DataPrintSelection />
        </div>
      )}
      {showSetup && (
        <SetupWizard onClose={() => setShowSetup(false)} onPathsSaved={() => setSettingsKey((k) => k + 1)} />
      )}
    </div>
  );
};

export default App;
