const XML_PATH = '\\\\192.168.0.17\\Original_files\\SPPrintReadyArtwork';
const DATE = '21-05-2026';
const TIME = '122509';
const PRINTER = 'YOKO';
const FILENAME = 'ON313127_hannah_livesey_2of2_Neraki Waterproof Canvas FR (Water Repellant)_2x_Linear Meter - 1m increments_XWD325858f99f0f4aa3af803129c184abb3_FF.pdf';
const GROUP = 'Neraki Waterproof Canvas FR (Water Repellant)';

function buildPath(group, maxLen) {
  const g = maxLen ? group.slice(0, maxLen).trimEnd() : group;
  const folder = `PRINTED_${TIME}-${g}-${PRINTER}`;
  return `${XML_PATH}\\PRINTED\\${DATE}\\${folder}\\${FILENAME}`;
}

[null, 35, 30, 28, 25].forEach(len => {
  const p = buildPath(GROUP, len);
  const group = len ? GROUP.slice(0, len).trimEnd() : GROUP;
  const folder = `PRINTED_${TIME}-${group}-${PRINTER}`;
  const label = len ? `MAX=${len}` : 'bez limitu';
  const status = p.length > 260 ? '❌ PRZEKROCZONE' : '✅ OK';
  console.log(`[${label}] ${p.length} chars - ${status}`);
  console.log(`  Folder: ${folder}`);
  console.log('');
});
