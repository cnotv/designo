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
check its own work without a browser: `get_screenshot` returns a PNG, `export_svg` the SVG and `export_pdf` a PDF.

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

## opencode

Run this once in the Designo clone. It installs the dependencies first:

```sh
pnpm opencode:install
```

It adds a `designo` entry to your global opencode config
(`~/.config/opencode/opencode.json`, or under `$XDG_CONFIG_HOME`), so the tools are there in every
project. Other settings and servers in that file are kept. The entry runs node and tsx by absolute
path, so opencode needs neither `pnpm` nor your shell's `PATH`. Restart opencode and check with
`opencode mcp list`.

If the file has comments, the installer leaves it untouched and prints the entry to paste.
Run it again after moving the clone or switching node versions. Skipping `pnpm install` is what
causes `sh: tsx: command not found`, and "MCP server process exited" in opencode.

Inside the clone itself nothing is needed: the committed `opencode.json` registers the server.

### How the install is tested

The `opencode install` workflow (`.github/workflows/opencode-install.yml`) runs on every pull
request that touches the MCP package, and by hand from the Actions tab. It does not use a
microVM of its own: a GitHub-hosted `ubuntu-latest` runner is already a fresh virtual machine
for each job and is thrown away afterwards, so a previous run cannot make it pass. On it, the job
installs opencode from npm, runs `pnpm opencode:install`, checks the config holds the `designo`
entry, starts the written command and waits for the MCP handshake, then runs `opencode mcp list`
and fails if `designo` is missing or reported as failed.

A microVM such as Firecracker would only be worth adding on a self-hosted runner, to keep
untrusted code off the host. This job runs code from the pull request, which is why the workflow
has read-only `contents` permission and no secrets.

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

A file starts with one page. A `createPage` operation (`id` optional, `order` to place it between
others, `properties` such as `name`) adds another, and a `create` operation whose `parentId` is
that page's id puts a node on it. `reorderPage` (`id`, `order`) moves a page in the print order, and
`delete` removes a page with its nodes, any but the last.

A `move` operation's `order` puts the node in front of a sibling that holds the same order, and that
sibling and the ones above it shift up by one. So `0` inserts at the front of a parent whose first
child has order 0, and a number past the end puts the node last. Each page is its own coordinate space and its own page of the PDF.

`export_pdf` takes a `fileId` and returns the whole file as one PDF, in an embedded resource of
type `application/pdf`. Frames with a `pdfPage` (a whole number from 1) are its pages, in that order,
each as large as its frame and clipped to it; this is how a book laid out as spreads on one canvas
becomes a PDF of those spreads, and anything on the canvas outside them is left out. A file with
no such frame gets a page for each page in the file, in order, each as large as its visible
content. One design unit is a point. Text is selectable and set in its embedded fonts, broken into
lines where the editor breaks it; a node with blur or a shadow is an image. It fails, naming the
text, when a text's fonts cannot be found, rather than leaving the text out.

A page frame with a bleed (see `set_page_setup`) makes a PDF page that is the frame plus the bleed
on every side. Its MediaBox and BleedBox are that larger box, its TrimBox is the frame's own box,
and the frame's fill and clip reach the bleed edge so the artwork bleeds. `trimMarks: true` adds a
slug of 18 points beyond the bleed with crop marks at the corners of the trim box.

The PDF's title, author and subject come from an `updateMetadata` operation in `apply_ops`
(`patch` with any of `title`, `author` and `subject`; an empty string clears a field), written to
the info dictionary and the XMP. The title falls back to the file name. A text node with a `pdfTag`
(`h1` to `h6`, `p` or `li`, set with `create_node`, `update_node` or `apply_ops`) is written as a
structure element of a tagged PDF; consecutive `li` texts share one list, and reading order is the
order of the frame's children. A PDF with no tagged text is not tagged.

## Tools

