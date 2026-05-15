import { describe, it, expect } from 'vitest'
import { deriveJoinHost } from '@/lib/client/derive-join-host'

describe('deriveJoinHost', () => {
  it('returns serverHost when set to a non-empty string', () => {
    expect(deriveJoinHost('10.0.0.22:3000', 'localhost:3000')).toBe('10.0.0.22:3000')
  })

  it('falls back to windowHost when serverHost is null', () => {
    expect(deriveJoinHost(null, 'localhost:3000')).toBe('localhost:3000')
  })

  it('falls back to windowHost when serverHost is undefined', () => {
    expect(deriveJoinHost(undefined, 'localhost:3000')).toBe('localhost:3000')
  })

  it('falls back to windowHost when serverHost is the empty string', () => {
    expect(deriveJoinHost('', 'localhost:3000')).toBe('localhost:3000')
  })

  it('preserves serverHost verbatim including custom DNS hostnames with port', () => {
    expect(deriveJoinHost('shimokita.local:3000', 'localhost:3000')).toBe('shimokita.local:3000')
  })

  it('preserves serverHost verbatim when it lacks a port (custom DNS without port)', () => {
    expect(deriveJoinHost('shimokita.local', 'localhost:3000')).toBe('shimokita.local')
  })
})
