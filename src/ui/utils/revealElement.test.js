import { describe, it, expect, vi } from "vitest";
import { revealElement, REVEAL_MAX_FRAMES } from "./revealElement";

// A frame clock we drive by hand: raf queues the callback, tick() runs the queue once.
const makeClock = () => {
  let queue = [];
  return {
    raf: (cb) => {
      queue.push(cb);
    },
    tick: () => {
      const run = queue;
      queue = [];
      run.forEach((cb) => cb());
    },
    pending: () => queue.length,
  };
};

const makeDoc = (appearsOnQuery = 1) => {
  let asked = 0;
  const el = { scrollIntoView: vi.fn() };
  return {
    el,
    asked: () => asked,
    doc: {
      querySelector: () => {
        asked += 1;
        return asked >= appearsOnQuery ? el : null;
      },
    },
  };
};

describe("revealElement", () => {
  it("looks on the NEXT frame, not synchronously (the state change has to be painted first)", () => {
    const clock = makeClock();
    const { doc, asked } = makeDoc();
    revealElement("[data-x]", { doc, raf: clock.raf });
    expect(asked()).toBe(0);
    clock.tick();
    expect(asked()).toBe(1);
  });

  it("scrolls the element to the middle and hands it to onReveal", () => {
    const clock = makeClock();
    const { doc, el } = makeDoc();
    const onReveal = vi.fn();
    revealElement("[data-x]", { doc, raf: clock.raf, onReveal });
    clock.tick();
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(onReveal).toHaveBeenCalledWith(el);
    expect(clock.pending()).toBe(0);
  });

  it("keeps looking on later frames when the card is not painted yet", () => {
    const clock = makeClock();
    const { doc, el } = makeDoc(3);
    revealElement("[data-x]", { doc, raf: clock.raf });
    clock.tick();
    clock.tick();
    expect(el.scrollIntoView).not.toHaveBeenCalled();
    clock.tick();
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(clock.pending()).toBe(0);
  });

  it("gives up after a bounded number of frames when the element never appears", () => {
    const clock = makeClock();
    const { doc, asked } = makeDoc(Infinity);
    revealElement("[data-x]", { doc, raf: clock.raf });
    for (let i = 0; i < REVEAL_MAX_FRAMES + 5; i++) clock.tick();
    expect(asked()).toBe(REVEAL_MAX_FRAMES);
    expect(clock.pending()).toBe(0);
  });

  it("cancel stops the search", () => {
    const clock = makeClock();
    const { doc, el } = makeDoc();
    const cancel = revealElement("[data-x]", { doc, raf: clock.raf });
    cancel();
    clock.tick();
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });
});
