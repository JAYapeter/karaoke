// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { isLocalhostFallback, useJoinUrl } from '@/lib/client/use-join-url'

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

// ---------------------------------------------------------------------------
// Hook composition tests for `useJoinUrl`. These cover the full pipeline
// (window.location.host + serverHost + isLocalhostFallback + protocol/path
// composition) end-to-end against a real React render. The pure pieces
// (`isLocalhostFallback`, `deriveJoinHost`) are still tested in isolation
// above and in `derive-join-host.test.ts`; this block locks down the
// composed behavior.
//
// Strategy: mount a tiny Probe component that calls the hook and writes the
// result into a captured ref. Drive `window.location` via happy-dom's
// `window.happyDOM.setURL()` (the API the project uses for DOM-shape tests).

type Probe = { url: string }

const captureUrl = (
  root: Root,
  serverHost: string | null,
  capture: Probe,
): void => {
  const Component = (): null => {
    capture.url = useJoinUrl(serverHost)
    return null
  }
  // act() must wrap the render so React flushes the post-mount effect
  // synchronously — useJoinUrl reads location inside useEffect.
  act(() => {
    root.render(createElement(Component))
  })
}

describe('useJoinUrl (hook composition)', () => {
  let container: HTMLDivElement
  let root: Root
  const setWindowHost = (host: string, protocol: 'http' | 'https' = 'http') => {
    // happy-dom exposes setURL() to navigate without triggering a real load.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).happyDOM.setURL(`${protocol}://${host}/`)
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('returns "" when serverHost is null AND windowHost is loopback', () => {
    setWindowHost('localhost:3000')
    const capture: Probe = { url: 'sentinel' }
    captureUrl(root, null, capture)
    expect(capture.url).toBe('')
  })

  it('returns "" when serverHost is null AND windowHost is 127.x.x.x', () => {
    setWindowHost('127.0.0.1:3000')
    const capture: Probe = { url: 'sentinel' }
    captureUrl(root, null, capture)
    expect(capture.url).toBe('')
  })

  it('encodes serverHost as http URL when serverHost is non-null', () => {
    setWindowHost('localhost:3000')
    const capture: Probe = { url: '' }
    captureUrl(root, '10.0.0.22:3000', capture)
    expect(capture.url).toBe('http://10.0.0.22:3000/')
  })

  it('falls back to windowHost when off-loopback even if serverHost is null (phone-client scenario)', () => {
    // Phone scanned the QR — its window.location.host is already a LAN
    // address, so the gate is skipped and the hook returns immediately.
    setWindowHost('10.0.0.22:3000')
    const capture: Probe = { url: '' }
    captureUrl(root, null, capture)
    expect(capture.url).toBe('http://10.0.0.22:3000/')
  })

  it('preserves https protocol from window.location', () => {
    setWindowHost('karaoke.example.com', 'https')
    const capture: Probe = { url: '' }
    captureUrl(root, 'karaoke.example.com', capture)
    expect(capture.url).toBe('https://karaoke.example.com/')
  })

  it('resets to "" when serverHost transitions from non-null back to null on a loopback host', () => {
    // Models a hypothetical "server lost LAN" reset. Even though serverHost
    // doesn't refresh in production (boot-captured), the hook must respond
    // correctly to its dep changing — that's the React contract we rely on.
    setWindowHost('localhost:3000')
    const capture: Probe = { url: '' }
    captureUrl(root, '10.0.0.22:3000', capture)
    expect(capture.url).toBe('http://10.0.0.22:3000/')
    captureUrl(root, null, capture)
    expect(capture.url).toBe('')
  })
})
