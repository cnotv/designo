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
- **Instancing was the slow part, on software GL.** The first version drew each glyph as an
  instance of a shared quad. At 5,000 labels (60,000 glyphs) frames took 750 ms at fit-to-screen
  zoom against 160 ms for the per-node textures it replaced, and the profile showed the main thread
  idle: one `drawArraysInstanced` took 1.1 s to finish. A bare WebGL2 test drawing 60,000 quads
  of 3 pixels took 1.4 s instanced and 42 ms as indexed triangles with the same shader and
  textures. Glyphs are now four vertices each (position, atlas position, colour) over one shared
  index pattern, with the rotation applied on the CPU. Before that, sending the rotation's cosine
  and sine instead of an angle, writing straight into one buffer and a linear `batchScene` took
  the instanced version from 100 to 130 ms to about 85 ms in a profile, and copying a node's
  fields out of the reactive document once per node took it to 50 to 65 ms; those stayed.
- **Snapping to the pixel grid.** Measured against the browser's own text (`?renderer=canvas2d`)
  on the recorded document at device pixel ratio 2, the 90th percentile of edge gradients was 188
  against 197 at 100% and 171 against 192 at 400% before snapping, because a glyph corner between
  two pixels is filtered across both. Snapping upright glyphs' corners to whole device pixels
  gave 197 against 197 at 100%, 200 against 192 at 400% and 180 against 196 at 25%, where the text
  is shown 2x below its 16-pixel bucket and a little soft. The mean absolute difference from the
  browser's text is 0.2 grey levels of 255 at 25%, 1.1 at 100% and 2.2 at 400%.
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

## Frame times with 5,000 text layers

The 5,000-layer document (a hundred columns of one-line labels, 16 and 20 pixel Inter, two
colours), headless Chromium on software GL (SwiftShader), 1400 by 900 viewport. Each cell is the
median and 95th percentile frame time in ms over 90 frames of wheel input, panning or zooming,
after the document had loaded and fonts were ready. "Fit" shows every label at about 5%; 25% and
100% show about 2,300 and 150 of them. The earlier path rasterised each text node into a texture.

| Device pixel ratio 1 | per-node textures | glyph atlas |
| -------------------- | ----------------- | ----------- |
| fit, pan             | 42 / 248          | 17 / 85     |
| fit, zoom            | 162 / 357         | 49 / 80     |
| 25%, pan             | 182 / 237         | 17 / 20     |
| 25%, zoom            | 133 / 243         | 19 / 31     |
| 100%, pan            | 17 / 36           | 17 / 18     |
| 100%, zoom           | 17 / 23           | 17 / 24     |

| Device pixel ratio 2 | per-node textures | glyph atlas |
| -------------------- | ----------------- | ----------- |
| fit, pan             | 48 / 228          | 19 / 60     |
| fit, zoom            | 203 / 2478        | 43 / 70     |
| 25%, pan             | 56 / 112          | 17 / 32     |
| 25%, zoom            | 34 / 198          | 32 / 60     |
| 100%, pan            | 19 / 92           | 17 / 21     |
| 100%, zoom           | 18 / 46           | 23 / 39     |

The per-node path pays again at every zoom bucket, because each of the thousands of visible
labels is rasterised and uploaded anew; the atlas draws a glyph once per bucket however many labels
show it. Loading the document costs the same either way (about 22 s of one long frame in this
environment, almost all of it the layers panel and the document, not the text). The numbers
are relative: software GL is far slower than a GPU, and the first run of the glyph path, with
instances, was slower than the old one until it was changed to triangles.
