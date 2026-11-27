import {
  applyOperations,
  createDocument,
  type DesignDocument,
  type DesignNodePatch,
  type DesignOperation
} from '@designo/core'
import { describe, expect, it } from 'vitest'
import type { CodeFile } from '../types.ts'
import { getExportBounds } from '../svg.ts'
import { formatCssNumber } from './codeStyles.ts'
import { buildCodeTree, toKebabCase, toPascalCase } from './codeTree.ts'
import { exportNodeToCode } from './exportCode.ts'

const create = (
  id: string,
  type: 'frame' | 'rectangle' | 'ellipse' | 'text' | 'image' | 'path' | 'group',
  parentId: string,
  properties: DesignNodePatch
): DesignOperation => ({ kind: 'create', id, type, parentId, properties })

const build = (operations: readonly DesignOperation[]): DesignDocument => {
  const result = applyOperations(createDocument('doc', 'Doc', 'page'), operations)
  if (!result.ok) throw new Error(result.error)
  return result.document
}

const fileContent = (files: readonly CodeFile[], path: string): string =>
  files.find((file) => file.path === path)?.content ?? ''

const card = build([
  create('card', 'frame', 'page', {
    name: 'Price card',
    x: 100,
    y: 50,
    width: 200,
    height: 120,
    fill: '#ffffff'
  }),
  create('badge', 'ellipse', 'card', {
    name: 'Badge',
    x: 110,
    y: 60,
    width: 20,
    height: 20,
    gradient: {
      kind: 'linear',
      angle: 0,
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 1, color: '#0000ff' }
      ]
    },
    shadow: { x: 2, y: 3, blur: 4, color: '#00000080' },
    blendMode: 'multiply'
  }),
  create('title', 'text', 'card', {
    name: 'Title',
    x: 140,
    y: 60,
    text: 'Pro <plan> & {more}\nPer month',
    fontWeight: 700,
    spans: [{ start: 0, end: 3, fill: '#ff0000', fontStyle: 'italic' }]
  }),
  create('hidden', 'rectangle', 'card', { name: 'Hidden', visible: false }),
  create('second', 'rectangle', 'card', { name: 'Title', x: 100, y: 150, width: 10, height: 10 })
])

describe('names', () => {
  it('turns layer names into class and component names', () => {
    expect(toKebabCase('Price Card / Hero')).toBe('price-card-hero')
    expect(toKebabCase('primaryButton')).toBe('primary-button')
    expect(toKebabCase('2 columns')).toBe('layer-2-columns')
    expect(toKebabCase('***')).toBe('layer')
    expect(toPascalCase('price card')).toBe('PriceCard')
  })
})

describe('buildCodeTree', () => {
  const tree = buildCodeTree(card, 'card')

  it('places the root relatively and the children of a plain frame absolutely', () => {
    expect(tree?.componentName).toBe('PriceCard')
    expect(tree?.root.style).toContainEqual(['position', 'relative'])
    const badge = tree?.root.children[0]
    expect(badge?.style).toEqual(
      expect.arrayContaining([
        ['position', 'absolute'],
        ['left', '10px'],
        ['top', '10px'],
        ['border-radius', '50%'],
        ['background', 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)'],
        ['box-shadow', '2px 3px 8px #00000080'],
        ['mix-blend-mode', 'multiply']
      ])
    )
  })

  it('leaves out hidden layers and numbers a repeated name', () => {
    expect(tree?.root.children.map((child) => child.className)).toEqual([
      'badge',
      'title',
      'title-2'
    ])
  })

  it('splits text into paragraphs and spans', () => {
    const title = tree?.root.children[1]
    expect(title?.tag).toBe('p')
    expect(title?.paragraphs).toEqual([
      [
        {
          text: 'Pro',
          className: 'title-span-1',
          style: [
            ['font-style', 'italic'],
            ['color', '#ff0000']
          ]
        },
        { text: ' <plan> & {more}', style: [] }
      ],
      [{ text: 'Per month', style: [] }]
    ])
  })

  it('gives a page the box of what is on it', () => {
    const page = buildCodeTree(card, 'page')
    const properties = page?.root.style.map(([property]) => property)
    expect(properties).toEqual(expect.arrayContaining(['width', 'height']))
    // The same box the SVG export draws, so the card sits where it does in the SVG.
    const pageNode = card.nodes.page
    if (!pageNode) throw new Error('The page is missing')
    const box = getExportBounds(card, pageNode)
    expect(page?.root.children[0]?.style).toEqual(
      expect.arrayContaining([
        ['left', `${formatCssNumber(100 - box.x)}px`],
        ['top', `${formatCssNumber(50 - box.y)}px`]
      ])
    )
  })
})

