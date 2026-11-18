#!/usr/bin/env -S npx tsx
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { resolveToolDirectory } from './accountDirectory.ts'
import { createDesignoServer } from './server.ts'
import { createShortId, resolveDataDirectory } from '@designo/storage'

// With sign-in on, the account has to be right before the first tool call, so a wrong setting
// stops the server with a message instead of leaving an agent with tools that fail one by one.
const dataDirectory = await resolveToolDirectory(
  process.env,
  resolveDataDirectory(process.env)
).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  return process.exit(1)
})

const server = createDesignoServer({ dataDirectory, generateId: createShortId })

await server.connect(new StdioServerTransport())