| Tool                | Does                                                                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list_files`        | Lists files with their ids and names                                                                                                                 |
| `create_file`       | Creates an empty file with one page; returns `fileId` and `pageId`                                                                                   |
| `get_document_tree` | Reads the node tree from the page, or from `nodeId`, to `depth` levels (default 3)                                                                   |
| `get_node`          | Reads one node with every property                                                                                                                   |
| `get_styles`        | Lists the variables and text styles of the file                                                                                                      |
| `get_screenshot`    | Renders the page, or `nodeId`, to a PNG image; `scale` 0.1 to 4 (default 1)                                                                          |
| `export_svg`        | Exports the page, or `nodeId`, as standalone SVG text                                                                                                |
| `export_pdf`        | Exports the file as one PDF, one page for each frame with a `pdfPage`, else each page, with embedded fonts                                           |
| `measure_text`      | Measures a text as the editor lays it out: box size, line count and each line                                                                        |
| `create_node`       | Creates one frame, group, rectangle, ellipse, text or image node                                                                                     |
| `add_image`         | Stores a PNG, JPEG, WebP or GIF from base64, a file path, a URL or a stored `assetId`; places it as an image node                                    |
| `update_node`       | Changes some properties of one node                                                                                                                  |
| `delete_node`       | Deletes a node and everything inside it                                                                                                              |
| `set_page_setup`    | Sets a frame as a printed page: size, bleed, facing and layout guides, in millimetres or points                                                      |
| `apply_ops`         | Applies up to 500 create, createPage, reorderPage, update, updateMetadata, variable, text style, delete, move and component operations as one change |

`add_image` takes the picture from exactly one of `data` (base64, at most 20 MB), `path` (a file
the server can read), `url` (`http` or `https`) or `assetId` (a picture already stored, so no bytes
are sent again). A `path` or `url` keeps a long picture out of the model, where one wrong
character would corrupt it. The server reads and fetches as the machine it runs on, so use these
only with an agent you trust; whatever they return is stored only if its first bytes are a picture.
Bytes whose header does not decode as a picture, such as a cut-off file, are refused with an error
instead of stored. Give `width` or
`height` alone to keep the picture's proportions; with neither it takes its own size in pixels.
It returns `assetId`, which an image node's `imageAsset` property holds, so a picture added once
can be placed again with `create_node` or `apply_ops`. The node's `imageFit` property is `stretch` (the default), `fit` (all of the picture, in
proportion, inside the box) or `fill` (covers the box in proportion and crops the overflow); set it
with `update_node`. The server decides the type from the
file's first bytes, never from a name, and refuses anything that is not one of the four.

Prefer `apply_ops` for layouts: give `create` operations your own ids and later operations in
the same batch can nest inside them. If any operation fails, nothing is saved.

`get_screenshot` lets an agent check its own work. It draws SVG in Node with resvg, no browser, so
text is plain SVG text and differs slightly from the editor's canvas, though a fixed-width text wraps where the editor wraps it. Its fonts
come from the same place as the editor's: for each `fontFamily` on the page the server asks the
[Fontsource](https://fontsource.org) API for the families, downloads the files the characters need
into a cache folder (`designo-fonts` in the system's temporary folder) and draws each text with the
file that has most of its characters, on the baseline the editor uses. Any family the API has
works, Georgia and the other fonts it cannot have draw in their open stand-ins (Gelasio for
Georgia), and the first screenshot of a new font takes a second or two longer. A line that needs
more than one fallback font at once, such as an arrow and a Polish letter in a Georgia sentence,
can draw boxes for them, because resvg keeps only one font per text; a script on a line of its own
draws right. When the API cannot be reached the
screenshot is still drawn, with whatever fonts the machine has (DejaVu in the Docker image).

### Components and instances

`apply_ops` makes and places components. An `update` with `patch: { "isComponent": true }` turns a
frame or group into a component; it cannot hold another component or an instance. `createInstance`
(`componentId`, `parentId`, optional `id`, `x`, `y`) places a copy. Every node inside an instance has
the id `<instance id>:<component node id>`, and an instance follows its component: a changed
property, an added child or a removed child shows up in every instance. The instance keeps its own
`x`, `y` and `name`, and never takes the component's `pdfPage`.

Editing a property of a node inside an instance keeps it as an override, listed in the node's
`overrides`; setting it back to the component's value makes it follow the component again.
`resetOverrides` on a node clears the overrides of it and everything beneath it, and `detachInstance`
turns an instance into plain nodes. Nodes inside an instance cannot be created, deleted or moved;
change the component or detach the instance. Placing an instance inside a component is refused.

### Master pages

`apply_ops` sets up masters with `update` patches on frames. `isMaster: true` makes a frame a master.
A page frame sets `masterId` to the master's id (null stops using one) and the master's children are
drawn on that page, moved to it and behind its own nodes, in `get_screenshot`, `export_svg` and
`export_pdf`. A text with `{page}` shows the number of the page it is on: the frame's `pdfPage`, or
its place among the frames that use a master. `masterHidden` is a list of ids of direct children of
the master that one page leaves out, so it can draw its own in their place. Editing the master
changes every page that uses it. The drawn copies are not in the file: `get_document_tree` shows the
stored nodes only.

### Render limits and errors

resvg is native code, and some inputs make it abort the whole process, so every screenshot is drawn
in a short-lived child process of its own. A render that crashes, hangs or is too big ends that one
call with a tool error (`isError`) that says what happened, and the server carries on. The limits:

| Limit  | Value                                    | The error says                                                  |
| ------ | ---------------------------------------- | --------------------------------------------------------------- |
| Time   | 20 seconds                               | `Rendering timed out after 20 s and was stopped. ...`           |
| Size   | 64 megapixels (width x height x scale^2) | `Rendering is too large: W x H px is N megapixels and the ...`  |
| Memory | 1024 MB for the renderer process (Linux) | `Rendering used more than 1024 MB of memory and was stopped...` |

A crash reads `Rendering crashed (SIGABRT). ...` and any other failure, such as an SVG the renderer
cannot read, `Rendering failed: <reason>`. The fix for a size error is a lower `scale` or a smaller
`nodeId`: a whole page of a big file can need more than 64 megapixels at scale 1. Drawing costs
about 9 bytes per pixel and 33 ms per megapixel; a page of 57 megapixels measured 520 MB and
1.9 s. Starting the child process adds about 100 ms per call (most of it loading the fonts,
which the old in-process call did on every render too).

The exported SVG leaves out what cannot show: a child that lies wholly outside its frame (a frame
clips its children), or outside the exported bounds. A child far from its frame, for example one
given coordinates relative to the frame when the tools expect absolute ones, is therefore simply
not drawn, and `get_node` still shows it. Coordinates are absolute on the page. `create_node`,
`update_node` and `apply_ops` return a `warnings` list that names each node they created or
changed that lies wholly outside its parent frame, so that mistake is no longer silent. The list
also names a text that could not be sized to its lines because its fonts are not available: it
keeps the box it was given and may clip.

Text keeps its blank lines in `export_svg` and `get_screenshot`: a line break in `text` moves down
one line height (1.2 times `fontSize`), and an empty line leaves a gap of one.

Colours are `#rrggbb` or `#rrggbbaa`. Coordinates are absolute on the page, and `rotation` (in
degrees) turns a node around its centre.

