import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// Plan MSG-3: openEtsyConversation is openEtsyOrder with the conversation flag - the same failure report, and the plain
// opener keeps calling the service with the order number alone (orderLink.test.js).

const h = vi.hoisted(() => ({
  openInEtsy: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("../services/fileService", () => ({ openInEtsy: h.openInEtsy }));
vi.mock("./notify", () => ({ notify: h.notify }));

import { openEtsyConversation, openEtsyOrder } from "./orderLink.js";

beforeEach(() => {
  h.openInEtsy.mockReset();
  h.notify.mockReset();
});

describe("openEtsyConversation", () => {
  it("asks the service for the conversation and stays quiet on success", async () => {
    h.openInEtsy.mockResolvedValue({ success: true, errors: [] });
    await openEtsyConversation("ET12");
    expect(h.openInEtsy).toHaveBeenCalledWith("ET12", { conversation: true });
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("reports the main-process error through notify, like the plain opener", async () => {
    h.openInEtsy.mockResolvedValue({ success: false, errors: [{ type: "Error", title: "Open in Etsy failed", message: "Not an Etsy order number." }] });
    await openEtsyConversation("ON1");
    expect(h.notify).toHaveBeenCalledWith(
      { type: "Error", title: "Open in Etsy failed", message: "Not an Etsy order number." },
      { stage: "app", code: "OPEN_ETSY_FAILED" },
    );
  });

  it("the plain opener does not ask for the conversation", async () => {
    h.openInEtsy.mockResolvedValue({ success: true, errors: [] });
    await openEtsyOrder("ET12");
    expect(h.openInEtsy.mock.calls[0]).toEqual(["ET12"]);
  });
});

describe("the bubble opens the conversation, every other entry the order page", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
  const dataList = read("../components/DataList/DataList.jsx");
  const production = read("../components/Production/Production.jsx");

  it("Inbox and Production hand the bubble openEtsyConversation", () => {
    expect(dataList).toContain("onOpen={() => openEtsyConversation(item.orderId)}");
    expect(production).toContain("onBuyerNoteClick={() => openEtsyConversation(row.order_id)}");
  });

  it("the context menus and the Etsy bar still open the order page", () => {
    expect(production.match(/openEtsyConversation\(/g)).toHaveLength(1);
    expect(dataList.match(/openEtsyConversation\(/g)).toHaveLength(1);
    expect(dataList).toContain("openEtsyOrder(orderId);");
    expect(production).toContain("openEtsyOrder(row.order_id);");
  });
});
