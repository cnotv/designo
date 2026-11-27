import type { DesignComment, DesignDocument } from '@designo/core'
import { readDocument } from '@designo/storage'
import type { PresenceEntry } from '@designo/sync'
import { readPresenceFile } from '@designo/sync/server'
import { applyBatch } from './tools.ts'
import type { DesignoToolContext, SelectionReport } from './types.ts'

const DEFAULT_AGENT_NAME = 'Agent'

const readPresenceOf = async (
  context: DesignoToolContext,
  fileId: string
): Promise<PresenceEntry[]> =>
  context.sync
    ? context.sync.getPresence(context.dataDirectory, fileId)
    : readPresenceFile(context.dataDirectory, fileId, Date.now())

const toSelectionReport = (document: DesignDocument, entry: PresenceEntry): SelectionReport => ({
  name: entry.user.name,
  kind: entry.user.kind,
  color: entry.user.color,
  selection: entry.selection.flatMap((id) => {
    const node = document.nodes[id]
    return node ? [{ id, name: node.name, type: node.type }] : []
  }),
  cursor: entry.cursor
})

/**
 * Tells who is on a file and what each of them has selected, from the presence the editors
 * publish to the sync server.
 * @param context - Where files live, and the live hub when the server has one.
 * @param input - The file.
 * @returns One entry per person or agent with the file open; empty when nobody has.
 */
export const getSelectionTool = async (
  context: DesignoToolContext,
  input: { fileId: string }
): Promise<{ people: SelectionReport[] }> => {
  const document = await readDocument(context.dataDirectory, input.fileId)
  const presence = await readPresenceOf(context, input.fileId)
  return { people: presence.map((entry) => toSelectionReport(document, entry)) }
}

/**
 * Lists the comments on a file.
 * @param context - Where files live.
 * @param input - The file, and whether to include resolved comments.
 * @returns The comments, oldest first.
 */
export const getCommentsTool = async (
  context: DesignoToolContext,
  input: { fileId: string; includeResolved?: boolean }
): Promise<{ comments: DesignComment[] }> => {
  const document = await readDocument(context.dataDirectory, input.fileId)
  const comments = Object.values(document.comments ?? {})
    .filter((comment) => input.includeResolved === true || !comment.resolved)
    .toSorted((first, second) => first.createdAt.localeCompare(second.createdAt))
  return { comments }
}

/**
 * Leaves a comment on the page or pinned to a node.
 * @param context - Where files live, how ids are made, and who signs the comment.
 * @param input - The file, the text, and where the pin goes: a node and a point from its top
 *   left, or a point on the page.
 * @returns The new comment's id.
 */
export const addCommentTool = async (
  context: DesignoToolContext,
  input: { fileId: string; text: string; nodeId?: string; x?: number; y?: number }
): Promise<{ commentId: string }> => {
  const comment: DesignComment = {
    id: context.generateId('comment'),
    nodeId: input.nodeId ?? null,
    x: input.x ?? 0,
    y: input.y ?? 0,
    text: input.text,
    author: context.authorName ?? DEFAULT_AGENT_NAME,
    createdAt: new Date().toISOString(),
    resolved: false
  }
  await applyBatch(context, input.fileId, [{ kind: 'setComment', comment }])
  return { commentId: comment.id }
}
