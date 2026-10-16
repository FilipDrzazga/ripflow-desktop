// Text of the "Printed metres" tile and of its Copy buttons (the KPI sheet is filled by pasting).

// One decimal: the operators round the metres anyway and the Cloud's own figure is the height of
// the printed content, not a measured length.
export const formatMetres = (metres) => (Math.round(metres * 10) / 10).toFixed(1);

// "2026-10-15" -> "15/10"
export const dayHeading = (dayKey) => `${dayKey.slice(8, 10)}/${dayKey.slice(5, 7)}`;

// A machine that printed nothing that day is shown as a dash, not as 0.0 m.
export const metresCell = (cell) => (cell.jobs > 0 ? formatMetres(cell.metres) : "-");

// What Copy puts on the clipboard for one day (`field` is "yesterday" or "today"): one line per
// machine that printed that day, "<machine><TAB><metres>", so a paste lands in two spreadsheet columns.
export const metresCopyText = (devices, field) =>
  devices
    .filter((device) => device[field].jobs > 0)
    .map((device) => `${device.name}\t${formatMetres(device[field].metres)}`)
    .join("\n");
