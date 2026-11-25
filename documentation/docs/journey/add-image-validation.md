# Validating pictures in add_image

Issue 92: why `add_image` checks a picture's header, and what that check cannot catch.

## The symptom

An agent sent a 150x165 JPEG as base64 with a few characters wrong. The call succeeded and
returned the requested box and an asset id, and the picture rendered blank. Nothing signalled
the problem.

## Why it passed

The store only looked at the first bytes to pick a type. A damaged file with a valid signature
is still "a JPEG" by that test. Worse, when the header held no size, the tool silently used a
default box, so the result looked normal. The returned width and height were the box the agent
asked for or a fallback, never evidence that the picture decoded.

## What the check can and cannot see

| Damage                              | Caught by the header check |
| ----------------------------------- | -------------------------- |
| Not a picture, or a script          | Yes (signature)            |
| Cut short before the size fields    | Yes (no size is readable)  |
| Wrong characters in the signature   | Yes                        |
| Wrong characters deep in image data | No                         |

The last row is the case in the issue. Finding it needs a full decode, and the server has no
raster decoder (resvg draws SVG; it does not read pictures on their own). The honest ceiling
today is the header. The real fix for corrupted data is not to send bytes through the model at
all, which is why `path`, `url` and `assetId` exist.

## Order matters

The size is read before the file is written. Checking after storing would leave a damaged asset
in the store, content addressed and reusable by id, which a later `assetId` call would then
trust.

## Reading files and URLs

`path` and `url` make the server read and fetch as its own machine. The earlier guide refused
both for that reason. What keeps it tolerable is that only bytes whose signature is a picture
are ever stored, so the model cannot use them to copy an arbitrary file into a document. A
`url` is limited to http and https, with a timeout and a size cap. It does not block private
addresses, so a server exposed to untrusted agents needs an allowlist first.
