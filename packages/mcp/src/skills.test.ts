import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDesignoServer } from './server.ts'
import { getSkillTool, listSkillsTool } from './skills.ts'

let skillsFolder: string

const SKILL_TEXT = [
  '---',
  'name: pretty-card',
  'description: >-',
  '  Use when a card is wanted.',
  '  Builds it.',
  '---',
  '',
  '# Pretty card'
].join('\n')

beforeEach(async () => {
  skillsFolder = await mkdtemp(path.join(tmpdir(), 'designo-skills-'))
  await mkdir(path.join(skillsFolder, 'pretty-card', 'references'), { recursive: true })
  await writeFile(path.join(skillsFolder, 'pretty-card', 'SKILL.md'), SKILL_TEXT)
  await writeFile(
    path.join(skillsFolder, 'pretty-card', 'references', 'sizes.md'),
    'A6 is 105 x 148'
  )
})

afterEach(async () => {
  await rm(skillsFolder, { recursive: true, force: true })
})

describe('listSkillsTool', () => {
  it('lists each skill with its description and files', async () => {
    expect(await listSkillsTool(skillsFolder)).toEqual([
      {
        name: 'pretty-card',
        description: 'Use when a card is wanted. Builds it.',
        files: ['SKILL.md', 'references/sizes.md']
      }
    ])
  })

  it('lists nothing when the folder is missing', async () => {
    expect(await listSkillsTool(path.join(skillsFolder, 'nowhere'))).toEqual([])
  })
})

describe('getSkillTool', () => {
  it('returns SKILL.md by default', async () => {
    const skill = await getSkillTool(skillsFolder, { name: 'pretty-card' })
    expect(skill.file).toBe('SKILL.md')
    expect(skill.content).toBe(SKILL_TEXT)
  })

  it('returns a reference file that the skill lists', async () => {
    const skill = await getSkillTool(skillsFolder, {
      name: 'pretty-card',
      file: 'references/sizes.md'
    })
    expect(skill.content).toBe('A6 is 105 x 148')
  })

  it('refuses a file the skill does not list, so a path cannot escape the folder', async () => {
    await expect(
      getSkillTool(skillsFolder, { name: 'pretty-card', file: '../../etc/passwd' })
    ).rejects.toThrow('Skill pretty-card has no file ../../etc/passwd')
  })

  it('names the skills that exist when the name is unknown', async () => {
    await expect(getSkillTool(skillsFolder, { name: 'nope' })).rejects.toThrow(
      'No skill named nope. Skills: pretty-card'
    )
  })
})

describe('the bundled skills over MCP', () => {
  const connect = async (): Promise<Client> => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
    await createDesignoServer({ dataDirectory: skillsFolder, generateId: (p) => `${p}-1` }).connect(
      serverSide
    )
    const client = new Client({ name: 'test-agent', version: '0.0.0' })
    await client.connect(clientSide)
    return client
  }

  it('tells an agent in the server instructions to load a skill first', async () => {
    expect((await connect()).getInstructions()).toContain('get_skill')
  })

  it('serves designo-template through get_skill', async () => {
    const client = await connect()
    const listed = await client.callTool({ name: 'get_skill', arguments: {} })
    expect(JSON.stringify(listed.content)).toContain('designo-template')
    const loaded = await client.callTool({
      name: 'get_skill',
      arguments: { name: 'designo-template' }
    })
    expect(JSON.stringify(loaded.content)).toContain('# Designo Template')
  })
})
