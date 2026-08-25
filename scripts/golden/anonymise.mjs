// Replaces Alex's customers and artwork ids with stable pseudonyms BEFORE anything is
// parsed.
//
// Why at the source and not on the finished XML: the customer name, order number and
// artwork id are embedded in the PDF file name, so they reach <Name>, <OrderId>,
// <DocumentId> AND <Path> (masking <Path> down to \PRINTED\ still leaves the file name).
// Rewriting file_id up front sends the pseudonyms through the real parsePrintFileName,
// so every field stays consistent with what a genuine file would have produced.
//
// Every mapping is DERIVED, never randomised: distinct values are sorted and numbered in
// order, so the same input always yields the same pseudonym. compare-golden depends on
// that - a re-capture must reproduce the identical baseline.
//
// Structure is preserved exactly, and for XWD that is load-bearing:
//   - customer name : always 2 underscore tokens  -> Customer_001
//   - order id      : always "ON" + 6 digits      -> ON000001
//   - artwork id    : always "XWD" + 32 lowercase hex, and parseFileName.js:121/:400 test
//                     the WHOLE token against /^XWD[0-9a-f]+$/i to decide the file is
//                     XWD-based. A pseudonym that breaks that pattern would make the
//                     parser pick a different product type, which would move the metres.
//                     So the replacement keeps "XWD" + exactly 32 hex characters.
// Dimensions, quantities, product types and material names are NOT touched - they carry
// no personal data and they are what the metre calculation is made of.
const HEAD = /^(ON\d+)_(.+?)_(\d+of\d+)_/;
const XWD_TOKEN = /XWD[0-9a-f]+/gi;
const XWD_EXPECTED = /^XWD[0-9a-f]{32}$/;
const XWD_HEX_LEN = 32;

const pad = (n, w) => String(n).padStart(w, "0");
const hexPad = (n, w) => n.toString(16).padStart(w, "0");

export function buildMapping(rows) {
  const names = new Set();
  const orders = new Set();
  const xwds = new Set();
  for (const r of rows) {
    const m = HEAD.exec(r.file_id);
    if (m) { orders.add(m[1]); names.add(m[2]); }
    for (const x of r.file_id.match(XWD_TOKEN) ?? []) xwds.add(x);
  }
  return {
    nameMap: new Map([...names].sort().map((n, i) => [n, `Customer_${pad(i + 1, 3)}`])),
    orderMap: new Map([...orders].sort().map((o, i) => [o, `ON${pad(i + 1, 6)}`])),
    // Sequential counter rendered as 32 hex digits: obviously synthetic, still a legal
    // XWD token for the parser.
    xwdMap: new Map([...xwds].sort().map((x, i) => [x, `XWD${hexPad(i + 1, XWD_HEX_LEN)}`])),
  };
}

export function anonymiseRows(rows) {
  const { nameMap, orderMap, xwdMap } = buildMapping(rows);
  const unmatched = [];
  const badXwd = [];
  // Not every file carries an XWD: CUSHION / TEA_TOWEL are keyword-based. Only the
  // tokens that exist are validated.
  for (const x of xwdMap.keys()) if (!XWD_EXPECTED.test(x)) badXwd.push(x);

  const out = rows.map((r) => {
    const m = HEAD.exec(r.file_id);
    if (!m) { unmatched.push(r.file_id); return { ...r }; }
    let file_id = r.file_id.replace(HEAD, `${orderMap.get(m[1])}_${nameMap.get(m[2])}_${m[3]}_`);
    file_id = file_id.replace(XWD_TOKEN, (tok) => xwdMap.get(tok) ?? tok);
    return { ...r, file_id };
  });
  return { rows: out, nameMap, orderMap, xwdMap, unmatched, badXwd };
}
