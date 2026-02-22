import { toaster } from "../Toaster/Toaster";

function createToast({ type, title, description, duration = 4500 }) {
  toaster.create({
    type, // "success" | "error" | "warning" | "info"
    title,
    description,
    duration,
    closable: true,
  });
}

/** Produkuje user-friendly tekst na podstawie {code, userMessage, details} z IPC */
export function describeBatchError(res) {
  const code = res?.code;
  const userMessage = res?.userMessage;

  // If backend already provided a nice message, prefer it
  // (you can reverse this priority if you prefer strict mapping by code)
  let title = userMessage || "Something went wrong.";
  let description = code ? `Code: ${code}` : undefined;

  switch (code) {
    case "RIP_LOCKED":
      title = "Ripping is already running.";
      description = "Please wait until it finishes.";
      break;

    case "VALIDATION_NO_FILES":
      title = "No files selected.";
      description = "Please select at least one file.";
      break;

    case "VALIDATION_PRINTER_REQUIRED":
      title = "Printer not selected.";
      description = "Please select a printer.";
      break;

    case "VALIDATION_BAD_GROUP":
      title = "Invalid material group.";
      description = "Please try again.";
      break;

    case "VALIDATION_MISSING_SOURCE_PATH": {
      const n = res?.details?.missing?.length ?? 0;
      title = "Some files are missing a source path.";
      description = n ? `Problematic files: ${n}` : "Please refresh the list and try again.";
      break;
    }

    case "VALIDATION_SOURCE_NOT_FOUND": {
      const n = res?.details?.notFound?.length ?? 0;
      title = "Some source files could not be found.";
      description = n ? `Missing files: ${n}` : "Please check the source folder and try again.";
      break;
    }

    case "FS_PERMISSION":
      title = "Permission denied.";
      description = "You don’t have access to a file or folder required to create the batch.";
      break;

    case "FS_BUSY":
      title = "File is in use.";
      description = "Close the file in other programs and try again.";
      break;

    case "FS_NO_SPACE":
      title = "Not enough disk space.";
      description = "Free up space and try again.";
      break;

    case "FS_NOT_FOUND":
      title = "File or folder not found.";
      description = "A required file or folder could not be located.";
      break;

    case "FS_MKDIR_FAILED":
      title = "Failed to create batch folders.";
      description = "Check permissions and try again.";
      break;

    case "FS_MOVE_FAILED":
      title = "Failed to move a file.";
      description = "One of the files could not be moved into the batch folder.";
      break;

    case "MANIFEST_WRITE_FAILED":
      title = "Failed to write manifest.";
      description = "The batch was created but the manifest could not be saved.";
      break;

    case "UNKNOWN":
    default:
      // keep defaults (userMessage + code)
      break;
  }

  return { title, description };
}

export function notifyBatchError(res) {
  const { title, description } = describeBatchError(res);
  createToast({ type: "error", title, description, duration: 6000 });
}

export function notifyBatchWarning(title, description) {
  createToast({ type: "error", title, description, duration: 6000 });
}

export function notifyBatchSuccess(title, description) {
  createToast({ type: "success", title, description, duration: 6000 });
}
