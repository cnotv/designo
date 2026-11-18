# Text shaping with HarfBuzz

Findings from building the shaping foundations for #10.

- **harfbuzzjs is the official build.** The npm package comes from the `harfbuzz/harfbuzzjs`
  repository. It is an ES module with a top-level `await` that starts the WebAssembly, and it
  finds `harfbuzz.wasm` beside itself with `new URL('harfbuzz.wasm', import.meta.url)`. Vitest in
  Node reads the file from disk. Vite's production build emits the `.wasm` as an asset and puts
  harfbuzzjs in its own chunk, loaded by a dynamic `import()` on first use. Vite's dev server
  breaks it unless `optimizeDeps.exclude` lists it: pre-bundling moves the script away from its
  `.wasm`, and the fetch then gets `index.html` back ("expected magic word").
- **Shape in font units.** The wasm font's scale defaults to the font's units per em, so one
  shaping serves every font size and zoom; layout multiplies advances by size over units per em.
- **Clusters are UTF-16 offsets.** `addText` takes a JavaScript string, so a character outside
  the basic plane counts two, which lines up with string indices.
- **Inter has no `fi` ligature.** Its ligature-like substitutions are contextual (arrows, stacked
  marks). The ligature test uses a small Noto Sans subset kept as a test fixture.
- **Fonts are subset, static and raw sfnt.** HarfBuzz does not read WOFF2. Inter comes from the
  rsms/inter v4.1 release, the Noto Sans scripts from the variable fonts in google/fonts,
  instantiated at weight 400 and subset with `pyftsubset` to the ranges in `fontCatalogData.ts`.
  The four files come to about 470 KB, and only Inter loads for Latin, Greek and Cyrillic text.
- **Neutrals belong to the font before them.** Space, digits and punctuation are claimed by every
  script font, and a character keeps the current font when it can, so an Arabic sentence with
  numbers is one run in one font instead of being cut at every space.
- **Bidi is a subset.** Levels follow the Unicode algorithm's weak and neutral rules (W1 to W4,
  W7, N1, N2, I1, I2) and run reordering (L2). Explicit embeddings and isolates are not applied.

## Drawing the shaped text

What building the glyph atlas and the WebGL text path (the rest of #10) taught.

- **Coverage, not a signed distance field.** The outline from `glyphToPath` becomes a `Path2D`,
  filled on an `OffscreenCanvas` at the zoom bucket's size, and the alpha channel is the atlas
  texel. A glyph is shown at its bucket's size or up to a factor of two below it, where coverage is
  exact. A signed distance field was not built: it would have needed a second shader and rounds
  sharp corners, and coverage matched the browser's own text closely at the sizes that matter
  (numbers below). Beyond 256 pixels per em the bucket stops growing and the quad scales up, and
  past 512 a node goes to the Canvas 2D path, which stays sharp.
- **The bitmap is cut on whole pixels** (`planGlyphRaster`), one pixel of margin around the
  outline's box, so its pixels line up with the outline whatever the glyph's own position.
- **One draw per run of glyphs on a page.** WebGL2 has no base instance, so a run starts by
  pointing the instance attributes at its offset with `vertexAttribPointer`. Texts in paint
  order that sit on different pages split into runs, so overlapping text never draws out of order.
- **Profile-guided changes.** The first working version took 100 to 130 ms a frame at 5,000
  labels in headless Chromium. Sending the rotation's cosine and sine instead of an angle (the
  vertex shader took them per vertex), writing instances straight into one buffer instead of an
  array per glyph, and making `batchScene` linear took it to about 85 ms. Reading the reactive
  document was the rest: the scene reads nodes through Vue's proxy, and ten tracked reads per
  glyph for 60,000 glyphs was a third of a frame in the profile. Copying a node's fields out once
  per node took it to 50 to 65 ms.
- **`batchScene` was quadratic** once texts could share a batch, because each item copied the
  batch before it. It is one pass now.
- **Fonts for the browser's own text.** The editing box and the Canvas 2D fallback use the
  browser's font stack, which showed the system's `system-ui` for Arabic and a different Inter, so
  the box did not line up with the shaped text. The bundled files are declared with `@font-face`
  under their own `designo-` names, which leaves the app's own use of Inter alone, and listed
  first.
- **Missing glyphs.** The bundled Inter subset has an empty `.notdef`, so a character inside Inter's
  ranges but not in the subset draws nothing. A character outside every bundled font (emoji,
  CJK) would too, which is worse than the system's glyph, so a node holding one is drawn by
  Canvas 2D instead, in colour.
- **Inter has no `fi` ligature**, so the recorded document shows kerning and Arabic's mandatory
  lam-alef ligature instead.
