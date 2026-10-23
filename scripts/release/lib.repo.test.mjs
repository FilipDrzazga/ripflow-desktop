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
  const fakeRepos = ({ failRepo = null, existsIn = null } = {}) => {
    const calls = [];
    const fetch = async (url, opts = {}) => {
      const method = opts.method || "GET";
      calls.push({ url, method, body: opts.body });
      const json = (status, data) => ({ status, ok: status < 300, json: async () => data });
      const repo = (url.match(/repos\/([^/]+\/[^/]+)\//) || [])[1];
      if (url.endsWith("/releases/tags/v1.0.24")) return json(repo === existsIn ? 200 : 404, {});
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
    expect(gh.calls.some((c) => c.url.includes("repos/o/old"))).toBe(false);
  });

  it("a release that already exists in the second repo stops there without a POST", async () => {
    const gh = fakeRepos({ existsIn: "o/old" });
    await expect(publishToRepos({ ...base, repos: ["o/new", "o/old"], fetch: gh.fetch })).rejects.toThrow(/^o\/old: a release for v1\.0\.24 already exists/);
    expect(posts(gh)).toEqual(["https://api.github.com/repos/o/new/releases"]);
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
    ["fixes ON308523", /order number/],
  ])("names a leak in %j", (text, label) => {
    const found = publicContentProblems(text);
    expect(found.length).toBeGreaterThan(0);
    expect(found.join(" ")).toMatch(label);
  });
  it("does not flag words that merely contain the patterns", () => {
    expect(publicContentProblems("Alexandria, Montana, ON1234567, ONE123456")).toEqual([]);
  });
});
