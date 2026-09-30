import { useStore } from "../store/useStore";
import { notify } from "./notify";

// The bulk Unhold as the operator starts it - from the context menu of a selected held file.
// Success for the released files, Warning for the ones that failed (they stay selected - "try
// again" is one click away).
export const runBulkUnhold = async () => {
  const { done, failed } = await useStore.getState().unholdSelectedFiles();
  const plural = (n) => (n === 1 ? "1 file" : `${n} files`);
  if (done.length > 0) {
    notify(
      { type: "Success", title: "Files released", message: `${plural(done.length)} taken off hold.` },
      { stage: "app", code: "BULK_UNHOLD", detail: { count: done.length } },
    );
  }
  if (failed.length > 0) {
    notify(
      {
        type: "Warning",
        title: "Some files are still on hold",
        message: `${plural(failed.length)} could not be released - check the connection to the shared database and try again. They are still selected.`,
      },
      { stage: "app", code: "BULK_UNHOLD_FAILED", detail: { failed } },
    );
  }
  return { done, failed };
};
