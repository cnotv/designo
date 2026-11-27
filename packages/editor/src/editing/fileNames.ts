import type { DesignOperation } from '@designo/core'
import type { DocumentSummary } from '@designo/storage'

const UNTITLED_NAME = 'Untitled'

/**
 * Names a new file `Untitled`, or `Untitled 2`, `Untitled 3` and so on when that name is taken,
 * so files made one after another can be told apart in the list.
 * @param existingNames - The names of the files already in the list.
 * @returns The first free name.
 */
export const nextUntitledFileName = (existingNames: readonly string[]): string => {
  const taken = new Set(existingNames)
  const firstFreeNumber = (candidate: number): number =>
    taken.has(`${UNTITLED_NAME} ${candidate}`) ? firstFreeNumber(candidate + 1) : candidate
  return taken.has(UNTITLED_NAME) ? `${UNTITLED_NAME} ${firstFreeNumber(2)}` : UNTITLED_NAME
}

/**
 * Turns what was typed into a file's name field into a rename, or nothing when the name is blank
 * or unchanged, so leaving the field as it was saves nothing.
 * @param currentName - The file's name now.
 * @param typedName - What was typed.
 * @returns The rename operation, or undefined when there is nothing to save.
 */
export const renameOperationFor = (
  currentName: string,
  typedName: string
): Extract<DesignOperation, { kind: 'renameDocument' }> | undefined => {
  const name = typedName.trim()
  return name === '' || name === currentName ? undefined : { kind: 'renameDocument', name }
}

/**
 * Shows a new name in the file list before the server has saved it.
 * @param summaries - The file list.
 * @param fileId - The renamed file.
 * @param name - Its new name.
 * @returns The list with that file renamed.
 */
export const renameSummary = (
  summaries: readonly DocumentSummary[],
  fileId: string,
  name: string
): DocumentSummary[] =>
  summaries.map((summary) => (summary.id === fileId ? { ...summary, name } : summary))