describe('auto-layout', () => {
  const row = build([
    create('row', 'frame', 'page', {
      name: 'Row',
      width: 300,
      height: 40,
      layoutMode: 'horizontal',
      layoutGap: 8,
      layoutPadding: 4,
      layoutAlign: 'space-between',
      layoutCrossAlign: 'center',
      heightSizing: 'hug'
    }),
    create('fixed', 'rectangle', 'row', { name: 'Fixed', width: 30, height: 30 }),
    create('grow', 'rectangle', 'row', { name: 'Grow', height: 20, widthSizing: 'fill' })
  ])
  const tree = buildCodeTree(row, 'row')

  it('makes an auto-layout frame a flex box that hugs its children', () => {
    expect(tree?.root.style).toEqual(
      expect.arrayContaining([
        ['width', '300px'],
        ['display', 'flex'],
        ['flex-direction', 'row'],
        ['justify-content', 'space-between'],
        ['align-items', 'center'],
        ['gap', '8px'],
        ['padding', '4px']
      ])
    )
    expect(tree?.root.style.map(([property]) => property)).not.toContain('height')
  })

  it('lets the browser place its children, and grows a filling one', () => {
    const [fixed, grow] = tree?.root.children ?? []
    expect(fixed?.style.map(([property]) => property)).not.toContain('position')
    expect(fixed?.style).toContainEqual(['width', '30px'])
    expect(grow?.style).toContainEqual(['flex', '1 1 0'])
  })
})

describe('content', () => {
  const content = build([
    create('box', 'frame', 'page', { name: 'Box', width: 200, height: 200 }),
    create('photo', 'image', 'box', { name: 'Photo', imageAsset: 'abc.png', imageFit: 'fill' }),
    create('star', 'path', 'box', {
      name: 'Star',
      pathData: 'M0 0 L10 10 Z',
      fill: '#ff0',
      stroke: '#000',
      strokeWidth: 2
    }),
    create('list', 'text', 'box', {
      name: 'List',
      text: 'One\nTwo',
      listStyle: 'number',
      link: 'https://example.com/?a=1&b=2'
    })
  ])

  it('writes an image, a path as inline SVG, and a linked list', () => {
    const html = fileContent(exportNodeToCode(content, 'box', 'html'), 'index.html')
    expect(html).toContain('<img class="photo" src="assets/abc.png" alt="Photo">')
    expect(html).toContain('<path d="M0 0 L10 10 Z" fill="#ff0" stroke="#000" stroke-width="2">')
    expect(html).toContain('<a href="https://example.com/?a=1&amp;b=2">')
    expect(html).toContain('<ol class="list">')
    expect(html).toContain('<li>Two</li>')
  })

  it('takes image sources from the caller', () => {
    const files = exportNodeToCode(content, 'box', 'vue', {
      getImageSource: (assetId) => `/media/${assetId}`
    })
    expect(fileContent(files, 'Box.vue')).toContain(
      '<img class="photo" src="/media/abc.png" alt="Photo" />'
    )
  })
})

describe('targets', () => {
  it('escapes text for HTML and keeps line breaks in the element', () => {
    const html = fileContent(exportNodeToCode(card, 'card', 'html'), 'index.html')
    expect(html).toContain(
      '<p class="title"><span class="title-span-1">Pro</span> &lt;plan&gt; &amp; {more}\nPer month</p>'
    )
  })

  it('writes a Vue component with scoped styles', () => {
    const vue = fileContent(exportNodeToCode(card, 'card', 'vue'), 'PriceCard.vue')
    expect(vue).toMatch(/^<template>\n {2}<div class="price-card">/)
    expect(vue).toContain('<style scoped>\n.price-card {')
  })

  it('writes a React component, with code-like text as a string', () => {
    const files = exportNodeToCode(card, 'card', 'react')
    const jsx = fileContent(files, 'PriceCard.jsx')
    expect(files.map((file) => file.path)).toEqual(['PriceCard.jsx', 'PriceCard.css'])
    expect(jsx).toContain('export default function PriceCard() {')
    expect(jsx).toContain('<span className="title-span-1">Pro</span>{" <plan> & {more}"}')
    expect(fileContent(files, 'PriceCard.css')).toContain('.title-span-1 {\n  font-style: italic;')
  })

  it('writes JavaScript that builds the same elements', () => {
    const javascript = fileContent(exportNodeToCode(card, 'card', 'js'), 'createPriceCard.js')
    expect(javascript).toContain('export const createPriceCard = () => {')
    expect(javascript).toContain("element2.append(span('title-span-1', 'Pro'))")
    expect(javascript).toContain("element2.append('\\n')")
  })

  it('refuses a node that does not exist', () => {
    expect(() => exportNodeToCode(card, 'missing', 'html')).toThrow('No node with id missing')
  })
})
