// ETAP 4 (4-power): pause the renderer's polls while the station sleeps or sits at the lock screen.
//
// Why: every 30 s the renderer reads the shared database and the SMB share (stages, open reprints,
// the inbox, RIP errors, Batch History). A locked station on the shop floor does that all night for
// nobody. And after a sleep the timers fire at once, while Wi-Fi / the SMB session is still coming
// back - the reads fail and raise the "Database unavailable" and "Can't check the inbox" signals for
// a problem that is only the wake-up. So:
//   paused = suspended OR locked OR within RESUME_GRACE_MS after a resume
// The grace applies to a resume only - an unlock without a sleep has a live network.
// The renderer is told on a TRANSITION only (like db:error / db:recovered); the polls restart when
// the pause ends, and their next tick catches up (the stage polls read "since the last success").
//
// Pure apart from the injected emit and timers - main.js wires it to powerMonitor, the test fakes.

export const RESUME_GRACE_MS = 10000;
export const STARTUP_PROBE_MS = 20000;

// powerMonitor announces a lock only as an event, so a launch that happens while the screen is
// ALREADY locked (a relaunch after an update install) would poll until the first unlock/lock. Ask
// once at startup instead. A failing probe must never stop the app: it is a no-op plus a log line.
//
// On Windows getSystemIdleState reports "locked" for a locked workstation OR a running screensaver
// (Chromium idle_win.cc: IsWorkstationLocked() || IsScreensaverRunning()), and ending a screensaver
// sends no unlock-screen event. So a lock seen at startup has no event that is guaranteed to end it:
// it is re-probed (watchStartupLock) until the state is no longer "locked". Any lock-screen /
// unlock-screen event stops that probe - from then on the events rule.
// Returns true when it locked the pause.
export const applyStartupLock = (powerPause, getState, log = console.warn) => {
  let state;
  try {
    state = getState();
  } catch (err) {
    log(`[power] startup idle-state probe failed: ${err?.message ?? err}`);
    return false;
  }
  if (state !== "locked") return false;
  powerPause.lock();
  powerPause.watchStartupLock(getState, log);
  return true;
};

export const createPowerPause = ({
  emit,
  graceMs = RESUME_GRACE_MS,
  probeMs = STARTUP_PROBE_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) => {
  let suspended = false;
  let locked = false;
  let graceTimer = null;
  let probeTimer = null;
  let paused = false;

  const update = () => {
    const next = suspended || locked || graceTimer !== null;
    if (next === paused) return;
    paused = next;
    emit(paused);
  };

  const cancelGrace = () => {
    if (graceTimer !== null) clearTimer(graceTimer);
    graceTimer = null;
  };

  const stopProbe = () => {
    if (probeTimer !== null) clearTimer(probeTimer);
    probeTimer = null;
  };

  return {
    isPaused: () => paused,
    // Re-asks until the system is no longer "locked", then ends the pause (see applyStartupLock).
    // A throwing probe also ends it: fail open = the behaviour from before the startup lock existed.
    watchStartupLock: (getState, log = console.warn) => {
      stopProbe();
      const tick = () => {
        probeTimer = null;
        let state;
        try {
          state = getState();
        } catch (err) {
          log(`[power] startup lock re-probe failed, ending the pause: ${err?.message ?? err}`);
          state = null;
        }
        if (state === "locked") {
          probeTimer = setTimer(tick, probeMs);
          return;
        }
        locked = false;
        update();
      };
      probeTimer = setTimer(tick, probeMs);
    },
    // The answer to the renderer's startup question (power:get-paused): a window that loads or
    // reloads while the station is locked missed the transition event, so it asks once.
    snapshot: () => ({ paused }),
    suspend: () => {
      cancelGrace();
      suspended = true;
      update();
    },
    resume: () => {
      if (!suspended) return; // a resume without a suspend we saw: nothing to wait for
      suspended = false;
      cancelGrace();
      graceTimer = setTimer(() => {
        graceTimer = null;
        update();
      }, graceMs);
      update();
    },
    lock: () => {
      stopProbe();
      locked = true;
      update();
    },
    unlock: () => {
      stopProbe();
      locked = false;
      update();
    },
  };
};
