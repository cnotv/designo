import type { SecretCall, SecretOptions, SecretValues, ValueOption } from './types.ts'

const DEFAULT_REPOSITORY = 'cnotv/designo'
const DEFAULT_SSH_PORT = 22
const MAX_PORT = 65_535

const HOST_PATTERN = /^[\w.:-]+$/
const USER_PATTERN = /^[_a-z][\w-]*$/
const PRIVATE_KEY_LINE = /-{5}BEGIN [ A-Z]*PRIVATE KEY-{5}/
const PUBLIC_KEY_START = /^(ssh|ecdsa)-/
const VALID_OPTIONS = '--repo, --host, --user, --key, --port, --run, --dry-run'

const VALUE_OPTIONS: ReadonlyMap<string, ValueOption> = new Map<string, ValueOption>([
  ['--repo', 'repository'],
  ['--host', 'host'],
  ['--user', 'user'],
  ['--key', 'keyFile'],
  ['--port', 'port']
])

const readOptions = (remaining: readonly string[], options: SecretOptions): SecretOptions => {
  const [flag, ...rest] = remaining
  if (flag === undefined) return options
  if (flag === '--run') return readOptions(rest, { ...options, runDeploy: true })
  if (flag === '--dry-run') return readOptions(rest, { ...options, dryRun: true })
  const option = VALUE_OPTIONS.get(flag)
  if (option === undefined) throw new Error(`Unknown option ${flag}. Options: ${VALID_OPTIONS}`)
  const [value, ...afterValue] = rest
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`)
  return readOptions(afterValue, { ...options, [option]: value })
}

/**
 * Reads the command line: `--repo`, `--host`, `--user`, `--key`, `--port`, `--run` and `--dry-run`.
 * @param argv - The arguments after the script name.
 * @returns The options; anything not given is left for a prompt.
 */
export const parseArguments = (argv: readonly string[]): SecretOptions =>
  readOptions(argv, { repository: DEFAULT_REPOSITORY, runDeploy: false, dryRun: false })

/**
 * Checks a server host name or IP address.
 * @param host - What was typed.
 * @returns The host without surrounding whitespace.
 */
export const validateHost = (host: string): string => {
  const trimmed = host.trim()
  if (!HOST_PATTERN.test(trimmed)) {
    throw new Error(`"${trimmed}" is not a host name or IP address`)
  }
  return trimmed
}

/**
 * Checks the SSH user name.
 * @param user - What was typed.
 * @returns The user without surrounding whitespace.
 */
export const validateUser = (user: string): string => {
  const trimmed = user.trim()
  if (!USER_PATTERN.test(trimmed)) {
    throw new Error(`"${trimmed}" is not a valid user name: use lowercase letters, digits, - and _`)
  }
  return trimmed
}

/**
 * Checks the SSH port.
 * @param port - What was typed, or 22 when left blank.
 * @returns The port as a number.
 */
export const validatePort = (port: string): number => {
  const value = Number(port.trim())
  if (!Number.isInteger(value) || value < 1 || value > MAX_PORT) {
    throw new Error(`"${port.trim()}" is not a port between 1 and ${MAX_PORT}`)
  }
  return value
}

/**
 * Turns a leading `~` into the home folder, as a shell would have done for a quoted path.
 * @param path - A path as typed.
 * @param home - The user's home folder.
 * @returns The path with `~` replaced.
 */
export const expandHome = (path: string, home: string): string =>
  path === '~' || path.startsWith('~/') ? `${home}${path.slice(1)}` : path

/**
 * Checks that a file is a private SSH key the deploy can use, and puts it in the shape GitHub
 * needs: Unix line endings and a final newline, without which the key fails to load.
 * @param keyText - The contents of the key file.
 * @param keyFile - Its path, to recognise a `.pub` file.
 * @returns The key, ready to store as a secret.
 */
export const prepareKey = (keyText: string, keyFile: string): string => {
  if (keyFile.endsWith('.pub') || PUBLIC_KEY_START.test(keyText.trim())) {
    throw new Error(
      'That is a public key. The deploy needs the private half: the file without .pub'
    )
  }
  if (!PRIVATE_KEY_LINE.test(keyText)) {
    throw new Error(
      'That file is not a private key: it has no "-----BEGIN ... PRIVATE KEY-----" line'
    )
  }
  if (keyText.includes('ENCRYPTED')) {
    throw new Error(
      'That key has a passphrase, and the deploy cannot type one. Use a key without it'
    )
  }
  const unixText = keyText.replaceAll('\r\n', '\n')
  return unixText.endsWith('\n') ? unixText : `${unixText}\n`
}

/**
 * Lists the secrets to set. The port is only stored when SSH is not on 22, as the deploy
 * falls back to 22.
 * @param values - The checked values.
 * @returns The secrets, by the names deploy.yml reads.
 */
export const buildSecretCalls = ({ host, user, privateKey, port }: SecretValues): SecretCall[] => [
  { name: 'HETZNER_HOST', value: host },
  { name: 'HETZNER_USERNAME', value: user },
  { name: 'HETZNER_SSH_KEY', value: privateKey },
  ...(port === DEFAULT_SSH_PORT ? [] : [{ name: 'HETZNER_PORT', value: String(port) }])
]
