// Read-only fingerprint of a folder tree: every file's relative path, size and mtime, plus a
// sha256 of the files that matter (databases and configs). Used to PROVE that a run did not touch
// the user's real dev sandbox: the fingerprint taken before and after must be identical.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const HASHED = /\.(db|json)$/i;

const walk = (dir, base, out) => {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    out.errors.push(`${path.relative(base, dir) || "."}: ${err.code}`);
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, base, out);
      continue;
    }
    let stat;
    try {
      stat = fs.statSync(full);
    } catch (err) {
      out.errors.push(`${path.relative(base, full)}: ${err.code}`);
      continue;
    }
    const row = { path: path.relative(base, full), size: stat.size, mtimeMs: Math.round(stat.mtimeMs) };
    if (HASHED.test(entry.name) && stat.size < 256 * 1024 * 1024) {
      row.sha256 = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    }
    out.files.push(row);
  }
};

export const fingerprintTree = (root) => {
  const out = { root, exists: fs.existsSync(root), files: [], errors: [] };
  if (out.exists) walk(root, root, out);
  out.files.sort((a, b) => a.path.localeCompare(b.path));
  out.digest = crypto.createHash("sha256").update(JSON.stringify(out.files)).digest("hex");
  return out;
};

export const sameFingerprint = (a, b) => a.exists === b.exists && a.digest === b.digest;
