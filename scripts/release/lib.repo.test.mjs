import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { readLatestYml, releaseRepos, publishToRepos, publicContentProblems } from "./lib.mjs";

// REPO-1b: the release script sends one release to two repos (the transition release) and checks
// that its public notes name no client. Fake fetch only - nothing leaves the machine. The tests of
// the single-repo parts stay in lib.test.mjs.
const exe = Buffer.from("fake installer bytes");
const sha512 = crypto.createHash("sha512").update(exe).digest("base64");
// the exact layout electron-builder wrote for 1.0.23, with this fake file's checksum
const LATEST_YML = [
  "version: 1.0.24",
  "files:",
  "  - url: RipFlow-Desktop-Setup-1.0.24.exe",
  `    sha512: ${sha512}`,
  `    size: ${exe.length}`,
  "path: RipFlow-Desktop-Setup-1.0.24.exe",
  `sha512: ${sha512}`,
  "releaseDate: '2026-09-24T10:17:07.569Z'",
  "",
].join("\n");

// REPO-1b: the release can go to a second repo (the transition release), and its public notes
// are checked before anything is sent.
describe("releaseRepos", () => {
  const primary = "FilipDrzazga/ripflow-releases";
  it("is just the primary repo without --also-repo", () => {
    expect(releaseRepos({ primary, alsoRepo: null })).toEqual({ repos: [primary], problems: [] });
  });
  it("adds the second repo after the primary one", () => {
    expect(releaseRepos({ primary, alsoRepo: "FilipDrzazga/ripflow-desktop" })).toEqual({
      repos: [primary, "FilipDrzazga/ripflow-desktop"],
      problems: [],
    });
  });
  it.each(["", "ripflow-desktop", "a/b/c", "--full", "o/r x"])("refuses --also-repo %j and sends to the primary repo only", (value) => {
    const r = releaseRepos({ primary, alsoRepo: value });
    expect(r.repos).toEqual([primary]);
    expect(r.problems[0]).toMatch(/--also-repo needs owner\/repo/);
  });
  it("refuses the primary repo named twice, whatever the case", () => {
    expect(releaseRepos({ primary, alsoRepo: "filipdrzazga/RIPFLOW-RELEASES" }).problems[0]).toMatch(/already goes to/);
  });
});

