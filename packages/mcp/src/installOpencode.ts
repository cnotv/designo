import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  buildDesignoEntry,
  configDirectory,
  globalOpencodeConfigPath,
  mergeOpencodeConfig
} from './opencodeConfig.ts'

const mcpPackageDirectory = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const configPath = globalOpencodeConfigPath(process.env, homedir())
const entry = buildDesignoEntry(process.execPath, mcpPackageDirectory)

const readIfPresent = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

const say = (text: string): void => {
  process.stdout.write(`${text}\n`)
}

const result = mergeOpencodeConfig(readIfPresent(configPath), entry)

if (result.kind === 'unreadable') {
  say(`${configPath} has comments or is not plain JSON, so it was not touched.`)
  say('Add this to it:\n')
  say(result.entry)
} else {
  mkdirSync(configDirectory(configPath), { recursive: true })
  writeFileSync(configPath, result.text)
  say(`Designo added to ${configPath}. Restart opencode, then run: opencode mcp list`)
}
