import { describe, expect, it } from 'vitest'
import {
  buildDesignoEntry,
  globalOpencodeConfigPath,
  mergeOpencodeConfig
} from './opencodeConfig.ts'

const entry = buildDesignoEntry('/usr/bin/node', '/clone/packages/mcp')

describe('buildDesignoEntry', () => {
  it('runs tsx and main.ts by absolute path', () => {
    expect(entry.command).toEqual([
      '/usr/bin/node',
      '/clone/packages/mcp/node_modules/tsx/dist/cli.mjs',
      '/clone/packages/mcp/src/main.ts'
    ])
  })
})

describe('mergeOpencodeConfig', () => {
  it('creates the config when there is no file', () => {
    const result = mergeOpencodeConfig(undefined, entry)
    expect(result.kind === 'merged' && JSON.parse(result.text)).toEqual({ mcp: { designo: entry } })
  })

  it('keeps other settings and servers, and replaces an old designo entry', () => {
    const existing = JSON.stringify({
      theme: 'dark',
      mcp: { figma: { type: 'remote' }, designo: { old: true } }
    })
    const result = mergeOpencodeConfig(existing, entry)
    expect(result.kind === 'merged' && JSON.parse(result.text)).toEqual({
      theme: 'dark',
      mcp: { figma: { type: 'remote' }, designo: entry }
    })
  })

  it('leaves a file with comments alone and returns the entry to paste', () => {
    const result = mergeOpencodeConfig('{\n // mine\n "theme": "dark" }', entry)
    expect(result.kind).toBe('unreadable')
  })
})

describe('globalOpencodeConfigPath', () => {
  it('honours XDG_CONFIG_HOME, else uses ~/.config', () => {
    expect(globalOpencodeConfigPath({ XDG_CONFIG_HOME: '/xdg' }, '/home/u')).toBe(
      '/xdg/opencode/opencode.json'
    )
    expect(globalOpencodeConfigPath({}, '/home/u')).toBe('/home/u/.config/opencode/opencode.json')
  })
})
