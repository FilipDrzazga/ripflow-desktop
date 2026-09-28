import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// ETAP 4 (4-types-c): the class of custom orders comes from the shop profile
// (customOrders.materialClass). Not configured -> CUSTOM_ORDER_CLASS_MISSING BEFORE anything is
// created or written; a printer of another class is refused; the class reaches <MaterialType>.
// Same harness as customOrderHandlers.folder.test.js (real temp storage, the real XML builder).
const h = vi.hoisted(() => ({ handlers: {}, storageRoot: "", cls: "Polyesters", printerClass: "Polyesters", orders: [] }));

vi.mock("electron", () => ({
  ipcMain: { handle: (name, fn) => (h.handlers[name] = fn) },
  dialog: {},
  BrowserWindow: {},
}));
vi.mock("../helpers/db.js", () => ({
  insertCustomOrder: (o) => h.orders.push(o),
  getAllCustomOrders: () => [],
  clearCustomOrders: () => true,
  deleteCustomOrder: () => true,
}));
vi.mock("../helpers/shopProfile.js", () => ({
  getPrinterByCode: (code) => ({ code, materialClass: h.printerClass }),
  getFolder: (name) => (name === "customOrder" ? "AUTOMATION_WORKFLOW_MINERVA" : null),
  getCustomOrderClass: () => h.cls,
}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => h.storageRoot }));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({ customOrderFolderPath: "C:\\Art" }) }));
vi.mock("../helpers/parseCustomOrderCSV.js", () => ({ parseCSVContent: () => [] }));
vi.mock("../helpers/customOrderMatcher.js", () => ({ scanCustomOrderFolder: () => [], matchFiles: (x) => x }));

import { registerCustomOrderHandlers } from "./customOrderHandlers.js";
import { buildCustomOrderXML } from "../helpers/customOrderXml.js";

registerCustomOrderHandlers();
const generate = (group) => h.handlers["customOrder:generateXML"](null, group);

const GROUP = {
  poNumber: "PO-9",
  materialName: "Poly Crepe",
  printer: "YUMI",
  totalMeters: 1,
  files: [{ fileName: "art_a", found: true, metersToprint: 1 }],
};
const hotfolder = () => path.join(h.storageRoot, "AUTOMATION_WORKFLOW_MINERVA");

beforeEach(() => {
  h.storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "co-class-"));
  h.cls = "Polyesters";
  h.printerClass = "Polyesters";
  h.orders = [];
});
afterEach(() => fs.rmSync(h.storageRoot, { recursive: true, force: true }));

describe("customOrder:generateXML - the class from the shop profile", () => {
  it("no class configured (null - also what an unreadable profile gives): refused before anything is written", async () => {
    h.cls = null;
    const res = await generate(GROUP);
    expect(res).toMatchObject({ success: false, code: "CUSTOM_ORDER_CLASS_MISSING" });
    expect(res.error).toMatch(/customOrders\.materialClass/);
    expect(fs.existsSync(hotfolder())).toBe(false); // not even the folder
    expect(h.orders).toEqual([]);
  });

  it("a printer of another class is refused, nothing written", async () => {
    h.printerClass = "Cottons";
    const res = await generate({ ...GROUP, printer: "DGEN" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/is not a Polyesters printer/);
    expect(fs.existsSync(hotfolder())).toBe(false);
    expect(h.orders).toEqual([]);
  });

  it("a renamed class: its printer is accepted and the class goes to <MaterialType>", async () => {
    h.cls = "Poly";
    h.printerClass = "Poly";
    const res = await generate(GROUP);
    expect(res.success).toBe(true);
    const [file] = fs.readdirSync(hotfolder());
    const xml = fs.readFileSync(path.join(hotfolder(), file), "utf8");
    expect(xml).toContain("<MaterialType>Poly</MaterialType>");
    expect(xml).not.toContain("Polyesters");
  });
});

describe("buildCustomOrderXML - no default class", () => {
  it("throws without materialClass (the handler refuses first; reaching this is a wiring error)", () => {
    for (const materialClass of [undefined, null, "", "  "]) {
      expect(() => buildCustomOrderXML(GROUP, "B1", { customOrderFolderPath: "C:\\Art", nestingId: "n", materialClass })).toThrow(
        /materialClass is required/,
      );
    }
  });
});
