import { describe, it, expect } from "vitest";
import { minutesAgoText, otherImportersNotice } from "./etsyView";

describe("minutesAgoText", () => {
  it.each([
    [0, "just now"],
    [-3, "just now"],
    [1, "1 minute ago"],
    [7, "7 minutes ago"],
  ])("%j -> %s", (minutes, text) => {
    expect(minutesAgoText(minutes)).toBe(text);
  });
});

describe("otherImportersNotice", () => {
  const one = [{ workstation: "QC-PC", minutesAgo: 3 }];
  const two = [
    { workstation: "QC-PC", minutesAgo: 1 },
    { workstation: "POLY-PC", minutesAgo: 8 },
  ];

  it("another importer while this station imports too is a warning that names the station and says what to do", () => {
    const notice = otherImportersNotice(one, true);
    expect(notice.tone).toBe("warn");
    expect(notice.text).toContain("QC-PC is also switched on as an Etsy importer");
    expect(notice.text).toContain("last check 3 minutes ago");
    expect(notice.text).toContain("Turn it Off on all but one");
  });

  it("several others: all are named, 'are' not 'is', the newest check is quoted", () => {
    const notice = otherImportersNotice(two, true);
    expect(notice.text).toContain("QC-PC, POLY-PC are also switched on");
    expect(notice.text).toContain("last check 1 minute ago");
  });

  it("this station Off: not a warning, only who imports", () => {
    expect(otherImportersNotice(one, false)).toEqual({ tone: "off", text: "Etsy orders are imported by QC-PC (last check 3 minutes ago)." });
  });

  it("only an explicit true counts as this station importing", () => {
    expect(otherImportersNotice(one, undefined).tone).toBe("off");
    expect(otherImportersNotice(one, "yes").tone).toBe("off");
  });

  it.each([[null], [undefined], [[]], ["x"]])("nobody else (%j) says nothing", (others) => {
    expect(otherImportersNotice(others, true)).toBeNull();
  });
});
