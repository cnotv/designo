import { dirname, join } from 'node:path'

/** What `mergeOpencodeConfig` found in an existing config file. */
export type MergeResult =
  | { readonly kind: 'merged'; readonly text: string }
  | { readonly kind: 'unreadable'; readonly entry: string }

/**
 * Builds the opencode `mcp.designo` entry. It runs tsx through the node binary by absolute path,
 * so opencode needs neither pnpm nor a shell on its PATH.
 * @param nodePath Absolute path of the node binary.
 * @param mcpPackageDirectory Absolute path of `packages/mcp`.
 * @returns The entry to place under `mcp.designo`.
 */
export const buildDesignoEntry = (nodePath: string, mcpPackageDirectory: string) => ({
  type: 'local',
  command: [
    nodePath,
    join(mcpPackageDirectory, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    join(mcpPackageDirectory, 'src', 'main.ts')
  ],
  enabled: true
})

/**
 * Adds or replaces the designo entry in an opencode config, keeping every other setting.
 * A file that is not plain JSON (comments, for instance) is left alone: the entry comes back to paste.
 * @param existingText Current file contents, or undefined when there is no file yet.
 * @param entry The `mcp.designo` entry.
 * @returns The new file text, or the entry as text when the file cannot be parsed safely.
 */
export const mergeOpencodeConfig = (
  existingText: string | undefined,
  entry: ReturnType<typeof buildDesignoEntry>
): MergeResult => {
  const parsed = parseObject(existingText ?? '{}')
  if (parsed === undefined) {
    return { kind: 'unreadable', entry: JSON.stringify({ mcp: { designo: entry } }, null, 2) }
  }
  const existingMcp = isRecord(parsed.mcp) ? parsed.mcp : {}
  const merged = { ...parsed, mcp: { ...existingMcp, designo: entry } }
  return { kind: 'merged', text: `${JSON.stringify(merged, null, 2)}\n` }
}

/**
 * Where opencode reads its global config.
 * @param environment Process environment.
 * @param homeDirectory The user's home directory.
 * @returns Absolute path of the global `opencode.json`.
 */
export const globalOpencodeConfigPath = (
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string
): string =>
  join(environment.XDG_CONFIG_HOME ?? join(homeDirectory, '.config'), 'opencode', 'opencode.json')

/**
 * The folder that has to exist before the config can be written.
 * @param configPath Path from `globalOpencodeConfigPath`.
 * @returns Its parent directory.
 */
export const configDirectory = (configPath: string): string => dirname(configPath)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseObject = (text: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}
