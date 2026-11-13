import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { fileIdSchema, nodeIdSchema, nodePatchSchema } from '@designo/storage'
import { creatableNodeTypeSchema, operationInputSchema } from './schemas.ts'
import {
  applyOperationsTool,
  createFileTool,
  getDocumentTreeTool,
  getNodeTool,
  listFilesTool
} from './tools.ts'
import type { DesignoToolContext } from './types.ts'

const SERVER_VERSION = '0.0.0'
const MAX_TREE_DEPTH = 50
const MAX_OPERATIONS_PER_BATCH = 500

const toToolResult = async (work: () => Promise<unknown>): Promise<CallToolResult> => {
  try {
    const value = await work()
    return { content: [{ type: 'text', text: JSON.stringify(value, undefined, 2) }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { isError: true, content: [{ type: 'text', text: message }] }
  }
}

const READ_ONLY = { readOnlyHint: true } as const

const registerReadTools = (server: McpServer, context: DesignoToolContext): void => {
  server.registerTool(
    'list_files',
    { description: 'List the Designo files with their ids and names.', annotations: READ_ONLY },
    () => toToolResult(() => listFilesTool(context))
  )
  server.registerTool(
    'get_document_tree',
    {
      description:
        'Read the node tree of a file. Starts at the root page unless nodeId is given; depth limits how many levels of children are returned (default 3).',
      inputSchema: {
        fileId: fileIdSchema,
        nodeId: nodeIdSchema.optional(),
        depth: z.number().int().min(0).max(MAX_TREE_DEPTH).optional()
      },
      annotations: READ_ONLY
    },
    (input) => toToolResult(() => getDocumentTreeTool(context, input))
  )
  server.registerTool(
    'get_node',
    {
      description: 'Read one node with all its properties.',
      inputSchema: { fileId: fileIdSchema, nodeId: nodeIdSchema },
      annotations: READ_ONLY
    },
    (input) => toToolResult(() => getNodeTool(context, input))
  )
}

const registerWriteTools = (server: McpServer, context: DesignoToolContext): void => {
  server.registerTool(
    'create_file',
    {
      description: 'Create an empty file with one page. Returns its fileId and pageId.',
      inputSchema: { name: z.string().min(1).max(200) }
    },
    (input) => toToolResult(() => createFileTool(context, input))
  )
  server.registerTool(
    'create_node',
    {
      description:
        'Create one node under a page, frame or group. Coordinates are absolute on the page. Returns the new id.',
      inputSchema: {
        fileId: fileIdSchema,
        type: creatableNodeTypeSchema,
        parentId: nodeIdSchema,
        properties: nodePatchSchema.optional()
      }
    },
    ({ fileId, ...operation }) =>
      toToolResult(() =>
        applyOperationsTool(context, { fileId, operations: [{ kind: 'create', ...operation }] })
      )
  )
  server.registerTool(
    'update_node',
    {
      description: 'Change some properties of one node; the rest stay as they are.',
      inputSchema: { fileId: fileIdSchema, nodeId: nodeIdSchema, patch: nodePatchSchema }
    },
    ({ fileId, nodeId, patch }) =>
      toToolResult(() =>
        applyOperationsTool(context, {
          fileId,
          operations: [{ kind: 'update', id: nodeId, patch }]
        })
      )
  )
  server.registerTool(
    'delete_node',
    {
      description: 'Delete a node and everything inside it.',
      inputSchema: { fileId: fileIdSchema, nodeId: nodeIdSchema },
      annotations: { destructiveHint: true }
    },
    ({ fileId, nodeId }) =>
      toToolResult(() =>
        applyOperationsTool(context, { fileId, operations: [{ kind: 'delete', id: nodeId }] })
      )
  )
  server.registerTool(
    'apply_ops',
    {
      description:
        'Apply a batch of create, update, delete and move operations as one change: if one fails, nothing is saved. Give create operations your own ids to nest nodes inside each other in the same batch. Prefer this over single-node tools when building a layout.',
      inputSchema: {
        fileId: fileIdSchema,
        operations: z.array(operationInputSchema).min(1).max(MAX_OPERATIONS_PER_BATCH)
      },
      annotations: { destructiveHint: true }
    },
    (input) => toToolResult(() => applyOperationsTool(context, input))
  )
}

/**
 * Builds the Designo MCP server with every tool registered.
 * @param context - Where files live and how ids are made.
 * @returns The server, ready to connect to a transport.
 */
export const createDesignoServer = (context: DesignoToolContext): McpServer => {
  const server = new McpServer({ name: 'designo', version: SERVER_VERSION })
  registerReadTools(server, context)
  registerWriteTools(server, context)
  return server
}
