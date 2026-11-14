---
sidebar_position: 2
---

# Connecting an agent to Designo

The MCP server runs over stdio. It reads and writes files in `DESIGNO_DATA_DIR`
(default `~/.designo-data`), the same folder the editor shows.

## Claude Code

Inside this repository nothing is needed: `.mcp.json` registers the server. Elsewhere:

```sh
claude mcp add designo -- npx tsx /absolute/path/to/designo/packages/mcp/src/main.ts
```

## Claude Desktop and other clients

```json
{
  "mcpServers": {
    "designo": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/designo/packages/mcp/src/main.ts"],
      "env": { "DESIGNO_DATA_DIR": "/absolute/path/to/your/designs" }
    }
  }
}
```

For a Designo running in Docker or on a server, see
[self-hosting](./self-hosting.md#connecting-an-agent): the same server runs inside the
container, reached over `docker exec` or SSH.

## Tools

| Tool                | Does                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- |
| `list_files`        | Lists files with their ids and names                                               |
| `create_file`       | Creates an empty file with one page; returns `fileId` and `pageId`                 |
| `get_document_tree` | Reads the node tree from the page, or from `nodeId`, to `depth` levels (default 3) |
| `get_node`          | Reads one node with every property                                                 |
| `get_screenshot`    | Renders the page, or `nodeId`, to a PNG image; `scale` 0.1 to 4 (default 1)        |
| `export_svg`        | Exports the page, or `nodeId`, as standalone SVG text                              |
| `create_node`       | Creates one frame, group, rectangle, ellipse or text node                          |
| `update_node`       | Changes some properties of one node                                                |
| `delete_node`       | Deletes a node and everything inside it                                            |
| `apply_ops`         | Applies up to 500 create, update, delete and move operations as one change         |

Prefer `apply_ops` for layouts: give `create` operations your own ids and later operations in
the same batch can nest inside them. If any operation fails, nothing is saved.

`get_screenshot` lets an agent check its own work. It draws SVG in Node with resvg, no browser, so
text is plain SVG text with no shaping and differs slightly from the editor's canvas. It uses the
fonts installed on the machine running the server.

Colours are `#rrggbb` or `#rrggbbaa`. Coordinates are absolute on the page.

## Try it

Ask the agent: "Create a Designo file called Palette and lay out five colour swatches in a
row inside a white frame, each with its hex code underneath." Open `http://localhost:5320` to watch it.
