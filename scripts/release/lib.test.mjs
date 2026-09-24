import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import {
  localInstallerName,
  readLatestYml,
  verifyLatestYml,
  buildPreconditions,
  releaseRequest,
  assetPlan,
  publishRelease,
} from "./lib.mjs";

// USPR 7: the release script's pure parts. publishRelease runs against a fake fetch -
// nothing leaves the machine.

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

describe("latest.yml", () => {
  it("reads version, path, sha512 and size", () => {
    expect(readLatestYml(LATEST_YML)).toEqual({ version: "1.0.24", path: "RipFlow-Desktop-Setup-1.0.24.exe", sha512, size: exe.length });
  });
  it("accepts the installer it describes, rejects another one", () => {
    const yml = readLatestYml(LATEST_YML);
    expect(verifyLatestYml(yml, exe)).toEqual([]);
    expect(verifyLatestYml(yml, Buffer.from("another build")).length).toBe(2);
  });
});

describe("buildPreconditions", () => {
  const ok = { version: "1.0.24", dirty: false, tagsAtHead: ["v1.0.24"], targetExists: false };
  it("passes a clean, tagged, new version", () => {
    expect(buildPreconditions(ok)).toEqual([]);
  });
  it("names every reason not to build", () => {
    expect(buildPreconditions({ ...ok, dirty: true })).toEqual(["the working tree is not clean - commit first"]);
    expect(buildPreconditions({ ...ok, tagsAtHead: [] })[0]).toMatch(/HEAD is not tagged v1\.0\.24/);
    expect(buildPreconditions({ ...ok, tagsAtHead: ["v1.0.23"] })[0]).toMatch(/not tagged/);
    expect(buildPreconditions({ ...ok, targetExists: true })[0]).toMatch(/already exists/);
    expect(buildPreconditions({ ...ok, version: "1.0" })[0]).toMatch(/not x\.y\.z/);
  });
});

describe("the release request", () => {
  it("is a PRE-release unless full is asked for", () => {
    expect(releaseRequest({ version: "1.0.24", body: "b" })).toEqual({ tag_name: "v1.0.24", name: "1.0.24", body: "b", draft: false, prerelease: true });
    expect(releaseRequest({ version: "1.0.24", body: "b", full: true }).prerelease).toBe(false);
  });
  it("uploads the local files under the names the updater expects", () => {
    expect(assetPlan("1.0.24", readLatestYml(LATEST_YML))).toEqual([
      { local: localInstallerName("1.0.24"), remote: "RipFlow-Desktop-Setup-1.0.24.exe" },
      { local: "RipFlow Desktop Setup 1.0.24.exe.blockmap", remote: "RipFlow-Desktop-Setup-1.0.24.exe.blockmap" },
      { local: "latest.yml", remote: "latest.yml" },
    ]);
  });
});

describe("publishRelease with a fake GitHub", () => {
  const fakeGitHub = ({ exists = false, failUpload = false } = {}) => {
    const calls = [];
    const fetch = async (url, opts = {}) => {
      calls.push({ url, method: opts.method || "GET", body: opts.body });
      const json = (status, data) => ({ status, ok: status < 300, json: async () => data });
      if (url.endsWith("/releases/tags/v1.0.24")) return json(exists ? 200 : 404, {});
      if (url.endsWith("/releases") && opts.method === "POST") {
        return json(201, { html_url: "https://example/r", upload_url: "https://uploads.example/assets{?name,label}" });
      }
      if (url.startsWith("https://uploads.example/assets")) return json(failUpload ? 500 : 201, {});
      if (url.endsWith("/releases/latest")) return json(200, { tag_name: "v1.0.23" });
      throw new Error("unexpected " + url);
    };
    return { fetch, calls };
  };
  const base = { repo: "o/r", token: "t", version: "1.0.24", body: "notes", yml: readLatestYml(LATEST_YML), readFile: () => exe };

  it("creates a pre-release and uploads the three assets", async () => {
    const gh = fakeGitHub();
    const res = await publishRelease({ ...base, full: false, fetch: gh.fetch });
    const created = JSON.parse(gh.calls.find((c) => c.method === "POST" && c.url.endsWith("/releases")).body);
    expect(created.prerelease).toBe(true);
    expect(gh.calls.filter((c) => c.url.startsWith("https://uploads.example")).map((c) => decodeURIComponent(c.url.split("name=")[1])))
      .toEqual(["RipFlow-Desktop-Setup-1.0.24.exe", "RipFlow-Desktop-Setup-1.0.24.exe.blockmap", "latest.yml"]);
    expect(res.latest).toBe("v1.0.23");
  });

  it("stops before creating anything when the release already exists", async () => {
    const gh = fakeGitHub({ exists: true });
    await expect(publishRelease({ ...base, full: false, fetch: gh.fetch })).rejects.toThrow(/already exists/);
    expect(gh.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("a failed upload stops the run with the asset's name", async () => {
    const gh = fakeGitHub({ failUpload: true });
    await expect(publishRelease({ ...base, full: false, fetch: gh.fetch })).rejects.toThrow(/uploading RipFlow-Desktop-Setup-1\.0\.24\.exe failed/);
  });
});
