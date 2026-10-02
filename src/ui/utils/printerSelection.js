// The printer the selection bar shows as chosen, after the selection changed. `auto` is what the bar
// would pick on its own (the shared preferred printer, else the only printer of the class).
//
// A printer the operator chose BY HAND is kept for as long as the material class stays the same -
// adding or removing files must never switch it silently, or Rip goes to a printer nobody picked
// (S2's review of preferred-printer C: manual YUMI, untick a file, the bar flipped to YOKO). The
// bar follows `auto` only when nothing is chosen, or when the current choice was its own pick.
// A class change resets, as it always has: a printer of the old class cannot print the new.
//
// `manual` is the explicit flag (D10): true once the operator clicked a radio, whatever the printer
// happens to equal later - a hand pick that converges with the auto pick (manual YOKO, then the
// shared preference becomes YOKO) must stay a hand pick. Undefined counts as not manual.
export const nextSelectedPrinter = ({ current, manual, auto, classChanged }) => {
  if (classChanged) return auto;
  if (current === null || current === undefined) return auto;
  return manual ? current : auto;
};

// The selection bar's state: the printer plus the flag saying who chose it.
export const NO_PRINTER = Object.freeze({ printer: null, manual: false });

// The operator clicked a printer radio.
export const pickPrinterByHand = (code) => ({ printer: code, manual: true });

// The selection (files or class) changed. The flag is cleared with the printer: a class change or an
// empty choice hands the bar back to `auto`, and an auto pick is never a hand pick.
export const nextPrinterSelection = ({ current, auto, classChanged }) => {
  const printer = nextSelectedPrinter({ current: current.printer, manual: current.manual, auto, classChanged });
  const keepsHandPick = !classChanged && current.manual && current.printer !== null && current.printer !== undefined;
  return { printer, manual: keepsHandPick };
};
