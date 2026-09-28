// A CSS colour as the shop profile may carry it (printers[].color.bg / .text): hex only. The
// value ends up in a style object, and a profile edited by hand or imported from a file must not
// be able to put anything else there. One rule for the renderer reader (shopProfileData.js) and
// the import validator (validateShopProfile.js), so a colour is either valid for both or neither.
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

export const isHexColor = (value) => typeof value === "string" && HEX_COLOR_RE.test(value);
