import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { ETSY_IMPORT_STATE } from "../../../shared/constants";
import { statusText, statusTitle } from "../../utils/etsyImportBar";

// FILIP 2026-10-22 15:30 + 16:33: a bar line keeps the picture, the name with a state badge (icon + reason), the
// actions as icons in the Batch tab's style and the ways out to Etsy at the right end; the order number and the
// quantity are gone. No UI harness here (50f64c8), so the markup is pinned by reading the sources (comment lines dropped).
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const bar = read("./EtsyImportBar.jsx");
const css = read("./EtsyImportBar.module.css");
const line = bar.slice(bar.indexOf("<li key={key}"), bar.indexOf("</li>"));
const text = bar.slice(bar.indexOf("<div className={styles.line_text}>"), bar.indexOf("<div className={styles.actions}>"));
const actions = bar.slice(bar.indexOf("<div className={styles.actions}>"), bar.indexOf("</li>"));

// A button by its accessible name -> [whole tag + body, inner body].
const buttonNamed = (src, name) => {
  const m = src.match(new RegExp(`<button [^\\n]*aria-label="${name}">([\\s\\S]*?)<\\/button>`));
  return m ? [m[0], m[1]] : [null, null];
};

const row = (over = {}) => ({ receiptId: "1", transactionId: "2", state: ETSY_IMPORT_STATE.NEEDS_REVIEW, reason: "No image with XWD118902 in the Etsy library folder.", ...over });

describe("a slim Etsy bar line", () => {
  it("shows the name and the state badge - icon and words together; no order number, no quantity", () => {
    expect(text).toContain("{lineTitle(row)}");
    expect(text).toMatch(/<span className=\{`\$\{styles\.status\} \$\{styles\[`status_\$\{chip\.tone\}`\]\}`\} title=\{statusTitle\(row, importerHere\)\}>\s+<StateIcon [^>]*role="img" aria-label=\{chip\.text\} \/>\s+<span className=\{styles\.line_reason\}>\{statusText\(row, importerHere\)\}<\/span>/);
    expect(line).not.toMatch(/lineMeta|row\.quantity|etsyOrderIdOf\(row\)\}/);
  });

  it("every action is an icon in the Batch tab's style, named by aria-label and title, no words inside", () => {
    for (const [name, icon] of [["Retry", "LuRotateCw"], ["Not a print", "LuBan"], ["Open order in Etsy", "SiEtsy"], ["Open listing in Etsy", "LuTag"]]) {
      const [tag, inner] = buttonNamed(actions, name);
      expect(tag, name).not.toBeNull();
      expect(tag).toMatch(/className=\{`\$\{styles\.action_btn\} \$\{styles\.action_[a-z]+\}`\}/);
      expect(tag).toMatch(/title="[^"]+"/);
      expect(inner).toMatch(new RegExp(`<${icon} [^>]*\\/>`));
      expect(inner.replace(/<[^>]*\/>/g, "").trim()).toBe("");
    }
    expect(css).toMatch(/\.action_btn\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;[^}]*border-radius:\s*8px;/s);
  });

  it("the ways out to Etsy are the last of the actions, after Retry and Not a print; a line without a listing keeps the place", () => {
    const at = (name) => actions.indexOf(`aria-label="${name}"`);
    expect(at("Retry")).toBeLessThan(at("Not a print"));
    expect(at("Not a print")).toBeLessThan(actions.indexOf("<div className={styles.line_links}>"));
    expect(actions.indexOf("<div className={styles.line_links}>")).toBeLessThan(at("Open order in Etsy"));
    expect(at("Open order in Etsy")).toBeLessThan(at("Open listing in Etsy"));
    expect(actions).toMatch(/\{row\.listingId \? \([\s\S]*?\) : \(\s*<span className=\{styles\.icon_spacer\} aria-hidden="true" \/>\s*\)\}/);
    expect(css).toMatch(/\.icon_spacer\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s);
  });

  it("the suggestion and the state badge are white and grey with 6px corners - no pill, no tinted fill (FILIP 16:42)", () => {
    expect(css).toMatch(/\.suggestion\s*\{[^}]*border-radius:\s*6px;[^}]*border:\s*1px solid var\(--border-grey\);[^}]*background-color:\s*var\(--bg-white\);/s);
    expect(css).toMatch(/\.status\s*\{[^}]*border:\s*1px solid var\(--border-grey\);[^}]*background-color:\s*var\(--bg-white\);/s);
    expect(css).not.toMatch(/\.status_(warn|bad|wait)\s*\{/);
  });
});

describe("the words of the state badge", () => {
  it("a line that waits for a person says why it stopped", () => {
    expect(statusText(row(), false)).toBe("No image with XWD118902 in the Etsy library folder.");
    expect(statusText(row({ state: ETSY_IMPORT_STATE.FAILED, reason: "Copy failed." }), true)).toBe("Copy failed.");
  });

  it("after a Retry it says who acts next, and the tooltip still carries the reason", () => {
    const retry = row({ state: ETSY_IMPORT_STATE.RETRY });
    expect(statusText(retry, false)).toMatch(/importer station picks it up at its next check of Etsy/);
    expect(statusText(retry, true)).toMatch(/this station imports it/);
    expect(statusTitle(retry, false).split("\n")).toEqual(["Retry requested", "No image with XWD118902 in the Etsy library folder.", expect.stringMatching(/importer station/)]);
  });

  it("a line without a reason falls back to the state's name, never an empty badge", () => {
    expect(statusText(row({ reason: null }), false)).toBe("Needs a person");
    expect(statusText(row({ reason: "  " }), false)).toBe("Needs a person");
    expect(statusTitle(row({ reason: null }), false)).toBe("Needs a person");
  });
});
