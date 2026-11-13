---
sidebar_position: 1
---

# Self-hosting

```sh
git clone https://github.com/cnotv/designo && cd designo
docker compose up -d --build     # http://localhost:3020
```

Files live in the `designo-data` volume. The port is bound to `127.0.0.1`, and the files API has
no login of its own, so put one in front before exposing it.

## Connecting an agent

The MCP server runs inside the same container, over stdio:

```sh
claude mcp add designo -- docker exec -i designo node packages/mcp/src/main.ts
```

On a remote server, SSH carries it:

```sh
claude mcp add designo -- ssh you@your-server docker exec -i designo node packages/mcp/src/main.ts
```

Use a key without a passphrase prompt (or an SSH agent), because the MCP client cannot answer one.
