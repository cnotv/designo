# Links in the PDF export

Findings from adding a `link` property and its PDF annotations for #95.

- **A link is a rectangle in page space, written outside the node's drawing state.** The PDF
  library converts an annotation's box through the current transform, flip included, and that
  conversion mixes up the axes as soon as a rotation is active. Written inside a node's rotation,
  the box of a turned node comes out wrong. The link is therefore written after the node's state
  is restored, from the upright box that surrounds the node's turned corners. The box is right for
  the node's own rotation. A rotated ancestor still skews it, because the full matrix would be
  needed; this is a known ceiling, marked in the exporter.
- **Page space starts at the content, not at the design origin.** A page is as large as its
  visible content, so a node at 10, 20 has its box at the page corner, not at 10, 20. A test that
  expects the design coordinates fails for that reason alone, and it is the reader's box, not the
  author's, that the annotation needs.
- **Wrapped text is clickable per line, not per box.** The box of a wrapped text has empty corners
  beside short lines. The layout already knows each line's start, width and top, so one annotation
  per line follows the ink. Text with no layout available falls back to the node box.
- **The address is an input at three edges.** A file, an agent and the editor field all set it,
  so the scheme check lives once in core and the storage schema applies it. A PDF reader acts on
  the address, which is why `javascript:`, `file:` and plain `http:` are refused rather than
  trusted.
- **A new property on every node is a format version.** The stored schema requires every
  property, so `link` needed version 11 and a migration that gives old files none, in the same way
  as earlier properties.
- **A placeholder with two slashes breaks the editor's type check.** The template checker lost
  its narrowing of the selected node for everything after a field whose placeholder read like a
  web address. The error pointed at unrelated lines further down, which made it look like the link
  logic was at fault. Removing attributes one at a time found it; the placeholder now avoids the
  slashes.
