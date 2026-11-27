import type { CodeElement, CodeTextRun, CssDeclaration } from '../types.ts'

const INDENT = '  '

const rule = (selector: string, declarations: readonly CssDeclaration[]): string[] =>
  declarations.length === 0
    ? []
    : [
        `${selector} {\n${declarations.map(([property, value]) => `${INDENT}${property}: ${value};`).join('\n')}\n}`
      ]

const spanRules = (element: CodeElement): string[] => {
  const runs = (element.paragraphs ?? []).flat()
  const byClass = new Map(
    runs.flatMap((run: CodeTextRun) => (run.className ? [[run.className, run.style] as const] : []))
  )
  return [...byClass].flatMap(([className, style]) => rule(`.${className}`, style))
}

const elementRules = (element: CodeElement): string[] => [
  ...rule(`.${element.className}`, element.style),
  ...spanRules(element),
  ...element.children.flatMap(elementRules)
]

/**
 * The stylesheet of a tree: a rule for every element's class, and one for each text span.
 * @param root - The tree's root element.
 * @returns The CSS.
 */
export const buildStylesheet = (root: CodeElement): string => `${elementRules(root).join('\n\n')}\n`
