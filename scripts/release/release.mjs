// release.mjs - build and publish a RipFlow release the way 1.0.23 was done by hand
// (USPR 7, 2026-09-24). Run from the repo root:
//
//   node scripts/release/release.mjs build   [--out <dir>] [--dry-run]
//   node scripts/release/release.mjs publish [--out <dir>] [--full] [--also-repo <owner/repo>] [--dry-run]
//
// build:   clean tree + HEAD tagged v<package.json version> -> vite build ->
//          electron-builder --win --publish never -> the installer, its blockmap and
//          latest.yml copied AT ONCE to <out>/<version>/ with SHA256SUMS.txt, and
//          latest.yml checked against the copied installer.
// publish: the copied files -> a GitHub release for the pushed tag, a PRE-release unless
//          --full is given; prints what releases/latest answers afterwards.
// <out> defaults to %USERPROFILE%\ripflow-releases.
//
// Where the release goes (REPO-1): the code repo is private, the installers live in the PUBLIC
// releases repo named in package.json build.publish (the app looks there). The tag v<version>
// stays in the CODE repo (publish checks it on origin); in the releases repo GitHub creates the
// tag itself on that repo's default branch, which is why that repo needs one commit (README).
// --also-repo <owner/repo> sends the SAME files and notes there too - only for the transition
// release, so stations that still look in the old repo get it; afterwards it is not used.
// The notes are public: publish stops when they name a client, a server, a drive or an order.
//
// Why, from the two traps of 2026-09-24:
//   - the 1.0.22 installer was lost: the next `vite build` emptied dist/. So the copy out
//     of dist/ is part of the build step, not a thing to remember;
//   - `npm run build:dist` publishes a FULL release in one go, and the installed app
//     downloads on start and installs on quit - every station would take it before a
//     pilot. So a pre-release is the default and a full release needs --full.
// --dry-run checks and prints the plan: no build, no copy, no network.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  localInstallerName,
  readLatestYml,
  verifyLatestYml,
  sha256,
  buildPreconditions,
  releaseRequest,
  assetPlan,
  publishToRepos,
  releaseRepos,
  publicContentProblems,
} from "./lib.mjs";

const args = process.argv.slice(2);
const command = args[0];
const has = (flag) => args.includes(flag);
const optionValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const dryRun = has("--dry-run");
const full = has("--full");
const alsoRepo = has("--also-repo") ? (optionValue("--also-repo") ?? "") : null; // "" = flag without a value, refused
const outRoot = optionValue("--out") || path.join(os.homedir(), "ripflow-releases");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = pkg.version;
const target = path.join(outRoot, version);
const primaryRepo = `${pkg.build.publish.owner}/${pkg.build.publish.repo}`;
const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const stop = (problems) => {
  for (const p of problems) console.error("release: " + p);
  process.exit(1);
};

const releaseNotes = () => {
  const entry = JSON.parse(fs.readFileSync("public/changelog.json", "utf8"))[0];
  if (entry.version !== version) stop([`public/changelog.json starts with ${entry.version}, not ${version}`]);
  return entry.changes.map((c) => "- " + c.text).join("\n");
};

if (command === "build") {
  const problems = buildPreconditions({
    version,
    dirty: git("status", "--porcelain") !== "",
    tagsAtHead: git("tag", "--points-at", "HEAD").split("\n").filter(Boolean),
    targetExists: fs.existsSync(target),
  });
  releaseNotes(); // the changelog must already carry this version
  if (problems.length) stop(problems);
  console.log(`release build ${version} -> ${target}`);
  if (dryRun) {
    console.log("  [dry-run] npx vite build");
    console.log("  [dry-run] npx electron-builder --win --publish never");
    console.log(`  [dry-run] copy ${localInstallerName(version)}, its .blockmap and latest.yml out of dist/, write SHA256SUMS.txt`);
    process.exit(0);
  }
  for (const cmd of ["npx vite build", "npx electron-builder --win --publish never"]) {
    const r = spawnSync(cmd, { shell: true, stdio: "inherit" });
    if (r.status !== 0) stop([`"${cmd}" failed (exit ${r.status})`]);
  }
  // copy out of dist/ FIRST - before anything else can run another vite build
  fs.mkdirSync(target, { recursive: true });
  const files = [localInstallerName(version), localInstallerName(version) + ".blockmap", "latest.yml"];
  for (const f of files) fs.copyFileSync(path.join("dist", f), path.join(target, f));
  const yml = readLatestYml(fs.readFileSync(path.join(target, "latest.yml"), "utf8"));
  const mismatch = verifyLatestYml(yml, fs.readFileSync(path.join(target, files[0])));
  if (yml.version !== version) mismatch.push(`latest.yml says ${yml.version}, package.json ${version}`);
  if (mismatch.length) stop(mismatch);
  const sums = files.map((f) => `${sha256(fs.readFileSync(path.join(target, f)))} *${f}`).join("\n") + "\n";
  fs.writeFileSync(path.join(target, "SHA256SUMS.txt"), sums);
  console.log(sums.trimEnd());
  console.log(`next: install on the pilot station from ${path.join(target, files[0])}, then: release.mjs publish`);
} else if (command === "publish") {
  const ymlPath = path.join(target, "latest.yml");
  if (!fs.existsSync(ymlPath)) stop([`no ${ymlPath} - run "release.mjs build" first`]);
  const yml = readLatestYml(fs.readFileSync(ymlPath, "utf8"));
  const body = releaseNotes();
  const { repos, problems: repoProblems } = releaseRepos({ primary: primaryRepo, alsoRepo });
  const leaks = publicContentProblems(body);
  if (repoProblems.length || leaks.length) stop([...repoProblems, ...leaks]);
  console.log(`release publish ${version} to ${repos.join(" + ")} as ${full ? "a FULL release - every station takes it on its next start + quit" : "a PRE-release (updater ignores it)"}`);
  if (dryRun) {
    // dry-run is network-free: ls-remote would already talk to GitHub
    console.log(`  [dry-run] check that tag v${version} is on origin (git ls-remote)`);
    for (const r of repos) {
      console.log(`  [dry-run] ${r}: POST /releases ` + JSON.stringify({ ...releaseRequest({ version, body, full }), body: "(changelog)" }));
      for (const a of assetPlan(version, yml)) console.log(`  [dry-run] ${r}: upload ${a.local} as ${a.remote}`);
    }
    process.exit(0);
  }
  const onOrigin = git("ls-remote", "--tags", "origin", `v${version}`) !== "";
  if (!onOrigin) stop([`tag v${version} is not on origin - push it first (git push origin v${version})`]);
  const env = fs.readFileSync(".env", "utf8");
  const token = ((env.match(/^GH_TOKEN=(.+)$/m) || [])[1] || "").trim().replace(/^["']|["']$/g, "");
  if (!token) stop(["no GH_TOKEN in .env"]);
  const results = await publishToRepos({
    repos,
    token,
    version,
    body,
    full,
    yml,
    readFile: (f) => fs.readFileSync(path.join(target, f)),
    fetch,
    log: (m) => console.log("  " + m),
  });
  for (const r of results) {
    if (!full && r.latest === `v${version}`) stop([`${r.repo}: releases/latest points at the pre-release - check GitHub before anything updates`]);
  }
} else {
  stop(["usage: node scripts/release/release.mjs build|publish [--out <dir>] [--full] [--also-repo <owner/repo>] [--dry-run]"]);
}
