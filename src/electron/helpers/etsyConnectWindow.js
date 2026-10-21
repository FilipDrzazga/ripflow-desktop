import { BrowserWindow, session } from "electron";
import { isRedirect } from "./etsyOAuth.js";

// The Etsy sign-in page in a window of its own. Etsy redirects to ETSY_REDIRECT_URI (https,
// nothing listens there); the window catches that request BEFORE it is sent - webRequest for
// the request itself, will-redirect for the 302 - and hands the address back. The page runs in
// an in-memory session ("etsy-connect", no "persist:" prefix): no Etsy cookie stays on the
// station after RipFlow closes, and nothing of the RipFlow window (preload, storage) is shared.
//
// Resolves with { redirect } | { cancelled: true } | { timedOut: true }. Never rejects.
const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000;

export const openEtsyConnectWindow = ({ url, parent }) =>
  new Promise((resolve) => {
    const ses = session.fromPartition("etsy-connect");
    const win = new BrowserWindow({
      parent: parent ?? undefined,
      modal: !!parent,
      width: 520,
      height: 760,
      title: "Connect to Etsy",
      autoHideMenuBar: true,
      webPreferences: { session: ses, contextIsolation: true, nodeIntegration: false, sandbox: true },
    });

    let done = false;
    const finish = (answer) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      ses.webRequest.onBeforeRequest(null);
      resolve(answer);
      if (!win.isDestroyed()) win.close();
    };

    const timer = setTimeout(() => finish({ timedOut: true }), SIGN_IN_TIMEOUT_MS);

    ses.webRequest.onBeforeRequest((details, callback) => {
      if (isRedirect(details.url)) {
        callback({ cancel: true });
        finish({ redirect: details.url });
        return;
      }
      callback({});
    });
    win.webContents.on("will-redirect", (event, address) => {
      if (!isRedirect(address)) return;
      event.preventDefault();
      finish({ redirect: address });
    });
    // No pop-ups out of the sign-in page.
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.on("closed", () => finish({ cancelled: true }));

    win.loadURL(url).catch(() => {
      // A load aborted by the caught redirect lands here too; finish() already ran then.
    });
  });
