---
sidebar_position: 4
---

# Roadmap

Phases 0 and 1 are done, and the shared-server deploy is merged. What is left runs in the order below.

| Step                        | Scope                                                                                                                                                                                                                  | Estimate | Status  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| 0. Core                     | Node model, operations, tests                                                                                                                                                                                          | 1–2 wks  | done    |
| 1. Canvas MVP               | Pan and zoom, select, move, resize, draw shapes and text, layers and properties panels, undo                                                                                                                           | 3–4 wks  | done    |
| Shared-server deploy        | Hetzner deploy behind a reverse proxy                                                                                                                                                                                  |          | done    |
| 2. MCP v1                   | Read and write tools done. `get_screenshot` ships with SVG and PNG export below. `get_selection` waits on phase 5                                                                                                      | 1–2 wks  | partial |
| Editor basics               | Duplicate, copy and paste, group and ungroup, bring forward and send back, align and distribute, snapping and smart guides, rotation, inline text editing, frames clipping their contents, more than one page per file | 2–3 wks  |         |
| File format versions        | Files are `formatVersion` 1 and the schema accepts only that. Add a migration path before any new node type. Blocks phase 3                                                                                            | 1 wk     |         |
| SVG and PNG export          | SVG from the document, PNG through resvg, both in Node. Ships `get_screenshot` and completes MCP v1 screenshots                                                                                                        | 1 wk     |         |
| WebGL renderer: shapes      | WebGL2 drawing of basic shapes and a spatial index for culling (#9, split from #5)                                                                                                                                     | 2 wks    |         |
| WebGL renderer: text        | Text through HarfBuzz and WebAssembly with a glyph atlas, the biggest risk (#10)                                                                                                                                       | 3–4 wks  |         |
| WebGL renderer: hit testing | Hit testing through the spatial index (#11)                                                                                                                                                                            | 1 wk     |         |
| 3. Real design work         | In order: auto-layout (a pure engine in `@designo/core`), components and instances with overrides, variables with an MCP tool, images with asset storage, pen tool and booleans last                                   | 6–8 wks  |         |
| 4. Export                   | Vue and HTML code generation after auto-layout, then PDF. SVG and PNG are already done                                                                                                                                 | 2–3 wks  |         |
| 5. Multiplayer              | Yjs sync server. The MCP server writes through it, which removes the two-writer race. `get_selection` comes from presence. Cursors, comments, real sign-in                                                             | 2–3 wks  |         |
| 6. Polish                   | WebGPU backend, sandboxed plugin API                                                                                                                                                                                   | ongoing  |         |

MCP v1 is partial: the read and write tools work. `get_screenshot` lands with SVG and PNG export,
`get_selection` with phase 5, and `export_code`, components and variables with the phases that
build them.

## Risks

- **Text** is the hardest part: shaping, line breaking, rich-text spans and font loading.
- **Pen tool and boolean operations:** reuse a proven library (paper.js booleans, lyon or kurbo
  through WebAssembly) rather than writing one.
- **Two writers:** until phase 5, the editor and the MCP server both write the same files.
- **Legal:** copy features and workflows, not Figma's branding, icons or `.fig` internals.
