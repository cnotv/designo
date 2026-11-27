# Live editing with Yjs

Issue 123: what got in the way of putting a Yjs sync server in front of the files.

## The first messages vanished

The first test of the hub, two y-websocket clients against a real HTTP server, never synced. A
client sends its first sync message the moment the socket opens, and the hub only listened for
messages once the room had read the file from disk. `ws` does not buffer for a listener that comes
later, so that message was dropped and the client waited for an answer forever. The fix listens at
once and chains every message on the promise of the opening room, which keeps them all, in order.

## Merges that are valid apart and broken together

Per-property maps make two edits to one node merge cleanly, but two valid operations can still
clash once merged: a node moved into a frame someone else deleted points at a parent that is
gone. Rather than teach every client to avoid it, the hub repairs the merge before it saves: nodes
no page reaches are dropped and layout runs again. Comments on a node that is gone are kept and
hidden, so undoing the delete brings them back with it.

## The stdio server is a second writer

The issue asks the MCP server to write through the hub. The remote `/mcp` endpoint runs inside the
server, so it does. The stdio server is a separate process the agent starts, with no connection to
the hub, so it still writes the file. The room follows the file's modification time and merges only
what changed on disk since its own last save, a three-way merge against what it last wrote, so a
live edit not yet saved is not overwritten. A clash inside the half second between two polls is
still possible, which the roadmap lists as a risk.

## The lint rule on maps and sets

The repository's immutable-data rule flags `Map.set` and `Set.add`, and the hub keeps rooms and
connections. Turning the rule off for the file would have been the quick way. The hub keeps
read-only maps in `let` bindings instead and replaces them on each change, as the replay guard in
`@designo/auth` already did.
