import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assertDemoHome, assertInside, demoEnv, demoLayout, resetDemoSandbox } from "./lib/demoPaths.mjs";

// The UI-shots generator deletes and writes folders. These tests pin the guards that keep it inside
// a demo home: a wrong path must be REFUSED before anything is touched.
describe("assertDemoHome", () => {
  it("accepts a local folder named ripflow-demo*", () => {
    expect(assertDemoHome("C:\\ripflow-demo")).toBe("C:\\ripflow-demo");
    expect(assertDemoHome("D:\\work\\ripflow-demo-2")).toBe("D:\\work\\ripflow-demo-2");
  });

  it("refuses a folder with another name", () => {
    expect(() => assertDemoHome("C:\\Temp")).toThrow(/ripflow-demo/);
    expect(() => assertDemoHome("C:\\ripflow-sandbox")).toThrow(/ripflow-demo/);
  });

  it("refuses the real home folder and a parent of it", () => {
    const home = os.userInfo().homedir;
    expect(() => assertDemoHome(home)).toThrow();
    expect(() => assertDemoHome(path.win32.dirname(home))).toThrow();
  });

  it("refuses the real home even when it is named like a demo home, and a demo home that contains it", () => {
    const spy = vi.spyOn(os, "userInfo").mockReturnValue({ homedir: "D:\\ripflow-demo\\ripflow-demo-me" });
    try {
      expect(() => assertDemoHome("D:\\ripflow-demo\\ripflow-demo-me")).toThrow(/real home/);
      expect(() => assertDemoHome("D:\\ripflow-demo")).toThrow(/real home/);
      expect(assertDemoHome("D:\\ripflow-demo-other")).toBe("D:\\ripflow-demo-other");
    } finally {
      spy.mockRestore();
    }
  });

  it("refuses a network or production-drive path", () => {
    expect(() => assertDemoHome("\\\\server\\share\\ripflow-demo")).toThrow(/local/);
    expect(() => assertDemoHome("O:\\ripflow-demo")).toThrow(/local/);
  });
});

describe("assertInside", () => {
  it("passes a path under the demo home and refuses the rest", () => {
    expect(assertInside("C:\\ripflow-demo", "C:\\ripflow-demo\\ripflow-sandbox\\storage")).toBeTruthy();
    expect(() => assertInside("C:\\ripflow-demo", "C:\\ripflow-demo\\..\\Users")).toThrow(/outside/);
    expect(() => assertInside("C:\\ripflow-demo", "C:\\ripflow-demo-other\\x")).toThrow(/outside/);
    expect(() => assertInside("C:\\ripflow-demo", "D:\\ripflow-demo\\x")).toThrow(/outside/);
  });
});

describe("demoEnv", () => {
  it("points every home-like variable into the demo home", () => {
    const env = demoEnv("C:\\ripflow-demo");
    expect(env.USERPROFILE).toBe("C:\\ripflow-demo");
    expect(env.HOME).toBe("C:\\ripflow-demo");
    expect(env.APPDATA.startsWith("C:\\ripflow-demo\\")).toBe(true);
    expect(env.LOCALAPPDATA.startsWith("C:\\ripflow-demo\\")).toBe(true);
  });
});

describe("resetDemoSandbox", () => {
  it("refuses a folder that is not a demo home, before touching anything", () => {
    const victim = fs.mkdtempSync(path.join(os.tmpdir(), "not-a-demo-"));
    fs.mkdirSync(path.join(victim, "ripflow-sandbox"));
    fs.writeFileSync(path.join(victim, "ripflow-sandbox", "keep.txt"), "x");
    expect(() => resetDemoSandbox(victim)).toThrow(/ripflow-demo/);
    expect(fs.existsSync(path.join(victim, "ripflow-sandbox", "keep.txt"))).toBe(true);
    fs.rmSync(victim, { recursive: true, force: true });
  });

  it("wipes only <demo-home>\\ripflow-sandbox and recreates the empty layout", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "demo-test-"));
    const home = path.join(base, "ripflow-demo-test");
    const layout = demoLayout(home);
    fs.mkdirSync(layout.storagePath, { recursive: true });
    fs.writeFileSync(path.join(layout.storagePath, "old.pdf"), "x");
    fs.writeFileSync(path.join(home, "sibling.txt"), "kept");
    resetDemoSandbox(home);
    expect(fs.existsSync(path.join(layout.storagePath, "old.pdf"))).toBe(false);
    expect(fs.existsSync(layout.storagePath)).toBe(true);
    expect(fs.existsSync(layout.userData)).toBe(true);
    expect(fs.readFileSync(path.join(home, "sibling.txt"), "utf8")).toBe("kept");
    fs.rmSync(base, { recursive: true, force: true });
  });
});
