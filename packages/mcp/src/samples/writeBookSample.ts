import { resolveDataDirectory, writeDocument } from '@designo/storage'
import { createBookSampleDocument } from './bookSample.ts'

const dataDirectory = resolveDataDirectory(process.env)
await writeDocument(dataDirectory, createBookSampleDocument())
console.warn(`Wrote book-sample to ${dataDirectory}. Open it in the editor and export a PDF.`)
