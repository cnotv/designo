import { describe, expect, it } from 'vitest'
import { loadFontFamilyList } from './familyList.ts'

const answer = (status: number, body: unknown) => ({
  ok: status === 200,
  status,
  json: () => Promise.resolve(body)
})

describe('loadFontFamilyList', () => {
  it('lists the families sorted by name, keeping what a picker shows', async () => {
    const families = await loadFontFamilyList(() =>
      Promise.resolve(
        answer(200, [
          { id: 'lora', family: 'Lora', category: 'serif', subsets: ['latin'] },
          {
            id: 'caveat',
            family: 'Caveat',
            category: 'handwriting',
            weights: [400],
            styles: ['normal', 'italic']
          }
        ])
      )
    )
    expect(families).toEqual([
      {
        id: 'caveat',
        family: 'Caveat',
        category: 'handwriting',
        weights: [400],
        styles: ['normal', 'italic']
      },
      { id: 'lora', family: 'Lora', category: 'serif', weights: [], styles: [] }
    ])
  })

  it('fails on an error answer and on data that is not a list', async () => {
    await expect(loadFontFamilyList(() => Promise.resolve(answer(503, [])))).rejects.toThrow(
      'The font API answered 503'
    )
    await expect(
      loadFontFamilyList(() => Promise.resolve(answer(200, { error: 1 })))
    ).rejects.toThrow()
  })
})
