import { describe, it, expect } from "vitest";
import { etsyKey, resolveEtsyFabric, ETSY_FABRIC_SEED } from "./etsyFabric.js";

// Plan E3b round 4: Etsy's name of a fabric -> the Fabrics row. Never the nearest name.

const fab = (...names) => names.map((name) => ({ name }));

describe("etsyKey", () => {
  it("ignores case, spaces, hyphens and accents", () => {
    expect(etsyKey("3 Pass Blackout FR")).toBe("3passblackoutfr");
    expect(etsyKey("3-Pass Blackout FR")).toBe("3passblackoutfr");
    expect(etsyKey("Crepe De Chine")).toBe(etsyKey("Crepe de Chine"));
    expect(etsyKey("Crèpe de Chine")).toBe("crepedechine");
  });

  it("is empty for nothing", () => {
    expect(etsyKey(null)).toBe("");
    expect(etsyKey("  - ")).toBe("");
  });
});

describe("resolveEtsyFabric", () => {
  const fabrics = fab("Velvet", "Crepe de Chine", "3-Pass Blackout FR", "Calico Plain Cotton", "Cora Canvas", "Canvas Waterproof");
  const map = [{ etsyKey: etsyKey("Calico Cotton Plain"), fabricName: "Calico Plain Cotton" }];

  it("the same name once spelling is ignored", () => {
    expect(resolveEtsyFabric("Crepe De Chine", { map, fabrics }).fabric.name).toBe("Crepe de Chine");
    expect(resolveEtsyFabric("3 Pass Blackout FR", { map, fabrics }).fabric.name).toBe("3-Pass Blackout FR");
  });

  it("a pair of the table wins over similarity", () => {
    expect(resolveEtsyFabric("Calico Cotton Plain", { map, fabrics }).fabric.name).toBe("Calico Plain Cotton");
  });

  it("a mapped fabric that is not in Fabrics is refused with both names", () => {
    const out = resolveEtsyFabric("Calico Cotton Plain", { map, fabrics: fab("Velvet") });
    expect(out.fabric).toBeUndefined();
    expect(out.reason).toContain("Calico Plain Cotton");
    expect(out.reason).toContain("not in Fabrics");
  });

  it("a name with no match is a reason, never the nearest fabric", () => {
    const out = resolveEtsyFabric("Canvas", { map, fabrics });
    expect(out.fabric).toBeUndefined();
    expect(out.reason).toMatch(/not in Fabrics/);
  });

  it("two Fabrics rows with the same key are ambiguous (collision test, W7)", () => {
    const out = resolveEtsyFabric("Velvet", { map: [], fabrics: fab("Velvet", "VELVET") });
    expect(out.fabric).toBeUndefined();
    expect(out.reason).toMatch(/matches 2 Fabrics rows/);
  });

  it("an empty variation is a reason", () => {
    expect(resolveEtsyFabric("", { map, fabrics }).reason).toMatch(/empty/);
  });

  it("an unreadable catalogue or table resolves nothing", () => {
    expect(resolveEtsyFabric("Velvet", { map: null, fabrics: null }).fabric).toBeUndefined();
  });
});

describe("the seed", () => {
  it("is the seven pairs of the plan, each Etsy name distinct by key", () => {
    expect(ETSY_FABRIC_SEED).toHaveLength(7);
    expect(new Set(ETSY_FABRIC_SEED.map(([etsy]) => etsyKey(etsy))).size).toBe(7);
  });
});
