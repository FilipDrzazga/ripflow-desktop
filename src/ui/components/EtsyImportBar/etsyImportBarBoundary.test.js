import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// S2 2026-10-22 14:23 (after FILIP 14:19, the window crashed from the bar): the Etsy bar is mounted only inside its
// own ErrorBoundary, so an error in it can never take the Inbox down. No React harness here (50f64c8): pinned by
// reading the sources (comment lines dropped).
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("/*") && !line.trim().startsWith("*"))
    .join("\n");

const bar = read("./EtsyImportBar.jsx");
const app = read("../../App.jsx");
const boundary = read("../ErrorBoundary/ErrorBoundary.jsx");
const boundaryCss = read("../ErrorBoundary/ErrorBoundary.module.css");

describe("the Etsy bar carries its own ErrorBoundary", () => {
  it("the module's default export is the content wrapped in a compact boundary", () => {
    expect(bar).toMatch(/const EtsyImportBar = \(\) => \(\s*<ErrorBoundary compact>\s*<EtsyImportBarContent \/>\s*<\/ErrorBoundary>\s*\);\s*export default EtsyImportBar;/);
    expect(bar).toContain('import ErrorBoundary from "../ErrorBoundary/ErrorBoundary";');
  });

  it("the content is never exported on its own (no mount without the boundary)", () => {
    expect(bar).not.toMatch(/export\s+(default\s+)?(const\s+)?EtsyImportBarContent/);
    expect(bar).not.toMatch(/export\s*\{[^}]*EtsyImportBarContent/);
  });

  it("App mounts the module's export - the boundary comes with it", () => {
    expect(app).toContain('import EtsyImportBar from "./components/EtsyImportBar/EtsyImportBar";');
    expect(app).not.toMatch(/EtsyImportBarContent/);
  });

  it("compact: a strip in the bar's place, not a full-height panel that pushes the table away", () => {
    expect(boundary).toContain("${this.props.compact ? styles.compact : \"\"}");
    expect(boundaryCss).toMatch(/\.compact\s*\{[^}]*height:\s*auto;[^}]*\}/s);
    expect(boundaryCss.indexOf(".compact {")).toBeGreaterThan(boundaryCss.indexOf(".container {"));
  });
});