describe("publishToRepos with a fake GitHub", () => {
  // `info` overrides what GET /repos/<repo> answers per repo: { status, data }; the default is a public repo
  // the token may push to. `tagStatus` overrides the answer to the release-for-the-tag lookup per repo.
  const fakeRepos = ({ failRepo = null, info = {}, tagStatus = {} } = {}) => {
    const calls = [];
    const fetch = async (url, opts = {}) => {
      const method = opts.method || "GET";
      calls.push({ url, method, body: opts.body });
      const json = (status, data) => ({ status, ok: status < 300, json: async () => data });
      const repoOnly = (url.match(/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)$/) || [])[1];
      if (repoOnly) {
        const o = info[repoOnly] || {};
        return json(o.status ?? 200, o.data ?? { private: false, permissions: { push: true } });
      }
      const repo = (url.match(/repos\/([^/]+\/[^/]+)\//) || [])[1];
      if (url.endsWith("/releases/tags/v1.0.24")) return json(tagStatus[repo] ?? 404, {});
      if (url.endsWith("/releases") && method === "POST") {
        if (repo === failRepo) return json(422, {});
        return json(201, { html_url: `https://example/${repo}`, upload_url: `https://uploads.example/${repo}/assets{?name,label}` });
      }
      if (url.startsWith("https://uploads.example/")) return json(201, {});
      if (url.endsWith("/releases/latest")) return json(200, { tag_name: "v1.0.23" });
      throw new Error("unexpected " + url);
    };
    return { fetch, calls };
  };
  const base = { token: "t", version: "1.0.24", body: "notes", full: true, yml: readLatestYml(LATEST_YML), readFile: () => exe };
  const posts = (gh) => gh.calls.filter((c) => c.method === "POST" && c.url.endsWith("/releases")).map((c) => c.url);
  const uploads = (gh, repo) => gh.calls.filter((c) => c.url.startsWith(`https://uploads.example/${repo}/`));

  it("two repos = two release POSTs and the three assets in each, the same notes", async () => {
    const gh = fakeRepos();
    const res = await publishToRepos({ ...base, repos: ["o/new", "o/old"], fetch: gh.fetch });
    expect(posts(gh)).toEqual(["https://api.github.com/repos/o/new/releases", "https://api.github.com/repos/o/old/releases"]);
    expect(uploads(gh, "o/new")).toHaveLength(3);
    expect(uploads(gh, "o/old")).toHaveLength(3);
    const bodies = gh.calls.filter((c) => c.method === "POST" && c.url.endsWith("/releases")).map((c) => JSON.parse(c.body));
    expect(bodies[1]).toEqual(bodies[0]);
    expect(res.map((r) => r.repo)).toEqual(["o/new", "o/old"]);
  });

  it("one repo = one release POST", async () => {
    const gh = fakeRepos();
    await publishToRepos({ ...base, repos: ["o/new"], fetch: gh.fetch });
    expect(posts(gh)).toHaveLength(1);
  });

  it("a failure in the second repo is loud, names the repo and what is already published", async () => {
    const gh = fakeRepos({ failRepo: "o/old" });
    const run = publishToRepos({ ...base, repos: ["o/new", "o/old"], fetch: gh.fetch });
    await expect(run).rejects.toThrow(/^o\/old: creating the release failed: HTTP 422 \(already published to o\/new\)$/);
    expect(uploads(gh, "o/new")).toHaveLength(3);
  });

  it("a failure in the first repo sends nothing to the second", async () => {
    const gh = fakeRepos({ failRepo: "o/new" });
    await expect(publishToRepos({ ...base, repos: ["o/new", "o/old"], fetch: gh.fetch })).rejects.toThrow(/^o\/new: creating the release failed/);
    expect(gh.calls.some((c) => c.method === "POST" && c.url.includes("o/old"))).toBe(false);
  });

  // S2 review W1: every condition is checked for EVERY repo before the first POST, so a refusal
  // leaves nothing half-published (a second run would stop at "already exists" in the first repo).
  describe("the check before the first POST", () => {
    const refused = async (opts, message) => {
      const gh = fakeRepos(opts);
      await expect(publishToRepos({ ...base, repos: ["o/new", "o/old"], fetch: gh.fetch })).rejects.toThrow(message);
      expect(gh.calls.filter((c) => c.method === "POST")).toEqual([]);
    };
    it("passes two ready repos (and asks only with GET)", async () => {
      const gh = fakeRepos();
      await publishToRepos({ ...base, repos: ["o/new", "o/old"], fetch: gh.fetch });
      const before = gh.calls.slice(0, gh.calls.findIndex((c) => c.method === "POST"));
      expect(before.every((c) => c.method === "GET")).toBe(true);
      // publishRelease asks for the tag once more right before its own POST; only the first four are the check
      expect(before.slice(0, 4).map((c) => c.url)).toEqual([
        "https://api.github.com/repos/o/new",
        "https://api.github.com/repos/o/new/releases/tags/v1.0.24",
        "https://api.github.com/repos/o/old",
        "https://api.github.com/repos/o/old/releases/tags/v1.0.24",
      ]);
    });
    it("a primary repo that is private: nothing is published", async () => {
      await refused({ info: { "o/new": { data: { private: true, permissions: { push: true } } } } }, /o\/new: is not public/);
    });
    it("a primary repo that does not say whether it is private counts as not public", async () => {
      await refused({ info: { "o/new": { data: { permissions: { push: true } } } } }, /o\/new: is not public/);
    });
    it("the second repo may be private (it is the one about to go private)", async () => {
      const gh = fakeRepos({ info: { "o/old": { data: { private: true, permissions: { push: true } } } } });
      await publishToRepos({ ...base, repos: ["o/new", "o/old"], fetch: gh.fetch });
      expect(posts(gh)).toHaveLength(2);
    });
    it.each([
      ["o/new", { permissions: { push: false } }],
      ["o/old", { private: false, permissions: { push: false } }],
      ["o/old", { private: false }],
    ])("a token that cannot push to %s (%j): nothing is published", async (repo, data) => {
      await refused({ info: { [repo]: { data: { private: false, ...data } } } }, new RegExp(`${repo}: GH_TOKEN cannot write`));
    });
    it.each(["o/new", "o/old"])("%s does not exist (404): nothing is published, and it is not mistaken for a free tag", async (repo) => {
      await refused({ info: { [repo]: { status: 404 } } }, new RegExp(`${repo}: no such repo`));
    });
    it.each([401, 403])("a refused token (HTTP %i) on the repo lookup: nothing is published", async (status) => {
      await refused({ info: { "o/new": { status } } }, new RegExp(`GitHub refused GH_TOKEN \\(HTTP ${status}\\)`));
    });
    it("any other answer to the repo lookup: nothing is published", async () => {
      await refused({ info: { "o/old": { status: 500 } } }, /o\/old: reading the repo failed: HTTP 500/);
    });
    it.each(["o/new", "o/old"])("a release for the tag that already exists in %s: nothing is published", async (repo) => {
      await refused({ tagStatus: { [repo]: 200 } }, new RegExp(`${repo}: a release for v1\\.0\\.24 already exists`));
    });
    it("any other answer to the tag lookup: nothing is published", async () => {
      await refused({ tagStatus: { "o/old": 500 } }, /o\/old: checking for a v1\.0\.24 release failed: HTTP 500/);
    });
    it("names every problem at once, not just the first", async () => {
      const gh = fakeRepos({ info: { "o/new": { data: { private: true, permissions: { push: true } } } }, tagStatus: { "o/old": 200 } });
      const run = publishToRepos({ ...base, repos: ["o/new", "o/old"], fetch: gh.fetch });
      await expect(run).rejects.toThrow(/^nothing was published - o\/new: is not public.*; o\/old: a release for v1\.0\.24 already exists$/);
    });
  });
});

describe("publicContentProblems", () => {
  it("passes ordinary release notes", () => {
    expect(publicContentProblems("- A file from an Etsy order keeps the Etsy logo.\n- Settings > Updates shows the version.")).toEqual([]);
  });
  it.each([
    ["Alex's stations get it", /Alex/],
    ["Fashion Formula UK", /Fashion Formula/],
    ["fashionformulauk.com", /domain/],
    [String.raw`share \\FAS-LON-SRV01\x`, /server/],
    [String.raw`copy from O:\Original_files`, /drive/],
    ["copy from O:/Original_files", /drive/],
    ["fixes ON123456", /order number/],
    ["Etsy order ET1234567890 is read", /Etsy order number/],
    ["Etsy order ET123456789 is read", /Etsy order number/],
  ])("names a leak in %j", (text, label) => {
    const found = publicContentProblems(text);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join(" ")).toMatch(label);
  });
  it("does not flag words that merely contain the patterns", () => {
    expect(publicContentProblems("Alexandria, Montana, ON1234567, ONE123456, ET12345678, GET1234567890, ETA")).toEqual([]);
  });
  it("says what was read: the notes by default, or the subject it is given (the whole changelog file)", () => {
    expect(publicContentProblems("Alex")).toEqual(["the release notes contain a client name (Alex)"]);
    expect(publicContentProblems("Alex", "public/changelog.json contains")).toEqual(["public/changelog.json contains a client name (Alex)"]);
  });
});
