// ESM resolve hook: swaps two leaf modules for deterministic stubs so the harness
// exercises the REAL createXML.js / parseFileName.js without a database or
// electron-store. Nothing else is intercepted.
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const STUBS = new Map([
  ["db.js", pathToFileURL(path.join(here, "stub-db.mjs")).href],
  ["getSettings.js", pathToFileURL(path.join(here, "stub-settings.mjs")).href],
]);

export async function resolve(specifier, context, next) {
  const base = specifier.split("/").pop();
  if (specifier.startsWith(".") && STUBS.has(base)) {
    return { url: STUBS.get(base), shortCircuit: true };
  }
  return next(specifier, context);
}
