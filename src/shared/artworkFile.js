// What kind of artwork a print file is, read from its extension - the one place that knows the list.
//
// A PDF is a FINISHED print: the platform that renders it (Shopify, for the ON files) has already
// scaled the pattern and repeated it across the fabric width. An image is ONE tile of a pattern,
// taken as it lies from the Etsy library folder (FILIP 2026-10-21: no PDF is built for Etsy, the
// PrintFactory workflow scales and repeats the tile itself). So an image needs one more fact the
// PDF does not: how the tile repeats. It travels in the file name, copied from the library name
// "<TITLE> XWD<n>_<designer>_<repeat>_<dpi>_<date>.<ext>", and leaves in the XML as <RepeatType>.
// The <dpi> number of the name is not used: the RIP takes the DPI stored in the image (P104).

export const PDF_EXT = "pdf";

// Lower case, without the dot. pdf-lib embeds only JPG and PNG, which is why no PDF is built:
// the RIP reads every one of these itself.
export const IMAGE_EXTS = Object.freeze(["jpg", "jpeg", "png", "tif", "tiff", "gif", "webp"]);

// The repeat types of the Etsy library names (measured 2026-10-21: Basic 1010, Half-Drop 48,
// Half-Brick 21, Center 2, Mirror 1), spelled as the library spells them - that spelling is what
// <RepeatType> carries.
export const REPEAT_TYPES = Object.freeze(["Basic", "Half-Drop", "Half-Brick", "Center", "Mirror"]);

// <RepeatType> of a PDF: a finished print does not repeat.
export const REPEAT_NONE = "None";

const IMAGE_EXT_SET = new Set(IMAGE_EXTS);

const normExt = (ext) =>
  String(ext ?? "")
    .trim()
    .replace(/^\./, "")
    .toLowerCase();

export const isImageExt = (ext) => IMAGE_EXT_SET.has(normExt(ext));

// The canonical spelling of a repeat type token (any case), or null for anything else.
export const repeatTypeOf = (token) => {
  const t = String(token ?? "").trim().toLowerCase();
  return REPEAT_TYPES.find((r) => r.toLowerCase() === t) ?? null;
};

// The extension of a tracked file, from file_stages.ext (E3a-2). The column is NULL for every PDF (and
// for every row an older build wrote), so anything that is not an image extension of the list above -
// NULL, "", an unknown word, a path fragment - is a PDF. The value of the database never reaches a
// path raw: only a member of IMAGE_EXTS (compared without case) comes through, spelled as it was
// stored (the spelling of the file on the disk), without the dot.
export const stageFileExt = (ext) => {
  const clean = String(ext ?? "")
    .trim()
    .replace(/^\./, "");
  return IMAGE_EXT_SET.has(clean.toLowerCase()) ? clean : PDF_EXT;
};

// What file_stages.ext stores for a file whose extension the parser read: NULL for a PDF.
export const stageExtToStore = (ext) => {
  const clean = stageFileExt(ext);
  return clean === PDF_EXT ? null : clean;
};

// The file of a file_stages row inside its batch folder. `row` needs file_id and ext (batch_path only
// for stageFilePath).
export const stageFileName = (row) => `${row.file_id}.${stageFileExt(row.ext)}`;
export const stageFilePath = (row) => `${row.batch_path}\\${stageFileName(row)}`;
