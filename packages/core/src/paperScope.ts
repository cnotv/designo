import paperCore from 'paper/dist/paper-core.js'

// paper-core ships a declaration that only registers the global `paper` types and exports
// nothing, so the scope it exports at runtime is typed here, once, for the rest of core. The
// scope stays free of the DOM: it builds and combines outlines and never draws.
export const paperScope = paperCore as unknown as paper.PaperScope
paperScope.setup(new paperScope.Size(1, 1))
