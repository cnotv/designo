---
sidebar_position: 2
---

# Connecting an agent to Designo

The MCP server runs over stdio. It reads and writes files in `DESIGNO_DATA_DIR`
(default `~/.designo-data`), the same folder the editor shows.

When the server uses Google sign-in (`DESIGNO_AUTH=google`), set `DESIGNO_ACCOUNT` to the email of an approved account: the MCP server then works on that account's designs and refuses to start if the account is missing, pending or blocked. A Designo that is reachable over the network also has a remote endpoint, which agents sign in to with their own browser: see [Remote login](#remote-login).

## Get it running

Needs Node 24 and pnpm. Clone the repository and install once:

```sh
git clone https://github.com/cnotv/designo && cd designo
pnpm install
```

Then pick how you want to use it. Both ways read and write the same plain `.designo.json` files.

### Headless

Just the MCP server: no editor, no browser and no port. Your agent's client starts it as a
process, as in the sections below, and the agent builds a design by calling the tools. It can
check its own work without a browser: `get_screenshot` returns a PNG and `export_svg` the SVG.

To try the server by hand, `pnpm mcp` waits for MCP messages on stdin. Keep the designs in a
folder of your own with `DESIGNO_DATA_DIR`, as an absolute path:

```sh
DESIGNO_DATA_DIR="$HOME/designs" pnpm mcp
```

A relative path would not mean the folder you are in: pnpm runs the server from `packages/mcp`.

The files are ordinary JSON, so they can be committed, backed up by copying the folder, or
opened in the editor later.

### Locally, with the editor

Run the editor on the same folder to watch an agent work, or to edit alongside it:

```sh
pnpm build && pnpm start      # http://127.0.0.1:3000, change the port with PORT
pnpm dev --port 5320          # or hot reload for working on Designo itself
```

An agent's edits show up in the editor within a second, and yours reach the agent. Both
processes must use the same `DESIGNO_DATA_DIR`: set it for the editor's server and in your
agent's MCP configuration, or leave it unset in both for `~/.designo-data`.

The editor's server listens on this machine only, because the files API has no login of its own.
Put a reverse proxy with a login in front of it before exposing it, or see
[self-hosting](./self-hosting.md) to run it in Docker.

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

## Remote login

A Designo with [Sign in with Google](./self-hosting.md#sign-in-with-google) turned on also serves
its MCP tools over HTTP at `/mcp`, and an agent signs in as you do, in the browser. Nothing is
installed on the server's side of the connection and no key is copied around:

```sh
claude mcp add --transport http designo https://<your-host>/mcp
```

The first time the agent uses the server, its client opens your browser:

1. If you are not signed in to Designo, you sign in with Google first.
2. A page says which program wants to edit your designs and where you are sent back to. **Allow**
   connects it; **Deny** tells it no. A pending or blocked account cannot connect an agent.
3. The browser goes back to the program, which now holds a token for your account.

From then on every tool call works on your designs and nobody else's: the token names one account
and the server opens only that account's folder. The tools are the ones listed [below](#tools).
Tokens last an hour and renew themselves for 30 days at a time, so an agent that stays in use
stays connected. Blocking the account cuts its agents off at once, and unblocking it lets them
carry on.

**Disconnecting an agent.** Open the account menu in the editor and choose **Connected agents**.
Each agent you approved is listed with **Disconnect**, which ends it at once; it has to sign in
again to come back. Signing out of the browser does not disconnect agents.

This is OAuth 2.1 with PKCE, so any MCP client that supports remote servers with OAuth works, not
only Claude Code. Without `DESIGNO_AUTH=google` there is no `/mcp`: use the stdio server instead,
which also still works with sign-in on (set `DESIGNO_ACCOUNT`, as above).

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

Colours are `#rrggbb` or `#rrggbbaa`. Coordinates are absolute on the page, and `rotation` (in
degrees) turns a node around its centre.

## Try it

Ask the agent: "Create a Designo file called Palette and lay out five colour swatches in a
row inside a white frame, each with its hex code underneath." With the editor running, open it
to watch; headless, ask the agent for a screenshot.
