#!/usr/bin/env -S npx tsx
import { randomUUID } from 'node:crypto'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createDesignoServer } from './server.ts'
import { resolveDataDirectory } from '@designo/storage'

const SHORT_ID_LENGTH = 8

const generateId = (prefix: string): string =>
  `${prefix}-${randomUUID().replaceAll('-', '').slice(0, SHORT_ID_LENGTH)}`

const server = createDesignoServer({
  dataDirectory: resolveDataDirectory(process.env),
  generateId
})

await server.connect(new StdioServerTransport())