### Links

`create_node`, `update_node` and `apply_ops` take `link` on a text, rectangle or frame node: an
`https:`, `mailto:` or `tel:` address, or `null` (the default) for none. Any other scheme is
refused. `export_pdf` writes it as a clickable link over the node's box, or over each line of a
wrapped text. A link has no style of its own; underline or colour the text yourself.

### Text properties

`create_node`, `update_node` and `apply_ops` take these on a text node, besides `text`,
`fontSize` and `fontFamily`. Each is optional; `get_node` always returns all of them.

| Property        | Values                               | Default  | Does                                                                                           |
| --------------- | ------------------------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| `fontWeight`    | a number from 100 to 900             | `400`    | Picks the family's nearest weight; 700 is bold                                                 |
| `fontStyle`     | `normal`, `italic`                   | `normal` | Picks the italic file when the family has one, else the upright one                            |
| `letterSpacing` | a number from -0.5 to 2              | `0`      | Extra space after every character, as a multiple of `fontSize`                                 |
| `textAlign`     | `left`, `center`, `right`, `justify` | `left`   | Puts every line against that edge of the node's `width`; `justify` fills it (needs `textWrap`) |
| `lineHeight`    | a number from 0.5 to 10              | `1.2`    | The distance between lines, as a multiple of `fontSize`                                        |
| `textWrap`      | `true`, `false`                      | `false`  | `true` makes the node a fixed-width box that wraps its lines at `width`                        |
| `spans`         | a list of `{ start, end, ... }`      | `[]`     | Stretches of `text` drawn with their own `fontWeight`, `fontStyle` or `fill` (see below)       |
| `listStyle`     | `none`, `bullet`, `number`           | `none`   | Puts a marker before every paragraph and hangs its lines past it                               |
| `listIndent`    | a number from 0 to 10                | `1.5`    | How far a list's lines sit past the marker, as a multiple of `fontSize`                        |

