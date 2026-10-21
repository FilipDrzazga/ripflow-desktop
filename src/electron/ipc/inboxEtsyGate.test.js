import { describe, it, expect, beforeEach, vi } from "vitest";

// E3b-1: the inbox image gate. The REAL shopProfile cache (db stubbed to hand it a profile) and the REAL
// gate: an image is an inbox row only with features.etsy ON and an Etsy file name.

let row = null;
vi.mock("../helpers/db.js", () => ({ getShopProfile: () => row }));

import { loadShopProfile, invalidateShopProfile } from "../helpers/shopProfile.js";
import { inboxSkipsImage, inboxTakesImages } from "../helpers/inboxFile.js";
import { isEtsyFileName } from "../../shared/orderSource.js";

const ETSY_TILE = "ET3841234567_Jane_Doe_1of1_Velvet_1x_LM_XWD173706_Basic_150_ETSY.png";
const HAND_MADE = "Colour atlas 3.tif";
const ON_FILE = "ON313496_Jane_Doe_1of1_Velvet_1x_LM_XWD7ec0_FFcopy.jpeg";

const load = (profile) => {
  row = profile;
  invalidateShopProfile();
  loadShopProfile();
};

beforeEach(() => {
  row = null;
  invalidateShopProfile();
});

describe("isEtsyFileName", () => {
  it("is the shape the import writes: ET<digits>_..._ETSY.<ext>, any extension and case", () => {
    expect(isEtsyFileName(ETSY_TILE)).toBe(true);
    expect(isEtsyFileName("et1_x_etsy.TIF")).toBe(true);
    for (const n of [HAND_MADE, ON_FILE, "ET1_x_FF.png", "ET_x_ETSY.png", "XET1_x_ETSY.png", "ET1_ETSY.png", "", null, undefined]) {
      expect(isEtsyFileName(n)).toBe(false);
    }
  });
});

describe("the inbox image gate behind features.etsy", () => {
  it("flag on + an Etsy name: the image is a row", () => {
    load({ features: { etsy: true } });
    expect(inboxTakesImages()).toBe(true);
    expect(inboxSkipsImage(ETSY_TILE)).toBe(false);
  });

  it("flag on + a hand-made image (or another shop's image): skipped", () => {
    load({ features: { etsy: true } });
    expect(inboxSkipsImage(HAND_MADE)).toBe(true);
    expect(inboxSkipsImage(ON_FILE)).toBe(true);
  });

  it("flag off, absent or not a real boolean + an Etsy name: skipped", () => {
    for (const features of [{ etsy: false }, {}, { etsy: "true" }, { etsy: 1 }]) {
      load({ features });
      expect(inboxSkipsImage(ETSY_TILE)).toBe(true);
    }
  });

  it("no profile (unreadable, or never loaded): skipped - fail-closed", () => {
    expect(inboxSkipsImage(ETSY_TILE)).toBe(true);
    row = () => null;
    load(null);
    expect(inboxSkipsImage(ETSY_TILE)).toBe(true);
  });

  it("a PDF and a file with no extension are untouched in every state", () => {
    for (const profile of [null, { features: { etsy: false } }, { features: { etsy: true } }]) {
      load(profile);
      for (const n of ["a.pdf", "A.PDF", ETSY_TILE.replace(".png", ".pdf"), "a", ".lock"]) expect(inboxSkipsImage(n)).toBe(false);
    }
  });
});
