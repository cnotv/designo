---
sidebar_position: 3
---

# Architecture

Designo is a pnpm workspace. Every change to a document, whoever makes it, is a
`DesignOperation` applied by `@designo/core`, so the editor, agents and (later) multiplayer
share one path for validation, undo and sync.

```
agent (Claude) ──stdio──▶ @designo/mcp ──▶ @designo/storage ──▶ ~/.designo-data/*.designo.json
                                │                   ▲
                                ▼                   │ dev server /api/files (polled)
                          @designo/core ◀──── @designo/editor (Vue 3, canvas)
```

## Packages

| Package            | Status  | Role                                                                        |
| ------------------ | ------- | --------------------------------------------------------------------------- |
| `@designo/core`    | built   | Document model, operations, queries. Pure: no DOM, no I/O                   |
| `@designo/storage` | built   | Validated, atomic file reads and writes; zod schemas shared with the editor |
| `@designo/mcp`     | built   | MCP server for agents (stdio)                                               |
| `@designo/editor`  | viewer  | Vue 3 app: canvas, panels, tools                                            |
| `renderer`         | phase 1 | WebGL2 scene renderer, WebGPU later; replaces the Canvas 2D stopgap         |
| `server`           | phase 5 | Yjs sync, presence and persistence (SQLite); replaces polling               |
| `exporter`         | phase 4 | SVG, PNG, PDF and Vue/HTML code                                             |

## Document model

A document is a flat map of nodes keyed by id. Each node has a `parentId` and an `order`
among its siblings, so a move is a two-field change and concurrent edits merge cleanly once
Yjs arrives. Coordinates are absolute on the page.

`applyOperations` applies a batch atomically: if any operation fails, the document is returned
unchanged. The MCP `apply_ops` tool relies on this, so an agent's half-finished layout never
lands on disk.

## Serving

- **Development:** `pnpm dev` runs Vite, whose `designoFilesPlugin` answers `/api/files`.
- **Self-hosted:** `pnpm start` runs `packages/editor/server/productionServer.ts`, which serves
  the built editor and the same `/api/files` handler (`server/filesApi.ts`). Node runs it
  straight from TypeScript. It listens on loopback unless `HOST` says otherwise; in the Docker
  image Caddy puts HTTPS and basic auth in front.
- **Static demo:** with no files API (Netlify), `useDesignoFiles` falls back to a bundled sample.
- **MCP:** stdio only. A remote agent reaches it through `ssh` and `docker exec`, so it needs no
  network listener or login of its own.

Deployment files: `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `netlify.toml`,
`deploy/hetzner/cloud-init.yaml`, and the workflows in `.github/workflows`. How to use them:
the self-hosting guide.

## Files

Files are `<id>.designo.json` in `DESIGNO_DATA_DIR`, by default `~/.designo-data`. Writes go to
a temporary file and are renamed into place, so the editor never reads half a file. File ids
are validated before they become paths.

## Decisions still open

- **UI component library** for the editor's panels. The shared agreements rule out building one;
  candidates: Reka UI (headless, Vue), PrimeVue (complete, themeable), Naive UI.
- **Text shaping:** HarfBuzz compiled to WebAssembly is the likely choice for the WebGL renderer.
