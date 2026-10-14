import { withTimeout } from "@/utils/ipcWithTimeout";

// scan triggers a folder read + parse in main; get is a cheap DB read.
export const scanRipErrors = () =>
  withTimeout(window.api.ripErrors.scan(), 15_000, "rip-errors:scan");
export const getRipErrors = () =>
  withTimeout(window.api.ripErrors.get(), 5_000, "rip-errors:get");
// Manual resolve — a single guarded UPDATE, so it shares the cheap DB-read timeout.
export const resolveRipError = (fileId) =>
  withTimeout(window.api.ripErrors.resolve(fileId), 5_000, "rip-errors:resolve");
// Manual resolve of a whole-batch failure: every open row of the job (rip_errors.job_guid).
export const resolveRipErrorJob = (jobGuid) =>
  withTimeout(window.api.ripErrors.resolveJob(jobGuid), 5_000, "rip-errors:resolveJob");
