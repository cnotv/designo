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
