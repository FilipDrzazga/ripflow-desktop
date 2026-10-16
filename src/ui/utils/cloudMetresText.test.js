import { describe, it, expect } from "vitest";
import { formatMetres, dayHeading, metresCell, metresCopyText } from "./cloudMetresText.js";

const devices = [
  { name: "d.gen Artrix H8", yesterday: { metres: 116.7123, jobs: 7 }, today: { metres: 56.44, jobs: 11 } },
  { name: "YOKO 1", yesterday: { metres: 30.55, jobs: 7 }, today: { metres: 0, jobs: 0 } },
  { name: "YUMI 2", yesterday: { metres: 0, jobs: 0 }, today: { metres: 65.05, jobs: 7 } },
];

describe("cloudMetresText", () => {
  it("shows one decimal", () => {
    expect(formatMetres(116.7123)).toBe("116.7");
    expect(formatMetres(0.04)).toBe("0.0");
    expect(formatMetres(30)).toBe("30.0");
  });

  it("writes a day key as DD/MM", () => {
    expect(dayHeading("2026-10-15")).toBe("15/10");
  });

  it("a machine that printed nothing that day is a dash, not 0.0", () => {
    expect(metresCell({ metres: 0, jobs: 0 })).toBe("-");
    expect(metresCell({ metres: 12.34, jobs: 2 })).toBe("12.3");
  });

  it("copy text is one tab-separated line per machine that printed that day", () => {
    expect(metresCopyText(devices, "yesterday")).toBe("d.gen Artrix H8\t116.7\nYOKO 1\t30.6");
    expect(metresCopyText(devices, "today")).toBe("d.gen Artrix H8\t56.4\nYUMI 2\t65.1");
  });

  it("copy text is empty when nothing printed", () => {
    expect(metresCopyText([], "today")).toBe("");
    expect(metresCopyText([{ name: "H8", yesterday: { metres: 0, jobs: 0 }, today: { metres: 0, jobs: 0 } }], "today")).toBe("");
  });
});
