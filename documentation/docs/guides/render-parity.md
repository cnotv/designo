---
sidebar_position: 4
---

# Render parity

Designo draws a design three ways: the editor's WebGL renderer, resvg for the MCP server's
screenshots, and the PDF writer. An agent only sees its work through the screenshot, so the three
must agree. `@designo/parity` draws one small document per effect with each of them and compares
the pixels.

![The parity report: each case drawn by resvg, WebGL and pdf.js, with the pixels that differ marked in red](/img/parity-report.png)

## Run it

```sh
pnpm test:parity
```

It serves a page with Vite, opens it in headless Chromium through Playwright, and writes
`packages/parity/report/index.html`: every case as each renderer drew it, with the pixels that
differ from resvg in red. `PARITY_OUT` writes the report somewhere else, and `PARITY_CHROMIUM`
points at a Chromium binary when Playwright's own is not installed. The command exits with 1 when
a renderer drifts.

![Scrolling through every case of the report: shapes, gradients, blur, shadow, opacity and each blend mode](/img/parity-report.gif)

In CI the `parity` job of `test.yml` runs it on every pull request, adds the table to the job
summary, and uploads the report as the `render-parity` artifact.

## What is compared

- **Reference:** the frame's SVG export, drawn by resvg at one pixel per design unit.
- **WebGL:** the editor's `createWebglRenderer` and `buildScene`, at scale 1. Headless Chromium has
  no GPU on a CI runner, so WebGL2 runs on SwiftShader.
- **PDF:** `exportDocumentToPdf`, with a blurred or shadowed node drawn to an image by resvg as the
  editor does, then drawn by pdf.js at 72 dpi, one pixel per point.

Each image is laid over white before the comparison. The cases, in `packages/parity/src/cases.ts`,
are plain shapes, a linear and a radial gradient, a blur, a shadow, opacity, and one case for each
blend mode. A new effect gets a case there.

## Tolerance

A pixel differs when any channel is more than 16 out of 255 away from resvg's. A renderer passes a
case when at most 2% of the pixels differ. Both numbers live in `packages/parity/src/tolerances.ts`.

They were set from what the renderers do today. Anti-aliased edges and the blur and shadow
approximations differ by at most about 1.1% of a case's pixels (the WebGL shadow), and the PDF
stays under 0.5%. A dropped effect is far above that: drawing the cases in WebGL with no blur,
shadow or blend mode made 11% to 25% of their pixels differ.
