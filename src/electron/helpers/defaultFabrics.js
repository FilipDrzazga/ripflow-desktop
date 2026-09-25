import { LM_XML_POLY, LM_XML_COTTON_DEFAULT, LM_ROLL_POLY, LM_ROLL_COTTON_DEFAULT } from "../../shared/printWidths.js";

// Ships empty on purpose: a fresh install starts with no materials. The fabric catalog
// is the shop's own data, entered in Settings > Fabrics or imported from a profile file
// (see profiles/). Seeding is guarded on this being non-empty, so it is a no-op today.
// The baked-in name lists that used to sit here (Alex's 33 cottons / 88 polyesters, unused
// since 0bf8aa6) were removed in ETAP 2g-1.
export const DEFAULT_FABRICS = [];

export const DEFAULT_FABRIC_GLOBALS = {
  marginCotton: 10,
  marginPoly: 5,
  defaultXmlWidthCotton: LM_XML_COTTON_DEFAULT,
  defaultXmlWidthPoly: LM_XML_POLY,
  defaultRollWidthCotton: LM_ROLL_COTTON_DEFAULT,
  defaultRollWidthPoly: LM_ROLL_POLY,
};
