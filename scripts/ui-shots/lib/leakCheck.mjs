// The leak check of the designer pack (build-pack.mjs). PNGs cannot be searched for text, so the INPUTS of the demo are
// searched instead for every line of a denylist (real client / shop / server names).
//
// Inputs are the whole scripts/ui-shots tree (the scenarios TYPE the text that ends up in the screenshots) plus a list of
// explicit demo inputs. An explicit input that does not exist is reported as `missing`, never skipped: a leak check that
// quietly shrinks when a path goes stale (D25) says "0 hits" about less than it claims.
import fs from "node:fs";
import path from "node:path";

const isTestFile = (name) => /\.test\.js$/.test(name);

// Every file under `root`, recursively. *.test.js is left out on purpose: the refusal test of demoPaths keeps a denylisted drive path in it.
export const walkFiles = (root) => {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full));
    else if (entry.isFile() && !isTestFile(entry.name)) files.push(full);
  }
  return files;
};

const listManifests = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^manifest-.*\.json$/.test(f)).map((f) => path.join(dir, f)) : [];

// treeRoot: the scripts/ui-shots folder; explicit: files that must exist; manifestsDir: where manifest-*.json live
// (at least one is required). Returns { inputs, missing, hits } - the caller fails on any missing or hit.
export const runLeakCheck = ({ treeRoot, explicit, manifestsDir, deny }) => {
  const missing = [];
  const files = [];
  if (fs.existsSync(treeRoot)) files.push(...walkFiles(treeRoot));
  else missing.push(treeRoot);
  for (const file of explicit) {
    if (fs.existsSync(file)) files.push(file);
    else missing.push(file);
  }
  const manifests = listManifests(manifestsDir);
  if (manifests.length === 0) missing.push(path.join(manifestsDir, "manifest-*.json"));
  files.push(...manifests);

  const inputs = [...new Set(files)];
  const label = (file) => (path.relative(treeRoot, file).startsWith("..") ? path.basename(file) : path.relative(treeRoot, file));
  const hits = [];
  for (const file of inputs) {
    const text = fs.readFileSync(file).toString("latin1").toLowerCase();
    for (const word of deny) if (text.includes(word.toLowerCase())) hits.push(`${label(file)}: "${word}"`);
  }
  return { inputs, missing, hits };
};
