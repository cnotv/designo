# Designo

A personal, self-hosted design tool, with its own MCP server, so you and
your agents can design without usage limits. Local-first: your files live on your disk.

## Plan

[![The Designo plan: architecture, MCP tools, milestones and risks](documentation/static/img/plan.svg)](https://claude.ai/artifact/V8reHYNtJRQpuMm3M6diRx)

The image links to the [plan whiteboard](https://claude.ai/artifact/V8reHYNtJRQpuMm3M6diRx). In
the docs: [architecture](https://cnotv.github.io/designo/architecture) and
[roadmap](https://cnotv.github.io/designo/roadmap).

## Run it

Locally, with Node 24 and pnpm:

```sh
pnpm install
pnpm build && pnpm start     # http://127.0.0.1:3000
```

Or with Docker: `docker compose up -d --build`, on port 3020.

On a cloud server, put your reverse proxy in front of port 3020 with a login.

The [self-hosting guide](https://cnotv.github.io/designo/guides/self-hosting) covers Docker and
connecting agents to it, locally or over SSH. For development, `pnpm dev` runs the
editor with hot reload on port 5320.

## Docs and demo

- **Docs:** [cnotv.github.io/designo](https://cnotv.github.io/designo/), built with Docusaurus
  from `documentation/`.
- **Demo:** the editor on Netlify shows a sample file, since no server is behind it. Self-host to
  keep files and connect agents.

Connect an agent to the MCP server with the
[MCP guide](https://cnotv.github.io/designo/guides/mcp). Claude Code in this repository picks the
server up from `.mcp.json`.

## What works today

- **`@designo/core`:** the document model. Nodes (page, frame, group, rectangle, ellipse, text),
  atomic batches of create, update, delete and move operations, tree and paint-order queries.
- **`@designo/mcp`:** an MCP server over stdio with `list_files`, `create_file`,
  `get_document_tree`, `get_node`, `create_node`, `update_node`, `delete_node` and `apply_ops`.
- **`@designo/storage`:** validated, atomic reads and writes of `.designo.json` files.
- **`@designo/editor`:** a Vue 3 viewer that draws files on a canvas and follows edits live.
  Editing tools come in phase 1.

## Agent skills

The MCP server carries its own skills, served by `get_skill`, so an agent that connects to Designo
learns how to build with it (artist and stationery templates today) without any outside skill pack.
Skill packs elsewhere point at these skills, never the other way round. See
[Agent skills](https://cnotv.github.io/designo/architecture#agent-skills) in the architecture.

## Development

```sh
pnpm lint:check && pnpm format:check && pnpm type-check && pnpm test:unit && pnpm build
```

Agent rules and project facts: [AGENTS.md](AGENTS.md).

## License

Designo is free software under the [GNU Affero General Public License v3.0 or later](LICENSE).
You may use, change and share it, but a version you share, or run for other people as a service,
must stay under the same license with its source available to them. The license covers the code,
not what you make with it: your designs and the files you export are yours.

Contributions are accepted under the same license, see [CONTRIBUTING.md](CONTRIBUTING.md).
