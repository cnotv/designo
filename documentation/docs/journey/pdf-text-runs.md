# PDF text came out without spaces

Issue 97: `export_pdf` drew every glyph in its own `BT ... ET` block and wrote no space characters.
`pdftotext` rebuilt the words from the gaps between glyphs, so the file looked fine to it. Parsers
that join glyphs (pdf.js in OpenResume) returned `SeniorFrontendEngineerwith15years`, and `pypdf`
lost the spaces on small lines only, so the result depended on the font size.

## The cause

The layout lists a glyph for every space, but the exporter skipped any glyph whose text was blank.
A space that is never drawn is never encoded, so pdfkit never adds it to the `ToUnicode` map of the
font subset, and nothing in the file says a space exists. The gap between two words was only an
empty stretch of the page.

## The fix

One text object per word, in one font and moving forward. The spaces after a word are appended to
that word's text, which encodes the space glyph and puts `U+0020` in the `ToUnicode` map. A blank
that starts a line has no word to join and is dropped.

## What was not obvious

- pdfkit's public `text()` takes a string and advances by the font's own widths. The layout engine
  has already placed each glyph with kerning and letter spacing, and the two can differ. There is no
  public call for per-glyph `TJ` adjustments, and `_font.encode` is private and untyped. The gap
  between the layout's position for a word's last glyph and the font's advance is therefore spread
  over the word as `characterSpacing`, which keeps each word's start and end exact.
- The test has to read the text layer the way a parser does. With no PDF parser in the repository,
  `pdf.test.ts` inflates the content streams and maps glyph ids through each font's `ToUnicode`.
  Decode the file as latin1 through `Buffer`: `TextDecoder('latin1')` is windows-1252 and corrupts
  bytes from 0x80 to 0x9f, which breaks `inflate`.
