import { getCommentPosition, type DesignComment, type DesignDocument } from '@designo/core'
import type { PresenceEntry } from '@designo/sync'
import type { CommentPin, Point, RemoteMark, Viewport } from './types.ts'
import { worldToScreen } from './viewport.ts'

const MAX_NESTING = 1000

// The page a node sits on, found by walking up; the depth bounds a damaged file's cycle.
const pageOf = (document: DesignDocument, nodeId: string, depth = 0): string | undefined => {
  const node = document.nodes[nodeId]
  if (!node || depth > MAX_NESTING) return undefined
  return node.parentId === null ? node.id : pageOf(document, node.parentId, depth + 1)
}

const isOnShownPage = (document: DesignDocument, nodeId: string): boolean =>
  pageOf(document, nodeId) === document.rootId

/**
 * Turns the others' presence into what the overlay draws: their selection and their pointer.
 * @param presence - Everyone else on the file.
 * @param document - The shown page; selected nodes on other pages are left out.
 * @returns One mark per person or agent.
 */
export const toRemoteMarks = (
  presence: readonly PresenceEntry[],
  document: DesignDocument
): RemoteMark[] =>
  presence.map((entry) => ({
    clientId: entry.clientId,
    name: entry.user.name,
    color: entry.user.color,
    selection: entry.selection.filter((id) => isOnShownPage(document, id)),
    cursor: entry.cursor
  }))

/**
 * Places the pins of the open comments on the screen.
 * @param document - The shown page.
 * @param viewport - Pan and zoom.
 * @returns A pin per open comment whose node is on this page, numbered oldest first.
 */
export const getCommentPins = (document: DesignDocument, viewport: Viewport): CommentPin[] =>
  Object.values(document.comments ?? {})
    .filter(
      (comment) =>
        !comment.resolved && (comment.nodeId === null || isOnShownPage(document, comment.nodeId))
    )
    .toSorted((first, second) => first.createdAt.localeCompare(second.createdAt))
    .flatMap((comment, index) => {
      const position = getCommentPosition(document, comment)
      return position
        ? [{ comment, number: index + 1, screen: worldToScreen(viewport, position) }]
        : []
    })

/**
 * Builds a new comment: pinned to the top right corner of the first selected node, or to the
 * page at a point, usually the middle of the view.
 * @param document - The shown page.
 * @param target - What is selected, the page, and the point to use with nothing selected.
 * @param target.selection - The selected node ids.
 * @param target.pageId - The shown page.
 * @param target.point - Where on the page the pin goes when nothing is selected.
 * @param content - The comment's id, text, author and time.
 * @param content.id - The new comment's id.
 * @param content.text - What it says.
 * @param content.author - Who wrote it.
 * @param content.createdAt - When, as ISO 8601.
 * @returns The comment.
 */
export const createComment = (
  document: DesignDocument,
  target: { selection: readonly string[]; pageId: string; point: Point },
  content: { id: string; text: string; author: string; createdAt: string }
): DesignComment => {
  const node = target.selection.map((id) => document.nodes[id]).find((found) => found)
  const page = document.nodes[target.pageId]
  const anchor = node
    ? { nodeId: node.id, x: node.width, y: 0 }
    : {
        nodeId: target.pageId,
        x: target.point.x - (page?.x ?? 0),
        y: target.point.y - (page?.y ?? 0)
      }
  return { ...content, ...anchor, text: content.text.trim(), resolved: false }
}

const GUEST_NAMES = ['Otter', 'Heron', 'Lynx', 'Wren', 'Ibex', 'Marten', 'Puffin', 'Fox'] as const

/**
 * Names a visitor who is not signed in, the same way on every reload of the tab.
 * @param seed - A number that stays the same for the tab.
 * @returns A short name such as "Guest Heron".
 */
export const guestName = (seed: number): string =>
  `Guest ${GUEST_NAMES[Math.abs(seed) % GUEST_NAMES.length] ?? GUEST_NAMES[0]}`
