# Deploying this repository to Hetzner Cloud

How this repository's own server is set up. `cloud-init.yaml` here
sets the server up on first boot, and `.github/workflows/deploy.yml` ships every change to `main`
there. For self-hosting on any server, see the
[self-hosting guide](https://cnotv.github.io/designo/guides/self-hosting).

## 1. Make a deploy key

```sh
ssh-keygen -t ed25519 -f ~/.ssh/designo-deploy -C designo-deploy -N ''
```

Put the public half, `~/.ssh/designo-deploy.pub`, in place of `REPLACE_WITH_DEPLOY_PUBLIC_KEY` in
`deploy/hetzner/cloud-init.yaml`. Don't commit that change: the file is a template, and a fork
would deploy your key.

## 2. Create the server

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

## 3. Point your domain at it

Add `A` (and `AAAA`) records for your domain with the server's addresses.

## 4. Tell GitHub about the server

The deploy goes into Designo's own folder, `~/designo` by default, which it creates; it never
copies into the SSH user's home or beside another app. In the repository's
**Settings → Secrets and variables → Actions**:

| Kind     | Name               | Value                                            |
| -------- | ------------------ | ------------------------------------------------ |
| Secret   | `HETZNER_HOST`     | The server's IP address                          |
| Secret   | `HETZNER_USERNAME` | `deploy`                                         |
| Secret   | `HETZNER_SSH_KEY`  | The private key, `~/.ssh/designo-deploy`         |
| Variable | `DEPLOY_DIRECTORY` | Only to change Designo's folder from `~/designo` |
| Secret   | `HETZNER_PORT`     | Only if SSH is not on 22                         |
| Variable | `DESIGNO_PORT`     | Only to publish on another port than 3020        |
| Variable | `DESIGNO_BIND`     | Only to bind another address than 127.0.0.1      |
| Variable | `HETZNER_DEPLOY`   | `true`, which switches the deploy workflow on    |

## 5. Deploy

Run **Actions → Deploy to Hetzner → Run workflow**, or push to `main`. The workflow runs the
tests, publishes the image to `ghcr.io/cnotv/designo`, copies the Compose file to the server,
writes `.env` from the variables and restarts the container. Route the server's reverse proxy to it as the
self-hosting guide describes, then open your domain and connect an agent over SSH.
