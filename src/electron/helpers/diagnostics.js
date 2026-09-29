import path from "path";

// "Export diagnostics" (ETAP 4, 4-diag): one zip the operator saves and sends when something is
// wrong - what support needs to see WITHOUT a remote session. No telemetry: nothing leaves the
// machine unless the operator sends the file.
//
// What goes in (small, text only):
//   summary.json     - app / Electron / Node version, OS, station name and role, the per-machine
//                      settings (paths, not their contents), database state, profile version
//   access.json      - can this station READ the folders it works with: storage root, XML path,
//                      PRINTED, every printer hotfolder, the RIP-error and custom-order folders -
//                      a real directory listing (readdir), which goes through the share's
//                      permissions. Writing is reported as "not tested", honestly: fs.access(W_OK)
//                      on Windows looks only at the read-only attribute, not at the SMB permissions
//                      (Node docs), so it would say "ok" for a folder the station cannot write to;
//                      and a probe file is out of the question - PrintFactory watches the
//                      hotfolders and could pick one up as a job.
//   logs.json        - the last 500 log rows (the logs table is capped at 500)
//   shop-profile.json- the stored profile row as it is (the shop's own configuration)
// What does NOT go in: file contents, PDFs, the database file, anything from other stations.
//
// Pure apart from the injected `readDir` - the handler in ipc/index.js passes fs, the test a fake.

// The folders the station works with, each with where it comes from.
export const diagnosticTargets = ({ storagePath, xmlPath }, profile) => {
  const targets = [];
  const add = (label, p) => {
    if (typeof p === "string" && p.trim()) targets.push({ label, path: p });
  };
  add("storagePath", storagePath);
  add("xmlPath", xmlPath);
  if (typeof storagePath === "string" && storagePath.trim()) {
    const printed = profile?.folders?.printed || "PRINTED";
    add(`PRINTED (${printed})`, path.join(storagePath, printed));
    const seen = new Set();
    for (const p of Array.isArray(profile?.printers) ? profile.printers : []) {
      if (typeof p?.hotfolder !== "string" || !p.hotfolder || seen.has(p.hotfolder)) continue;
      seen.add(p.hotfolder);
      add(`hotfolder ${p.hotfolder} (${p.code ?? "?"})`, path.join(storagePath, p.hotfolder));
    }
    for (const key of ["ripError", "customOrder"]) {
      const name = profile?.folders?.[key];
      if (typeof name === "string" && name) add(`folders.${key} (${name})`, path.join(storagePath, name));
    }
  }
  return targets;
};

// readDir(path) -> Promise that resolves when the folder can be listed, rejects with the OS error
// otherwise. Nothing is written: `write` is always "not tested" (see the header).
export const checkAccess = async (targets, readDir) =>
  Promise.all(
    targets.map(async (t) => {
      try {
        await readDir(t.path);
        return { ...t, read: "ok", write: "not tested" };
      } catch (err) {
        return { ...t, read: err?.code || err?.message || String(err), write: "not tested" };
      }
    }),
  );

const json = (value) => JSON.stringify(value, null, 2) + "\n";

// -> [{ name, data }] for buildZip.
export const collectDiagnostics = async ({
  versions,
  settings,
  logs,
  profileRaw,
  dbOpen,
  dbDegraded,
  readDir,
  now = new Date(),
}) => {
  let profile = null;
  try {
    profile = profileRaw ? JSON.parse(profileRaw) : null;
  } catch {
    profile = null; // shipped as it is in shop-profile.json - summary says it did not parse
  }
  const accessResults = await checkAccess(diagnosticTargets(settings || {}, profile), readDir);
  const summary = {
    generatedAt: now.toISOString(),
    versions,
    workstation: { name: settings?.workstationName ?? null, role: settings?.workstationRole ?? null },
    settings: settings ?? null,
    database: { open: dbOpen, degraded: dbDegraded },
    shopProfile: profileRaw
      ? { schemaVersion: profile?.schemaVersion ?? "unreadable", printers: Array.isArray(profile?.printers) ? profile.printers.length : null }
      : null,
    folderProblems: accessResults.filter((r) => r.read !== "ok").map((r) => `${r.label}: cannot read (${r.read})`),
    logRows: Array.isArray(logs) ? logs.length : 0,
  };
  return [
    { name: "summary.json", data: json(summary) },
    { name: "access.json", data: json(accessResults) },
    { name: "logs.json", data: json(Array.isArray(logs) ? logs : []) },
    { name: "shop-profile.json", data: profileRaw ? String(profileRaw) : "null\n" },
  ];
};

export const diagnosticsFileName = (workstationName, now = new Date()) => {
  const station = String(workstationName || "station").replace(/[^A-Za-z0-9_-]/g, "_");
  return `ripflow-diagnostics-${station}-${now.toISOString().slice(0, 10)}.zip`;
};
