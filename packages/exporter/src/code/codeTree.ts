import { getChildren, type DesignDocument, type DesignNode } from '@designo/core'
import { getExportBounds } from '../svg.ts'
import type { CodeElement, CodeExportOptions, CodeTree } from '../types.ts'
import { getNodeStyle } from './codeStyles.ts'
import { getTextParagraphs } from './codeText.ts'

const FALLBACK_NAME = 'layer'

const toWords = (name: string): string[] =>
  name
    .normalize('NFKD')
    .replaceAll(/[^\d\sA-Za-z]/g, ' ')
    .replaceAll(/([\da-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== '')

/**
 * A name as a CSS class: lowercase words joined by hyphens, never starting with a digit.
 * @param name - A layer's name.
 * @returns The class name.
 */
export const toKebabCase = (name: string): string => {
  const kebab = toWords(name).join('-') || FALLBACK_NAME
  return /^\d/.test(kebab) ? `${FALLBACK_NAME}-${kebab}` : kebab
}

/**
 * A name as a component: each word capitalised and joined, never starting with a digit.
 * @param name - A layer's name.
 * @returns The component name.
 */
export const toPascalCase = (name: string): string => {
  const pascal = toKebabCase(name)
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join('')
  return pascal
}

const textTag = (node: DesignNode): CodeElement['tag'] => {
  if (node.listStyle === 'bullet') return 'ul'
  if (node.listStyle === 'number') return 'ol'
  return node.pdfTag && node.pdfTag !== 'li' ? node.pdfTag : 'p'
}

const tagOf = (node: DesignNode): CodeElement['tag'] => {
  if (node.type === 'text') return textTag(node)
  if (node.type === 'image' && node.imageAsset !== null) return 'img'
  if (node.type === 'path') return 'svg'
  return 'div'
}

interface TreeState {
  document: DesignDocument
  options: CodeExportOptions
  /** The class of every exported node, by id. */
  classNames: ReadonlyMap<string, string>
}

const collectVisible = (document: DesignDocument, node: DesignNode): DesignNode[] => [
  node,
  ...getChildren(document, node.id)
    .filter((child) => child.visible)
    .flatMap((child) => collectVisible(document, child))
]

// In document order, so the first layer of a name keeps it and the later ones are numbered.
const assignClassNames = (nodes: readonly DesignNode[]): ReadonlyMap<string, string> =>
  new Map(
    nodes.reduce<{ counts: Readonly<Record<string, number>>; names: [string, string][] }>(
      (state, node) => {
        const base = toKebabCase(node.name || node.type)
        const count = (state.counts[base] ?? 0) + 1
        return {
          counts: { ...state.counts, [base]: count },
          names: [...state.names, [node.id, count === 1 ? base : `${base}-${count}`]]
        }
      },
      { counts: {}, names: [] }
    ).names
  )

const contentOf = (
  state: TreeState,
  node: DesignNode,
  className: string
): Pick<CodeElement, 'paragraphs' | 'image' | 'vector'> => {
  if (node.type === 'text') return { paragraphs: getTextParagraphs(node, className) }
  if (node.type === 'image' && node.imageAsset !== null)
    return {
      image: {
        source: state.options.getImageSource?.(node.imageAsset) ?? `assets/${node.imageAsset}`,
        alt: node.name
      }
    }
  if (node.type === 'path')
    return {
      vector: {
        width: node.width,
        height: node.height,
        pathData: node.pathData,
        fill: node.fill ?? 'none',
        stroke: node.stroke,
        strokeWidth: node.strokeWidth
      }
    }
  return {}
}

const buildElement = (
  state: TreeState,
  node: DesignNode,
  parent: DesignNode | undefined
): CodeElement => {
  const className = state.classNames.get(node.id) ?? toKebabCase(node.name)
  return {
    nodeId: node.id,
    className,
    tag: tagOf(node),
    style: getNodeStyle(node, parent),
    ...contentOf(state, node, className),
    ...(node.link ? { link: node.link } : {}),
    children: getChildren(state.document, node.id)
      .filter((child) => child.visible)
      .map((child) => buildElement(state, child, node))
  }
}

/**
 * Builds the intermediate representation a node's code is emitted from. Auto-layout frames become
 * flex boxes, other children are placed absolutely in their parent, hidden layers are left out.
 * @param document - The document, with masters resolved and auto-layout applied.
 * @param nodeId - The node to export; it becomes the root element, positioned relatively.
 * @param options - Where image sources point.
 * @returns The tree, or undefined when the node does not exist.
 */
export const buildCodeTree = (
  document: DesignDocument,
  nodeId: string,
  options: CodeExportOptions = {}
): CodeTree | undefined => {
  const stored = document.nodes[nodeId]
  if (!stored) return undefined
  // A page has no box of its own: it takes the box of what is on it.
  const node = stored.type === 'page' ? { ...stored, ...getExportBounds(document, stored) } : stored
  const state: TreeState = {
    document,
    options,
    classNames: assignClassNames(collectVisible(document, node))
  }
  return {
    componentName: toPascalCase(node.name || 'Design'),
    root: buildElement(state, node, undefined)
  }
}
