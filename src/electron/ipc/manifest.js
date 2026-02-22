import fs from "node:fs/promises";
import path from "node:path";

/**
 * Manifest status enum (doc)
 * CREATED | PRODUCTIZE_RUNNING | PRODUCTIZE_DONE | NESTING_RUNNING | NESTED | ERROR
 */

export const MANIFEST_FILE = "manifest.json";

export async function readManifest(batchRoot) {
  const manifestPath = path.join(batchRoot, MANIFEST_FILE);
  const raw = await fs.readFile(manifestPath, "utf-8");
  return JSON.parse(raw);
}

export async function writeManifest(batchRoot, manifest) {
  const manifestPath = path.join(batchRoot, MANIFEST_FILE);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  return manifest;
}

// simple deep merge for plain objects
function deepMerge(target, patch) {
  if (patch == null || typeof patch !== "object" || Array.isArray(patch)) return target;

  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      target[k] = deepMerge(target[k] && typeof target[k] === "object" ? target[k] : {}, v);
    } else {
      target[k] = v;
    }
  }
  return target;
}

/**
 * updateManifest(batchRoot, patch)
 * - reads manifest.json
 * - deep merges "patch"
 * - writes back
 */
export async function updateManifest(batchRoot, patch) {
  const manifest = await readManifest(batchRoot);
  const updated = deepMerge({ ...manifest }, patch);
  await writeManifest(batchRoot, updated);
  return updated;
}

/**
 * appendEvent(batchRoot, { type, note, at? })
 * - pushes an event entry into manifest.events
 */
export async function appendEvent(batchRoot, event) {
  const manifest = await readManifest(batchRoot);
  const next = {
    at: event?.at ?? new Date().toISOString(),
    type: String(event?.type ?? "INFO"),
    note: event?.note != null ? String(event.note) : "",
  };

  const events = Array.isArray(manifest.events) ? manifest.events : [];
  manifest.events = [...events, next];

  await writeManifest(batchRoot, manifest);
  return manifest;
}

// Usage examples (anywhere in Electron main process)
// import { updateManifest, appendEvent } from "./manifest.js";

// // set status:
// await updateManifest(batchRoot, {
//   status: "PRODUCTIZE_RUNNING",
// });

// // add an event:
// await appendEvent(batchRoot, {
//   type: "PRODUCTIZE_RUNNING",
//   note: "Sent batch to PRODUCTIZE flow",
// });

// // nested done:
// await updateManifest(batchRoot, { status: "NESTED" });
// await appendEvent(batchRoot, { type: "NESTED", note: "Nesting completed" });
