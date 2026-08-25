// The ONLY three things normalized before diffing. Keep this list short and explicit:
// every extra mask is a place the harness goes blind.
//
//  1. <NestingGroup>   - a fresh randomUUID() on every run (createXML.js:79). No signal.
//  2. <LogisticGroup>  - `${uuid}_${meters}m`. ONLY the 36-char UUID is masked; the
//                        `_Nm` suffix is compared BYTE FOR BYTE, because the metre count
//                        is exactly what BUG 4 can move. Masking the whole element would
//                        blind the harness to the very thing it exists to catch.
//  3. <Path>           - absolute prefix up to \PRINTED\ is machine-specific (xmlPath).
//                        Everything from PRINTED\ onwards (day, batch, file name) is kept.
//
// Nothing else is masked - in particular nothing carrying metres, widths or heights.
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const BS = String.fromCharCode(92);
const PRINTED_SEG = BS + "PRINTED" + BS;

export const UUID_TOKEN = "{{UUID}}";
export const ROOT_TOKEN = "{{XMLROOT}}";

export function maskXml(xml) {
  let out = xml.replace(new RegExp(`(<NestingGroup>)${UUID}(</NestingGroup>)`, "gi"), `$1${UUID_TOKEN}$2`);
  // Leading UUID only - the `_<metres>m` tail is deliberately untouched.
  out = out.replace(new RegExp(`(<LogisticGroup>)${UUID}(_)`, "gi"), `$1${UUID_TOKEN}$2`);
  out = out.replace(/<Path>([^<]*)<\/Path>/g, (full, p) => {
    const i = p.indexOf(PRINTED_SEG);
    return i < 0 ? full : `<Path>${ROOT_TOKEN}${p.slice(i)}</Path>`;
  });
  return out;
}
