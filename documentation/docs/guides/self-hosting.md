---
sidebar_position: 1
---

# Self-hosting

Designo is one Node server: it serves the editor and the files API, and the same image runs the
MCP server for agents. Files are plain `.designo.json` files in one folder, so a backup is a copy
of that folder.

The files API has no login of its own. Locally it listens only on your machine; on a server,
your reverse proxy sits in front of it with HTTPS and a login.

## On your machine

### With Node

Needs Node 24 and pnpm.

```sh
git clone https://github.com/cnotv/designo && cd designo
pnpm install
pnpm build
pnpm start            # http://127.0.0.1:3000
```

Files go to `~/.designo-data`. Set `DESIGNO_DATA_DIR` to keep them elsewhere, and `PORT` to
change the port. Connect an agent as in [Connecting an agent](./mcp.md).

### With Docker

```sh
git clone https://github.com/cnotv/designo && cd designo
docker compose up -d --build     # http://localhost:3020
```

Files live in the `designo-data` volume. The port is bound to `127.0.0.1`, so only this machine
reaches it. Point an agent at the MCP server inside the container:

```sh
claude mcp add designo -- docker exec -i designo node packages/mcp/src/main.ts
```

## On a cloud server

Any Linux server with Docker works. `docker compose up -d` publishes Designo on
`127.0.0.1:3020`, reachable only from the server itself, for a reverse proxy there to route to.
Port 3020 stays clear of apps that commonly take 3000 and 3001; set `DESIGNO_PORT` in `.env` to
use another, and `DESIGNO_BIND` if your proxy runs in a container that cannot reach the host's
loopback.

The files API has no login of its own, so **the reverse proxy must add one**.

### Behind your reverse proxy

Route your domain to `127.0.0.1:3020`, with a login in front. Pass the `Host` header through as
the browser sent it: the editor's write endpoint refuses requests whose `Origin` does not match
it, which is how it stops other sites posting with your login.

### Backups

Files live in the `designo-data` volume. To copy them off the server:

```sh
ssh you@your-server 'docker run --rm -v designo_designo-data:/data alpine tar -cz -C /data .' > designo-backup.tgz
```

### Agents on a remote server

The MCP server talks over stdio, so SSH carries it with no extra port or login to secure:

```sh
claude mcp add designo -- ssh you@your-server docker exec -i designo node packages/mcp/src/main.ts
```

Use a key without a passphrase prompt (or an SSH agent), because the MCP client cannot answer one.
