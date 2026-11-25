# Spans and lists in one text node

Issue 93: a CV bullet with a bold lead-in took a frame of three nodes (a marker, a fixed-width text,
a hug-height workaround). The goal was one text node that holds styled stretches and a list.

## Why the layout engine needed more than a flag

The text engine assumed one font face per node. A face is a family, a weight and a style, and each
has its own registry of files, so a bold span cannot be shaped by the node's shaper. Layout now takes
one shaper per span and cuts every shaped stretch at span boundaries, on top of the cuts bidi levels
already made. Line breaking still measures whole words, so a word that crosses a span boundary
keeps one width. Glyph `cluster` stays an offset into the whole `text`, which the PDF relies on to
give each glyph its character.

Three things were not obvious:

- **The engine loads fonts per face.** The layout cache key, the family lookup and the "are all files
  loaded" check each had to include the span faces, or a span's file never loaded and the text stayed
  on the Canvas 2D fallback. Each span only asks for the files its own slice of the text needs.
- **Spans are offsets, so they go stale.** Typing changes `text` and leaves the offsets pointing at
  other characters. The operations layer cuts spans to the new length when a patch changes `text`
  alone, and rejects spans that overlap or run past the text. Callers that move words send `spans`
  with the text.
- **The list marker is not a character of the text.** It hangs in the margin on a paragraph's first
  line and carries the line's start as its cluster, plus `markerText` so the PDF can write it as
  selectable text. Wrapping uses the box width minus the indent, and alignment works inside what is
  left of the margin.

## No format version bump

A new property normally needs a migration step. Three siblings were bumping the version at the same
time, so the stored schema gives `spans`, `listStyle` and `listIndent` defaults instead. Files from
before read as no spans and no list. Revisit if a later change needs to rewrite stored data.

## Limits left in

The Canvas 2D fallback and the in-place editor draw the node's own style, so a span shows once the
fonts load. The SVG writes a span's weight as an attribute, which needs that weight in the renderer's
fonts. The panel sets a list style; spans are set through MCP.
