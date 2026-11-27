import { layoutDocument, type DesignDocument } from '@designo/core'
import type { CodeExportOptions, CodeFile, CodeTarget } from '../types.ts'
import { buildCodeTree } from './codeTree.ts'
import { emitCode } from './emitters.ts'

export const CODE_TARGETS: readonly CodeTarget[] = ['html', 'vue', 'react', 'js']

/**
 * Exports a node as code: HTML and CSS, a Vue component, a React component, or vanilla
 * JavaScript that builds the elements. Auto-layout frames are flex boxes, every other child is
 * placed absolutely, as on the canvas.
 * @param document - The document, with masters resolved.
 * @param nodeId - The node to export.
 * @param target - Which kind of code.
 * @param options - Where image sources point.
 * @returns The files.
 * @throws {Error} When the node does not exist.
 */
export const exportNodeToCode = (
  document: DesignDocument,
  nodeId: string,
  target: CodeTarget,
  options: CodeExportOptions = {}
): CodeFile[] => {
  const tree = buildCodeTree(layoutDocument(document), nodeId, options)
  if (!tree) throw new Error(`No node with id ${nodeId}`)
  return emitCode(tree, target)
}
