import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

// Plan MSG-3: the buyer's-note bubble opens the order with the conversation expanded. The address is the one Etsy's own
// "Message buyer" button leads to (FILIP 2026-10-23); the receipt id stays the ONLY thing built into it, and the plain
// "Open in Etsy" address is untouched (openInEtsy.test.js).

const h = vi.hoisted(() => ({
  openExternal: vi.fn(() => Promise.resolve()),
}));

vi.mock("electron", () => ({ shell: { openExternal: h.openExternal } }));

import { openInEtsy } from "./openInEtsy.js";

beforeEach(() => {
  h.openExternal.mockClear();
});

const CONVERSATION = "https://www.etsy.com/your/orders/sold?ref=seller-platform-mcnav&expand_convo=true&order_id=4207943493";

describe("openInEtsy with the conversation", () => {
  it("opens the order with its conversation expanded", async () => {
    const res = await openInEtsy("ET4207943493", { conversation: true });
    expect(res.success).toBe(true);
    expect(h.openExternal).toHaveBeenCalledTimes(1);
    expect(h.openExternal.mock.calls[0][0]).toBe(CONVERSATION);
  });

  it.each([[undefined], [{}], [{ conversation: false }], [{ conversation: "true" }], [{ conversation: 1 }], [null]])(
    "anything but a literal true keeps the plain order page: %j",
    async (options) => {
      await openInEtsy("ET4207943493", options ?? undefined);
      expect(h.openExternal.mock.calls[0][0]).toBe("https://www.etsy.com/your/orders/sold?order_id=4207943493");
    },
  );

  it.each([["ON312819"], [""], ["ET"], ["ET12&x=1"], [null]])("still refuses %j and opens nothing", async (value) => {
    const res = await openInEtsy(value, { conversation: true });
    expect(res.success).toBe(false);
    expect(h.openExternal).not.toHaveBeenCalled();
    expect(res.errors[0]).toMatchObject({ code: "INVALID_ETSY_ORDER", stage: "validate" });
  });
});

describe("the flag's way from the renderer to main", () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

  it("preload sends a boolean, never the options object", () => {
    expect(read("../preload.js")).toContain('ipcRenderer.invoke("open-in-etsy", orderName, options?.conversation === true)');
  });

  it("the handler hands main a literal true or nothing", () => {
    expect(read("./index.js")).toContain("return openInEtsy(orderName, { conversation: conversation === true });");
  });

  it("the service passes the options through", () => {
    expect(read("../../ui/services/fileService.js")).toContain("window.api.openInEtsy(orderName, options)");
  });
});
