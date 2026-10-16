// Text of the "Printed metres" tile and of its Copy buttons (the KPI sheet is filled by pasting).

// One decimal: the operators round the metres anyway and the Cloud's own figure is the height of
// the printed content, not a measured length.
export const formatMetres = (metres) => (Math.round(metres * 10) / 10).toFixed(1);

// "2026-10-15" -> "15/10"
export const dayHeading = (dayKey) => `${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}`;

// A machine that printed nothing that day is shown as a dash, not as 0.0 m.
export const metresCell = (cell) => (cell.jobs > 0 ? formatMetres(cell.metres) : "-");

// The tile's figure: the number with its unit. The Copy text stays unit-free (it is pasted into a sheet).
export const metresLabel = (cell) => (cell.jobs > 0 ? `${formatMetres(cell.metres)} m` : "-");

// The RipFlow printer a Cloud machine name belongs to ("d.gen Artrix H8" -> DGEN, "YOKO 1" -> YOKO), or null.
// The Cloud names are free text and not mapped to the profile, so a printer owns a machine when its code is
// the start of the name, letters and digits only, any case. The longest code wins.
const alnum = (text) => text.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const printerCodeOfDevice = (deviceName, printerCodes) => {
  const name = alnum(deviceName);
  let best = null;
  for (const code of printerCodes) {
    if (name.startsWith(alnum(code)) && (best === null || code.length > best.length)) best = code;
  }
  return best;
};

// What the badge in front of a machine says: the printer code, plus the last word of the Cloud name
// ("YOKO 1") when two machines of the list belong to the same printer - without it two rows would
// carry the same badge. A machine no printer owns keeps its Cloud name and gets no code (code: null).
export const deviceBadges = (deviceNames, printerCodes) => {
  const codes = deviceNames.map((name) => printerCodeOfDevice(name, printerCodes));
  return deviceNames.map((name, i) => {
    const code = codes[i];
    if (code === null) return { code: null, text: name };
    const shared = codes.filter((c) => c === code).length > 1;
    const tail = name.trim().split(/\s+/).at(-1);
    return { code, text: shared && alnum(tail) !== alnum(code) ? `${code} ${tail}` : code };
  });
};

// What Copy puts on the clipboard for one day (`field` is "yesterday" or "today"): one line per
// machine that printed that day, "<machine><TAB><metres>", so a paste lands in two spreadsheet columns.
export const metresCopyText = (devices, field) =>
  devices
    .filter((device) => device[field].jobs > 0)
    .map((device) => `${device.name}\t${formatMetres(device[field].metres)}`)
    .join("\n");
