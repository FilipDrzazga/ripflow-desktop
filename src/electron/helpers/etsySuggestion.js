// The XWD number the Inbox bar SUGGESTS for an order line the importer could not read a number from (plan E4c).
// A hint for a person, never applied: the importer copies a file only for a number that came from the line or was
// typed into the bar. The listing title says the design and its designer ("Banana Print fabric by daisyhsteele"),
// and every library file name says the same thing in front of and behind its XWD token
// ("BANANA PRINT XWD110328_daisyhsteele_Basic_150_01102020.jpg").

const norm = (value) => ` ${String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
const squash = (value) => String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// "<design> XWD<six digits>_<designer>_..." - the number is read the way the library is named, six digits only.
const LIBRARY_NAME_RE = /^(.*?)[\s_-]*XWD(\d{6})_([^_]*)/i;

// A design or designer shorter than this is too common a word to prove anything.
const MIN_DESIGN_LENGTH = 4;
const MIN_DESIGNER_LENGTH = 3;

// -> "110328" or null. `names` = the file names of the library folder, `isImage` the artwork test of the import.
// Only a number that names EXACTLY ONE library image is suggested (a second version or a " copy" of the file would
// make the retry fail with "N images carry XWD..." anyway), and only when the title matches ONE number: the design
// name must OPEN the title as whole words (a title that merely contains a design's name - "Geometric Fox" for "Fox" - is
// another design), and the designer, ignoring spaces and case, must be in it too.
export const suggestXwdForTitle = (title, names, isImage) => {
  const titleWords = norm(title);
  const titleSquashed = squash(title);
  if (titleSquashed === "" || !Array.isArray(names)) return null;

  const filesOf = new Map(); // number -> library image names
  const entries = new Map(); // number -> { design, designer }
  for (const name of names) {
    if (!isImage(name)) continue;
    const m = LIBRARY_NAME_RE.exec(name);
    if (!m) continue;
    const [, design, xwd, designer] = m;
    filesOf.set(xwd, [...(filesOf.get(xwd) ?? []), name]);
    if (!entries.has(xwd)) entries.set(xwd, { design, designer });
  }

  const matches = [];
  for (const [xwd, { design, designer }] of entries) {
    const designWords = norm(design);
    if (designWords.trim().length < MIN_DESIGN_LENGTH || !titleWords.startsWith(designWords)) continue;
    const designerSquashed = squash(designer);
    if (designerSquashed.length < MIN_DESIGNER_LENGTH || !titleSquashed.includes(designerSquashed)) continue;
    matches.push(xwd);
  }
  // A second match is an ambiguity even when its own files are doubled, so the file count is asked only now.
  return matches.length === 1 && filesOf.get(matches[0]).length === 1 ? matches[0] : null;
};
