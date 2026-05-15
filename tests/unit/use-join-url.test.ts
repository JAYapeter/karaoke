import { describe, it, expect } from 'vitest'
import { isLocalhostFallback } from '@/lib/client/use-join-url'

describe('isLocalhostFallback', () => {
  it('matches bare "localhost"', () => {
    expect(isLocalhostFallback('localhost')).toBe(true)
  })

  it('matches localhost with port', () => {
    expect(isLocalhostFallback('localhost:3000')).toBe(true)
    expect(isLocalhostFallback('localhost:8080')).toBe(true)
  })

  it('matches 127.x.x.x with and without port', () => {
    expect(isLocalhostFallback('127.0.0.1')).toBe(true)
    expect(isLocalhostFallback('127.0.0.1:3000')).toBe(true)
    expect(isLocalhostFallback('127.1.2.3:9999')).toBe(true)
  })

  it('matches bracketed IPv6 loopback', () => {
    expect(isLocalhostFallback('[::1]')).toBe(true)
    expect(isLocalhostFallback('[::1]:3000')).toBe(true)
  })

  it('does NOT match LAN-reachable hosts', () => {
    expect(isLocalhostFallback('10.0.0.22:3000')).toBe(false)
    expect(isLocalhostFallback('192.168.1.50')).toBe(false)
    expect(isLocalhostFallback('shimokita.local:3000')).toBe(false)
    expect(isLocalhostFallback('karaoke.example.com')).toBe(false)
  })

  it('does NOT match the empty string', () => {
    expect(isLocalhostFallback('')).toBe(false)
  })

  it('does NOT match "localhostfoo" or other prefix-only matches', () => {
    expect(isLocalhostFallback('localhostfoo')).toBe(false)
    expect(isLocalhostFallback('mylocalhost')).toBe(false)
    expect(isLocalhostFallback('127.0.0.1.evil.com')).toBe(false)
  })
})
