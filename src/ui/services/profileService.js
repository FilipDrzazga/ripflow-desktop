import { withTimeout } from "@/utils/ipcWithTimeout";

export const getShopProfile = () =>
  withTimeout(window.api.profile.get(), 5_000, "profile:get");
export const setShopProfile = (profile) =>
  withTimeout(window.api.profile.set(profile), 30_000, "profile:set");
