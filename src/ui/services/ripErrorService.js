import { withTimeout } from "@/utils/ipcWithTimeout";

// scan triggers a folder read + parse in main; get is a cheap DB read.
export const scanRipErrors = () =>
  withTimeout(window.api.ripErrors.scan(), 15_000, "rip-errors:scan");
export const getRipErrors = () =>
  withTimeout(window.api.ripErrors.get(), 5_000, "rip-errors:get");
