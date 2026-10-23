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
  // Only 404 means "free to create". A 401/403 is a refused token, not a release that exists
  // (1.0.32: an expired GH_TOKEN was reported as "already exists").
  if (existing.status === 401 || existing.status === 403) {
    throw new Error(`GitHub refused GH_TOKEN (HTTP ${existing.status}) - renew it in .env`);
  }
  if (existing.ok) throw new Error(`a release for v${version} already exists (HTTP ${existing.status}) - stopping`);
  if (existing.status !== 404) throw new Error(`checking for a v${version} release failed: HTTP ${existing.status} - stopping`);

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

// REPO-1: the release goes to the repo in package.json build.publish (the public releases repo,
// where the installed app looks) and, on a transition release only, ALSO to a second repo
// (--also-repo): the old one, where stations that still run a build pointing at it look. The
// primary repo comes first; a failure in a later one is named with its repo and with what is
// already published, never swallowed.
const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export const releaseRepos = ({ primary, alsoRepo }) => {
  if (alsoRepo === null || alsoRepo === undefined) return { repos: [primary], problems: [] };
  if (!REPO_NAME.test(String(alsoRepo))) {
    return { repos: [primary], problems: [`--also-repo needs owner/repo, got "${alsoRepo}"`] };
  }
  if (String(alsoRepo).toLowerCase() === primary.toLowerCase()) {
    return { repos: [primary], problems: [`--also-repo ${alsoRepo} is the repo the release already goes to`] };
  }
  return { repos: [primary, alsoRepo], problems: [] };
};

// Before the FIRST POST, for EVERY repo: the whole run is refused when any of them cannot take it.
// A half-done transition release cannot be repaired by running the script again (the second run
// stops at "already exists" in the repo that got it), and "no release for the tag" answers 404 for
// a repo that does not exist at all - so the repo itself is asked first (REPO-1b, S2 review):
//   - it exists and the token may push to it (permissions.push);
//   - the FIRST (primary) repo is public: the app reads its Releases without a token, so a private
//     one makes auto-update silently dead on every station;
//   - no release for v<version> in it yet.
// Returns one text per problem, empty = ready. Makes only GET requests.
export const checkReposReady = async ({ repos, token, version, fetch }) => {
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "ripflow-release" };
  const problems = [];
  for (const [i, repo] of repos.entries()) {
    const api = `https://api.github.com/repos/${repo}`;
    const info = await fetch(api, { headers });
    if (info.status === 401 || info.status === 403) {
      problems.push(`${repo}: GitHub refused GH_TOKEN (HTTP ${info.status}) - renew it in .env`);
      continue;
    }
    if (info.status === 404) {
      problems.push(`${repo}: no such repo, or GH_TOKEN cannot see it`);
      continue;
    }
    if (!info.ok) {
      problems.push(`${repo}: reading the repo failed: HTTP ${info.status}`);
      continue;
    }
    const data = await info.json();
    if (data?.permissions?.push !== true) problems.push(`${repo}: GH_TOKEN cannot write to it (no push permission)`);
    if (i === 0 && data?.private !== false) {
      problems.push(`${repo}: is not public - the app reads its Releases without a token, so updates would stop on every station`);
    }
    const tag = await fetch(`${api}/releases/tags/v${version}`, { headers });
    if (tag.ok) problems.push(`${repo}: a release for v${version} already exists`);
    else if (tag.status === 401 || tag.status === 403) problems.push(`${repo}: GitHub refused GH_TOKEN (HTTP ${tag.status}) - renew it in .env`);
    else if (tag.status !== 404) problems.push(`${repo}: checking for a v${version} release failed: HTTP ${tag.status}`);
  }
  return problems;
};

export const publishToRepos = async ({ repos, ...rest }) => {
  const problems = await checkReposReady({ repos, token: rest.token, version: rest.version, fetch: rest.fetch });
  if (problems.length) throw new Error(`nothing was published - ${problems.join("; ")}`);
  const done = [];
  for (const repo of repos) {
    try {
      done.push({ repo, ...(await publishRelease({ ...rest, repo })) });
    } catch (err) {
      const already = done.length ? ` (already published to ${done.map((d) => d.repo).join(", ")})` : "";
      throw new Error(`${repo}: ${err.message}${already}`);
    }
  }
  return done;
};

// The release notes become PUBLIC with the release (the releases repo is public). A shop's name,
// its server or an order number must not travel there: one label per kind found, empty = fine.
const PUBLIC_CONTENT_LEAKS = [
  ["a client name (Alex)", /\balex\b/i],
  ["a client name (Fashion Formula)", /fashion\s*formula/i],
  ["a client domain (fashionformulauk)", /fashionformulauk/i],
  ["a client server (FAS-LON)", /FAS-LON/i],
  ["a drive path (O:\\ or O:/)", /\bO:[\\/]/],
  ["an order number (ON + 6 digits)", /\bON\d{6}\b/i],
  ["an Etsy order number (ET + 9 or more digits)", /\bET\d{9,}\b/],
];

// `subject` says what was read, with its verb: the notes of this release, or the whole changelog
// file (all of it is inside app.asar of the public installer).
export const publicContentProblems = (text, subject = "the release notes contain") =>
  PUBLIC_CONTENT_LEAKS.filter(([, re]) => re.test(String(text))).map(([label]) => `${subject} ${label}`);
