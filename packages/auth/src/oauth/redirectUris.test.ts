import { describe, expect, it } from 'vitest'
import {
  MAX_REDIRECT_URI_LENGTH,
  MAX_REDIRECT_URIS,
  redirectUriProblem,
  redirectUrisProblem
} from './redirectUris.ts'

describe('redirectUriProblem', () => {
  it.each([
    'https://client.example.com/callback',
    'https://client.example.com:8443/cb?x=1',
    'http://localhost:6274/oauth/callback',
    'http://127.0.0.1:33417/callback',
    'http://[::1]:33417/callback',
    'http://localhost/callback'
  ])('accepts %s', (uri) => {
    expect(redirectUriProblem(uri)).toBeUndefined()
  })

  it.each([
    ['plain http on a real host', 'http://client.example.com/callback'],
    ['http on a look-alike of localhost', 'http://localhost.evil.example/callback'],
    ['http on another loopback address', 'http://127.0.0.2/callback'],
    ['http on the unspecified address', 'http://0.0.0.0/callback'],
    ['a wildcard host', 'https://*.example.com/callback'],
    ['a wildcard path', 'https://client.example.com/*'],
    ['a fragment', 'https://client.example.com/callback#token'],
    ['an empty fragment', 'https://client.example.com/callback#'],
    ['a custom scheme', 'cursor://anysphere/oauth'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,hello'],
    ['credentials in the URL', 'https://user:secret@client.example.com/callback'],
    ['something that is not a URL', 'not a url'],
    ['a relative URL', '/callback'],
    ['a line break', 'https://client.example.com/call\nback'],
    ['a leading space', ' https://client.example.com/callback'],
    ['nothing', '']
  ])('refuses %s', (_label, uri) => {
    expect(redirectUriProblem(uri)).toEqual(expect.any(String))
  })

  it('refuses a URI over the length limit', () => {
    const uri = `https://client.example.com/${'a'.repeat(MAX_REDIRECT_URI_LENGTH)}`
    expect(redirectUriProblem(uri)).toEqual(expect.any(String))
  })
})

describe('redirectUrisProblem', () => {
  it('accepts a short list of acceptable URIs', () => {
    expect(
      redirectUrisProblem(['https://a.example.com/cb', 'http://localhost:1/cb'])
    ).toBeUndefined()
  })

  it('refuses an empty list', () => {
    expect(redirectUrisProblem([])).toEqual(expect.any(String))
  })

  it('refuses more URIs than the limit', () => {
    const uris = Array.from(
      { length: MAX_REDIRECT_URIS + 1 },
      (_, index) => `https://a.example.com/${index}`
    )
    expect(redirectUrisProblem(uris)).toEqual(expect.any(String))
  })

  it('names the problem of the first bad URI', () => {
    expect(redirectUrisProblem(['https://a.example.com/cb', 'http://b.example.com/cb'])).toMatch(
      /https/
    )
  })
})
