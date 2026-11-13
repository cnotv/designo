---
sidebar_position: 1
---

# Self-hosting

Designo is one Node server: it serves the editor and the files API, and the same image runs the
MCP server for agents. Files are plain `.designo.json` files in one folder, so a backup is a copy
of that folder.

The files API has no login of its own. Locally it listens only on your machine; on a server,
Caddy sits in front of it with HTTPS and a password.

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
docker compose up -d --build     # http://localhost:3000
```

Files live in the `designo-data` volume. The port is bound to `127.0.0.1`, so only this machine
reaches it. Point an agent at the MCP server inside the container:

```sh
claude mcp add designo -- docker exec -i designo node packages/mcp/src/main.ts
```

## On a cloud server

Any Linux server with Docker works: you need a domain name pointing at it, and ports 80 and 443
open. The `public` Compose profile adds Caddy, which fetches an HTTPS certificate for your domain
and asks for a username and password before anything reaches Designo.

1. Point an `A` record (and `AAAA` for IPv6) for your domain at the server.
2. On the server, put `docker-compose.yml`, `Caddyfile` and a `.env` in one folder. Copy
   `.env.example` to `.env` and fill it in. Make the password hash with:

   ```sh
   docker run --rm caddy:2-alpine caddy hash-password --plaintext 'your-password'
   ```

3. Start it:

   ```sh
   docker compose --profile public up -d
   ```

The image comes from `ghcr.io/cnotv/designo`, which the deploy workflow publishes. To build on
the server instead, copy the whole repository and add `--build`.

### Agents on a remote server

The MCP server talks over stdio, so SSH carries it with no extra port or login to secure:

```sh
claude mcp add designo -- ssh deploy@your-server docker exec -i designo node packages/mcp/src/main.ts
```

Use a key without a passphrase prompt (or an SSH agent), because the MCP client cannot answer one.

## On Hetzner Cloud

The repository deploys itself to a Hetzner server: `deploy/hetzner/cloud-init.yaml` sets the
server up on first boot, and `.github/workflows/deploy.yml` ships every change to `main` there.

### 1. Make a deploy key

```sh
ssh-keygen -t ed25519 -f ~/.ssh/designo-deploy -C designo-deploy -N ''
```

Put the public half, `~/.ssh/designo-deploy.pub`, in place of `REPLACE_WITH_DEPLOY_PUBLIC_KEY` in
`deploy/hetzner/cloud-init.yaml`. Don't commit that change: the file is a template, and a fork
would deploy your key.

### 2. Create the server

In the [Hetzner Cloud Console](https://console.hetzner.cloud), create a server:

- **Image:** Ubuntu 24.04
- **Type:** a small shared-vCPU plan is plenty; CX23 (2 vCPU, 4 GB) if it is orderable in your
  location, otherwise the smallest CPX
- **SSH key:** none needed: cloud-init adds the deploy key to the `deploy` user and turns off
  root and password login. Add your own public key next to it in the file to log in with it too.
- **Cloud config:** paste the edited `cloud-init.yaml`
- **Firewall (recommended):** a Hetzner Cloud Firewall allowing inbound 22, 80 and 443 only

Or with the [hcloud CLI](https://github.com/hetznercloud/cli):

```sh
hcloud server create --name designo --image ubuntu-24.04 --type cx23 --location nbg1 \
  --user-data-from-file deploy/hetzner/cloud-init.yaml
```

Wait a few minutes for first boot to finish, then check: `ssh -i ~/.ssh/designo-deploy deploy@SERVER_IP docker ps`.

### 3. Point your domain at it

Add `A` (and `AAAA`) records for your domain with the server's addresses.

### 4. Tell GitHub about the server

In the repository's **Settings → Secrets and variables → Actions**:

| Kind     | Name                    | Value                                          |
| -------- | ----------------------- | ---------------------------------------------- |
| Secret   | `HETZNER_HOST`          | The server's IP address                        |
| Secret   | `HETZNER_USERNAME`      | `deploy`                                       |
| Secret   | `HETZNER_SSH_KEY`       | The private key, `~/.ssh/designo-deploy`       |
| Secret   | `HETZNER_TARGET_DIR`    | `/opt/designo`                                 |
| Secret   | `HETZNER_PORT`          | Only if SSH is not on 22                       |
| Secret   | `DESIGNO_DOMAIN`        | Your domain, for example `designo.example.com` |
| Secret   | `DESIGNO_USER`          | The username to sign in with                   |
| Secret   | `DESIGNO_PASSWORD_HASH` | The hash from `caddy hash-password`            |
| Variable | `HETZNER_DEPLOY`        | `true`, which switches the deploy workflow on  |

### 5. Deploy

Run **Actions → Deploy to Hetzner → Run workflow**, or push to `main`. The workflow runs the
tests, publishes the image to `ghcr.io/cnotv/designo`, copies `docker-compose.yml` and
`Caddyfile` to the server, writes `.env` from the secrets and restarts the containers. Open your
domain, sign in, and connect an agent over SSH as above.

### Backups

Hetzner's server backups cover everything. For just the files:

```sh
ssh deploy@SERVER_IP 'docker run --rm -v designo_designo-data:/data alpine tar -cz -C /data .' > designo-backup.tgz
```
