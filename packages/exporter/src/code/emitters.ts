import type { CodeElement, CodeFile, CodeTarget, CodeTree, CodeVector } from '../types.ts'
import { buildStylesheet } from './css.ts'
import { elementMarkup, HTML_DIALECT, JSX_DIALECT, VUE_DIALECT } from './markup.ts'

const INDENT = '  '
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

const indentLines = (lines: readonly string[], depth: number): string =>
  lines.map((line) => `${INDENT.repeat(depth)}${line}`).join('\n')

const emitHtml = (tree: CodeTree): CodeFile[] => [
  {
    path: 'index.html',
    content: [
      '<!doctype html>',
      '<html lang="en">',
      '  <head>',
      '    <meta charset="utf-8" />',
      '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
      `    <title>${tree.componentName}</title>`,
      '    <link rel="stylesheet" href="styles.css" />',
      '  </head>',
      '  <body>',
      ...elementMarkup(HTML_DIALECT, tree.root, 2),
      '  </body>',
      '</html>',
      ''
    ].join('\n')
  },
  { path: 'styles.css', content: buildStylesheet(tree.root) }
]

const emitVue = (tree: CodeTree): CodeFile[] => [
  {
    path: `${tree.componentName}.vue`,
    content: [
      '<template>',
      ...elementMarkup(VUE_DIALECT, tree.root, 1),
      '</template>',
      '',
      '<style scoped>',
      buildStylesheet(tree.root).trimEnd(),
      '</style>',
      ''
    ].join('\n')
  }
]

const emitReact = (tree: CodeTree): CodeFile[] => [
  {
    path: `${tree.componentName}.jsx`,
    content: [
      `import './${tree.componentName}.css'`,
      '',
      `export default function ${tree.componentName}() {`,
      '  return (',
      ...elementMarkup(JSX_DIALECT, tree.root, 2),
      '  )',
      '}',
      ''
    ].join('\n')
  },
  { path: `${tree.componentName}.css`, content: buildStylesheet(tree.root) }
]

// Vanilla JavaScript builds the same elements with the DOM: one statement list per element, each
// element a numbered constant appended to its parent.
interface DomStatements {
  lines: string[]
  next: number
}

// A single-quoted JavaScript string, as the rest of the file is written.
const quote = (value: string): string =>
  `'${JSON.stringify(value)
    .slice(1, -1)
    .replaceAll(String.raw`\"`, '"')
    .replaceAll("'", String.raw`\'`)}'`

const vectorStatements = (name: string, vector: CodeVector): string[] => [
  `${name}.setAttribute('viewBox', ${quote(`0 0 ${vector.width} ${vector.height}`)})`,
  `const ${name}Path = document.createElementNS(${quote(SVG_NAMESPACE)}, 'path')`,
  `${name}Path.setAttribute('d', ${quote(vector.pathData)})`,
  `${name}Path.setAttribute('fill', ${quote(vector.fill)})`,
  ...(vector.stroke
    ? [
        `${name}Path.setAttribute('stroke', ${quote(vector.stroke)})`,
        `${name}Path.setAttribute('stroke-width', ${quote(String(vector.strokeWidth))})`
      ]
    : []),
  `${name}.append(${name}Path)`
]

const textStatements = (name: string, element: CodeElement): string[] =>
  (element.paragraphs ?? []).flatMap((runs, index) => {
    const isList = element.tag === 'ul' || element.tag === 'ol'
    const target = isList ? `${name}Item${index + 1}` : name
    const runLines = runs.map((run) =>
      run.className
        ? `${target}.append(span(${quote(run.className)}, ${quote(run.text)}))`
        : `${target}.append(${quote(run.text)})`
    )
    if (isList)
      return [
        `const ${target} = document.createElement('li')`,
        ...runLines,
        `${name}.append(${target})`
      ]
    return index === 0 ? runLines : [`${name}.append('\\n')`, ...runLines]
  })

const createStatement = (name: string, element: CodeElement): string =>
  element.tag === 'svg'
    ? `const ${name} = document.createElementNS(${quote(SVG_NAMESPACE)}, 'svg')`
    : `const ${name} = document.createElement(${quote(element.tag)})`

const elementStatements = (
  element: CodeElement,
  parentName: string | undefined,
  state: DomStatements
): DomStatements => {
  const name = `element${state.next}`
  const own = [
    createStatement(name, element),
    `${name}.setAttribute('class', ${quote(element.className)})`,
    ...(element.image
      ? [
          `${name}.setAttribute('src', ${quote(element.image.source)})`,
          `${name}.setAttribute('alt', ${quote(element.image.alt)})`
        ]
      : []),
    ...(element.vector ? vectorStatements(name, element.vector) : []),
    ...textStatements(name, element)
  ]
  const link = element.link
    ? [
        `const ${name}Link = document.createElement('a')`,
        `${name}Link.setAttribute('href', ${quote(element.link)})`,
        `${name}Link.append(${name})`
      ]
    : []
  const outer = element.link ? `${name}Link` : name
  const withChildren = element.children.reduce(
    (current, child) => elementStatements(child, name, current),
    { lines: [...state.lines, ...own, ...link], next: state.next + 1 }
  )
  return {
    lines: [...withChildren.lines, ...(parentName ? [`${parentName}.append(${outer})`] : [])],
    next: withChildren.next
  }
}

const emitJavaScript = (tree: CodeTree): CodeFile[] => {
  const { lines } = elementStatements(tree.root, undefined, { lines: [], next: 0 })
  const rootName = tree.root.link ? 'element0Link' : 'element0'
  return [
    {
      path: `create${tree.componentName}.js`,
      content: [
        `import './${tree.componentName}.css'`,
        '',
        'const span = (className, text) => {',
        "  const element = document.createElement('span')",
        "  element.setAttribute('class', className)",
        '  element.append(text)',
        '  return element',
        '}',
        '',
        `export const create${tree.componentName} = () => {`,
        indentLines(lines, 1),
        `  return ${rootName}`,
        '}',
        ''
      ].join('\n')
    },
    { path: `${tree.componentName}.css`, content: buildStylesheet(tree.root) }
  ]
}

const EMITTERS: Record<CodeTarget, (tree: CodeTree) => CodeFile[]> = {
  html: emitHtml,
  vue: emitVue,
  react: emitReact,
  js: emitJavaScript
}

/**
 * Writes a tree as the files of one code target.
 * @param tree - The intermediate representation.
 * @param target - HTML with a stylesheet, a Vue component, a React component, or a JavaScript
 * function that builds the elements.
 * @returns The files, with paths relative to where they are saved.
 */
export const emitCode = (tree: CodeTree, target: CodeTarget): CodeFile[] => EMITTERS[target](tree)
