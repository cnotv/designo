---
sidebar_position: 1
---

# Self-hosting

```sh
git clone https://github.com/cnotv/designo && cd designo
docker compose up -d --build     # http://localhost:3020
```

Files live in the `designo-data` volume. The port is bound to `127.0.0.1`, and the files API has
no login of its own unless you turn on [Sign in with Google](#sign-in-with-google), so put one in
front or turn that on before exposing it.

## Fonts

No font ships with Designo: the editor and the screenshot tool load them from the
[Fontsource](https://fontsource.org) API, `api.fontsource.org` for a family's description and
`cdn.jsdelivr.net` for its files. Visitors' browsers fetch them directly, so those hosts learn the
visitor's address, as with any web font service. The server fetches the files a screenshot needs
and keeps them in `designo-fonts` in its temporary folder. Where the server cannot reach those
hosts, screenshots fall back to the image's DejaVu fonts.

## Sign in with Google

Off by default. Turn it on to put a Google sign-in in front of the editor and keep each person's
designs apart.

1. In the Google Cloud console, create an OAuth client of type **Web application**. Add
   `<DESIGNO_PUBLIC_URL>/auth/google/callback` as an authorized redirect URI, and set the
   consent screen's publishing status to **In production**, or only listed test users can sign in.
2. Put the settings in `.env` next to `docker-compose.yml`, then run `docker compose up -d`.

| Setting                        | Required | Is                                                                                 |
| ------------------------------ | -------- | ---------------------------------------------------------------------------------- |
| `DESIGNO_AUTH`                 | yes      | `google` turns sign-in on; unset keeps Designo as it was                           |
| `DESIGNO_GOOGLE_CLIENT_ID`     | yes      | The OAuth client's ID                                                              |
| `DESIGNO_GOOGLE_CLIENT_SECRET` | yes      | The OAuth client's secret                                                          |
| `DESIGNO_PUBLIC_URL`           | yes      | Where people reach Designo: `https://` and no path (`http://localhost` also works) |
| `DESIGNO_SESSION_SECRET`       | yes      | A random string of 32 characters or more, which signs the session cookies          |
| `DESIGNO_ADMIN_EMAILS`         | yes      | Comma-separated addresses of the admins, at least one                              |
| `DESIGNO_AUTO_APPROVE_EMAILS`  | no       | Comma-separated addresses approved at their first sign-in                          |
| `DESIGNO_AUTO_APPROVE_DOMAINS` | no       | Comma-separated domains whose addresses are approved at their first sign-in        |

A missing or invalid setting stops the server at start and names the setting. The deploy workflow
takes the same names: `DESIGNO_AUTH`, `DESIGNO_GOOGLE_CLIENT_ID`, `DESIGNO_PUBLIC_URL` and
`DESIGNO_AUTO_APPROVE_DOMAINS` as repository variables, the other four as secrets.

**Approval.** Anyone with a Google account can sign in, but not everyone can open designs. An
admin listed in `DESIGNO_ADMIN_EMAILS` is approved at every sign-in. Anyone else waits on a
"Waiting for approval" screen until an admin approves them in the editor, unless their address or
domain is on an auto-approve list. Only an address Google has verified counts for the lists.
Blocking applies on the person's next request.

**Admin screen.** Admins get an account menu in the toolbar with an **Accounts** screen that lists
everyone who signed in, with Approve, Block and Unblock. Admins themselves cannot be blocked
there: take the address off `DESIGNO_ADMIN_EMAILS` instead.

**Designs belong to accounts.** Each account sees only its own designs, kept in `accounts/<id>/`
inside the data folder. Designs already in the data folder stay on disk, and no account sees them;
move a file into an account's folder to hand it over. The agent's MCP server picks an account with
`DESIGNO_ACCOUNT` ([Connecting an agent to Designo](./mcp.md)).

## Connecting an agent

With sign-in on, agents can sign in to `https://<your-host>/mcp` in the browser, with no SSH and
no shell on the server: `claude mcp add --transport http designo https://<your-host>/mcp`. See
[Remote login](./mcp.md#remote-login). Whatever sits in front of Designo must pass these paths
through to it unchanged:

- `/.well-known/*`, where clients discover how to sign in
- `/register`, `/authorize`, `/token` and `/revoke`, the sign-in itself
- `/mcp`, the tools, whose responses must not be buffered or cached
- `/auth/*`, the Google sign-in

Those paths must be served over `https`, at the same address as `DESIGNO_PUBLIC_URL`: it is the
issuer the tokens are made for, so a client that reaches Designo under another name is refused.
Agents' tokens are kept hashed in `oauth.json` in the data folder, next to `accounts.json`.
`/register` and `/token` are open to everyone who can reach the server, so each address is limited
in how often it can call them; behind a proxy that address is the proxy's.

The MCP server also runs inside the same container, over stdio:

```sh
claude mcp add designo -- docker exec -i designo node packages/mcp/src/main.ts
```

On a remote server, SSH carries it:

```sh
claude mcp add designo -- ssh you@your-server docker exec -i designo node packages/mcp/src/main.ts
```

Use a key without a passphrase prompt (or an SSH agent), because the MCP client cannot answer one.
