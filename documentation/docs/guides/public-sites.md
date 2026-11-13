---
sidebar_position: 3
---

# Docs site and public demo

Two public sites come from this repository. Neither holds your files.

## Docs on GitHub Pages

`.github/workflows/github-pages.yml` builds this Docusaurus site from `documentation/` and
publishes it to `https://cnotv.github.io/designo/` on every change to `main`. Pull requests that
touch the docs build it without publishing, so a broken link fails the pull request.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

To work on the docs locally:

```sh
pnpm --dir documentation install --ignore-workspace
pnpm docs        # http://localhost:3000/designo/
```

## Editor demo on Netlify

`netlify.toml` builds the editor as a static site. With no Designo server behind it, the editor
notices the files API is missing and shows a bundled sample, with a note pointing here. It is a
look at the editor, not somewhere to keep work.

One-time setup: in Netlify, **Add new project → Import an existing project → GitHub →
cnotv/designo**. Netlify reads the build settings from `netlify.toml`. It then deploys `main` and
builds a preview for every pull request, and skips builds when nothing the editor uses changed.
