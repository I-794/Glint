// v39 — hold to compare: while the backslash key is held, the preview shows
// the screenshot without its flip, grade, curves, Bokeh, Compare or filters
// (Lightroom's key). Runtime only: never in snapshot() or saved. renderInto
// counts the export renders it is inside, so an export made mid-hold is graded.
export const holdOriginal = { held: false, exporting: 0 };

export function showingOriginal() {
  return holdOriginal.held && holdOriginal.exporting === 0;
}
