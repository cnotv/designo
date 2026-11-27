const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const areArraysEqual = (first: readonly unknown[], second: readonly unknown[]): boolean =>
  first.length === second.length && first.every((item, index) => isJsonEqual(item, second[index]))

const areObjectsEqual = (
  first: Readonly<Record<string, unknown>>,
  second: Readonly<Record<string, unknown>>
): boolean => {
  const firstKeys = Object.keys(first).filter((key) => first[key] !== undefined)
  const secondKeys = Object.keys(second).filter((key) => second[key] !== undefined)
  return (
    firstKeys.length === secondKeys.length &&
    firstKeys.every((key) => isJsonEqual(first[key], second[key]))
  )
}

/**
 * Compares two JSON values by content, ignoring key order and keys set to undefined.
 * @param first - One value.
 * @param second - The other value.
 * @returns True when both hold the same data.
 */
export const isJsonEqual = (first: unknown, second: unknown): boolean => {
  if (first === second) return true
  if (Array.isArray(first) && Array.isArray(second)) return areArraysEqual(first, second)
  if (isPlainObject(first) && isPlainObject(second)) return areObjectsEqual(first, second)
  return false
}
