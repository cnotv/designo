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
  edge flips the shape.
- **Properties:** position, size, rotation, opacity, corner radius, fill, stroke, and text with
  its size. A field applies when you press Enter or leave it; Escape leaves the field.
- **Hide and show:** the eye beside a layer in the layers panel.
- **Delete:** Delete or Backspace.

## Shortcuts

| Keys                     | Does                |
| ------------------------ | ------------------- |
| Ctrl/Cmd Z               | Undo                |
| Shift Ctrl/Cmd Z, Ctrl Y | Redo                |
| Ctrl/Cmd A               | Select all          |
| Escape                   | Deselect            |
| Scroll                   | Pan                 |
| Space-drag, middle-drag  | Pan                 |
| Ctrl/Cmd scroll, pinch   | Zoom at the pointer |
| Shift 1                  | Zoom to fit         |
| Shift 0                  | Zoom to 100%        |

Undo covers your own edits. If an agent changed a layer since, a step that no longer applies is
skipped rather than half-applied.

## Not yet

Rotation handles, inline text editing on the canvas, and frames clipping their contents. The
canvas is drawn with Canvas 2D for now; a WebGL renderer is tracked in
[issue #5](https://github.com/cnotv/designo/issues/5).
