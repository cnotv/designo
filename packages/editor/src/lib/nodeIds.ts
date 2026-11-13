const SHORT_ID_LENGTH = 8

/**
 * Makes a fresh node id; random, so it lives outside the pure editing functions, which take it
 * as a parameter.
 * @param prefix - What the node is, to keep ids readable.
 * @returns The id.
 */
export const createNodeId = (prefix: string): string =>
  `${prefix}-${crypto.randomUUID().replaceAll('-', '').slice(0, SHORT_ID_LENGTH)}`
