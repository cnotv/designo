# Why an auto width text started at the wrong size

Findings from #106.

- **A box was measured only when someone edited the text.** The editor's measurer runs inside
  `createPropertyOperations`, so a text made by an operation batch (the palette sample, an agent
  edit) or loaded from a file kept the box it was created with. That box came from a character
  count estimate, or from a layout made before its fonts were available.
- **Fonts arrive after the first frame.** The shaped layout does not exist until the font loads,
  so the first measure of any text can only be an estimate. Nothing asked again when the font
  arrived, so the estimate stayed.
- **The fix measures again, and never writes an estimate.** `useTextBoxFitting` runs
  `findStaleTextBoxes` when a file loads, when the document changes and on every text engine
  notification. A text whose layout is still `undefined` is skipped, so the saved box only ever
  holds a shaped size. The correction is applied without a history step, because undoing it
  would bring the wrong box back.
- **The MCP server had the same gap.** Its refit list omitted `fontWeight`, `fontStyle` and
  `letterSpacing`, so changing one of them left the old width.
- **Inter at 14px is narrower than it looks.** `#2d6a4f` shapes to 57 by 17. At low zoom the
  eight selection handles cover most of a box that small, which can read as a box that does not
  fit when it does.
