# get_screenshot took the server down

Issue 39: on a file of 936 nodes, `get_screenshot` on any of 22 big frames answered
`Bad Gateway`, again a minute later, while `export_svg`, `get_node` and `apply_ops` worked on the
same frames and `get_screenshot` worked on each child of a failing frame. One `list_files` also
answered Bad Gateway a few minutes later and then recovered.

## The cause

resvg, the renderer behind `get_screenshot`, **aborts the whole process** on a particular input.
It is a Rust panic inside the native binding (`resvg/src/geom.rs:27`, an `Option::unwrap()` on
`None`), and a panic cannot unwind through the Node binding, so the process dies with `SIGABRT`
(`fatal runtime error: failed to initiate panic`). The server was that process. The reverse proxy
saw its upstream disappear and said Bad Gateway; the next request, `list_files` included, hit the
restart; the container's restart policy brought it back.

The input is a group that resvg has to draw on a layer of its own (a `clip-path`, an `opacity`, a
rotation) when everything in it lies **more than a canvas size beyond the canvas**: the first
crashing x is exactly twice the canvas width plus two. Found by bisecting random SVGs:

| Canvas   | A 10 px rect inside `<g opacity="0.5">` first crashes at x |
| -------- | ---------------------------------------------------------- |
| 100x100  | 202                                                        |
| 400x400  | 802                                                        |
| 840x420  | 1682                                                       |
| 2000x100 | 4002                                                       |

The exporter writes a frame as a clip group around its children. A frame whose children are all
far outside it is such a group, and a frame far from the origin is exactly where that happens if
the children carry coordinates relative to the frame: the old 480x480 frames sat near the origin,
where relative and absolute nearly agree, and the 22 new ones at y 8400 to 14000 did not. A child
alone has no clip group, so each one rendered. A whole page has a canvas big enough to hold
everything, so it rendered too. A group that has at least one child inside the canvas is fine, so
only frames with no child near them failed. The reproduction is a generated file of 939 nodes
(40 frames of 480x480 near the origin, 22 of 840x420 at x 100 and 1040, y 8400 to 14000, with
translucent `#rrggbbaa` ellipses, stroked rectangles with `fill: null`, Georgia and Inter text)
whose big frames carry relative coordinates; the same file with absolute coordinates renders.

I could not see the agent's own file, so that its children were relative is an inference, not
something I observed. What I did observe is every symptom reproduced by the mechanism above: the
socket closing mid-request, the server process gone, deterministic failure for the same frame,
and the next `list_files` failing until the process is started again. Things that did not matter,
each ruled out by rendering with and without it: the frame size and position alone, the 8-digit hex
fills, fonts that are not installed, the number of nodes, the number of translucent ellipses, and
repeated renders (no memory growth over 60 renders).

## What was done about it

- **The exporter drops what cannot show.** It carries the region that can be seen down the tree,
  cut by every clipping frame and moved into each rotated node's own space, and writes no
  frame, rectangle, ellipse or text that lies wholly outside it. Text is bounded generously
  rather than measured. This removes the layers resvg cannot take, and a 240-case random fuzz of
  nested frames, groups, opacity and rotation went from 17 aborts to none, with the same pixels
  (the few differing channels, up to 11 levels, are anti-aliasing at a layer's edge).
- **The renderer runs in a child process.** Whatever else resvg cannot take, it now ends one call:
  a crash, a timeout, a render above 64 megapixels or a process above 1 GB each become a tool
  error. A worker thread would not do, because a native abort kills the whole process. The cost is
  about 100 ms a call, measured at 46 ms in process and 145 ms with the child on a 840x420 frame.
- **The error says what failed**, and `/mcp` answers a failure of its own plumbing as a JSON-RPC
  error instead of a bare 500.
- **Blank lines in text** collapsed because each line after the first was placed by a `dy` on its
  own `tspan`, and an empty `tspan` is dropped, taking its `dy` with it. Every line now sets its own
  `y`.

## What did not work, or is left

- Lowering the scale does not avoid the crash: the canvas and the content shrink together, so it
  fails at every scale, as the agent saw at 0.5 to 1.5.
- Everything above was checked on glibc. The Docker image is Alpine, where resvg-js loads its musl
  binary; I could not run that here (no musl runtime was reachable), so the abort on musl is
  assumed to be the same panic, not seen. The child process does not depend on that: it works the
  same on any platform that can run `node file.ts`.
- The memory limit is read from `/proc` every 50 ms, so it exists only on Linux, and a single
  large allocation can overshoot it before the next reading; the pixel limit is what bounds that.
