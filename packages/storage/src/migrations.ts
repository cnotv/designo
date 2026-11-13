import { CURRENT_FORMAT_VERSION, type DesignDocument } from '@designo/core'
import { storedDocumentSchema } from './schemas.ts'
import type { MigrationSteps, RawDocument } from './types.ts'

/**
 * Every upgrade, keyed by the version it starts from. Bumping CURRENT_FORMAT_VERSION from N to
 * N + 1 means adding the entry N here and nothing else.
 */
export const MIGRATION_STEPS: MigrationSteps = {}

const isRawDocument = (value: unknown): value is RawDocument =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readFormatVersion = (raw: RawDocument): number => {
  const { formatVersion } = raw
  if (typeof formatVersion !== 'number' || !Number.isInteger(formatVersion) || formatVersion < 0) {
    throw new Error('The file has no valid formatVersion, so it cannot be a Designo document')
  }
  return formatVersion
}

const applyStep = (raw: RawDocument, fromVersion: number, steps: MigrationSteps): RawDocument => {
  const step = steps[fromVersion]
  if (step === undefined) {
    throw new Error(`No migration exists from format version ${fromVersion}`)
  }
  // The pipeline owns the version number, so a step cannot forget to bump it or skip ahead.
  return { ...step(raw), formatVersion: fromVersion + 1 }
}

/**
 * Upgrades a raw document to the target format version, one step at a time, in order.
 * @param raw - Parsed JSON of unknown shape.
 * @param targetVersion - The version to end at.
 * @param steps - The migration steps, keyed by the version each starts from.
 * @returns The raw document at the target version, not yet validated.
 */
export const migrateRawDocument = (
  raw: unknown,
  targetVersion: number = CURRENT_FORMAT_VERSION,
  steps: MigrationSteps = MIGRATION_STEPS
): RawDocument => {
  if (!isRawDocument(raw)) {
    throw new Error('A Designo document must be a JSON object')
  }
  const fileVersion = readFormatVersion(raw)
  if (fileVersion > targetVersion) {
    throw new Error(
      `This file uses format version ${fileVersion}, but this version of Designo only understands up to ${targetVersion}. Update Designo to open it.`
    )
  }
  return Array.from(
    { length: targetVersion - fileVersion },
    (_, offset) => fileVersion + offset
  ).reduce((current, fromVersion) => applyStep(current, fromVersion, steps), raw)
}

/**
 * Turns raw file contents into a validated document of the current format.
 * @param raw - Parsed JSON read from disk, of any format version.
 * @param steps - The migration steps; tests inject their own.
 * @returns The document at the current format version.
 */
export const parseStoredDocument = (
  raw: unknown,
  steps: MigrationSteps = MIGRATION_STEPS
): DesignDocument =>
  storedDocumentSchema.parse(migrateRawDocument(raw, CURRENT_FORMAT_VERSION, steps))
