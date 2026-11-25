# PDF metadata and tagged structure

Findings from #96.

- **pdfkit writes no XMP at its default version.** The default is PDF 1.3, and `endMetadata`
  skips the XMP stream there. The export asks for 1.7, which also covers tagging (1.4 or later).
- **pdfkit does not escape the XMP.** It copies the info fields into the XML as they are, so a
  title with `&` or `<` produced invalid XMP. The exporter wraps `appendXML` and escapes only the
  XMP copy; the info dictionary keeps the raw text.
- **Info strings are separate objects.** `/Title` points to an indirect object, so a test finds
  the value as `(text)`, not as `/Title (text)`.
- **Metadata is document level, so it needed an operation.** A new `updateMetadata` operation
  keeps it on the same undo and sync path as every other change. An emptied field is removed, and
  an emptied metadata object leaves no key, so undo gives back the exact document.
- **`pdfTag` is optional on a node.** Absent means untagged, so no format version bump and no
  migration was needed.
- **Reading order is draw order.** Tagged text is collected while the pages are drawn and the
  structure tree is built at the end, so the order follows the child order of each frame.
  Consecutive list items become one `L`, each as `LI` holding an `LBody`.
