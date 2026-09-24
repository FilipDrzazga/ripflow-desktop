import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// ETAP 2d-4: customOrder:generateXML writes into {storagePath}\<folders.customOrder>, and refuses
// VISIBLY (CUSTOM_ORDER_FOLDER_MISSING) before creating or writing anything when the profile
// names no usable folder. Edges mocked: electron, the DB, the profile lookups, settings and
// the storage root; the storage root is a real temp dir, the XML builder is the real one.
const handlers = {};
let storageRoot = "";
let folder = null;
let printerClass = "Polyesters";
const insertedOrders = [];

vi.mock("electron", () => ({
  ipcMain: { handle: (name, fn) => (handlers[name] = fn) },
  dialog: {},
  BrowserWindow: {},
}));
vi.mock("../helpers/db.js", () => ({
  insertCustomOrder: (o) => insertedOrders.push(o),
  getAllCustomOrders: () => [],
  clearCustomOrders: () => true,
  deleteCustomOrder: () => true,
}));
vi.mock("../helpers/shopProfile.js", () => ({
  getPrinterByCode: (code) => ({ code, materialClass: printerClass }),
  getFolder: (name) => (name === "customOrder" ? folder : null),
}));
vi.mock("../helpers/getRootPath.js", () => ({ getStorageRootPath: () => storageRoot }));
vi.mock("../helpers/getSettings.js", () => ({ getSettings: () => ({ customOrderFolderPath: "C:\\Art" }) }));
vi.mock("../helpers/parseCustomOrderCSV.js", () => ({ parseCSVContent: () => [] }));
vi.mock("../helpers/customOrderMatcher.js", () => ({ scanCustomOrderFolder: () => [], matchFiles: (x) => x }));

import { registerCustomOrderHandlers } from "./customOrderHandlers.js";
import { buildCustomOrderXML } from "../helpers/customOrderXml.js";

registerCustomOrderHandlers();
const generate = (group) => handlers["customOrder:generateXML"](null, group);

const GROUP = {
  poNumber: "PO-77",
  materialName: "Poly Crepe",
  printer: "YUMI",
  totalMeters: 1.5,
  files: [{ fileName: "art_a", found: true, metersToprint: 1.5 }],
};

beforeEach(() => {
  storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "co-folder-"));
  folder = null;
  printerClass = "Polyesters";
  insertedOrders.length = 0;
});
afterEach(() => fs.rmSync(storageRoot, { recursive: true, force: true }));

const writtenXml = (dir) => {
  const files = fs.existsSync(path.join(storageRoot, dir)) ? fs.readdirSync(path.join(storageRoot, dir)) : [];
  return files.map((f) => ({ name: f, text: fs.readFileSync(path.join(storageRoot, dir, f), "utf8") }));
};

describe("customOrder:generateXML - hotfolder from the shop profile (ETAP 2d-4)", () => {
  it("writes into the folder the profile names", async () => {
    folder = "MINERVA_IN";
    const res = await generate(GROUP);
    expect(res.success).toBe(true);
    const out = writtenXml("MINERVA_IN");
    expect(out.map((f) => f.name)).toEqual([expect.stringMatching(/^CUSTOM_ORDER_PO-77_\d{8}_[0-9a-f]{8}\.xml$/)]);
    expect(fs.readdirSync(storageRoot)).toEqual(["MINERVA_IN"]);
    expect(insertedOrders).toHaveLength(1);
  });

  it("the file is exactly what the 2d-1 builder renders (the baseline stays the contract)", async () => {
    folder = "AUTOMATION_WORKFLOW_MINERVA";
    await generate(GROUP);
    const [{ name, text }] = writtenXml("AUTOMATION_WORKFLOW_MINERVA");
    const batchId = name.replace(/\.xml$/, "");
    const nestingId = text.match(/<NestingGroup>([^<]+)<\/NestingGroup>/)[1];
    expect(text).toBe(buildCustomOrderXML(GROUP, batchId, { customOrderFolderPath: "C:\\Art", nestingId }));
  });

  it("no folder in the profile -> CUSTOM_ORDER_FOLDER_MISSING, nothing created, nothing recorded", async () => {
    folder = null;
    const res = await generate(GROUP);
    expect(res).toEqual({ success: false, code: "CUSTOM_ORDER_FOLDER_MISSING", error: expect.stringContaining("folders.customOrder") });
    expect(fs.readdirSync(storageRoot)).toEqual([]);
    expect(insertedOrders).toEqual([]);
  });

  it("a non-polyester printer is still refused first, and nothing is created", async () => {
    folder = "MINERVA_IN";
    printerClass = "Cottons";
    const res = await generate(GROUP);
    expect(res.success).toBe(false);
    expect(res.code).toBeUndefined();
    expect(fs.readdirSync(storageRoot)).toEqual([]);
  });
});
