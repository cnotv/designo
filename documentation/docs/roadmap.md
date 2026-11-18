---
sidebar_position: 4
---

# Roadmap

Phases 0 and 1 are done, and the shared-server deploy is merged. What is left runs in the order below.

| Step                        | Scope                                                                                                                                                                                                                                  | Estimate | Status  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| 0. Core                     | Node model, operations, tests                                                                                                                                                                                                          | 1–2 wks  | done    |
| 1. Canvas MVP               | Pan and zoom, select, move, resize, draw shapes and text, layers and properties panels, undo                                                                                                                                           | 3–4 wks  | done    |
| Shared-server deploy        | Hetzner deploy behind a reverse proxy                                                                                                                                                                                                  |          | done    |
| Accounts and sign-in        | Google sign-in, approval by admins or auto-approve lists, designs kept per account, an Accounts screen, stdio MCP as an account, a remote `/mcp` agents sign in to with OAuth (#32)                                                    |          | done    |
| 2. MCP v1                   | Read and write tools done. `get_screenshot` ships with SVG and PNG export below. `get_selection` waits on phase 5                                                                                                                      | 1–2 wks  | partial |
| Editor basics               | Duplicate, copy and paste, group and ungroup, bring forward and send back, align and distribute, snapping and smart guides, rotation, inline text editing, frames clipping their contents, more than one page per file (#13, #14, #16) | 2–3 wks  |         |
| File format versions        | Files carry a `formatVersion` (3 now) and old files are migrated one step at a time on read (#12)                                                                                                                                      | 1 wk     | done    |
| SVG and PNG export          | SVG from the document, PNG through resvg, both in Node. Ships `get_screenshot` and completes MCP v1 screenshots (#15)                                                                                                                  | 1 wk     |         |
| WebGL renderer: shapes      | WebGL2 drawing of basic shapes and a spatial index for culling (#9, split from #5)                                                                                                                                                     | 2 wks    |         | done |
| WebGL renderer: text        | Text through HarfBuzz and WebAssembly with a glyph atlas, the biggest risk (#10)                                                                                                                                                       | 3–4 wks  | done    |
| WebGL renderer: hit testing | Hit testing through the spatial index (#11)                                                                                                                                                                                            | 1 wk     |         |
| 3. Real design work         | In order: auto-layout (a pure engine in `@designo/core`), components and instances with overrides, variables with an MCP tool, images with asset storage, pen tool and booleans last                                                   | 6–8 wks  |         |
| Print and book design       | Guides, pages in millimetres with bleed, master pages, gradients and blur, fonts and text styles, MCP fixes, then multi-page PDF. See [Print and book design](#print-and-book-design) (#42)                                            | 5–7 wks  |         |
| 4. Export                   | Vue and HTML code generation after auto-layout, then PDF. SVG and PNG are already done                                                                                                                                                 | 2–3 wks  |         |
| 5. Multiplayer              | Yjs sync server. The MCP server writes through it, which removes the two-writer race. `get_selection` comes from presence. Cursors, comments                                                                                           | 2–3 wks  |         |
| 6. Polish                   | WebGPU backend, sandboxed plugin API                                                                                                                                                                                                   | ongoing  |         |

MCP v1 is partial: the read and write tools work. `get_screenshot` lands with SVG and PNG export,
`get_selection` with phase 5, and `export_code`, components and variables with the phases that
build them.

## Print and book design

A 40-page picture book template was built twice, once as a PDF from a script and once in Designo through
the MCP server. The Designo version came out far worse, because each missing feature had to be faked with
shapes: 316 translucent fills and 110 stacked ellipses stood in for watercolour, 80 rectangles for guides,
37 page numbers were placed by hand, and text was broken into lines by hand. Each fake is listed below with the
feature that replaces it.

| What the template faked                                                                                                          | The feature                                                                                                                              | Lands in                |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Text set to wrap draws on one line in screenshots and SVG, so lines were broken by hand                                          | Wrapping in `get_screenshot` and `export_svg` through the same layout engine the editor uses                                             | MCP follow-up, first    |
| Children placed relative to a frame landed outside it, and nothing said so                                                       | Create and update results carry a warning when a node lies outside its parent frame, and the tool text says which coordinates it takes   | MCP follow-up, first    |
| Panels sized by guesswork, because text height is unknown                                                                        | A `measure_text` tool, and text boxes that grow to fit their text                                                                        | MCP follow-up, first    |
| Georgia drawn as a sans-serif in screenshots, and no way to add a font                                                           | Bundled serif faces (a metric-compatible Georgia replacement), fonts added per account, and screenshots shaped the way the editor shapes | Text, then MCP          |
| Bold italic chapter titles described in prose on a style card                                                                    | Font weight and style, letter spacing, paragraph spacing, justified text, rich-text spans                                                | Text                    |
| 80 rectangles drawn as margin, gutter, fold and focal guides, which would print                                                  | Layout guides (margins, columns, gutter, fold) kept on the page, always drawn under the content and never exported                       | New                     |
| Spreads as 840 x 420 pixel frames, with 3 mm bleed and trim converted by hand                                                    | Page size in millimetres or points, bleed, trim, facing pages and spreads, page order. Extends more than one page per file (#16)         | Editor basics, then new |
| 37 page numbers placed by hand                                                                                                   | Master pages and a page-number field                                                                                                     | New, with components    |
| A palette of 10 colours copied by hex into every node                                                                            | Colour and text styles, and variables                                                                                                    | 3. Real design work     |
| 316 translucent fills and 110 stacked ellipses as watercolour washes, with no place for painted artwork                          | Gradients, layer blur, blend modes such as multiply, shadows, and images with asset storage. Paper grain as a pattern or an image fill   | New, images in step 3   |
| Organic shapes limited to rectangles and ellipses                                                                                | Pen tool, paths, lines, polygons and booleans, brought forward in step 3                                                                 | 3. Real design work     |
| One file drawn by the editor, the screenshot tool and the PDF writer, with differences in blur, text or colour found only by eye | A shared visual test: render the same document in every renderer and compare the images, run with each new effect                        | New, alongside effects  |
| No PDF at all                                                                                                                    | Multi-page PDF with embedded fonts, bleed and trim marks, plus an `export_pdf` MCP tool. CMYK last                                       | 4. Export               |

The order follows how much each item improves what a person sees, per week of work:

1. **Server fonts** (#45). The production image has only DejaVu, so every screenshot there draws text in a
   generic sans-serif whatever font a node asks for. Bundling a serif and the full Inter comes first, because
   it colours every other judgement of a design.
2. **Blur, gradients, blend modes and shadows.** Hard-edged stacked ellipses are what make the washes in the
   template look flat. One blurred, gradient-filled shape replaces five of them. This is the larger half of the
   visual gap, and the harder half, since the WebGL editor and the SVG and PNG exporter must both draw it.
3. **The MCP fixes**, a few days: wrapping in screenshots and SVG export, a warning for a node outside its
   frame, and `measure_text`.
4. **Text styles**, then **pages, units and guides**, then images and master pages.
5. **PDF last**, because it needs all of the above.

**Render parity** runs alongside step 2. Designo draws with three renderers: WebGL in the editor, resvg for
screenshots and a PDF writer later. The screenshot is the only way an agent sees its work, so one file is
rendered by every renderer and compared, and each new effect lands with that comparison, not after it.

## Risks

- **Text** is the hardest part: shaping, line breaking, rich-text spans and font loading.
- **Pen tool and boolean operations:** reuse a proven library (paper.js booleans, lyon or kurbo
  through WebAssembly) rather than writing one.
- **Two writers:** until phase 5, the editor and the MCP server both write the same files.
- **Legal:** copy features and workflows, not Figma's branding, icons or `.fig` internals.
