import { describe, it, expect } from 'vitest'
import { isValidLanHost } from '@/lib/server/validate-lan-host'

describe('isValidLanHost', () => {
  it('accepts DNS-style host with port', () => {
    expect(isValidLanHost('shimokita.local:3000')).toBe(true)
    expect(isValidLanHost('karaoke.example.com:8080')).toBe(true)
  })

  it('accepts DNS-style host without port', () => {
    expect(isValidLanHost('shimokita.local')).toBe(true)
    expect(isValidLanHost('karaoke')).toBe(true)
  })

  it('accepts IPv4 with and without port', () => {
    expect(isValidLanHost('10.0.0.22:3000')).toBe(true)
    expect(isValidLanHost('192.168.1.50')).toBe(true)
    expect(isValidLanHost('127.0.0.1:3000')).toBe(true)
  })

  it('accepts bracketed IPv6 with and without port', () => {
    expect(isValidLanHost('[::1]')).toBe(true)
    expect(isValidLanHost('[::1]:3000')).toBe(true)
    expect(isValidLanHost('[fe80::1]:3000')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidLanHost('')).toBe(false)
  })

  it('rejects values containing a scheme', () => {
    expect(isValidLanHost('http://10.0.0.1:3000')).toBe(false)
    expect(isValidLanHost('https://shimokita.local')).toBe(false)
    expect(isValidLanHost('://malformed')).toBe(false)
  })

  it('rejects unbracketed IPv6 (ambiguous with port)', () => {
    expect(isValidLanHost('::1')).toBe(false)
    expect(isValidLanHost('fe80::1')).toBe(false)
  })

  it('rejects whitespace, query, fragment', () => {
    expect(isValidLanHost('host with space')).toBe(false)
    expect(isValidLanHost('host?query')).toBe(false)
    expect(isValidLanHost('host#frag')).toBe(false)
    expect(isValidLanHost(' host:3000')).toBe(false)
  })

  it('rejects malformed port', () => {
    expect(isValidLanHost('host:abc')).toBe(false)
    expect(isValidLanHost('host:')).toBe(false)
  })
})
