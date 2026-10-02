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

export const createPowerPause = ({ emit, graceMs = RESUME_GRACE_MS, setTimer = setTimeout, clearTimer = clearTimeout }) => {
  let suspended = false;
  let locked = false;
  let graceTimer = null;
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

  return {
    isPaused: () => paused,
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
      locked = true;
      update();
    },
    unlock: () => {
      locked = false;
      update();
    },
  };
};
