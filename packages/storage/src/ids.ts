import { randomUUID } from 'node:crypto'

const SHORT_ID_LENGTH = 8

/**
 * Makes a short random id that says what it names, such as `rectangle-3f9a1c2e`.
 * @param prefix - What the id is for.
 * @returns The id.
 */
export const createShortId = (prefix: string): string =>
  `${prefix}-${randomUUID().replaceAll('-', '').slice(0, SHORT_ID_LENGTH)}`
