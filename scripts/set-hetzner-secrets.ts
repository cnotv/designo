#!/usr/bin/env node
// Sets the repository secrets deploy.yml needs to reach the Hetzner server: HETZNER_HOST,
// HETZNER_USERNAME, HETZNER_SSH_KEY and, when SSH is not on 22, HETZNER_PORT.
//
//   node scripts/set-hetzner-secrets.ts
//   node scripts/set-hetzner-secrets.ts --host 203.0.113.7 --user deploy --key ~/.ssh/deploy_key
//
// Options (anything left out is asked for):
//   --repo OWNER/NAME   the repository to set them on (default cnotv/designo)
//   --host              the server's IP address or name
//   --user              the SSH user the deploy logs in as
//   --key FILE          the PRIVATE key for that user, the file without .pub, without a passphrase
//   --port N            only if SSH is not on 22
//   --dry-run           check everything and list the secrets, without calling GitHub
//   --run               start the deploy once the secrets are set
//
// Needs the GitHub CLI (`gh`), logged in with `gh auth login` as someone who can write this
// repository's secrets. Each value goes to `gh secret set` on stdin, so it never appears on a
// command line or in the output; only the secret names are listed. A port of 22 sets no
// HETZNER_PORT, so to go back to 22 after using another, delete that secret.
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { createInterface, type Interface } from 'node:readline/promises'
import {
  buildSecretCalls,
  expandHome,
  parseArguments,
  prepareKey,
  validateHost,
  validatePort,
  validateUser
} from './hetznerSecrets.ts'
import type { SecretCall } from './types.ts'

const DEFAULT_PORT_TEXT = '22'

const say = (message: string): void => {
  process.stdout.write(`${message}\n`)
}

const runGithubCli = (args: readonly string[], input = ''): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let standardOutput = ''
    let standardError = ''
    child.stdout.on('data', (chunk: Buffer) => {
      standardOutput += String(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      standardError += String(chunk)
    })
    child.on('error', () =>
      reject(new Error('Could not run `gh`. Install the GitHub CLI: https://cli.github.com'))
    )
    child.on('close', (code) =>
      code === 0
        ? resolve(standardOutput)
        : reject(new Error(`gh ${args.slice(0, 2).join(' ')} failed: ${standardError.trim()}`))
    )
    child.stdin.end(input)
  })

type Asker = (question: string, given: string | undefined) => Promise<string>

// A question never settles once input has ended, which would let the script exit as if it had
// worked, so ending the input fails it instead.
const createAsker = (readline: Interface): Asker => {
  const inputEnded = new Promise<never>((_resolve, reject) => {
    readline.once('close', () =>
      reject(
        new Error('Ran out of input. Give the missing value as an option, for example --port 22')
      )
    )
  })
  inputEnded.catch(() => undefined)
  return (question, given) =>
    given === undefined
      ? Promise.race([readline.question(question), inputEnded])
      : Promise.resolve(given)
}

const readKeyFile = (keyFile: string): Promise<string> =>
  readFile(keyFile, 'utf8').catch(() => {
    throw new Error(`Could not read the key file ${keyFile}`)
  })

const setSecret = (repository: string, call: SecretCall): Promise<void> =>
  runGithubCli(['secret', 'set', call.name, '--repo', repository], call.value).then(() =>
    say(`set ${call.name}`)
  )

const main = async (): Promise<void> => {
  const options = parseArguments(process.argv.slice(2))
  const readline = createInterface({ input: process.stdin, output: process.stdout })
  const ask = createAsker(readline)
  const calls = await (async () => {
    try {
      const host = validateHost(await ask('Server host or IP: ', options.host))
      const user = validateUser(await ask('SSH user: ', options.user))
      const keyAnswer = await ask('Path to the PRIVATE SSH key: ', options.keyFile)
      const keyFile = expandHome(keyAnswer.trim(), homedir())
      const port = validatePort(
        (await ask(`SSH port [${DEFAULT_PORT_TEXT}]: `, options.port)) || DEFAULT_PORT_TEXT
      )
      const privateKey = prepareKey(await readKeyFile(keyFile), keyFile)
      return buildSecretCalls({ host, user, privateKey, port })
    } finally {
      readline.close()
    }
  })()

  if (options.dryRun) {
    say(`Dry run: would set on ${options.repository}: ${calls.map((call) => call.name).join(', ')}`)
    return
  }

  await runGithubCli(['auth', 'status'])
  await calls.reduce(
    (previous, call) => previous.then(() => setSecret(options.repository, call)),
    Promise.resolve()
  )
  say(`\nSecrets now on ${options.repository}:`)
  say((await runGithubCli(['secret', 'list', '--repo', options.repository])).trim())

  if (options.runDeploy) {
    await runGithubCli([
      'workflow',
      'run',
      'deploy.yml',
      '--repo',
      options.repository,
      '--ref',
      'main'
    ])
    say(`\nStarted the deploy: https://github.com/${options.repository}/actions`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
