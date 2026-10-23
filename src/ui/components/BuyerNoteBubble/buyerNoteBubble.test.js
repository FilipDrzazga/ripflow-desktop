import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import BuyerNoteBubble from "./BuyerNoteBubble.jsx";

// Plan MSG-2: the bubble beside "Ship by". Rendered to a string (no DOM here) for what it shows, and the sources read (comment
// lines dropped, like shipByBadgeWiring.test.js) for how it is wired into the two views.
const read = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const html = (props) => renderToStaticMarkup(createElement(BuyerNoteBubble, props));

describe("what it renders", () => {
  it.each([[null], [undefined], [""], [42], [{}]])("nothing for a note of %j (no empty space)", (note) => {
    expect(html({ note })).toBe("");
  });

  it("a button whose tooltip and label are the full note", () => {
    const out = html({ note: "Gift - please wrap" });
    expect(out).toContain("<button");
    expect(out).toContain('type="button"');
    expect(out).toContain('title="Gift - please wrap"');
    expect(out).toContain('aria-label="Buyer&#x27;s note: Gift - please wrap"');
  });

  it("a customer's markup is text: escaped in the attributes, never a tag", () => {
    const out = html({ note: '"><img src=x onerror=alert(1)><script>x</script>' });
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&quot;&gt;");
  });
});

const bubble = read("./BuyerNoteBubble.jsx");
const dataList = read("../DataList/DataList.jsx");
const production = read("../Production/Production.jsx");
const card = read("../Production/ProductionCard.jsx");
const receive = read("../Production/SewingReceive.jsx");

describe("the click", () => {
  it("neither toggles the row's checkbox (label) nor selects the card, and opens the order through the caller", () => {
    expect(bubble).toContain("e.preventDefault();");
    expect(bubble).toContain("e.stopPropagation();");
    expect(bubble).toContain("onOpen?.();");
  });
});

describe("the note is only ever React text", () => {
  it("no markup injection, no floating layer, no log, no notification, no window.api", () => {
    expect(bubble).not.toContain("dangerouslySetInnerHTML");
    expect(bubble).not.toContain("createPortal");
    expect(bubble).not.toContain("useFloatingClose");
    expect(bubble).not.toMatch(/console\./);
    expect(bubble).not.toContain("notify");
    expect(bubble).not.toContain("window.api");
  });
});

describe("the two views", () => {
  it("Inbox puts one bubble beside the badge and opens the conversation on Etsy", () => {
    expect(dataList.match(/<BuyerNoteBubble /g)).toHaveLength(1);
    expect(dataList).toContain("<BuyerNoteBubble note={buyerNoteOfOrder(etsyShipDates, item.orderId)} onOpen={() => openEtsyConversation(item.orderId)} />");
  });

  it("Production hands the card a note (none for a shipped card) and the same opener; the card stays presentational", () => {
    expect(production).toContain("buyerNote={row.stage === PRODUCTION_STAGE.SHIPPED ? null : buyerNoteOfOrder(etsyShipDates, row.order_id)}");
    expect(production).toContain("onBuyerNoteClick={() => openEtsyConversation(row.order_id)}");
    expect(card).toContain("<BuyerNoteBubble note={buyerNote} onOpen={onBuyerNoteClick} />");
    expect(card).not.toContain("useEtsyShipDates");
    expect(card).not.toContain("openEtsyOrder");
  });

  it("the Receive lens shows no bubble", () => {
    expect(receive).not.toContain("BuyerNoteBubble");
    expect(receive).not.toContain("buyerNote");
  });
});
