// Pure pieces of the release script (scripts/release/release.mjs), kept apart so they run
// in a test without a build, a token or a network. See release.mjs for the why.
import crypto from "node:crypto";

// What electron-builder writes to dist/ for this productName (package.json "build").
export const localInstallerName = (version) => `RipFlow Desktop Setup ${version}.exe`;

// latest.yml in the one shape electron-builder writes for a single NSIS target. The
// updater reads `path` (hyphenated name) and checks `sha512` and `size` of the download.
export const readLatestYml = (text) => {
  const get = (key) => (String(text).match(new RegExp(`^${key}: *'?([^'\\r\\n]+)'?$`, "m")) || [])[1] ?? null;
  const size = (String(text).match(/^ +size: *(\d+)$/m) || [])[1];
  return { version: get("version"), path: get("path"), sha512: get("sha512"), size: size ? Number(size) : null };
};

// The copied installer must be the file latest.yml describes - else the updater on the
// stations rejects the download (or, worse, the checksums in the release are for
// another build).
export const verifyLatestYml = (yml, exeBuffer) => {
  const sha512 = crypto.createHash("sha512").update(exeBuffer).digest("base64");
  const problems = [];
  if (yml.sha512 !== sha512) problems.push("latest.yml sha512 does not match the installer");
  if (yml.size !== exeBuffer.length) problems.push(`latest.yml size ${yml.size} != installer ${exeBuffer.length} bytes`);
  return problems;
};

export const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

// Before building: every reason not to. A release must come from a clean tree at the
// tagged commit (1.0.22 had no tag, so nobody could say later what was in it), and must
// never overwrite an earlier copy of the same version.
export const buildPreconditions = ({ version, dirty, tagsAtHead, targetExists }) => {
  const problems = [];
  if (!/^\d+\.\d+\.\d+$/.test(String(version))) problems.push(`package.json version "${version}" is not x.y.z`);
  if (dirty) problems.push("the working tree is not clean - commit first");
  if (!tagsAtHead.includes(`v${version}`)) problems.push(`HEAD is not tagged v${version} - tag the bump commit first`);
  if (targetExists) problems.push("the release folder for this version already exists - nothing is overwritten");
  return problems;
};

// The GitHub release to create. PRE-release unless `full` is asked for explicitly: the
// installed 1.0.21+ has autoDownload + autoInstallOnAppQuit, so a FULL release reaches
// every station on its next app start + quit - before any pilot (2026-09-24).
export const releaseRequest = ({ version, body, full = false }) => ({
  tag_name: `v${version}`,
  name: version,
  body,
  draft: false,
  prerelease: !full,
});

// The three assets, local file -> the name the updater expects on GitHub.
export const assetPlan = (version, yml) => [
  { local: localInstallerName(version), remote: yml.path },
  { local: localInstallerName(version) + ".blockmap", remote: yml.path + ".blockmap" },
  { local: "latest.yml", remote: "latest.yml" },
];

// Create the release and upload the assets. `fetch` and `readFile` are passed in, so a
// test drives this with fakes and nothing leaves the machine.
export const publishRelease = async ({ repo, token, version, body, full, yml, readFile, fetch, log = () => {} }) => {
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "ripflow-release" };
  const api = `https://api.github.com/repos/${repo}`;

  const existing = await fetch(`${api}/releases/tags/v${version}`, { headers });
  if (existing.status !== 404) throw new Error(`a release for v${version} already exists (HTTP ${existing.status}) - stopping`);

  const res = await fetch(`${api}/releases`, { method: "POST", headers, body: JSON.stringify(releaseRequest({ version, body, full })) });
  const rel = await res.json();
  if (!res.ok) throw new Error(`creating the release failed: HTTP ${res.status}`);
  log(`created ${full ? "FULL release" : "pre-release"} ${rel.html_url}`);

  const uploadBase = String(rel.upload_url).replace(/\{.*$/, "");
  for (const a of assetPlan(version, yml)) {
    const data = readFile(a.local);
    const up = await fetch(`${uploadBase}?name=${encodeURIComponent(a.remote)}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/octet-stream", "Content-Length": String(data.length) },
      body: data,
    });
    if (!up.ok) throw new Error(`uploading ${a.remote} failed: HTTP ${up.status}`);
    log(`uploaded ${a.remote} (${data.length} B)`);
  }

  const latest = await (await fetch(`${api}/releases/latest`, { headers })).json();
  log(`releases/latest = ${latest.tag_name}${full ? "" : " (a pre-release must NOT be it)"}`);
  return { url: rel.html_url, latest: latest.tag_name };
};
