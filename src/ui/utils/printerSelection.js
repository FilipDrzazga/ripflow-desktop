// The printer the selection bar shows as chosen, after the selection changed. `auto` is what the bar
// would pick on its own (the shared preferred printer, else the only printer of the class);
// `lastAuto` is what it picked on its own the previous time.
//
// A printer the operator chose BY HAND is kept for as long as the material class stays the same -
// adding or removing files must never switch it silently, or Rip goes to a printer nobody picked
// (S2's review of preferred-printer C: manual YUMI, untick a file, the bar flipped to YOKO). The
// bar follows `auto` only when nothing is chosen, or when the current choice was its own previous
// pick. A class change resets, as it always has: a printer of the old class cannot print the new.
export const nextSelectedPrinter = ({ current, lastAuto, auto, classChanged }) => {
  if (classChanged) return auto;
  if (current === null || current === undefined || current === lastAuto) return auto;
  return current;
};
