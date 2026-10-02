import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { demoLayout } from "./lib/demoPaths.mjs";
import { runLeakCheck, walkFiles } from "./lib/leakCheck.mjs";

// D25: the leak check of the designer pack used to skip a missing input without a word and did not read lib/ or
// scenarios/ - the folders where the typed text of the screenshots lives. These tests pin that both fail loudly.
const here = path.dirname(fileURLToPath(import.meta.url));
const temp = [];
const makeTemp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leakcheck-"));
  temp.push(dir);
  return dir;
};
const write = (file, text = "") => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  return file;
};
afterEach(() => {
  for (const dir of temp.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

// A tree like scripts/ui-shots plus the explicit inputs, all clean.
const fixture = () => {
  const root = makeTemp();
  const tree = path.join(root, "tree");
  write(path.join(tree, "demoData.mjs"), "export const a = 1;");
  write(path.join(tree, "lib", "helper.mjs"), "export const b = 2;");
  write(path.join(tree, "scenarios", "print.mjs"), "await type('hello');");
  write(path.join(tree, "demoPaths.test.js"), "expect(refuse('O:\\\\x')).toThrow();");
  const explicit = [write(path.join(root, "opisy.md"), "- text"), write(path.join(root, "config.json"), "{}")];
  const manifestsDir = path.join(root, "shots");
  write(path.join(manifestsDir, "manifest-a.json"), '{"shots":[]}');
  return { root, tree, explicit, manifestsDir };
};

describe("walkFiles", () => {
  it("reads lib/ and scenarios/ but not *.test.js", () => {
    const { tree } = fixture();
    const names = walkFiles(tree).map((f) => path.relative(tree, f).replaceAll("\\", "/")).sort();
    expect(names).toEqual(["demoData.mjs", "lib/helper.mjs", "scenarios/print.mjs"]);
  });
});

describe("runLeakCheck", () => {
  it("a clean fixture has no hits and nothing missing", () => {
    const { tree, explicit, manifestsDir } = fixture();
    const result = runLeakCheck({ treeRoot: tree, explicit, manifestsDir, deny: ["secret client"] });
    expect(result.hits).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.inputs).toHaveLength(3 + 2 + 1);
  });

  it("finds a denylist word typed by a scenario (case-insensitive)", () => {
    const { tree, explicit, manifestsDir } = fixture();
    write(path.join(tree, "scenarios", "print.mjs"), "await type('Secret Client ltd');");
    const { hits } = runLeakCheck({ treeRoot: tree, explicit, manifestsDir, deny: ["secret client"] });
    expect(hits).toEqual(['scenarios\\print.mjs: "secret client"']);
  });

  it("finds a denylist word in lib/ and in an explicit input", () => {
    const { tree, explicit, manifestsDir } = fixture();
    write(path.join(tree, "lib", "helper.mjs"), "const server = '\\\\FAS-LON-SRV01';");
    write(explicit[0], "client ACME");
    const { hits } = runLeakCheck({ treeRoot: tree, explicit, manifestsDir, deny: ["fas-lon-srv01", "acme"] });
    expect(hits).toHaveLength(2);
  });

  it("does not read a *.test.js: its refusal test keeps O:\\ on purpose", () => {
    const { tree, explicit, manifestsDir } = fixture();
    const { hits } = runLeakCheck({ treeRoot: tree, explicit, manifestsDir, deny: ["O:\\\\x"] });
    expect(hits).toEqual([]);
  });

  it("a missing explicit input is reported, not skipped", () => {
    const { root, tree, explicit, manifestsDir } = fixture();
    const gone = path.join(root, "ripflow.db");
    const { missing } = runLeakCheck({ treeRoot: tree, explicit: [...explicit, gone], manifestsDir, deny: [] });
    expect(missing).toEqual([gone]);
  });

  it("no manifest at all is reported, and so is a missing tree", () => {
    const { root, tree, explicit } = fixture();
    const noManifests = path.join(root, "empty-shots");
    const result = runLeakCheck({ treeRoot: path.join(root, "no-tree"), explicit, manifestsDir: noManifests, deny: [] });
    expect(result.missing).toEqual([path.join(root, "no-tree"), path.join(noManifests, "manifest-*.json")]);
    expect(runLeakCheck({ treeRoot: tree, explicit, manifestsDir: noManifests, deny: [] }).missing).toHaveLength(1);
  });
});

// build-pack.mjs end to end on a minimal artefact folder: the exit code is what stops a build.
describe("build-pack leak check exit codes", () => {
  const run = (demoHome, dir, denyWord) => {
    const denylist = write(path.join(dir, "denylist.txt"), `# test\n${denyWord}\n`);
    return spawnSync(
      process.execPath,
      [path.join(here, "build-pack.mjs"), `--denylist=${denylist}`, `--dir=${dir}`, `--demo-home=${demoHome}`, "--no-zip"],
      { encoding: "utf8" },
    );
  };
  const artefact = () => {
    const root = makeTemp();
    const dir = path.join(root, "ui-dostawa");
    write(path.join(dir, "katalog.md"), "");
    write(path.join(dir, "opisy.md"), "");
    write(path.join(dir, "shots", "manifest-a.json"), '{"shots":[]}');
    const demoHome = path.join(root, "ripflow-demo-test");
    return { dir, demoHome, layout: demoLayout(demoHome) };
  };

  it("a missing demo input stops the build with exit 4 and names the file", () => {
    const { dir, demoHome } = artefact();
    const result = run(demoHome, dir, "never-in-the-tree-zzz");
    expect(result.status).toBe(4);
    expect(result.stderr).toContain("config.json");
    expect(result.stderr).toContain("ripflow.db");
  });

  it("a hit in an input stops the build with exit 3", () => {
    const { dir, demoHome, layout } = artefact();
    write(layout.configPath, "{}");
    write(path.join(layout.storagePath, "ripflow.db"), "");
    write(path.join(dir, "opisy.md"), "- text with Zzz-Planted-Word");
    const result = run(demoHome, dir, "zzz-planted-word");
    expect(result.status).toBe(3);
    expect(result.stderr).toContain("opisy.md");
  });
});
