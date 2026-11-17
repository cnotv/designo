const DAY_LENGTH = 'YYYY-MM-DD'.length

/**
 * Formats a moment as a day. UTC, so everyone reads the same date.
 * @param isoDate - An ISO 8601 date.
 * @returns `YYYY-MM-DD`, or a dash when the date cannot be read.
 */
export const formatDay = (isoDate: string): string => {
  const time = Date.parse(isoDate)
  return Number.isNaN(time) ? '-' : new Date(time).toISOString().slice(0, DAY_LENGTH)
}
