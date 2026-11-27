---
sidebar_position: 4
---

# Exporting code

A layer, or the whole page, exports as code in four flavours. In the editor, pick one in the
**Format** select of the Export section; an agent calls `export_code` with a `target`. Both write
the same files.

| Target                | Files                           | What you get                                                     |
| --------------------- | ------------------------------- | ---------------------------------------------------------------- |
| `html` (HTML and CSS) | `index.html`, `styles.css`      | A page with the design in its body, linking the stylesheet       |
| `vue`                 | `<Name>.vue`                    | A single-file component, its styles scoped                       |
| `react`               | `<Name>.jsx`, `<Name>.css`      | A function component, the default export, importing its CSS      |
| `js` (JavaScript)     | `create<Name>.js`, `<Name>.css` | `create<Name>()`, which builds the elements and returns the root |

`<Name>` is the layer name in PascalCase, such as `CodeCard` for **Code card**.

## How a design becomes code

- **Auto-layout frames** are flex boxes: direction, gap, padding, main and cross alignment. A child
  set to fill grows along the main axis or stretches across it; a frame that hugs has no width or
  height of its own, so it grows with its content.
- **Everything else** is placed absolutely at its offset inside its parent, as on the canvas. The
  exported layer itself is `position: relative`, so the code drops into a page as a block.
- **Frames** clip their content (`overflow: hidden`), as on the canvas.
- **Shapes:** fills, linear and radial gradients, corner radius, an ellipse's round edge, a stroke
  centred on the edge (an outline pulled in by half its width), opacity, rotation, blur, shadow
  and blend modes.
- **Text** keeps its line breaks (`white-space: pre-wrap`, or `pre` for a text that does not wrap).
  A span is a `span` element with its own class. A bullet or numbered list is `ul` or `ol`, a
  paragraph an item. A text with a PDF tag of heading 1 to 6 is that heading; any other text is a
  `p`.
- **Paths** are inline SVG, **images** an `img` whose `src` is `assets/<asset id>`: copy the
  pictures there, or edit the paths. A layer with a link is wrapped in an `a`.
- **Class names** come from layer names in kebab case; a repeated name gets a number, such as
  `title-2`. Hidden layers are left out.

## Each target

- **HTML and CSS:** open `index.html` beside `styles.css`. Nothing else is needed.
- **Vue:** put the `.vue` file in a Vue 3 project and use it as a component. It has no script, so
  it works with or without `<script setup>` elsewhere.
- **React:** put both files in a React project with a bundler that imports CSS, such as Vite. The
  component takes no props. Text that JSX would change (braces, angle brackets, line breaks,
  leading spaces) is written as a string in braces.
- **JavaScript:** import `create<Name>` in a page with a bundler that imports CSS, and append what
  it returns: `document.body.append(createCodeCard())`. Without a bundler, drop the import line and
  link the CSS file.

## Limits

The code is a starting point, not a responsive layout: positions and sizes are in pixels, as
designed. Fonts are named, not bundled, so load them (Fontsource or your own files) where the code
runs. Components, variables and text styles are written out as plain values.
