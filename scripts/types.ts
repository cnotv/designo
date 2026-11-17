/** Which option a `--flag value` pair fills in. */
export type ValueOption = 'repository' | 'host' | 'user' | 'keyFile' | 'port'

export interface SecretOptions {
  repository: string
  host?: string
  user?: string
  keyFile?: string
  port?: string
  runDeploy: boolean
  dryRun: boolean
}

export interface SecretValues {
  host: string
  user: string
  privateKey: string
  port: number
}

/** One repository secret to set; the value is sent on stdin and never printed. */
export interface SecretCall {
  name: string
  value: string
}
