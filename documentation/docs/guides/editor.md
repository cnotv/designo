---
sidebar_position: 0
---

# Using the editor

![Drawing a frame and a rectangle, moving, resizing and filling it, an agent editing the file live, then undo](/img/editor.gif)

The editor saves every change as you make it: there is no save button. An agent working on the
same file through the MCP server shows up within a second, and your edits reach the agent the
same way.

## Tools

| Tool      | Key | Does                                                      |
| --------- | --- | --------------------------------------------------------- |
| Move      | V   | Select, move and resize                                   |
| Frame     | F   | Draw a frame; shapes drawn inside it belong to it         |
| Rectangle | R   | Draw a rectangle                                          |
| Ellipse   | O   | Draw an ellipse                                           |
| Text      | T   | Click to place text, then edit it in the properties panel |

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
- **Properties:** position, size, rotation, opacity, corner radius, fill, stroke, and text with
  its size. A field applies when you press Enter or leave it; Escape leaves the field.
- **Hide and show:** the eye beside a layer in the layers panel.
- **Delete:** Delete or Backspace.
- **Duplicate:** Ctrl/Cmd D copies the selection with everything in it, 10 px down and right, and
  selects the copies.
- **Copy, cut, paste:** Ctrl/Cmd C, X and V. A paste goes into the layer's original parent, or the
  page if that is gone, and each further paste sits another 10 px along. The clipboard is kept
  inside the editor; copying also writes the layers as JSON to the system clipboard.
- **Group:** Ctrl/Cmd G wraps the selected layers, which must share a parent, in a group sized to
  them. Shift Ctrl/Cmd G ungroups, lifting the children out in place.
- **Context menu:** right-click a layer in the layers panel, or the canvas, for Duplicate, Copy,
  Cut, Paste, Group, Ungroup, the four layer-order commands and Delete, each with its shortcut.
  A right-click on a layer selects it unless it is already selected. The menu is shadcn-vue's
  ContextMenu.
- **Layer order:** Ctrl/Cmd ] and [ move the selection one step forward or backward among its
  siblings; add Shift to send it to the front or the back.

## Export

![The Export section of the properties panel](/img/export.png)

The Export section sits at the bottom of the properties panel.

- **What it exports:** each selected layer, one file apiece, or the whole page when nothing is
  selected. A layer is drawn with everything inside it.
- **SVG:** a vector file named `<layer name>.svg`. Text is plain SVG text, so it may differ from
  the canvas where fonts differ.
- **PNG:** pick 1x, 2x or 3x; the file is `<layer name>@<scale>x.png`. The browser draws the SVG
  onto a canvas, so nothing is uploaded. A very large layer is shrunk to fit the browser's canvas
  limit of 8192 pixels on the long side.
- **Shortcut:** Shift Ctrl/Cmd E exports again with the last-used format and scale.

Characters a file name cannot hold (such as `/` or `:`) in a layer name become `-`. Agents get the
same SVG, and a PNG made in Node, through the MCP `export_svg` and `get_screenshot` tools.

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

Inline text editing on the canvas. The canvas
is drawn with Canvas 2D for now; a WebGL renderer is tracked in
[issue #5](https://github.com/cnotv/designo/issues/5).
