import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  DATA_DIRECTORY_ENVIRONMENT_VARIABLE,
  DEFAULT_DATA_DIRECTORY_NAME,
  type DesignDocument
} from '@designo/core'
import { fileIdSchema, storedDocumentSchema } from './schemas.ts'
import type { DocumentSummary } from './types.ts'

const DOCUMENT_EXTENSION = '.designo.json'

/**
 * Works out where Designo files live: the environment variable if set, else a folder in home.
 * @param environment - The process environment.
 * @returns Absolute path of the data directory.
 */
export const resolveDataDirectory = (environment: NodeJS.ProcessEnv): string =>
  path.resolve(
    environment[DATA_DIRECTORY_ENVIRONMENT_VARIABLE] ??
      path.join(homedir(), DEFAULT_DATA_DIRECTORY_NAME)
  )

// The id becomes a file name, so it is validated before it can reach the file system.
const documentPath = (dataDirectory: string, fileId: string): string =>
  path.join(dataDirectory, `${fileIdSchema.parse(fileId)}${DOCUMENT_EXTENSION}`)

/**
 * Reads and validates one document.
 * @param dataDirectory - Where Designo files live.
 * @param fileId - Id of the file to read.
 * @returns The document.
 */
export const readDocument = async (
  dataDirectory: string,
  fileId: string
): Promise<DesignDocument> => {
  const raw = await readFile(documentPath(dataDirectory, fileId), 'utf8')
  return storedDocumentSchema.parse(JSON.parse(raw))
}

/**
 * Writes a document atomically, so a reader never sees half a file.
 * @param dataDirectory - Where Designo files live.
 * @param document - The document to save.
 * @returns Resolves once the file is in place.
 */
export const writeDocument = async (
  dataDirectory: string,
  document: DesignDocument
): Promise<void> => {
  await mkdir(dataDirectory, { recursive: true })
  const targetPath = documentPath(dataDirectory, document.id)
  const temporaryPath = `${targetPath}.${process.pid}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(document, undefined, 2)}\n`, 'utf8')
  await rename(temporaryPath, targetPath)
}

/**
 * Lists every document in the data directory.
 * @param dataDirectory - Where Designo files live.
 * @returns A summary of each readable document, sorted by name.
 */
export const listDocuments = async (dataDirectory: string): Promise<DocumentSummary[]> => {
  await mkdir(dataDirectory, { recursive: true })
  const fileNames = await readdir(dataDirectory)
  const fileIds = fileNames
    .filter((fileName) => fileName.endsWith(DOCUMENT_EXTENSION))
    .map((fileName) => fileName.slice(0, -DOCUMENT_EXTENSION.length))
    .filter((fileId) => fileIdSchema.safeParse(fileId).success)
  const documents = await Promise.all(
    fileIds.map((fileId) => readDocument(dataDirectory, fileId).catch(() => undefined))
  )
  return documents
    .filter((document): document is DesignDocument => document !== undefined)
    .map((document) => ({
      id: document.id,
      name: document.name,
      nodeCount: Object.keys(document.nodes).length
    }))
    .toSorted((first, second) => first.name.localeCompare(second.name))
}
