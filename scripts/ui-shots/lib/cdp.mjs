// A small Chrome DevTools Protocol client for the app window (Node's built-in WebSocket and fetch -
// no dependencies). Real mouse and keyboard events go through Input.*, so hover, context menus and
// focus behave as they do for an operator. CDP listens on 127.0.0.1 only (see launch.mjs).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { waitFor } from "./launch.mjs";

export const connectPage = async (port, { urlPrefix = "http://localhost:5173" } = {}) => {
  const target = await waitFor(
    async () => {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      return list.find((t) => t.type === "page" && t.url.startsWith(urlPrefix));
    },
    { what: "the app page target", timeoutMs: 60000 },
  );
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("CDP websocket error")), { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
      else resolve(msg.result);
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  // Runs `fn(...args)` in the page and returns its JSON-serialisable result.
  const evaluate = async (fn, ...args) => {
    const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
    const res = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    return res.result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");

  const page = {
    send,
    evaluate,
    close: () => ws.close(),

    setViewport: async (width, height) => {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      page.viewport = { width, height };
    },

    // Centre of the first VISIBLE element whose own visible text matches. `within` narrows the search.
    findText: (text, { selector = "button, a, [role=button], [role=tab], [role=menuitem], [role=option], label, li, td, span, p, h1, h2, h3, div", exact = true, within = null, nth = 0 } = {}) =>
      evaluate(
        (text, selector, exact, within, nth) => {
          const root = within ? document.querySelector(within) : document;
          if (!root) return null;
          const norm = (s) => s.replace(/\s+/g, " ").trim();
          const visible = (el) => {
            const r = el.getBoundingClientRect();
            const st = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
          };
          const hits = [];
          for (const el of root.querySelectorAll(selector)) {
            if (!visible(el)) continue;
            const own = norm(el.textContent ?? "");
            const ok = exact ? own === text : own.includes(text);
            if (!ok) continue;
            hits.push(el);
          }
          // keep only the innermost matches: an ancestor whose text contains the text is not the target
          const inner = hits.filter((h) => !hits.some((o) => o !== h && h.contains(o)));
          const el = inner[nth];
          if (!el) return null;
          el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        },
        text,
        selector,
        exact,
        within,
        nth,
      ),

    mouseMove: (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }),
    mouseClickAt: async (x, y, { button = "left", clickCount = 1 } = {}) => {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, clickCount });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, clickCount });
    },

    waitForText: (text, opts = {}) => waitFor(() => page.findText(text, opts), { what: `text "${text}"`, timeoutMs: opts.timeoutMs ?? 20000 }),
    waitForGone: (text, opts = {}) => waitFor(async () => !(await page.findText(text, opts)), { what: `text "${text}" to disappear`, timeoutMs: opts.timeoutMs ?? 20000 }),

    // Scrolls the match into view, lets the layout settle, then measures again: the first position can be stale.
    locateText: async (text, opts = {}) => {
      await page.waitForText(text, opts);
      await page.sleep(250);
      return (await page.findText(text, opts)) ?? page.waitForText(text, opts);
    },

    clickText: async (text, opts = {}) => {
      const at = await page.locateText(text, opts);
      await page.mouseClickAt(at.x, at.y);
    },
    rightClickText: async (text, opts = {}) => {
      const at = await page.locateText(text, opts);
      await page.mouseClickAt(at.x, at.y, { button: "right" });
    },
    hoverText: async (text, opts = {}) => {
      const at = await page.locateText(text, opts);
      await page.mouseMove(at.x, at.y);
    },
    pressKey: async (key) => {
      const codes = { Enter: 13, Escape: 27, Tab: 9, ArrowLeft: 37, ArrowRight: 39 };
      const vk = codes[key];
      const text = key === "Enter" ? String.fromCharCode(13) : undefined;
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(text ? { text } : {}) });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    },

    // Centre of the first visible element matching a CSS selector (scrolled into view). nth picks another match.
    findSelector: (selector, { nth = 0 } = {}) =>
      evaluate(
        (selector, nth) => {
          const els = [...document.querySelectorAll(selector)].filter((el) => {
            const r = el.getBoundingClientRect();
            const st = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && st.visibility !== "hidden" && st.display !== "none";
          });
          const el = els[nth];
          if (!el) return null;
          el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        },
        selector,
        nth,
      ),
    clickSelector: async (selector, opts = {}) => {
      const at = await waitFor(() => page.findSelector(selector, opts), { what: `selector ${selector}`, timeoutMs: 15000 });
      await page.sleep(150);
      const again = (await page.findSelector(selector, opts)) ?? at;
      await page.mouseClickAt(again.x, again.y, { button: opts.button ?? "left" });
    },
    hoverSelector: async (selector, opts = {}) => {
      const at = await waitFor(() => page.findSelector(selector, opts), { what: `selector ${selector}`, timeoutMs: 15000 });
      await page.mouseMove(at.x, at.y);
    },
    exists: (selector) => evaluate((s) => !!document.querySelector(s), selector),
    // React-safe value change for an input (native setter + input event), then the caller may press Enter.
    setValue: (selector, value) =>
      evaluate(
        (selector, value) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.focus();
          return true;
        },
        selector,
        value,
      ),
    scrollContainer: (selector, top) =>
      evaluate(
        (selector, top) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          el.scrollTop = top === "end" ? el.scrollHeight : top;
          return el.scrollTop;
        },
        selector,
        top,
      ),
    // Synthetic drag events with an in-memory file (the native file chooser is outside the page).
    dragFile: (selector, { name, content, drop = false } = {}) =>
      evaluate(
        (selector, name, content, drop) => {
          const el = document.querySelector(selector);
          if (!el) return false;
          const dt = new DataTransfer();
          if (name) dt.items.add(new File([content ?? ""], name, { type: "text/csv" }));
          const types = drop ? ["dragenter", "dragover", "drop"] : ["dragenter", "dragover"];
          for (const type of types) el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
          return true;
        },
        selector,
        name ?? null,
        content ?? "",
        drop,
      ),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),

    // PNG of the viewport. Waits until two captures in a row are identical, so a running animation
    // (GSAP number roll, a fading toast) is not photographed half way.
    screenshotStable: async ({ attempts = 8, gapMs = 350 } = {}) => {
      let prev = null;
      for (let i = 0; i < attempts; i++) {
        const { data } = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
        const buf = Buffer.from(data, "base64");
        if (prev && prev.equals(buf)) return { buf, stable: true };
        prev = buf;
        await page.sleep(gapMs);
      }
      return { buf: prev, stable: false };
    },
  };
  return page;
};

// Writes a screenshot and returns its manifest row.
export const saveShot = async (page, outDir, { id, view, state, file }) => {
  const { buf, stable } = await page.screenshotStable();
  const target = path.join(outDir, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buf);
  return {
    id,
    view,
    state,
    file: file.replaceAll("\\", "/"),
    width: page.viewport?.width ?? null,
    height: page.viewport?.height ?? null,
    bytes: buf.length,
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    stable,
  };
};
