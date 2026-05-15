export const toIpcError = (error, stage, fallbackTitle = "Operation failed") => ({
  code: error.code || "UNKNOWN_ERROR",
  message: error.message || "An unknown error occurred.",
  stage: error.stage || stage || "unknown",
  type: error.type || "Error",
  title: error.title || fallbackTitle,
});