The server sizes every text a call creates or changes, as the editor does: with `textWrap` off the
box follows the words in width and height, with it on the `width` stays and the height follows the
wrapped lines. Giving a text a `width` and no `textWrap` makes it a fixed-width text. If the fonts
are not available the box keeps the size it was given. With `textWrap` off, `width` is only the box the text sits in, which the editor keeps in step with
the words; lines break where the text has a newline and never anywhere else. Set `textWrap: true`
and a `width` to have long text wrap instead of adding line breaks by hand. `export_svg` and
`get_screenshot` wrap a `textWrap` text at its `width` with the editor's own layout engine, and
honour `textAlign` and `lineHeight`. A text with `textWrap` off draws each line as it is written.
They draw `justify` as left aligned, because SVG has no way to stretch a line's spaces; the editor
justifies it. `justify` stretches the spaces of every wrapped line except the last of each paragraph.

A span is `{ "start": 0, "end": 14, "fontWeight": 700, "fill": "#b00020" }`: `start` (included) and
`end` (excluded) are UTF-16 offsets into `text`, and what a span leaves out follows the node. Spans
are in order, never overlap and stay inside the text, or the operation fails and says which span.
To bold the lead-in of a bullet, give one text node `listStyle: "bullet"` and a span over the words;
that replaces a frame of three nodes. Send the whole `spans` list to change it. Changing `text`
alone cuts the spans to the new length, so send `spans` with it when the words move. A list marks
every paragraph (each line break starts one) with a bullet or `1.`, `2.`, and wrapped lines hang at
the indent. Spans and lists are laid out by the same engine, so wrapping, `measure_text`, the
screenshot, the SVG and the PDF agree; the PDF selects the marker as text. The SVG sets a span's
weight and style by attribute, so its fonts need that weight to show.

