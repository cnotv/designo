import {
  PDF_TAGS,
  type DesignDocument,
  type DesignOperation,
  type DocumentMetadata,
  type PdfTag
} from '@designo/core'

/** What the tag select shows for text that is not tagged. */
export const NO_PDF_TAG = 'none'

/**
 * Turns what was typed into a metadata field into the operation that saves it.
 * @param document - The document being edited.
 * @param field - Which field was typed in.
 * @param raw - The field's text; empty clears it.
 * @returns One operation, or none when the field already holds that text.
 */
export const createMetadataOperations = (
  document: DesignDocument,
  field: keyof DocumentMetadata,
  raw: string
): DesignOperation[] => {
  const value = raw.trim()
  return value === (document.metadata?.[field] ?? '')
    ? []
    : [{ kind: 'updateMetadata', patch: { [field]: value } }]
}

/**
 * Reads the value of the tag select.
 * @param raw - The select's value.
 * @returns The tag, null for none, or undefined for a value that is not an option.
 */
export const readPdfTag = (raw: unknown): PdfTag | null | undefined => {
  if (raw === NO_PDF_TAG) return null
  return PDF_TAGS.find((tag) => tag === raw)
}
