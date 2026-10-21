import { withTimeout } from "@/utils/ipcWithTimeout";

// Settings -> Etsy (plan E2). Every answer: { success, status, redirectUri, errors? } - status
// is the public view of this station's connection (no secret in it).
export const getEtsyStatus = () => withTimeout(window.api.etsy.status(), 10_000, "etsy:status");
export const saveEtsyKey = (keystring, sharedSecret) =>
  withTimeout(window.api.etsy.saveKey({ keystring, sharedSecret }), 10_000, "etsy:saveKey");
// no timeout - the operator signs in at their own pace (main stops the window after 10 min)
export const connectEtsy = () => window.api.etsy.connect();
// 30s: two requests to Etsy plus, at most once an hour, a token refresh
export const testEtsyConnection = () => withTimeout(window.api.etsy.test(), 30_000, "etsy:test");
export const disconnectEtsy = () => withTimeout(window.api.etsy.disconnect(), 10_000, "etsy:disconnect");
export const removeEtsyKey = () => withTimeout(window.api.etsy.removeKey(), 10_000, "etsy:removeKey");
