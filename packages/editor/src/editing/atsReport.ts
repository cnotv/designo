import type { DesignDocument } from '@designo/core'
import type { AtsFinding, AtsStatus } from '@designo/ats'

const SEVERITY: Record<AtsStatus, number> = { fail: 0, warn: 1, pass: 2 }

/**
 * Orders findings with failures first, then warnings, then passes; each keeps its place among its
 * own kind.
 * @param findings - The findings of a report.
 * @returns A new list, most serious first.
 */
export const sortFindingsBySeverity = (findings: readonly AtsFinding[]): AtsFinding[] =>
  findings.toSorted((first, second) => SEVERITY[first.status] - SEVERITY[second.status])

/**
 * Says where a finding applies, in words the person knows: the layer's name and the page.
 * @param document - The exported document, or none for a PDF checked on its own.
 * @param finding - One finding.
 * @returns A short place such as `Name, page 1`, or an empty string for a finding on the whole file.
 */
export const describeFindingPlace = (
  document: DesignDocument | undefined,
  finding: AtsFinding
): string =>
  [
    ...(finding.nodeId ? [document?.nodes[finding.nodeId]?.name ?? finding.nodeId] : []),
    ...(finding.page === undefined ? [] : [`page ${finding.page}`])
  ].join(', ')
