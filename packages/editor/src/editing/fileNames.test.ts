import { describe, expect, it } from 'vitest'
import { nextUntitledFileName, renameOperationFor, renameSummary } from './fileNames.ts'

describe('nextUntitledFileName', () => {
  it('names the first new file Untitled', () => {
    expect(nextUntitledFileName(['Palette', 'CV'])).toBe('Untitled')
  })

  it('numbers the next one from 2', () => {
    expect(nextUntitledFileName(['Untitled'])).toBe('Untitled 2')
  })

  it('takes the first free number, filling a gap', () => {
    expect(nextUntitledFileName(['Untitled', 'Untitled 2', 'Untitled 4'])).toBe('Untitled 3')
  })
})

describe('renameOperationFor', () => {
  it('renames to the trimmed name', () => {
    expect(renameOperationFor('Untitled', '  Poster ')).toEqual({
      kind: 'renameDocument',
      name: 'Poster'
    })
  })

  it('saves nothing for a blank or unchanged name', () => {
    expect(renameOperationFor('Untitled', '   ')).toBeUndefined()
    expect(renameOperationFor('Untitled', 'Untitled ')).toBeUndefined()
  })
})

describe('renameSummary', () => {
  it('renames only the given file', () => {
    const summaries = [
      { id: 'a', name: 'One', nodeCount: 1 },
      { id: 'b', name: 'Two', nodeCount: 3 }
    ]
    expect(renameSummary(summaries, 'b', 'Poster')).toEqual([
      { id: 'a', name: 'One', nodeCount: 1 },
      { id: 'b', name: 'Poster', nodeCount: 3 }
    ])
  })
})
