// Stands in for a render that needs far more memory than it is allowed: holds 300 MB, touched so it is resident.
const HELD_BYTES = 314_572_800
const held = Buffer.alloc(HELD_BYTES, 1)
setInterval(() => held.length, 1000)
