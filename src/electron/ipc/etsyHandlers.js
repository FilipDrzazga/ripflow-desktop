import { ipcMain, safeStorage, BrowserWindow } from "electron";
import Store from "electron-store";
import { toIpcError } from "../helpers/ipcError.js";
import { createEtsyCredentials } from "../helpers/etsyCredentials.js";
import { createEtsyClient } from "../helpers/etsyApi.js";
import { createPkce, buildConnectUrl, parseRedirect, ETSY_REDIRECT_URI } from "../helpers/etsyOAuth.js";
import { openEtsyConnectWindow } from "../helpers/etsyConnectWindow.js";

// Settings -> Etsy (plan E2): this station's key, the sign-in and "Test connection". Nothing
// here touches the shared database or the shop profile - the connection is the station's own.
// Every answer carries the public status (etsyCredentials.status: no secret in it), so the
// view redraws from what main holds, never from what it asked for.

let credentials = null;
let client = null;

const parts = () => {
  if (!credentials) {
    credentials = createEtsyCredentials({
      store: new Store({ name: "etsy" }),
      crypt: {
        available: () => safeStorage.isEncryptionAvailable(),
        encrypt: (text) => safeStorage.encryptString(text).toString("base64"),
        decrypt: (stored) => safeStorage.decryptString(Buffer.from(stored, "base64")),
      },
    });
    client = createEtsyClient({ credentials, fetch: (...args) => fetch(...args) });
  }
  return { credentials, client };
};

const answer = (extra = {}) => ({ success: true, status: parts().credentials.status(), redirectUri: ETSY_REDIRECT_URI, ...extra });

const failure = (error, stage, title) => {
  let status = null;
  try {
    status = parts().credentials.status();
  } catch {
    status = null;
  }
  return { success: false, errors: [toIpcError(error, stage, title)], status, redirectUri: ETSY_REDIRECT_URI };
};

const cancelled = (message) => Object.assign(new Error(message), { code: "ETSY_SIGN_IN_CANCELLED", type: "Warning", title: "Etsy" });

// One sign-in window at a time: a second Connect while the first is open gets the same answer.
let pendingConnect = null;

const connect = async (parent) => {
  const { credentials: creds, client: api } = parts();
  if (!creds.secrets()) {
    throw Object.assign(new Error("Enter and save the Etsy keystring and shared secret first."), { code: "ETSY_NO_KEY", title: "Etsy" });
  }
  const pkce = createPkce();
  const url = buildConnectUrl({ keystring: creds.secrets().keystring, challenge: pkce.challenge, state: pkce.state });
  const result = await openEtsyConnectWindow({ url, parent });
  if (result.cancelled) throw cancelled("The Etsy window was closed before signing in finished.");
  if (result.timedOut) throw cancelled("Signing in to Etsy took longer than 10 minutes and was stopped.");
  const redirect = parseRedirect(result.redirect, pkce.state);
  if (redirect.error) {
    throw Object.assign(new Error(redirect.description), { code: `ETSY_${redirect.error.toUpperCase()}`, title: "Etsy" });
  }
  api.forgetToken();
  return api.completeSignIn({ code: redirect.code, verifier: pkce.verifier });
};

export function registerEtsyHandlers() {
  ipcMain.handle("etsy:status", () => {
    try {
      return answer();
    } catch (error) {
      return failure(error, "status", "Etsy status failed");
    }
  });

  ipcMain.handle("etsy:saveKey", (_event, key) => {
    try {
      parts().client.forgetToken();
      parts().credentials.saveKey(key ?? {});
      return answer();
    } catch (error) {
      return failure(error, "save-key", "Saving the Etsy key failed");
    }
  });

  ipcMain.handle("etsy:connect", async (event) => {
    if (!pendingConnect) {
      const parent = BrowserWindow.fromWebContents(event.sender);
      pendingConnect = connect(parent)
        .then((shop) => answer({ shop }))
        .catch((error) => failure(error, "connect", "Connecting to Etsy failed"))
        .finally(() => {
          pendingConnect = null;
        });
    }
    return pendingConnect;
  });

  ipcMain.handle("etsy:test", async () => {
    try {
      return answer({ test: await parts().client.testConnection() });
    } catch (error) {
      return failure(error, "test", "Etsy connection test failed");
    }
  });

  ipcMain.handle("etsy:disconnect", () => {
    try {
      parts().client.forgetToken();
      parts().credentials.disconnect();
      return answer();
    } catch (error) {
      return failure(error, "disconnect", "Disconnecting Etsy failed");
    }
  });

  ipcMain.handle("etsy:removeKey", () => {
    try {
      parts().client.forgetToken();
      parts().credentials.removeKey();
      return answer();
    } catch (error) {
      return failure(error, "remove-key", "Removing the Etsy key failed");
    }
  });
}
