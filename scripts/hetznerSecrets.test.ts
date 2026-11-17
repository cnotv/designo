import { describe, expect, it } from 'vitest'
import {
  buildSecretCalls,
  expandHome,
  parseArguments,
  prepareKey,
  validateHost,
  validatePort,
  validateUser
} from './hetznerSecrets.ts'

const PRIVATE_KEY =
  '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXk=\n-----END OPENSSH PRIVATE KEY-----'

describe('parseArguments', () => {
  it('defaults to this repository, with a real run and nothing preset', () => {
    expect(parseArguments([])).toEqual({
      repository: 'cnotv/designo',
      runDeploy: false,
      dryRun: false
    })
  })

  it('reads each option', () => {
    expect(
      parseArguments([
        '--repo',
        'a/b',
        '--host',
        '1.2.3.4',
        '--user',
        'deploy',
        '--key',
        '/k',
        '--port',
        '2222',
        '--run',
        '--dry-run'
      ])
    ).toEqual({
      repository: 'a/b',
      host: '1.2.3.4',
      user: 'deploy',
      keyFile: '/k',
      port: '2222',
      runDeploy: true,
      dryRun: true
    })
  })

  it('rejects an unknown option and names the valid ones', () => {
    expect(() => parseArguments(['--token', 'x'])).toThrow(/Unknown option --token.*--dry-run/)
  })

  it('rejects an option with no value, including one followed by another option', () => {
    expect(() => parseArguments(['--host'])).toThrow(/--host needs a value/)
    expect(() => parseArguments(['--host', '--run'])).toThrow(/--host needs a value/)
  })
})

describe('validators', () => {
  it('accepts a host name, an IPv4 and an IPv6 address, and trims them', () => {
    expect(validateHost(' 203.0.113.7 ')).toBe('203.0.113.7')
    expect(validateHost('server.example.com')).toBe('server.example.com')
    expect(validateHost('2001:db8::1')).toBe('2001:db8::1')
  })

  it('rejects a host with spaces, a scheme or a path', () => {
    expect(() => validateHost('my server')).toThrow(/not a host name/)
    expect(() => validateHost('https://server.example.com')).toThrow(/not a host name/)
    expect(() => validateHost('')).toThrow(/not a host name/)
  })

  it('accepts ordinary user names and rejects the rest', () => {
    expect(validateUser('deploy')).toBe('deploy')
    expect(validateUser('ci-user_1')).toBe('ci-user_1')
    expect(() => validateUser('Deploy User')).toThrow(/not a valid user name/)
    expect(() => validateUser('')).toThrow(/not a valid user name/)
  })

  it('accepts ports from 1 to 65535 only', () => {
    expect(validatePort('22')).toBe(22)
    expect(validatePort(' 2222 ')).toBe(2222)
    expect(() => validatePort('0')).toThrow(/not a port/)
    expect(() => validatePort('65536')).toThrow(/not a port/)
    expect(() => validatePort('ssh')).toThrow(/not a port/)
    expect(() => validatePort('22.5')).toThrow(/not a port/)
  })
})

describe('expandHome', () => {
  it('replaces a leading tilde only', () => {
    expect(expandHome('~/.ssh/key', '/home/me')).toBe('/home/me/.ssh/key')
    expect(expandHome('~', '/home/me')).toBe('/home/me')
    expect(expandHome('/etc/key', '/home/me')).toBe('/etc/key')
    expect(expandHome('./a~b', '/home/me')).toBe('./a~b')
  })
})

describe('prepareKey', () => {
  it('adds the final newline a key needs', () => {
    expect(prepareKey(PRIVATE_KEY, '/k')).toBe(`${PRIVATE_KEY}\n`)
  })

  it('keeps a key that already ends in a newline', () => {
    expect(prepareKey(`${PRIVATE_KEY}\n`, '/k')).toBe(`${PRIVATE_KEY}\n`)
  })

  it('turns Windows line endings into Unix ones', () => {
    expect(prepareKey(PRIVATE_KEY.replaceAll('\n', '\r\n'), '/k')).toBe(`${PRIVATE_KEY}\n`)
  })

  it('refuses a public key, by file name and by content', () => {
    expect(() => prepareKey(PRIVATE_KEY, '/home/me/.ssh/key.pub')).toThrow(/public key/)
    expect(() => prepareKey('ssh-ed25519 AAAAC3Nza me@laptop', '/k')).toThrow(/public key/)
  })

  it('refuses a file that is not a private key', () => {
    expect(() => prepareKey('hello', '/k')).toThrow(/not a private key/)
  })

  it('refuses a key with a passphrase, which the deploy cannot answer', () => {
    const encrypted =
      '-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nabc\n-----END RSA PRIVATE KEY-----'
    expect(() => prepareKey(encrypted, '/k')).toThrow(/passphrase/)
  })

  it('never puts the key text in an error message', () => {
    const message = ((): string => {
      try {
        prepareKey('secret-material-here', '/k')
        return ''
      } catch (error) {
        return String(error)
      }
    })()
    expect(message).toContain('not a private key')
    expect(message).not.toContain('secret-material-here')
  })
})

describe('buildSecretCalls', () => {
  const values = { host: '203.0.113.7', user: 'deploy', privateKey: `${PRIVATE_KEY}\n`, port: 22 }

  it('sets the three secrets deploy.yml reads, and no port on 22', () => {
    expect(buildSecretCalls(values).map((call) => call.name)).toEqual([
      'HETZNER_HOST',
      'HETZNER_USERNAME',
      'HETZNER_SSH_KEY'
    ])
  })

  it('also sets the port when SSH is elsewhere', () => {
    expect(buildSecretCalls({ ...values, port: 2222 })).toContainEqual({
      name: 'HETZNER_PORT',
      value: '2222'
    })
  })

  it('carries each value unchanged', () => {
    expect(buildSecretCalls(values)).toEqual([
      { name: 'HETZNER_HOST', value: '203.0.113.7' },
      { name: 'HETZNER_USERNAME', value: 'deploy' },
      { name: 'HETZNER_SSH_KEY', value: `${PRIVATE_KEY}\n` }
    ])
  })
})