`measure_text` answers how big a text will be before you draw it. Give `text` and the font you
will use (`fontFamily`, `fontWeight`, `fontStyle`, `letterSpacing`, `fontSize`, `lineHeight`,
`textAlign`, `spans`, `listStyle`, `listIndent`, each defaulting to a new text node's); add `width` to wrap it like a fixed-width node. It returns `width`, `height`, `lineCount`
and the text of each `lines` entry, so a panel can be sized to its text instead of guessed. It
needs the same fonts as a screenshot, and says so when they are not available.

### Effects

`create_node`, `update_node` and `apply_ops` take these. Each is optional; `get_node` always returns
all four, and `get_screenshot` and `export_svg` draw them.

| Property    | Values                                                         | Default  | Does                                                                      |
| ----------- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| `gradient`  | `{ kind, angle, stops }` or `null`                             | `null`   | Paints the fill instead of `fill`                                         |
| `blur`      | a number, 0 or more                                            | `0`      | A gaussian blur of the shape, as a standard deviation in pixels           |
| `blendMode` | `normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten` | `normal` | How the shape combines with what is behind it                             |
| `shadow`    | `{ x, y, blur, color }` or `null`                              | `null`   | A drop shadow: offset `x` and `y`, `blur` as a standard deviation, colour |

A gradient's `kind` is `linear` or `radial`. A linear one runs along `angle`, in degrees clockwise
from pointing right (90 runs top to bottom), from one corner of the box to the opposite one; a
radial one runs from the centre to the box's edge and ignores `angle`. `stops` is two to sixteen
`{ offset, color }` entries, `offset` from 0 to 1 and in increasing order, with colours as above.

`blur`, `blendMode` and `shadow` take effect on rectangles and ellipses only; a gradient also fills
a frame's background. Text, groups and frames ignore the other three, because they would need to be
drawn to a layer first. A shadow is cast by the sharp shape, and `blur` softens the shape itself.
Several translucent, blurred, gradient shapes with `blendMode: "multiply"` give watercolour washes
with far fewer nodes than stacked ellipses.

### Auto-layout

`create_node`, `update_node` and `apply_ops` take these. A frame with a `layoutMode` places its
children itself, so set sizes and spacing instead of coordinates; every operation lays out again,
and `get_node` returns the resulting `x`, `y`, `width` and `height`.

| Property           | Values                                      | Default | Does                                                                              |
| ------------------ | ------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| `layoutMode`       | `none`, `horizontal`, `vertical`            | `none`  | Frames only: a row or a column; overwrites the children's position                |
| `layoutGap`        | a number, 0 or more                         | `0`     | The space between children                                                        |
| `layoutPadding`    | a number, 0 or more                         | `0`     | The space between the frame's edge and its children, on all sides                 |
| `layoutAlign`      | `start`, `center`, `end`, `space-between`   | `start` | Where children sit along the direction                                            |
| `layoutCrossAlign` | `start`, `center`, `end`                    | `start` | Where children sit across the direction                                           |
| `widthSizing`      | `fixed`, `hug`, `fill` (and `heightSizing`) | `fixed` | `hug` sizes a layout frame to its children; `fill` shares a layout parent's space |

A child with `fill` along the direction shares the space the fixed children leave; `fill` across it
stretches to the frame's inner size. A node that fills takes no part in what a hugging parent
measures on that axis. Hidden children are skipped, text keeps the size it has, and rotation is
ignored. Only a frame can have a `layoutMode`.

## Try it

Ask the agent: "Create a Designo file called Palette and lay out five colour swatches in a
row inside a white frame, each with its hex code underneath." With the editor running, open it
to watch; headless, ask the agent for a screenshot.

## Variables and text styles

A palette or a type scale is defined once and referenced by nodes, so changing it is one operation
instead of one `update_node` call for every node. `get_styles` lists what a file has.

`apply_ops` creates and removes them:

- `setVariable` adds or changes a variable: `{ id, name, kind, value }`, where `kind` is `color` (a
  hex `value`) or `number`.
- `setTextStyle` adds or changes a text style: `{ id, name, fontFamily, fontSize, fontWeight,
fontStyle, lineHeight, letterSpacing }`.
- `deleteVariable` and `deleteTextStyle` remove one. The nodes that used it keep its last value and
  stop following it.

A node uses them through `create`, `update`, `create_node` and `update_node`:

- `bindings` maps a property to a variable id, for example `{ "fill": "ink", "cornerRadius":
"round" }`. A colour variable drives `fill` and `stroke`; a number variable drives `fontSize`,
  `fontWeight`, `lineHeight`, `letterSpacing`, `opacity`, `cornerRadius`, `strokeWidth`, `blur`,
  `layoutGap` and `layoutPadding`. It replaces all the bindings of the node; `{}` unbinds them.
- `textStyleId` makes a text follow a text style; `null` stops it.

Setting a bound property directly on a node ends its binding, and the value stays. Setting a style
property such as `fontSize` on a text with a text style keeps that property as the node's own: it is
listed in `styleOverrides`, and the text follows the style for the rest. A binding wins over a text
style. A binding to a missing variable, a colour variable on a number property, or a value out of
range for its property is refused, and nothing is saved.

The document stores the resolved value in each node, so `get_node`, screenshots, SVG and PDF show
the final colours and sizes. Undo restores the links as well as the values.
