#!/usr/bin/env -S npx tsx
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createDesignoServer } from './server.ts'
import { createShortId, resolveDataDirectory } from '@designo/storage'

const server = createDesignoServer({
  dataDirectory: resolveDataDirectory(process.env),
  generateId: createShortId
})

await server.connect(new StdioServerTransport())
