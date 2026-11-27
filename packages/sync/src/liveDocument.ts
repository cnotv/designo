import { applyOperations, type DesignDocument, type DesignOperation } from '@designo/core'
import { storedDocumentSchema } from '@designo/storage/schemas'
import * as Y from 'yjs'
import { isJsonEqual } from './jsonEquality.ts'
import type { ChangeOrigin, LiveApplyResult } from './types.ts'

// Each node is a map of its properties, so two people changing different properties of the
// same node both keep their change. Everything else is replaced whole.
const NODES_KEY = 'nodes'
const META_KEY = 'meta'
const RECORD_KEYS = ['variables', 'textStyles', 'comments'] as const
const META_FIELDS = ['formatVersion', 'id', 'name', 'rootId', 'metadata'] as const

type RecordKey = (typeof RECORD_KEYS)[number]
type JsonRecord = Readonly<Record<string, unknown>>

const nodesMap = (yDocument: Y.Doc): Y.Map<Y.Map<unknown>> => yDocument.getMap(NODES_KEY)
const metaMap = (yDocument: Y.Doc): Y.Map<unknown> => yDocument.getMap(META_KEY)
const recordMap = (yDocument: Y.Doc, key: RecordKey): Y.Map<unknown> => yDocument.getMap(key)

const asRecord = (value: unknown): JsonRecord =>
  typeof value === 'object' && value !== null ? (value as JsonRecord) : {}

const writeEntries = (target: Y.Map<unknown>, before: JsonRecord, after: JsonRecord): void => {
  Object.keys(before)
    .filter((key) => after[key] === undefined)
    .forEach((key) => target.delete(key))
  Object.entries(after)
    .filter(([key, value]) => value !== undefined && !isJsonEqual(before[key], value))
    .forEach(([key, value]) => target.set(key, value))
}

const createNodeMap = (node: JsonRecord): Y.Map<unknown> => {
  const nodeMap = new Y.Map<unknown>()
  writeEntries(nodeMap, {}, node)
  return nodeMap
}

const writeNodes = (yDocument: Y.Doc, before: JsonRecord, after: JsonRecord): void => {
  const nodes = nodesMap(yDocument)
  Object.keys(before)
    .filter((id) => after[id] === undefined)
    .forEach((id) => nodes.delete(id))
  Object.entries(after).forEach(([id, node]) => {
    const existing = nodes.get(id)
    if (existing) writeEntries(existing, asRecord(before[id]), asRecord(node))
    else nodes.set(id, createNodeMap(asRecord(node)))
  })
}

const pickMeta = (document: DesignDocument | undefined): JsonRecord =>
  Object.fromEntries(META_FIELDS.map((field) => [field, document?.[field]]))

/**
 * Writes the difference between two versions of a document into a live document, as one
 * transaction tagged with where the change came from.
 * @param yDocument - The live document, holding `before`.
 * @param before - The document as the live document holds it now; undefined when it is empty.
 * @param after - The document it should hold.
 * @param origin - Where the change came from.
 */
export const writeLiveDocument = (
  yDocument: Y.Doc,
  before: DesignDocument | undefined,
  after: DesignDocument,
  origin: ChangeOrigin
): void => {
  yDocument.transact(() => {
    writeEntries(metaMap(yDocument), pickMeta(before), pickMeta(after))
    writeNodes(yDocument, asRecord(before?.nodes), after.nodes)
    RECORD_KEYS.forEach((key) =>
      writeEntries(recordMap(yDocument, key), asRecord(before?.[key]), asRecord(after[key]))
    )
  }, origin)
}

const optionalRecord = (yDocument: Y.Doc, key: RecordKey): JsonRecord => {
  const entries = recordMap(yDocument, key).toJSON()
  return Object.keys(entries).length > 0 ? { [key]: entries } : {}
}

/**
 * Reads a live document back into plain data, without checking it.
 * @param yDocument - The live document.
 * @returns The document's fields as JSON.
 */
export const readLiveDocumentJson = (yDocument: Y.Doc): JsonRecord => ({
  ...metaMap(yDocument).toJSON(),
  nodes: nodesMap(yDocument).toJSON(),
  ...Object.assign({}, ...RECORD_KEYS.map((key) => optionalRecord(yDocument, key)))
})

/**
 * Reads a live document and checks it against the stored file schema.
 * @param yDocument - The live document.
 * @returns The document, or undefined when it is empty or does not hold a valid document.
 */
export const readLiveDocument = (yDocument: Y.Doc): DesignDocument | undefined => {
  const parsed = storedDocumentSchema.safeParse(readLiveDocumentJson(yDocument))
  return parsed.success ? parsed.data : undefined
}

/**
 * Fills an empty live document from a file.
 * @param yDocument - The live document, still empty.
 * @param document - The file to load.
 * @param origin - Where the file came from.
 */
export const seedLiveDocument = (
  yDocument: Y.Doc,
  document: DesignDocument,
  origin: ChangeOrigin
): void => {
  writeLiveDocument(yDocument, undefined, document, origin)
}

/**
 * Applies a batch to a live document: the batch runs through `applyOperations`, the same path
 * as every other edit, and only the properties it changed are written.
 * @param yDocument - The live document.
 * @param operations - The changes, in order.
 * @param origin - Who made them.
 * @returns The applied operations, or why the batch was refused; nothing is written then.
 */
export const applyOperationsToLiveDocument = (
  yDocument: Y.Doc,
  operations: readonly DesignOperation[],
  origin: ChangeOrigin
): LiveApplyResult => {
  const before = readLiveDocument(yDocument)
  if (!before) return { ok: false, error: 'The live document is not loaded' }
  const result = applyOperations(before, operations)
  if (!result.ok) return result
  writeLiveDocument(yDocument, before, result.document, origin)
  return { ok: true, operations }
}
