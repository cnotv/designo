import type {
  CommentOperation,
  DesignComment,
  DesignDocument,
  DesignOperation,
  OperationResult
} from './types.ts'

const MAX_COMMENT_LENGTH = 10_000

const withComments = (
  document: DesignDocument,
  comments: Readonly<Record<string, DesignComment>>
): DesignDocument => {
  const { comments: _comments, ...rest } = document
  return Object.keys(comments).length > 0 ? { ...rest, comments } : rest
}

const checkComment = (document: DesignDocument, comment: DesignComment): string | undefined => {
  if (comment.text.trim() === '') return 'A comment needs text'
  if (comment.text.length > MAX_COMMENT_LENGTH)
    return `A comment is at most ${MAX_COMMENT_LENGTH} characters`
  if (comment.nodeId !== null && !document.nodes[comment.nodeId])
    return `Node ${comment.nodeId} does not exist`
  return undefined
}

/**
 * Whether an operation adds, changes or removes a comment.
 * @param operation - Any operation.
 * @returns True for setComment and deleteComment.
 */
export const isCommentOperation = (operation: DesignOperation): operation is CommentOperation =>
  operation.kind === 'setComment' || operation.kind === 'deleteComment'

/**
 * Applies a comment operation. Comments sit beside the nodes, so they never change the layout.
 * @param document - The document before the operation.
 * @param operation - A comment operation.
 * @returns The new document, or the reason the operation was refused.
 */
export const applyCommentOperation = (
  document: DesignDocument,
  operation: CommentOperation
): OperationResult => {
  const comments = document.comments ?? {}
  if (operation.kind === 'deleteComment') {
    if (!comments[operation.id])
      return { ok: false, error: `Comment ${operation.id} does not exist` }
    return {
      ok: true,
      document: withComments(
        document,
        Object.fromEntries(Object.entries(comments).filter(([id]) => id !== operation.id))
      )
    }
  }
  const problem = checkComment(document, operation.comment)
  if (problem) return { ok: false, error: problem }
  return {
    ok: true,
    document: withComments(document, { ...comments, [operation.comment.id]: operation.comment })
  }
}

/**
 * Works out the operation that undoes a comment operation.
 * @param document - The document before the operation.
 * @param operation - A comment operation.
 * @returns The operation that restores the comment as it was, or removes a new one.
 */
export const invertCommentOperation = (
  document: DesignDocument,
  operation: CommentOperation
): DesignOperation[] => {
  const id = operation.kind === 'setComment' ? operation.comment.id : operation.id
  const existing = document.comments?.[id]
  if (existing) return [{ kind: 'setComment', comment: existing }]
  return operation.kind === 'setComment' ? [{ kind: 'deleteComment', id }] : []
}

/**
 * Where a comment's pin sits on the page: its own point, or that point from its node's corner.
 * @param document - The document.
 * @param comment - The comment.
 * @returns The point, or undefined when its node is gone.
 */
export const getCommentPosition = (
  document: DesignDocument,
  comment: DesignComment
): { x: number; y: number } | undefined => {
  if (comment.nodeId === null) return { x: comment.x, y: comment.y }
  const node = document.nodes[comment.nodeId]
  return node ? { x: node.x + comment.x, y: node.y + comment.y } : undefined
}
