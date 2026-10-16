import { withTimeout } from "@/utils/ipcWithTimeout";

// PrintFactory Cloud (read-only). The key goes in through setKey and is never handed back:
// hasKey only says whether one is set on this station.
export const hasCloudKey = () =>
  withTimeout(window.api.cloud.hasKey(), 5_000, "cloud:has-key");
export const setCloudKey = (key) =>
  withTimeout(window.api.cloud.setKey(key), 5_000, "cloud:set-key");
export const clearCloudKey = () =>
  withTimeout(window.api.cloud.clearKey(), 5_000, "cloud:clear-key");
// Two Cloud calls over the internet.
export const testCloudKey = (key) =>
  withTimeout(window.api.cloud.test(key), 60_000, "cloud:test");
// The first read after the app starts walks a week of jobs (~150 requests, about 5 s measured
// on the shop's connection); later ones come from main's cache.
export const getCloudDayMetres = () =>
  withTimeout(window.api.cloud.getDayMetres(), 180_000, "cloud:get-day-metres");
