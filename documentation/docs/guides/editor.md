---
sidebar_position: 0
---

# Using the editor

![Drawing a frame and a rectangle, moving, resizing and filling it, an agent editing the file live, then undo](/img/editor.gif)

The editor saves every change as you make it: there is no save button. An agent working on the
same file through the MCP server shows up within a second, and your edits reach the agent the
same way.

## Signing in and accounts

On a server with [Sign in with Google](./self-hosting.md#sign-in-with-google) turned on, the editor
opens on a sign-in page. A new account waits on a "Waiting for approval" screen until an admin
approves it, and a blocked account sees "Access refused". Once approved, your name sits at the
right of the toolbar: its menu shows who you are and has **Sign out**, which also ends the
account's other sessions. Without sign-in, nothing of this appears.

**Connected agents** in the same menu lists the agents you let in through the server's
[remote MCP login](./mcp.md#remote-login), with the day each connected and a **Disconnect**
button. Disconnecting ends the agent at once. The dialog also shows the address to give your
agent's client.

Admins also get **Accounts** in that menu. It lists everyone who has signed in, with the accounts
waiting for a decision first, and each row has **Approve**, **Block** or **Unblock**. A change
applies on that person's next request. Admins themselves have no Block button: their addresses
come from the server's settings.

## Tools

| Tool      | Key | Does                                              |
| --------- | --- | ------------------------------------------------- |
| Move      | V   | Select, move and resize                           |
| Frame     | F   | Draw a frame; shapes drawn inside it belong to it |
| Rectangle | R   | Draw a rectangle                                  |
| Ellipse   | O   | Draw an ellipse                                   |
| Text      | T   | Click to place text, then type it on the canvas   |
| Image     |     | The **Add image** button opens a file chooser     |

Drag to draw; a click without a drag draws at a default size. Hold Shift for a square or a
circle. After drawing, the editor returns to Move.

## Selecting and editing

- **Select:** click a layer on the canvas or in the layers panel. Shift-click adds or removes.
  Drag on empty canvas for a marquee.
- **Move:** drag the selection, or nudge with the arrow keys (Shift for 10). A frame moves with
  everything in it.
- **Resize:** drag one of the eight handles of a single selection. Dragging past the opposite
  edge flips the shape. A rotated node resizes along its own axes, and the edge opposite the
  handle stays put.
- **Rotate:** with a single selection, drag just outside a corner handle; the cursor turns into a
  rotate cursor. The node turns around its centre, and Shift snaps to 15 degree steps. A frame
  takes what it holds along, though rotating through the properties panel turns only that node.
  The selection outline and handles turn with the node.
- **Clipping:** a frame clips what it holds to its bounds, corner radius and rotation included.
  What sticks out of a frame is not drawn there, and cannot be picked outside it.
- **Snap:** while you move or resize, the edges and centres of what you drag jump to the edges
  and centres of nearby siblings and of the frame they sit in, within 6 screen pixels at any zoom.
  A red guide line shows what it caught. Hold Ctrl/Cmd while dragging to turn snapping off. A
  rotated layer does not snap while it is resized along its own axes.
- **Align and distribute:** the row of buttons at the top of the properties panel. With two or
  more layers selected, align moves them to the left, horizontal centre, right, top, vertical
  centre or bottom of the selection's bounds. A single layer inside a frame aligns to that frame.
  With three or more, distribute leaves equal gaps horizontally or vertically, keeping the two
  outermost in place. A frame carries what it holds. Each is one undo step.
- **Edit text:** double-click a text layer, or press Enter with one text layer selected, to type
  in place; a new text layer opens the same way. Enter adds a line, and the layer grows to fit
  its lines. Escape, Cmd/Ctrl+Enter or a click outside commits it as one undo step, and a new
  text layer left empty is removed. Shortcuts are paused while you type.
- **Properties:** position, size, rotation, opacity, corner radius, fill, stroke, and text with
  its size. A field applies when you press Enter or leave it; Escape leaves the field.
- **Text layout:** a text layer's properties also hold its **Line height**, a multiple of the font
  size (1.2 by default, from 0.5 to 10), a **Letter spacing** in percent of the font size, a
  weight list (Thin to Black) and an Italic button, four buttons to align its lines left, centre,
  right or justified inside its width, and **Auto width** or **Fixed width**. Justified text
  stretches the spaces of every wrapped line except the last of each paragraph, so it needs a
  fixed width. The weight and style load that file of the family from Fontsource. The weight list
  offers only the weights the family has, and Italic is off for a family with no italic face; a
  family the font list does not know, such as Georgia, offers all nine, and the nearest weight is
  drawn. An auto-width box follows its words and
  never wraps them; a fixed-width box keeps its width and wraps its lines there. Typing a width
  into a text layer makes it fixed-width, and choosing **Auto width** fits the box to the words
  again. Each change is one undo step, and the in-place text editor follows the alignment, line
  height and wrapping of the drawn text. The box of a text layer is the box its text is drawn in:
  a fixed-width layer grows as tall as its lines wrap to as you type, and an auto-width one is as
  wide as its longest line. Files saved before these existed open with the defaults.
- **Lists and rich text:** three buttons in a text layer's properties make its paragraphs a
  bulleted or numbered **list**: every line break starts a paragraph with its marker in the margin
  and the lines hung past it, all in one text layer (the indent is `listIndent`, 1.5 times the font
  size by default). Spans, a stretch of the text with its own weight, italic or colour, are set
  through the MCP server for now and drawn by the canvas, the SVG and the PDF; editing the words
  keeps each span on its characters up to the end of the text and cuts the rest. The in-place
  editor shows the text in the node's own style, and the Canvas 2D fallback draws a list and its
  spans with the node's style until the fonts have loaded.
- **Font:** with a text layer selected, the **Font** field in the properties panel opens a search
  of every Google font family (from the [Fontsource](https://fontsource.org) API, loaded the first
  time you open it). Type to filter, pick one, and the layer's font family is set to it, with a
  generic family after it (`Lora, serif`), as an undoable change. The field shows the first family
  of the layer's font list. If the list cannot be loaded the field says so, and opening it again
  retries; an agent can still set any font family through the MCP tools.
- **Text rendering:** text is shaped with HarfBuzz, so ligatures, kerning, Arabic joining,
  Devanagari conjuncts and mixed left-to-right and right-to-left lines come out right, and it
  stays sharp at any zoom. Fonts come from the [Fontsource](https://fontsource.org) API as a text
  needs them, so a layer's font family can name any of its families: every Google font and more,
  such as Lora, Playfair Display or Caveat. The first family in the list the API has draws the
  text. Fonts that cannot be published, such as Georgia, Arial, Helvetica, Times New Roman,
  Courier New, Calibri and Cambria, draw in an open font with the same letter widths (Gelasio,
  Arimo, Tinos, Cousine, Carlito, Caladea), so lines break where they would; a list that names no
  family the API has uses Inter. Arabic, Hebrew, Devanagari and symbols the family lacks come from
  Noto fonts. Characters none of them cover, such as emoji and Chinese, Japanese and Korean text,
  are drawn by the browser with your system fonts. The editor needs to reach `api.fontsource.org`
  and `cdn.jsdelivr.net`; while it cannot, text is drawn by the browser.
- **Hide and show:** the eye beside a layer in the layers panel.
- **Delete:** Delete or Backspace.
- **Duplicate:** Ctrl/Cmd D copies the selection with everything in it, 10 px down and right, and
  selects the copies.
- **Copy, cut, paste:** Ctrl/Cmd C, X and V. A paste goes into the layer's original parent, or the
  page if that is gone, and each further paste sits another 10 px along. The clipboard is kept
  inside the editor; copying also writes the layers as JSON to the system clipboard.
- **Components:** the right-click menu makes the selected frame or group a component with Create
  component. New instance places a copy beside it, and a copy follows the component: change the
  component and every instance changes. A property edited on a node inside an instance is kept as
  an override, so the component's later changes to it no longer reach that node. Reset overrides
  makes the selection follow the component again, and Detach instance turns it into plain layers.
  Layers inside an instance cannot be added, deleted or reordered; change the component instead.
- **Group:** Ctrl/Cmd G wraps the selected layers, which must share a parent, in a group sized to
  them. Shift Ctrl/Cmd G ungroups, lifting the children out in place.
- **Context menu:** right-click a layer in the layers panel, or the canvas, for Duplicate, Copy,
  Cut, Paste, Group, Ungroup, the four layer-order commands and Delete, each with its shortcut.
  A right-click on a layer selects it unless it is already selected. The menu is shadcn-vue's
  ContextMenu.
- **Layer order:** Ctrl/Cmd ] and [ move the selection one step forward or backward among its
  siblings; add Shift to send it to the front or the back.

## Gradients, blur, blend modes and shadows

The properties panel has an effects section below Stroke.

![Selecting each effect in the sample file: a gradient, a radial gradient, a blur, a shadow and two multiplied circles](/img/effects.gif)

- **Gradient:** the plus beside Gradient turns the fill into a two colour gradient that starts on the
  current fill. Pick linear or radial, set the angle of a linear one, and change the colour of each
  stop. A gradient can fill a rectangle, an ellipse or a frame. More than two stops, or stops at
  other positions, come through the MCP tools.
- **Blur:** a number, in pixels, for the standard deviation of a gaussian blur. Rectangles and
  ellipses only.
- **Blend:** how a rectangle or ellipse combines with what is behind it: Normal, Multiply, Screen,
  Overlay, Darken or Lighten.
- **Shadow:** the plus adds a drop shadow. Set its colour, its offset X and Y, and its blur.

The editor, `get_screenshot` and `export_svg` draw these the same way. The Canvas 2D fallback
approximates them: it blurs the shadow along with the shape, and browsers without canvas filters do
not blur.

## Auto-layout

Select a frame and choose **Row** or **Column** under Auto layout in the properties panel. The
frame then places its children itself, so their X and Y no longer stick.

- **Gap** is the space between children and **Padding** the space between the frame's edge and its
  children, on all sides.
- The two selects align the children along the direction (Start, Centre, End, Space between) and
  across it (Start, Centre, End).
- **Width** and **Height** sizing, shown for a frame and for any child of a layout frame: Fixed keeps
  the size, Hug contents sizes a layout frame to its children, and Fill container shares the free
  space of a layout parent along its direction, or stretches across it.

It is one change like any other, so undo takes it back in one step. Text keeps the size it has, and
hidden layers are skipped. Components and reordering by drag are not part of it yet.

## Pages

A file can hold several pages, and the **Pages** list above the layers shows them in print order. The
canvas, the layers, selection and export all work on the page you pick; the others stay as they were.

- **Switch:** click a page. The view fits the new page and the selection clears.
- **Add:** the **Add page** button puts a new page after the others and shows it.
- **From a template:** the **Add page from a template** button next to it lists stationery
  layouts: a letterhead on A4, a business card, a DL envelope and a postcard. Each adds a page
  holding a white frame at the standard size, in millimetres, with placeholder text and shapes to
  type over. The page is one undo step.
- **Rename:** double-click a page, or choose **Rename** from its menu; Enter keeps the name and
  Escape drops it.
- **Reorder:** **Move earlier** and **Move later** in the page's menu.
- **Delete:** **Delete** in the menu removes the page with everything on it. A file keeps at least
  one page, so the last cannot be deleted.

![Switching pages, adding one, renaming it to Cover and moving it earlier](/img/page-switcher.gif)

Each of these is one undoable step, and agents see the same operations (`createPage`,
`reorderPage` and `delete`). A page is not a printed page: frames set up as pages for print live
on a design page, as the next section describes.

## Images

**Add image** in the toolbar opens a file chooser for a PNG, JPEG, WebP or GIF of up to 20 MB.
The picture is sent to the server's picture store and placed in the middle of the view, inside
the frame there if there is one, at its own size or smaller so its longer side is at most 400
units. It is an ordinary layer: move, resize, rotate, fade and reorder it. The picture is
stretched to the layer's box by default; the **Fit** choice in its properties changes that to
**Fit inside** (all of it, in proportion, with the fill showing around it) or **Fill and crop**
(covers the box in proportion and cuts off the overflow). You can also drop a PNG, JPEG, WebP or
GIF on the canvas to place it under the pointer. **Replace image** in its properties swaps the picture. A picture that has not loaded yet shows the layer's fill.

The file is kept once under the hash of its bytes in `assets/` in the data directory, however
many layers use it. Pictures need the server: the static demo has no store, so its button is off.
SVG and PDF export and `get_screenshot` include pictures. The PDF embeds a stretched PNG or JPEG as
it is and draws WebP and GIF, and any picture set to fit or fill, as images through the same rasteriser that draws a blurred layer.

## Links

A text, rectangle or frame can open an address when it is clicked in the exported PDF, so an email
address, a phone number, a profile or a button can be a link. Select the node and type the address
in the **Link** field of the properties panel: an `https://` address, `mailto:` or `tel:`. Anything
else, such as `javascript:` or `http://`, is refused, and the field stays as it was. Empty the field
to remove the link.

In the PDF the link covers the node's box; a wrapped text is clickable along each of its lines. A
link has no style of its own, so underline or colour the text as you like. Resting the pointer on a
linked node on the canvas shows its address. A link on part of a text is not possible yet.

## Pages, units and guides

Select a frame and the properties panel gains a **Page** section that makes it a printed page.

- **Paper size:** a preset for standard stationery, grouped into ISO paper (A0 to A7 and B0 to
  B7), US paper (Letter, Legal, Tabloid and more), envelopes (DL, C4, C5, C6 and #10) and cards
  (business cards, a postcard and a square card). Picking one sets the unit to `mm` and the
  frame's size; bleed and guides stay as they are. A frame of a size the list has shows it, and
  any other shows **Custom size**.

  ![The Paper size list open, grouped into ISO paper, US paper, envelopes and cards](/img/paper-size.png)

- **Unit:** `mm` or `pt`. It sets how the width, height, bleed, margins and gutter are shown and
  typed. The file stores points (one design unit, as in the PDF), so switching the unit changes no
  size. A4 is 210 by 297 mm, which is 595.28 by 841.89 pt.
- **Bleed:** how far the print extends past the page. The frame's box is the trim, so the bleed
  lies outside it, drawn as a red outline.
- **Facing:** a single page, a left or right page of a facing pair, or a spread, which is two
  facing pages in one frame (twice the page width). Page order is the **PDF page** number.
- **Guides:** margins, columns with a gutter, and a fold down the middle. The inner margin lies
  along the spine, so on a left page it is the right one, and a spread mirrors it across its two
  pages. Guides are kept on the frame, drawn over the frame's fill and under its content, and
  never exported: not to SVG, PNG or PDF, and not in a screenshot. A turned frame draws none.

Agents set the same through the MCP `set_page_setup` tool, in either unit.

## Export

![The Export section of the properties panel](/img/export.png)

The Export section sits at the bottom of the properties panel.

- **What it exports:** each selected layer, one file apiece, or the whole page when nothing is
  selected. A layer is drawn with everything inside it.
- **SVG:** a vector file named `<layer name>.svg`. Text is plain SVG text, so it may differ from
  the canvas where fonts differ. It follows a text layer's alignment and line height, but never
  wraps: a fixed-width layer is drawn line by line as written.
- **PNG:** pick 1x, 2x or 3x; the file is `<layer name>@<scale>x.png`. The browser draws the SVG
  onto a canvas, so nothing is uploaded. A very large layer is shrunk to fit the browser's canvas
  limit of 8192 pixels on the long side.
- **PDF:** the whole document as one file named `<document name>.pdf`, whatever is selected. Give
  a frame a number in the **PDF page** field of the properties panel and it becomes a page of the
  PDF, at the frame's own size, in that order; frames without a number, and anything else on the
  canvas, are left out. With no numbered frame, each page in the document is a PDF page, as large
  as its visible content. One design unit is a point. Shapes, clipping frames, gradients, opacity and blend modes are vector; text is set in
  the fonts the editor lays it out with, embedded and selectable, with every line breaking where
  it does on the canvas. A layer with blur or a shadow becomes an image, because a PDF has no
  blur. Layout guides are never drawn. Bleed, trim marks and CMYK are not part of this export yet.
- **A file to try it on:** `pnpm sample:book` writes `book-sample` to the data directory: twelve
  numbered page frames laid out on one canvas, and an art direction board with no number. Its
  PDF has twelve pages and no board. It is rewritten each time it runs, so edit a copy.
- **Shortcut:** Shift Ctrl/Cmd E exports again with the last-used format and scale.

![Selecting the two page frames of the sample file; the PDF page field shows 1 and 2](/img/pdf-pages.gif)

Characters a file name cannot hold (such as `/` or `:`) in a layer name become `-`. Agents get the
same SVG, and a PNG made in Node, through the MCP `export_svg` and `get_screenshot` tools, and the
same PDF through `export_pdf`.

## Shortcuts

| Keys                     | Does                |
| ------------------------ | ------------------- |
| Ctrl/Cmd Z               | Undo                |
| Shift Ctrl/Cmd Z, Ctrl Y | Redo                |
| Ctrl/Cmd A               | Select all          |
| Ctrl/Cmd D               | Duplicate           |
| Ctrl/Cmd C, X, V         | Copy, cut, paste    |
| Ctrl/Cmd G               | Group               |
| Shift Ctrl/Cmd G         | Ungroup             |
| Ctrl/Cmd ], [            | Forward, backward   |
| Shift Ctrl/Cmd ], [      | To front, to back   |
| Escape                   | Deselect            |
| Scroll                   | Pan                 |
| Space-drag, middle-drag  | Pan                 |
| Ctrl/Cmd scroll, pinch   | Zoom at the pointer |
| Shift 1                  | Zoom to fit         |
| Shift 0                  | Zoom to 100%        |
| Shift Ctrl/Cmd E         | Export again        |

Undo covers your own edits. If an agent changed a layer since, a step that no longer applies is
skipped rather than half-applied.

## Not yet

The canvas draws shapes with WebGL2 and falls back to Canvas 2D where WebGL2 is missing; add
`?renderer=canvas2d` to the address to force the fallback, which draws text with the browser's own
text drawing and still honours alignment, line height and wrapping. Clicks, hover and marquee
selection read the spatial index, so their cost does not grow with the number of layers. A marquee
selects a node where it is drawn, so a rotated node is caught by its turned shape, not its
unturned box.
