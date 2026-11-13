# Roadmap

| Phase               | Scope                                                                                                  | Estimate | Status  |
| ------------------- | ------------------------------------------------------------------------------------------------------ | -------- | ------- |
| 0. Core             | Node model, operations, tests                                                                          | 1–2 wks  | done    |
| 1. Canvas MVP       | Pan and zoom, select, move, resize, draw shapes and text, layers and properties panels, WebGL renderer | 3–4 wks  | next    |
| 2. MCP v1           | Read and write tools, screenshots, Claude config                                                       | 1–2 wks  | partial |
| 3. Real design work | Pen tool and booleans, images, auto-layout, components and instances, variables                        | 6–8 wks  |         |
| 4. Export           | SVG, PNG, PDF, Vue and HTML code generation                                                            | 2–3 wks  |         |
| 5. Multiplayer      | Yjs sync server, presence, cursors, comments, auth                                                     | 2–3 wks  |         |
| 6. Polish           | WebGPU backend, sandboxed plugin API                                                                   | ongoing  |         |

MCP v1 is partial: the read and write tools work; `get_screenshot`, `get_selection`,
`export_code`, components and variables wait on the phases that build them.

## Risks

- **Text** is the hardest part: shaping, line breaking, rich-text spans and font loading.
- **Pen tool and boolean operations:** reuse a proven library (paper.js booleans, lyon or kurbo
  through WebAssembly) rather than writing one.
- **Legal:** copy features and workflows, not Figma's branding, icons or `.fig` internals.
