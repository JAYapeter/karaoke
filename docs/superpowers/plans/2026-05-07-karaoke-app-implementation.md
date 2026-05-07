# Karaoke App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local-LAN home karaoke web app per `docs/superpowers/specs/2026-05-06-karaoke-app-design.md`. Source page on the MacBook plays YouTube karaoke videos full-screen with real Web Audio pitch shifting. Phones search/paste/queue. WebSocket realtime sync; in-memory state; `yt-dlp` for everything YouTube.

**Architecture:** Single Node process running Next.js 16 (App Router) with a custom `server.ts` that attaches a `ws` WebSocket endpoint. Server is the single source of truth (queue, history, player, epoch, source-token). Source device unlocks audio with a user gesture, runs an AudioWorklet (SoundTouchJS) for pitch. All control plane is over WebSocket; the only HTTP endpoint is `/api/stream/:videoId` (media proxy). State dies on restart — no DB.

**Tech Stack:** Next.js 16 + React 19 + TypeScript strict; Tailwind CSS; `ws` (WebSocket); `@soundtouchjs/audio-worklet`; `qrcode` (terminal QR); `yt-dlp` binary (Homebrew); Vitest for unit tests.

**Operating principles:**
- TDD where the value is high (queue mutations, player epoch, ws dispatch, dedup, authority, ytdlp parsers, proxy Range logic).
- For UI components and Web-Audio glue, write the code, then verify in a real browser against the spec's success criteria. Don't fake what only the browser can validate.
- Commit after every task. Small commits are reviewable; big commits are not.
- Surgical changes only. No speculative features. No refactors of unrelated code.

---

## Conventions used in this plan

- **Vitest** runs as `npm test` (CI-style, runs once) or `npm run test:watch`.
- All paths are relative to the repo root (`/Users/jonathanyapeter/Documents/Karaoke App`).
- `git commit` lines use conventional commit prefixes (`chore`, `feat`, `test`, `fix`, `docs`).
- Source-only authority is enforced server-side; never trust client claims.
- Imports use the `@/` path alias for `src/`.

---

## Phase 1 — Project bootstrap

### Task 1: Initialize Next.js 16 project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Scaffold Next.js**

Run from the repo root:
```bash
npx --yes create-next-app@latest . \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias '@/*' --no-turbopack --use-npm --no-experimental-app
```

When prompted about overwriting `.gitignore`, choose **No** (we already have one). When prompted about other existing files, allow.

Expected: a working Next.js 16 project with `src/app/page.tsx`.

- [ ] **Step 2: Verify boot**

Run:
```bash
npm run dev
```

Expected: dev server starts on `http://localhost:3000` and `curl -s http://localhost:3000 | head -c 200` returns HTML containing `Next.js`.

Stop the server (`Ctrl+C`) before continuing.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold next.js 16 app with tailwind + ts"
```

---

### Task 2: Add runtime dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
npm install ws @soundtouchjs/audio-worklet qrcode
npm install -D @types/ws @types/qrcode tsx vitest @vitest/ui happy-dom
```

- [ ] **Step 2: Add `npm test` and `npm run test:watch` scripts**

Edit `package.json` `"scripts"` to include:
```json
"test": "vitest run",
"test:watch": "vitest",
"check-ytdlp": "tsx scripts/check-ytdlp.ts"
```

- [ ] **Step 3: Add a minimal `vitest.config.ts`**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
```

- [ ] **Step 4: Sanity-check Vitest with a trivial test**

Create `tests/unit/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm test`
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add ws, soundtouchjs, qrcode, vitest"
```

---

### Task 3: Lock TypeScript strict mode and path aliases

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Enable strict + relevant flags**

Update `tsconfig.json` `"compilerOptions"` to include (merge into existing object — do not delete fields):
```json
"strict": true,
"noUncheckedIndexedAccess": true,
"noImplicitOverride": true,
"exactOptionalPropertyTypes": true,
"target": "ES2022",
"moduleResolution": "Bundler"
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors. (If errors arise from the scaffold, fix them — usually a `params: Promise<...>` mismatch in App Router.)

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: tighten typescript strict flags"
```

---

## Phase 2 — Shared types and config

### Task 4: Define configuration constants

**Files:**
- Create: `src/lib/config.ts`

- [ ] **Step 1: Write config**

Create `src/lib/config.ts`:
```ts
export const PORT = Number(process.env.PORT ?? 3000)

// yt-dlp format selectors, in order. First success wins.
export const FORMAT_SELECTORS = [
  'best[ext=mp4][vcodec^=avc1][acodec^=mp4a][height<=720]',
  'best[ext=mp4][acodec!=none]',
  'best[acodec!=none][vcodec!=none]',
] as const

export const PITCH_MIN = -6
export const PITCH_MAX = 6

export const URL_REFRESH_LEAD_MS = 5 * 60 * 1000 // refresh if expiry within 5 min

export const META_CACHE_MS = 5 * 60 * 1000

export const RECENT_MSG_IDS_PER_SESSION = 100

export const POSITION_HEARTBEAT_MS = 1000

export const YTDLP_BIN = process.env.YTDLP_BIN ?? 'yt-dlp'
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat: add config constants"
```

---

### Task 5: Define WebSocket protocol types

**Files:**
- Create: `src/lib/types/protocol.ts`

- [ ] **Step 1: Write protocol types**

Create `src/lib/types/protocol.ts`:
```ts
import type { PlayerState, QueueItem, ServerState, SearchResult } from './state'

export type ClientMutating =
  | { type: 'queue.add'; msgId: string; videoId: string; prePitch: number }
  | { type: 'queue.remove'; msgId: string; itemId: string }
  | { type: 'queue.move'; msgId: string; itemId: string; toIndex: number }
  | { type: 'queue.shuffle'; msgId: string }
  | { type: 'player.skip'; msgId: string; epoch: number }
  | { type: 'player.prev'; msgId: string; epoch: number }
  | { type: 'player.pause'; msgId: string }
  | { type: 'player.play'; msgId: string }
  | { type: 'player.setLivePitch'; msgId: string; semitones: number }
  | { type: 'player.setPrePitch'; msgId: string; itemId: string; semitones: number }
  | { type: 'player.setVolume'; msgId: string; volume: number }

export type ClientNonMutating =
  | { type: 'join'; msgId: string; sessionId: string; name: string; sourceToken?: string }
  | { type: 'source.ready'; msgId: string; sourceToken: string }
  | { type: 'search'; msgId: string; query: string }
  | { type: 'meta.fetch'; msgId: string; videoId: string }

export type ClientEvent =
  | { type: 'player.position'; epoch: number; positionSec: number }
  | { type: 'player.ended'; epoch: number }
  | { type: 'player.error'; epoch: number; itemId: string; message: string }

export type ClientMessage = ClientMutating | ClientNonMutating | ClientEvent

export type ServerMessage =
  | { type: 'state.full'; state: ServerState }
  | { type: 'state.queue'; queue: QueueItem[]; history: QueueItem[] }
  | { type: 'state.player'; player: PlayerState }
  | { type: 'state.ack'; msgId: string; ok: boolean; error?: string }
  | { type: 'search.results'; msgId: string; results: SearchResult[] }
  | { type: 'meta.result'; msgId: string; videoId: string; title: string; thumbnail: string; durationSec: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'toast'; level: 'info' | 'warn' | 'error'; message: string }
```

- [ ] **Step 2: Commit (defer until state types exist; the import will type-check then)**

For now just add the file; we'll wire imports in the next task.

```bash
git add src/lib/types/protocol.ts
git commit -m "feat: ws protocol types (state types follow)"
```

---

### Task 6: Define server state types

**Files:**
- Create: `src/lib/types/state.ts`

- [ ] **Step 1: Write state types**

Create `src/lib/types/state.ts`:
```ts
export type SessionId = string

export type User = {
  sessionId: SessionId
  name: string
  joinedAt: number
}

export type QueueItem = {
  id: string
  videoId: string
  title: string
  thumbnail: string
  durationSec: number
  queuedBy: { sessionId: SessionId; name: string }
  prePitch: number
  addedAt: number
}

export type PlayerStateIdle = { status: 'idle'; epoch: number }

export type PlayerStateActive = {
  status: 'playing' | 'paused'
  epoch: number
  item: QueueItem
  livePitch: number
  positionSec: number
  positionUpdatedAt: number
}

export type PlayerState = PlayerStateIdle | PlayerStateActive

export type ServerState = {
  users: { sessionId: SessionId; name: string }[]
  queue: QueueItem[]
  history: QueueItem[]
  player: PlayerState
  sourceConnected: boolean
  sourceReady: boolean
}

export type SearchResult = {
  videoId: string
  title: string
  thumbnail: string
  durationSec: number
  channel: string
}
```

Note: `users` is serialized as an array (not a `Map`) for wire transport. The internal store may keep a `Map`.

- [ ] **Step 2: Verify both type files compile**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/state.ts
git commit -m "feat: server state types"
```

---

### Task 7: Tiny logger

**Files:**
- Create: `src/lib/log.ts`

- [ ] **Step 1: Write logger**

Create `src/lib/log.ts`:
```ts
type Level = 'info' | 'warn' | 'error' | 'debug'

const COLORS: Record<Level, string> = {
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  debug: '\x1b[90m',
}
const RESET = '\x1b[0m'

export const log = (level: Level, msg: string, data?: Record<string, unknown>) => {
  const ts = new Date().toISOString().slice(11, 23)
  const head = `${COLORS[level]}${ts} ${level.toUpperCase()}${RESET}`
  if (data) console.log(`${head} ${msg}`, data)
  else console.log(`${head} ${msg}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/log.ts
git commit -m "feat: tiny console logger"
```

---

## Phase 3 — yt-dlp wrapper (TDD)

### Task 8: yt-dlp runner — spawn helper

**Files:**
- Create: `src/lib/ytdlp/runner.ts`
- Test: `tests/unit/ytdlp-runner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ytdlp-runner.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { runYtDlp } from '@/lib/ytdlp/runner'

vi.mock('node:child_process', () => {
  const { EventEmitter } = require('node:events')
  return {
    spawn: () => {
      const ee: any = new EventEmitter()
      ee.stdout = new EventEmitter()
      ee.stderr = new EventEmitter()
      ee.kill = () => {}
      setImmediate(() => {
        ee.stdout.emit('data', Buffer.from('hello\n'))
        ee.emit('close', 0)
      })
      return ee
    },
  }
})

describe('runYtDlp', () => {
  it('resolves with stdout for exit 0', async () => {
    const out = await runYtDlp(['--version'])
    expect(out).toBe('hello\n')
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- tests/unit/ytdlp-runner.test.ts`
Expected: import error — file doesn't exist.

- [ ] **Step 3: Implement**

Create `src/lib/ytdlp/runner.ts`:
```ts
import { spawn } from 'node:child_process'
import { YTDLP_BIN } from '@/lib/config'

export class YtDlpError extends Error {
  constructor(public code: number | null, public stderr: string) {
    super(`yt-dlp exited with code ${code}: ${stderr.trim()}`)
  }
}

export const runYtDlp = (args: string[], opts: { timeoutMs?: number } = {}): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(YTDLP_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timeout = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL')
          reject(new YtDlpError(null, `timeout after ${opts.timeoutMs}ms`))
        }, opts.timeoutMs)
      : null
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('error', (e) => {
      if (timeout) clearTimeout(timeout)
      reject(e)
    })
    child.on('close', (code) => {
      if (timeout) clearTimeout(timeout)
      if (code === 0) resolve(stdout)
      else reject(new YtDlpError(code, stderr))
    })
  })
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/unit/ytdlp-runner.test.ts`
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ytdlp/runner.ts tests/unit/ytdlp-runner.test.ts
git commit -m "feat: yt-dlp spawn wrapper with error class"
```

---

### Task 9: yt-dlp search

**Files:**
- Create: `src/lib/ytdlp/search.ts`
- Test: `tests/unit/ytdlp-search.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ytdlp-search.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/ytdlp/runner', () => ({
  runYtDlp: vi.fn(),
}))

import { runYtDlp } from '@/lib/ytdlp/runner'
import { searchYouTube } from '@/lib/ytdlp/search'

describe('searchYouTube', () => {
  it('parses ndjson result lines into SearchResult[]', async () => {
    const lines = [
      JSON.stringify({ id: 'abc', title: 'Foo', thumbnail: 't1', duration: 230, channel: 'C1' }),
      JSON.stringify({ id: 'def', title: 'Bar', thumbnail: 't2', duration: 180, channel: 'C2' }),
    ].join('\n')
    ;(runYtDlp as any).mockResolvedValue(lines + '\n')

    const out = await searchYouTube('test')
    expect(out).toEqual([
      { videoId: 'abc', title: 'Foo', thumbnail: 't1', durationSec: 230, channel: 'C1' },
      { videoId: 'def', title: 'Bar', thumbnail: 't2', durationSec: 180, channel: 'C2' },
    ])
    expect(runYtDlp).toHaveBeenCalledWith(
      expect.arrayContaining(['--dump-json', '--flat-playlist', 'ytsearch10:test']),
      expect.any(Object),
    )
  })

  it('returns [] on empty stdout', async () => {
    ;(runYtDlp as any).mockResolvedValue('')
    expect(await searchYouTube('q')).toEqual([])
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- tests/unit/ytdlp-search.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

Create `src/lib/ytdlp/search.ts`:
```ts
import type { SearchResult } from '@/lib/types/state'
import { runYtDlp } from './runner'

const SEARCH_LIMIT = 10

export const searchYouTube = async (query: string): Promise<SearchResult[]> => {
  const stdout = await runYtDlp(
    ['--dump-json', '--flat-playlist', '--no-warnings', `ytsearch${SEARCH_LIMIT}:${query}`],
    { timeoutMs: 8000 },
  )
  return stdout
    .split('\n')
    .filter((l) => l.trim())
    .map((line) => {
      const j = JSON.parse(line)
      return {
        videoId: j.id,
        title: j.title,
        thumbnail: j.thumbnail ?? '',
        durationSec: Number(j.duration ?? 0),
        channel: j.channel ?? j.uploader ?? '',
      } satisfies SearchResult
    })
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/unit/ytdlp-search.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ytdlp/search.ts tests/unit/ytdlp-search.test.ts
git commit -m "feat: ytdlp search wrapper"
```

---

### Task 10: yt-dlp metadata fetch

**Files:**
- Create: `src/lib/ytdlp/meta.ts`
- Test: `tests/unit/ytdlp-meta.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ytdlp-meta.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ytdlp/runner', () => ({ runYtDlp: vi.fn() }))
import { runYtDlp } from '@/lib/ytdlp/runner'
import { fetchMeta, _resetMetaCache } from '@/lib/ytdlp/meta'

beforeEach(() => {
  ;(runYtDlp as any).mockReset()
  _resetMetaCache()
})

describe('fetchMeta', () => {
  it('returns parsed metadata', async () => {
    ;(runYtDlp as any).mockResolvedValue(
      JSON.stringify({ title: 'Hi', thumbnail: 't', duration: 200 }),
    )
    expect(await fetchMeta('xxx')).toEqual({ title: 'Hi', thumbnail: 't', durationSec: 200 })
  })

  it('caches within window', async () => {
    ;(runYtDlp as any).mockResolvedValueOnce(
      JSON.stringify({ title: 'A', thumbnail: 'a', duration: 100 }),
    )
    const a = await fetchMeta('vid')
    const b = await fetchMeta('vid')
    expect(a).toEqual(b)
    expect(runYtDlp).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- tests/unit/ytdlp-meta.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

Create `src/lib/ytdlp/meta.ts`:
```ts
import { runYtDlp } from './runner'
import { META_CACHE_MS } from '@/lib/config'

export type Meta = { title: string; thumbnail: string; durationSec: number }

const cache = new Map<string, { value: Meta; expiresAt: number }>()
export const _resetMetaCache = () => cache.clear()

export const fetchMeta = async (videoId: string): Promise<Meta> => {
  const now = Date.now()
  const hit = cache.get(videoId)
  if (hit && hit.expiresAt > now) return hit.value
  const stdout = await runYtDlp(
    ['--dump-json', '--no-warnings', `https://www.youtube.com/watch?v=${videoId}`],
    { timeoutMs: 10000 },
  )
  const j = JSON.parse(stdout)
  const meta: Meta = {
    title: j.title,
    thumbnail: j.thumbnail ?? '',
    durationSec: Number(j.duration ?? 0),
  }
  cache.set(videoId, { value: meta, expiresAt: now + META_CACHE_MS })
  return meta
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/unit/ytdlp-meta.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ytdlp/meta.ts tests/unit/ytdlp-meta.test.ts
git commit -m "feat: ytdlp meta fetcher with in-process cache"
```

---

### Task 11: yt-dlp stream URL with format ladder

**Files:**
- Create: `src/lib/ytdlp/stream.ts`
- Test: `tests/unit/ytdlp-stream.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/ytdlp-stream.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ytdlp/runner', () => ({ runYtDlp: vi.fn() }))
import { runYtDlp, YtDlpError } from '@/lib/ytdlp/runner'
import { resolveStream, _resetStreamCache } from '@/lib/ytdlp/stream'

beforeEach(() => {
  ;(runYtDlp as any).mockReset()
  _resetStreamCache()
})

describe('resolveStream', () => {
  it('returns URL + headers from first selector that succeeds', async () => {
    ;(runYtDlp as any).mockResolvedValueOnce(
      JSON.stringify({ url: 'https://cdn/x.mp4', http_headers: { 'User-Agent': 'UA' } }),
    )
    const r = await resolveStream('vid')
    expect(r.url).toBe('https://cdn/x.mp4')
    expect(r.headers['User-Agent']).toBe('UA')
    expect(runYtDlp).toHaveBeenCalledTimes(1)
  })

  it('falls through ladder when first selector fails', async () => {
    ;(runYtDlp as any)
      .mockRejectedValueOnce(new YtDlpError(1, 'no format'))
      .mockResolvedValueOnce(JSON.stringify({ url: 'https://cdn/y.mp4', http_headers: {} }))
    const r = await resolveStream('vid')
    expect(r.url).toBe('https://cdn/y.mp4')
    expect(runYtDlp).toHaveBeenCalledTimes(2)
  })

  it('throws when all selectors fail', async () => {
    ;(runYtDlp as any).mockRejectedValue(new YtDlpError(1, 'no format'))
    await expect(resolveStream('vid')).rejects.toThrow()
  })

  it('caches result until expiresAt', async () => {
    ;(runYtDlp as any).mockResolvedValueOnce(
      JSON.stringify({ url: 'https://cdn/?expire=9999999999', http_headers: {} }),
    )
    await resolveStream('vid')
    await resolveStream('vid')
    expect(runYtDlp).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- tests/unit/ytdlp-stream.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

Create `src/lib/ytdlp/stream.ts`:
```ts
import { runYtDlp, YtDlpError } from './runner'
import { FORMAT_SELECTORS, URL_REFRESH_LEAD_MS } from '@/lib/config'
import { log } from '@/lib/log'

export type Stream = {
  url: string
  headers: Record<string, string>
  expiresAt: number
}

const cache = new Map<string, Stream>()
export const _resetStreamCache = () => cache.clear()
export const _evictStream = (videoId: string) => cache.delete(videoId)

const parseExpiry = (url: string): number => {
  const m = url.match(/[?&]expire=(\d+)/)
  if (m && m[1]) return Number(m[1]) * 1000
  return Date.now() + 60 * 60 * 1000 // 1h default
}

export const resolveStream = async (videoId: string): Promise<Stream> => {
  const now = Date.now()
  const hit = cache.get(videoId)
  if (hit && hit.expiresAt - URL_REFRESH_LEAD_MS > now) return hit

  let lastErr: unknown
  for (const selector of FORMAT_SELECTORS) {
    try {
      const stdout = await runYtDlp(
        ['-f', selector, '--dump-json', '--no-warnings', `https://www.youtube.com/watch?v=${videoId}`],
        { timeoutMs: 12000 },
      )
      const j = JSON.parse(stdout)
      const stream: Stream = {
        url: j.url,
        headers: j.http_headers ?? {},
        expiresAt: parseExpiry(j.url),
      }
      cache.set(videoId, stream)
      return stream
    } catch (e) {
      lastErr = e
      log('debug', `format ${selector} failed for ${videoId}`, { error: String(e) })
    }
  }
  throw lastErr instanceof Error ? lastErr : new YtDlpError(null, 'all selectors failed')
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/unit/ytdlp-stream.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ytdlp/stream.ts tests/unit/ytdlp-stream.test.ts
git commit -m "feat: ytdlp stream resolver with format ladder + cache"
```

---

### Task 12: `check-ytdlp` smoke-test script

**Files:**
- Create: `scripts/check-ytdlp.ts`

- [ ] **Step 1: Write script**

Create `scripts/check-ytdlp.ts`:
```ts
import { runYtDlp, YtDlpError } from '../src/lib/ytdlp/runner'
import { resolveStream } from '../src/lib/ytdlp/stream'
import { log } from '../src/lib/log'

const TEST_VIDEO_ID = 'jNQXAC9IVRw' // "Me at the zoo" — the first YouTube video, public, short

const main = async () => {
  try {
    const v = await runYtDlp(['--version'])
    log('info', `yt-dlp version: ${v.trim()}`)
  } catch (e) {
    log('error', 'yt-dlp not found or not executable. Install with `brew install yt-dlp`.')
    process.exit(1)
  }
  try {
    const s = await resolveStream(TEST_VIDEO_ID)
    log('info', `smoke OK — got URL for ${TEST_VIDEO_ID} (expires ${new Date(s.expiresAt).toISOString()})`)
  } catch (e) {
    if (e instanceof YtDlpError) log('error', `smoke FAILED: ${e.stderr.trim()}`)
    else log('error', `smoke FAILED: ${String(e)}`)
    process.exit(2)
  }
}

main()
```

- [ ] **Step 2: Verify it runs**

Run: `npm run check-ytdlp`

Expected: prints yt-dlp version and "smoke OK — got URL …" within ~5s.

If `yt-dlp` is missing, the script exits 1 with the install hint — that's the path we want for new users.

- [ ] **Step 3: Commit**

```bash
git add scripts/check-ytdlp.ts
git commit -m "feat: add check-ytdlp smoke test script"
```

---

## Phase 4 — Server state and core logic (TDD)

### Task 13: Queue mutations

**Files:**
- Create: `src/lib/server/queue.ts`
- Test: `tests/unit/queue.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/queue.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { addItem, removeItem, moveItem, shuffleQueue } from '@/lib/server/queue'
import type { QueueItem } from '@/lib/types/state'

const item = (id: string, sessionId = 's1'): QueueItem => ({
  id,
  videoId: `v_${id}`,
  title: `Title ${id}`,
  thumbnail: '',
  durationSec: 100,
  queuedBy: { sessionId, name: 'n' },
  prePitch: 0,
  addedAt: 0,
})

describe('queue mutations', () => {
  it('addItem appends', () => {
    expect(addItem([], item('a')).map((x) => x.id)).toEqual(['a'])
    expect(addItem([item('a')], item('b')).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('removeItem removes by id', () => {
    expect(removeItem([item('a'), item('b')], 'a').map((x) => x.id)).toEqual(['b'])
  })

  it('removeItem is no-op when id missing', () => {
    expect(removeItem([item('a')], 'z').map((x) => x.id)).toEqual(['a'])
  })

  it('moveItem to top', () => {
    expect(moveItem([item('a'), item('b'), item('c')], 'c', 0).map((x) => x.id)).toEqual([
      'c', 'a', 'b',
    ])
  })

  it('moveItem clamps toIndex', () => {
    expect(moveItem([item('a'), item('b')], 'a', 99).map((x) => x.id)).toEqual(['b', 'a'])
    expect(moveItem([item('a'), item('b')], 'a', -5).map((x) => x.id)).toEqual(['a', 'b'])
  })

  it('shuffleQueue keeps every item exactly once', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((x) => item(x))
    const out = shuffleQueue(items, () => 0.42).map((x) => x.id).sort()
    expect(out).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- tests/unit/queue.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

Create `src/lib/server/queue.ts`:
```ts
import type { QueueItem } from '@/lib/types/state'

export const addItem = (queue: readonly QueueItem[], item: QueueItem): QueueItem[] => [
  ...queue,
  item,
]

export const removeItem = (queue: readonly QueueItem[], itemId: string): QueueItem[] =>
  queue.filter((q) => q.id !== itemId)

export const moveItem = (
  queue: readonly QueueItem[],
  itemId: string,
  toIndex: number,
): QueueItem[] => {
  const fromIndex = queue.findIndex((q) => q.id === itemId)
  if (fromIndex < 0) return [...queue]
  const next = [...queue]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return [...queue]
  const dest = Math.max(0, Math.min(next.length, toIndex))
  next.splice(dest, 0, moved)
  return next
}

export const shuffleQueue = (
  queue: readonly QueueItem[],
  rng: () => number = Math.random,
): QueueItem[] => {
  const out = [...queue]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = out[i]!
    const b = out[j]!
    out[i] = b
    out[j] = a
  }
  return out
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/unit/queue.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/queue.ts tests/unit/queue.test.ts
git commit -m "feat: queue mutation helpers"
```

---

### Task 14: Player state machine with epoch

**Files:**
- Create: `src/lib/server/player.ts`
- Test: `tests/unit/player.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/player.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { startNext, endCurrent, skipCurrent, prevCurrent, errorCurrent, pause, play, setLivePitch } from '@/lib/server/player'
import type { PlayerState, QueueItem } from '@/lib/types/state'

const idle = (epoch: number): PlayerState => ({ status: 'idle', epoch })

const item = (id: string, prePitch = 0): QueueItem => ({
  id,
  videoId: `v_${id}`,
  title: id,
  thumbnail: '',
  durationSec: 200,
  queuedBy: { sessionId: 's', name: 'n' },
  prePitch,
  addedAt: 0,
})

describe('player transitions', () => {
  it('startNext pops queue, increments epoch, copies prePitch to livePitch', () => {
    const r = startNext(idle(0), [item('a', -2), item('b')])
    expect(r.player.status).toBe('playing')
    expect(r.player.epoch).toBe(1)
    if (r.player.status === 'playing') {
      expect(r.player.item.id).toBe('a')
      expect(r.player.livePitch).toBe(-2)
      expect(r.player.positionSec).toBe(0)
    }
    expect(r.queue.map((q) => q.id)).toEqual(['b'])
  })

  it('startNext from empty queue stays idle (no epoch change)', () => {
    const r = startNext(idle(5), [])
    expect(r.player.status).toBe('idle')
    expect(r.player.epoch).toBe(5)
  })

  it('endCurrent pushes current to history and increments epoch', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 7, item: item('a'),
      livePitch: 0, positionSec: 100, positionUpdatedAt: 0,
    }
    const r = endCurrent(playing, [], [])
    expect(r.history.map((h) => h.id)).toEqual(['a'])
    expect(r.player.status).toBe('idle')
    expect(r.player.epoch).toBe(8)
  })

  it('endCurrent ignores stale epoch', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 7, item: item('a'),
      livePitch: 0, positionSec: 100, positionUpdatedAt: 0,
    }
    const r = endCurrent(playing, [], [], 6) // stale
    expect(r.history).toEqual([])
    expect(r.player).toBe(playing) // unchanged
  })

  it('skipCurrent advances epoch and moves current to history', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 1, item: item('a'),
      livePitch: 0, positionSec: 50, positionUpdatedAt: 0,
    }
    const r = skipCurrent(playing, [item('b')], [])
    expect(r.history.map((h) => h.id)).toEqual(['a'])
    expect(r.queue.map((q) => q.id)).toEqual([item('b').id]) // queue unchanged at this layer
    expect(r.player.epoch).toBe(2)
  })

  it('prevCurrent restores from history if available', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 3, item: item('b'),
      livePitch: 0, positionSec: 0, positionUpdatedAt: 0,
    }
    const r = prevCurrent(playing, [], [item('a')])
    if (r.player.status === 'playing') expect(r.player.item.id).toBe('a')
    expect(r.queue.map((q) => q.id)).toEqual(['b'])
    expect(r.history).toEqual([])
    expect(r.player.epoch).toBe(4)
  })

  it('prevCurrent is no-op when history empty', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 3, item: item('b'),
      livePitch: 0, positionSec: 0, positionUpdatedAt: 0,
    }
    const r = prevCurrent(playing, [], [])
    expect(r.player).toBe(playing)
  })

  it('pause/play preserve epoch', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 9, item: item('a'),
      livePitch: 0, positionSec: 0, positionUpdatedAt: 0,
    }
    const paused = pause(playing)
    expect(paused.status).toBe('paused')
    expect(paused.epoch).toBe(9)
    const resumed = play(paused)
    expect(resumed.status).toBe('playing')
    expect(resumed.epoch).toBe(9)
  })

  it('setLivePitch clamps to [-6, 6]', () => {
    const playing: PlayerState = {
      status: 'playing', epoch: 1, item: item('a'),
      livePitch: 0, positionSec: 0, positionUpdatedAt: 0,
    }
    if (setLivePitch(playing, 7).status !== 'idle')
      expect((setLivePitch(playing, 7) as any).livePitch).toBe(6)
    if (setLivePitch(playing, -10).status !== 'idle')
      expect((setLivePitch(playing, -10) as any).livePitch).toBe(-6)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- tests/unit/player.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

Create `src/lib/server/player.ts`:
```ts
import type { PlayerState, QueueItem } from '@/lib/types/state'
import { PITCH_MAX, PITCH_MIN } from '@/lib/config'

const clampPitch = (n: number) => Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(n)))

export type Result = {
  player: PlayerState
  queue: QueueItem[]
  history: QueueItem[]
}

export const startNext = (
  player: PlayerState,
  queue: readonly QueueItem[],
  history: readonly QueueItem[] = [],
): Result => {
  if (queue.length === 0) return { player, queue: [...queue], history: [...history] }
  const [first, ...rest] = queue
  if (!first) return { player, queue: [...queue], history: [...history] }
  return {
    player: {
      status: 'playing',
      epoch: player.epoch + 1,
      item: first,
      livePitch: clampPitch(first.prePitch),
      positionSec: 0,
      positionUpdatedAt: Date.now(),
    },
    queue: [...rest],
    history: [...history],
  }
}

export const endCurrent = (
  player: PlayerState,
  queue: readonly QueueItem[],
  history: readonly QueueItem[],
  reportedEpoch?: number,
): Result => {
  if (player.status === 'idle') return { player, queue: [...queue], history: [...history] }
  if (reportedEpoch !== undefined && reportedEpoch !== player.epoch) {
    return { player, queue: [...queue], history: [...history] }
  }
  return {
    player: { status: 'idle', epoch: player.epoch + 1 },
    queue: [...queue],
    history: [player.item, ...history],
  }
}

export const skipCurrent = (
  player: PlayerState,
  queue: readonly QueueItem[],
  history: readonly QueueItem[],
): Result => {
  if (player.status === 'idle') return { player, queue: [...queue], history: [...history] }
  return {
    player: { status: 'idle', epoch: player.epoch + 1 },
    queue: [...queue],
    history: [player.item, ...history],
  }
}

export const prevCurrent = (
  player: PlayerState,
  queue: readonly QueueItem[],
  history: readonly QueueItem[],
): Result => {
  if (history.length === 0) return { player, queue: [...queue], history: [...history] }
  const [prev, ...rest] = history
  if (!prev) return { player, queue: [...queue], history: [...history] }
  if (player.status === 'idle') {
    return {
      player: {
        status: 'playing',
        epoch: player.epoch + 1,
        item: prev,
        livePitch: clampPitch(prev.prePitch),
        positionSec: 0,
        positionUpdatedAt: Date.now(),
      },
      queue: [...queue],
      history: rest,
    }
  }
  return {
    player: {
      status: 'playing',
      epoch: player.epoch + 1,
      item: prev,
      livePitch: clampPitch(prev.prePitch),
      positionSec: 0,
      positionUpdatedAt: Date.now(),
    },
    queue: [player.item, ...queue],
    history: rest,
  }
}

export const errorCurrent = (
  player: PlayerState,
  queue: readonly QueueItem[],
  history: readonly QueueItem[],
  reportedEpoch: number,
): Result => {
  if (player.status === 'idle' || reportedEpoch !== player.epoch) {
    return { player, queue: [...queue], history: [...history] }
  }
  return {
    player: { status: 'idle', epoch: player.epoch + 1 },
    queue: [...queue],
    history: [player.item, ...history],
  }
}

export const pause = (player: PlayerState): PlayerState =>
  player.status === 'playing' ? { ...player, status: 'paused' } : player

export const play = (player: PlayerState): PlayerState =>
  player.status === 'paused' ? { ...player, status: 'playing' } : player

export const setLivePitch = (player: PlayerState, semitones: number): PlayerState =>
  player.status === 'idle' ? player : { ...player, livePitch: clampPitch(semitones) }
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/unit/player.test.ts`
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/player.ts tests/unit/player.test.ts
git commit -m "feat: player state machine with epoch + pitch clamp"
```

---

### Task 15: Per-session msgId dedup

**Files:**
- Create: `src/lib/server/dedup.ts`
- Test: `tests/unit/dedup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/dedup.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { Dedup } from '@/lib/server/dedup'

describe('Dedup', () => {
  it('first call records and returns false', () => {
    const d = new Dedup(3)
    expect(d.seen('s1', 'm1')).toBe(false)
    expect(d.seen('s1', 'm1')).toBe(true)
  })

  it('per-session isolation', () => {
    const d = new Dedup(3)
    d.seen('s1', 'm1')
    expect(d.seen('s2', 'm1')).toBe(false)
  })

  it('LRU eviction at capacity', () => {
    const d = new Dedup(2)
    d.seen('s1', 'a')
    d.seen('s1', 'b')
    d.seen('s1', 'c') // evicts 'a'
    expect(d.seen('s1', 'a')).toBe(false) // re-recorded
    expect(d.seen('s1', 'b')).toBe(true)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- tests/unit/dedup.test.ts`

- [ ] **Step 3: Implement**

Create `src/lib/server/dedup.ts`:
```ts
export class Dedup {
  private map = new Map<string, string[]>() // sessionId → recent msgIds (oldest first)

  constructor(private readonly capacity: number) {}

  /** Records (sessionId, msgId). Returns true if it was already seen. */
  seen(sessionId: string, msgId: string): boolean {
    const list = this.map.get(sessionId) ?? []
    if (list.includes(msgId)) return true
    list.push(msgId)
    if (list.length > this.capacity) list.shift()
    this.map.set(sessionId, list)
    return false
  }

  forget(sessionId: string) {
    this.map.delete(sessionId)
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/unit/dedup.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/dedup.ts tests/unit/dedup.test.ts
git commit -m "feat: per-session msgId dedup"
```

---

### Task 16: Authority checks

**Files:**
- Create: `src/lib/server/authority.ts`
- Test: `tests/unit/authority.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/authority.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { canRemove, canMove, canSetLivePitch, canSetPrePitch, isSourceOnly } from '@/lib/server/authority'
import type { PlayerState, QueueItem } from '@/lib/types/state'

const item = (id: string, sessionId: string): QueueItem => ({
  id, videoId: 'v', title: 't', thumbnail: '', durationSec: 0,
  queuedBy: { sessionId, name: 'n' }, prePitch: 0, addedAt: 0,
})

describe('authority', () => {
  it('canRemove: source allowed', () => {
    expect(canRemove({ isSource: true, sessionId: 'x' }, item('a', 'b'))).toBe(true)
  })
  it('canRemove: queuer allowed', () => {
    expect(canRemove({ isSource: false, sessionId: 'a' }, item('i', 'a'))).toBe(true)
  })
  it('canRemove: stranger denied', () => {
    expect(canRemove({ isSource: false, sessionId: 'a' }, item('i', 'b'))).toBe(false)
  })

  it('canMove: source-only', () => {
    expect(canMove({ isSource: true, sessionId: 'x' })).toBe(true)
    expect(canMove({ isSource: false, sessionId: 'x' })).toBe(false)
  })

  it('canSetLivePitch: source or current queuer', () => {
    const p: PlayerState = { status: 'playing', epoch: 1, item: item('a', 'q'), livePitch: 0, positionSec: 0, positionUpdatedAt: 0 }
    expect(canSetLivePitch({ isSource: true, sessionId: 'x' }, p)).toBe(true)
    expect(canSetLivePitch({ isSource: false, sessionId: 'q' }, p)).toBe(true)
    expect(canSetLivePitch({ isSource: false, sessionId: 'z' }, p)).toBe(false)
  })

  it('canSetLivePitch: idle blocks non-source', () => {
    const idle: PlayerState = { status: 'idle', epoch: 0 }
    expect(canSetLivePitch({ isSource: false, sessionId: 'q' }, idle)).toBe(false)
    expect(canSetLivePitch({ isSource: true, sessionId: 'q' }, idle)).toBe(true)
  })

  it('canSetPrePitch: source or queuer of that item', () => {
    expect(canSetPrePitch({ isSource: true, sessionId: 'x' }, item('a', 'q'))).toBe(true)
    expect(canSetPrePitch({ isSource: false, sessionId: 'q' }, item('a', 'q'))).toBe(true)
    expect(canSetPrePitch({ isSource: false, sessionId: 'x' }, item('a', 'q'))).toBe(false)
  })

  it('isSourceOnly enforces source flag', () => {
    expect(isSourceOnly({ isSource: true, sessionId: 'x' })).toBe(true)
    expect(isSourceOnly({ isSource: false, sessionId: 'x' })).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- tests/unit/authority.test.ts`

- [ ] **Step 3: Implement**

Create `src/lib/server/authority.ts`:
```ts
import type { PlayerState, QueueItem } from '@/lib/types/state'

export type Caller = { isSource: boolean; sessionId: string }

export const isSourceOnly = (caller: Caller) => caller.isSource

export const canRemove = (caller: Caller, item: QueueItem) =>
  caller.isSource || caller.sessionId === item.queuedBy.sessionId

export const canMove = (caller: Caller) => caller.isSource

export const canSetLivePitch = (caller: Caller, player: PlayerState) => {
  if (caller.isSource) return true
  if (player.status === 'idle') return false
  return caller.sessionId === player.item.queuedBy.sessionId
}

export const canSetPrePitch = (caller: Caller, item: QueueItem) =>
  caller.isSource || caller.sessionId === item.queuedBy.sessionId
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/unit/authority.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/authority.ts tests/unit/authority.test.ts
git commit -m "feat: server-side authority checks"
```

---

### Task 17: Central state store

**Files:**
- Create: `src/lib/server/store.ts`
- Test: `tests/unit/store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/store.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { Store } from '@/lib/server/store'

describe('Store', () => {
  it('initial state is idle, empty', () => {
    const s = new Store('TOKEN')
    expect(s.snapshot().queue).toEqual([])
    expect(s.snapshot().player.status).toBe('idle')
    expect(s.snapshot().sourceConnected).toBe(false)
    expect(s.snapshot().sourceReady).toBe(false)
  })

  it('addUser / removeUser', () => {
    const s = new Store('TOKEN')
    s.addUser('a', 'Alice')
    expect(s.snapshot().users).toContainEqual({ sessionId: 'a', name: 'Alice' })
    s.removeUser('a')
    expect(s.snapshot().users).toEqual([])
  })

  it('emits change events on mutate', () => {
    const s = new Store('TOKEN')
    const cb = vi.fn()
    s.on(cb)
    s.addUser('a', 'A')
    expect(cb).toHaveBeenCalled()
  })

  it('verifySourceToken', () => {
    const s = new Store('TOKEN')
    expect(s.verifySourceToken('TOKEN')).toBe(true)
    expect(s.verifySourceToken('nope')).toBe(false)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- tests/unit/store.test.ts`

- [ ] **Step 3: Implement**

Create `src/lib/server/store.ts`:
```ts
import type { PlayerState, QueueItem, ServerState, User } from '@/lib/types/state'

type Listener = () => void

export class Store {
  private users = new Map<string, User>()
  private queue: QueueItem[] = []
  private history: QueueItem[] = []
  private player: PlayerState = { status: 'idle', epoch: 0 }
  private sourceConnected = false
  private sourceReady = false
  private listeners = new Set<Listener>()

  constructor(private readonly sourceToken: string) {}

  on(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    for (const l of this.listeners) l()
  }

  verifySourceToken(token: string): boolean {
    return token === this.sourceToken
  }

  snapshot(): ServerState {
    return {
      users: [...this.users.values()].map(({ sessionId, name }) => ({ sessionId, name })),
      queue: [...this.queue],
      history: [...this.history],
      player: this.player,
      sourceConnected: this.sourceConnected,
      sourceReady: this.sourceReady,
    }
  }

  // Mutators
  addUser(sessionId: string, name: string) {
    this.users.set(sessionId, { sessionId, name, joinedAt: Date.now() })
    this.emit()
  }
  removeUser(sessionId: string) {
    if (this.users.delete(sessionId)) this.emit()
  }
  getUser(sessionId: string): User | undefined {
    return this.users.get(sessionId)
  }
  setQueue(q: QueueItem[]) { this.queue = q; this.emit() }
  setHistory(h: QueueItem[]) { this.history = h; this.emit() }
  setPlayer(p: PlayerState) { this.player = p; this.emit() }
  setSourceConnected(b: boolean) { this.sourceConnected = b; this.emit() }
  setSourceReady(b: boolean) { this.sourceReady = b; this.emit() }

  // Read-only accessors
  getQueue(): readonly QueueItem[] { return this.queue }
  getHistory(): readonly QueueItem[] { return this.history }
  getPlayer(): PlayerState { return this.player }
  getSourceReady(): boolean { return this.sourceReady }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/unit/store.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/store.ts tests/unit/store.test.ts
git commit -m "feat: central in-memory state store with listeners"
```

---

### Task 18: WS message dispatcher

**Files:**
- Create: `src/lib/server/dispatch.ts`
- Test: `tests/unit/dispatch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/dispatch.test.ts` (covers the high-leverage authority + dedup paths; per-handler coverage of trivial cases is left to manual smoke testing in Task 39):
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Store } from '@/lib/server/store'
import { Dispatcher } from '@/lib/server/dispatch'

vi.mock('@/lib/ytdlp/meta', () => ({
  fetchMeta: vi.fn().mockResolvedValue({ title: 'T', thumbnail: 'th', durationSec: 100 }),
}))

let store: Store
let send: ReturnType<typeof vi.fn>
let broadcast: ReturnType<typeof vi.fn>
let d: Dispatcher

beforeEach(() => {
  store = new Store('TOKEN')
  send = vi.fn()
  broadcast = vi.fn()
  d = new Dispatcher(store, { send, broadcast })
})

describe('dispatcher', () => {
  it('queue.add succeeds for joined user', async () => {
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'join', msgId: 'j1', sessionId: 'a', name: 'Alice',
    })
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.add', msgId: 'q1', videoId: 'vid', prePitch: 0,
    })
    expect(store.getQueue().length).toBe(1)
    expect(store.getQueue()[0]?.title).toBe('T')
  })

  it('queue.add is idempotent on msgId replay (returns the original ack outcome)', async () => {
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'join', msgId: 'j1', sessionId: 'a', name: 'Alice',
    })
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.add', msgId: 'q1', videoId: 'vid', prePitch: 0,
    })
    send.mockClear()
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.add', msgId: 'q1', videoId: 'vid', prePitch: 0,
    })
    expect(store.getQueue().length).toBe(1) // not added twice
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'state.ack', msgId: 'q1', ok: true }))
  })

  it('replay of a previously-failed mutation returns the cached failure', async () => {
    // queue.remove on a missing item → fails
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.remove', msgId: 'r1', itemId: 'nope',
    })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'state.ack', msgId: 'r1', ok: false }))
    send.mockClear()
    // Replay → must return the same cached failure, not re-attempt
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'queue.remove', msgId: 'r1', itemId: 'nope',
    })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'state.ack', msgId: 'r1', ok: false }))
  })

  it('player.skip from non-source rejected', async () => {
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'player.skip', msgId: 's1', epoch: 0,
    })
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'state.ack', msgId: 's1', ok: false }),
    )
  })

  it('player.position from non-source is silently dropped (no state mutation)', async () => {
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'player.position', epoch: 999, positionSec: 30,
    })
    // Player should remain idle (epoch 0)
    expect(store.getPlayer().status).toBe('idle')
  })

  it('source.ready with bad token sends Invalid source token toast', async () => {
    await d.handle({ sessionId: 'a', isSource: false }, {
      type: 'source.ready', msgId: 'sr1', sourceToken: 'WRONG',
    })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: 'toast', message: 'Invalid source token' }))
  })

  it('join uses caller.sessionId, ignores msg.sessionId mismatch', async () => {
    await d.handle({ sessionId: 'real-session', isSource: false }, {
      type: 'join', msgId: 'j1', sessionId: 'spoofed', name: 'Mallory',
    })
    expect(store.getUser('real-session')?.name).toBe('Mallory')
    expect(store.getUser('spoofed')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- tests/unit/dispatch.test.ts`

- [ ] **Step 3: Implement**

Create `src/lib/server/dispatch.ts`:
```ts
import { randomUUID } from 'node:crypto'
import type { ClientMessage, ServerMessage } from '@/lib/types/protocol'
import type { QueueItem, PlayerState } from '@/lib/types/state'
import { Store } from './store'
import { Dedup } from './dedup'
import { addItem, removeItem, moveItem, shuffleQueue } from './queue'
import {
  startNext, endCurrent, errorCurrent, skipCurrent, prevCurrent,
  pause, play, setLivePitch,
} from './player'
import { canMove, canRemove, canSetLivePitch, canSetPrePitch, isSourceOnly } from './authority'
import { fetchMeta } from '@/lib/ytdlp/meta'
import { RECENT_MSG_IDS_PER_SESSION, PITCH_MAX, PITCH_MIN } from '@/lib/config'

export type Caller = { sessionId: string; isSource: boolean }

export type IO = {
  send: (msg: ServerMessage) => void
  broadcast: (msg: ServerMessage) => void
}

const clampPitch = (n: number) => Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(n)))

type CachedAck = { ok: boolean; error?: string }

export class Dispatcher {
  private dedup = new Dedup(RECENT_MSG_IDS_PER_SESSION)
  /** Stores the *original* ack outcome per (sessionId, msgId) so replays return identical results. */
  private ackCache = new Map<string, CachedAck>()

  constructor(private store: Store, private io: IO) {}

  private ackKey(sessionId: string, msgId: string) {
    return `${sessionId}::${msgId}`
  }

  async handle(caller: Caller, msg: ClientMessage): Promise<void> {
    // Idempotent replay for mutating messages — return the cached ack (ok or fail).
    const mutating = 'msgId' in msg && this.isMutating(msg)
    if (mutating && msg.msgId) {
      const key = this.ackKey(caller.sessionId, msg.msgId)
      if (this.dedup.seen(caller.sessionId, msg.msgId)) {
        const cached = this.ackCache.get(key) ?? { ok: true }
        this.io.send({ type: 'state.ack', msgId: msg.msgId, ok: cached.ok, ...(cached.error ? { error: cached.error } : {}) })
        return
      }
    }

    try {
      await this.dispatch(caller, msg)
      if ('msgId' in msg && msg.msgId) {
        this.io.send({ type: 'state.ack', msgId: msg.msgId, ok: true })
        if (mutating) this.ackCache.set(this.ackKey(caller.sessionId, msg.msgId), { ok: true })
      }
    } catch (e) {
      const errStr = String(e)
      if ('msgId' in msg && msg.msgId) {
        this.io.send({ type: 'state.ack', msgId: msg.msgId, ok: false, error: errStr })
        if (mutating) this.ackCache.set(this.ackKey(caller.sessionId, msg.msgId), { ok: false, error: errStr })
      }
    }
  }

  private isMutating(msg: ClientMessage): boolean {
    return msg.type.startsWith('queue.') || msg.type.startsWith('player.set') ||
      msg.type === 'player.skip' || msg.type === 'player.prev' ||
      msg.type === 'player.pause' || msg.type === 'player.play'
  }

  private async dispatch(caller: Caller, msg: ClientMessage) {
    switch (msg.type) {
      case 'join': {
        // Trust the WS-bound sessionId on caller, not whatever the client put in the payload.
        const user = this.store.getUser(caller.sessionId)
        const name = msg.name?.trim() || user?.name || 'guest'
        this.store.addUser(caller.sessionId, name)
        this.io.send({ type: 'state.full', state: this.store.snapshot() })
        return
      }
      case 'source.ready': {
        if (!this.store.verifySourceToken(msg.sourceToken)) {
          this.io.send({ type: 'toast', level: 'warn', message: 'Invalid source token' })
          throw new Error('bad source token')
        }
        this.store.setSourceReady(true)
        this.maybeAutoAdvance()
        return
      }
      case 'queue.add': {
        const meta = await fetchMeta(msg.videoId)
        const user = this.store.getUser(caller.sessionId)
        if (!user) throw new Error('not joined')
        const item: QueueItem = {
          id: randomUUID(),
          videoId: msg.videoId,
          title: meta.title,
          thumbnail: meta.thumbnail,
          durationSec: meta.durationSec,
          queuedBy: { sessionId: caller.sessionId, name: user.name },
          prePitch: clampPitch(msg.prePitch),
          addedAt: Date.now(),
        }
        this.store.setQueue(addItem(this.store.getQueue(), item))
        this.broadcastQueueAndPlayer()
        this.maybeAutoAdvance()
        return
      }
      case 'queue.remove': {
        const item = this.store.getQueue().find((q) => q.id === msg.itemId)
        if (!item) throw new Error('item not found')
        if (!canRemove(caller, item)) throw new Error('forbidden')
        this.store.setQueue(removeItem(this.store.getQueue(), msg.itemId))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'queue.move': {
        if (!canMove(caller)) throw new Error('forbidden')
        this.store.setQueue(moveItem(this.store.getQueue(), msg.itemId, msg.toIndex))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'queue.shuffle': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        this.store.setQueue(shuffleQueue(this.store.getQueue()))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.skip': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        const r = skipCurrent(this.store.getPlayer(), this.store.getQueue(), this.store.getHistory())
        this.store.setPlayer(r.player)
        this.store.setHistory(r.history)
        this.broadcastQueueAndPlayer()
        this.maybeAutoAdvance()
        return
      }
      case 'player.prev': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        const r = prevCurrent(this.store.getPlayer(), this.store.getQueue(), this.store.getHistory())
        this.store.setPlayer(r.player)
        this.store.setQueue(r.queue)
        this.store.setHistory(r.history)
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.pause': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        this.store.setPlayer(pause(this.store.getPlayer()))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.play': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        this.store.setPlayer(play(this.store.getPlayer()))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.setLivePitch': {
        const p = this.store.getPlayer()
        if (!canSetLivePitch(caller, p)) throw new Error('forbidden')
        this.store.setPlayer(setLivePitch(p, msg.semitones))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.setPrePitch': {
        const item = this.store.getQueue().find((q) => q.id === msg.itemId)
        if (!item) throw new Error('item not found')
        if (!canSetPrePitch(caller, item)) throw new Error('forbidden')
        const updated = { ...item, prePitch: clampPitch(msg.semitones) }
        this.store.setQueue(this.store.getQueue().map((q) => (q.id === msg.itemId ? updated : q)))
        this.broadcastQueueAndPlayer()
        return
      }
      case 'player.setVolume': {
        if (!isSourceOnly(caller)) throw new Error('forbidden')
        // Volume is owned client-side on /source — no server state change. Broadcasted as-is for remote-control phones (future).
        return
      }
      case 'search': {
        const { searchYouTube } = await import('@/lib/ytdlp/search')
        const results = await searchYouTube(msg.query)
        this.io.send({ type: 'search.results', msgId: msg.msgId, results })
        return
      }
      case 'meta.fetch': {
        const meta = await fetchMeta(msg.videoId)
        this.io.send({
          type: 'meta.result', msgId: msg.msgId, videoId: msg.videoId,
          title: meta.title, thumbnail: meta.thumbnail, durationSec: meta.durationSec,
        })
        return
      }
      case 'player.position': {
        if (!isSourceOnly(caller)) return // silently drop non-source heartbeats
        const p = this.store.getPlayer()
        if (p.status !== 'idle' && p.epoch === msg.epoch) {
          this.store.setPlayer({ ...p, positionSec: msg.positionSec, positionUpdatedAt: Date.now() })
        }
        return
      }
      case 'player.ended': {
        if (!isSourceOnly(caller)) return
        const r = endCurrent(this.store.getPlayer(), this.store.getQueue(), this.store.getHistory(), msg.epoch)
        this.store.setPlayer(r.player)
        this.store.setHistory(r.history)
        this.broadcastQueueAndPlayer()
        this.maybeAutoAdvance()
        return
      }
      case 'player.error': {
        if (!isSourceOnly(caller)) return
        const r = errorCurrent(this.store.getPlayer(), this.store.getQueue(), this.store.getHistory(), msg.epoch)
        this.store.setPlayer(r.player)
        this.store.setHistory(r.history)
        this.io.broadcast({ type: 'toast', level: 'warn', message: `Couldn't load: ${msg.message}` })
        this.broadcastQueueAndPlayer()
        this.maybeAutoAdvance()
        return
      }
    }
  }

  private broadcastQueueAndPlayer() {
    this.io.broadcast({ type: 'state.queue', queue: [...this.store.getQueue()], history: [...this.store.getHistory()] })
    this.io.broadcast({ type: 'state.player', player: this.store.getPlayer() })
  }

  /** If idle and source ready and queue non-empty → start next + pre-fetch the upcoming item. */
  private maybeAutoAdvance() {
    const p = this.store.getPlayer()
    if (p.status !== 'idle') return
    if (!this.store.getSourceReady()) return
    const r = startNext(p, this.store.getQueue(), this.store.getHistory())
    if (r.player.status === 'playing') {
      this.store.setPlayer(r.player)
      this.store.setQueue(r.queue)
      this.broadcastQueueAndPlayer()
      // Pre-fetch the *next* queue item's stream so its yt-dlp URL is hot when its turn comes.
      const upcoming = r.queue[0]
      if (upcoming) {
        void import('@/lib/ytdlp/stream').then(({ resolveStream }) =>
          resolveStream(upcoming.videoId).catch(() => {}),
        )
      }
    }
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/unit/dispatch.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/dispatch.ts tests/unit/dispatch.test.ts
git commit -m "feat: ws message dispatcher with dedup + authority"
```

---

## Phase 5 — Media proxy

### Task 19: Media proxy route

**Files:**
- Create: `src/app/api/stream/[videoId]/route.ts`
- Test: `tests/unit/proxy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/proxy.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ytdlp/stream', () => ({
  resolveStream: vi.fn().mockResolvedValue({
    url: 'https://upstream/test.mp4',
    headers: { 'User-Agent': 'UA' },
    expiresAt: Date.now() + 3600_000,
  }),
  _evictStream: vi.fn(),
}))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { GET } from '@/app/api/stream/[videoId]/route'

beforeEach(() => fetchMock.mockReset())

describe('stream proxy', () => {
  it('relays 206 with Content-Range when client sends Range', async () => {
    fetchMock.mockResolvedValue(new Response('partial', {
      status: 206,
      headers: { 'Content-Range': 'bytes 0-99/200', 'Content-Type': 'video/mp4' },
    }))
    const req = new Request('http://localhost/api/stream/v1', {
      headers: { Range: 'bytes=0-99' },
    })
    const res = await GET(req, { params: Promise.resolve({ videoId: 'v1' }) })
    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-99/200')
  })

  it('relays 200 when no Range', async () => {
    fetchMock.mockResolvedValue(new Response('whole', {
      status: 200,
      headers: { 'Content-Type': 'video/mp4' },
    }))
    const res = await GET(
      new Request('http://localhost/api/stream/v1'),
      { params: Promise.resolve({ videoId: 'v1' }) },
    )
    expect(res.status).toBe(200)
  })

  it('on upstream 403 evicts cache and retries once', async () => {
    fetchMock.mockResolvedValueOnce(new Response('forbidden', { status: 403 }))
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200, headers: { 'Content-Type': 'video/mp4' } }))
    const res = await GET(
      new Request('http://localhost/api/stream/v1'),
      { params: Promise.resolve({ videoId: 'v1' }) },
    )
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('relays 416 unsatisfiable range', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 416, headers: { 'Content-Range': 'bytes */200' } }))
    const res = await GET(
      new Request('http://localhost/api/stream/v1', { headers: { Range: 'bytes=999999-' } }),
      { params: Promise.resolve({ videoId: 'v1' }) },
    )
    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */200')
  })

  it('on mid-range upstream 5xx, evicts and retries once; if still 5xx, relays 502', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }))
    const res = await GET(
      new Request('http://localhost/api/stream/v1', { headers: { Range: 'bytes=0-99' } }),
      { params: Promise.resolve({ videoId: 'v1' }) },
    )
    expect(res.status).toBe(502)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('on a non-range upstream 5xx, evicts and retries; if recovered, relays 200', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 502 }))
    fetchMock.mockResolvedValueOnce(new Response('ok', { status: 200, headers: { 'Content-Type': 'video/mp4' } }))
    const res = await GET(
      new Request('http://localhost/api/stream/v1'),
      { params: Promise.resolve({ videoId: 'v1' }) },
    )
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- tests/unit/proxy.test.ts`

- [ ] **Step 3: Implement**

Create `src/app/api/stream/[videoId]/route.ts`:
```ts
import { _evictStream, resolveStream } from '@/lib/ytdlp/stream'
import { log } from '@/lib/log'

const upstream = async (videoId: string, range: string | null) => {
  const stream = await resolveStream(videoId)
  const headers: Record<string, string> = { ...stream.headers }
  if (range) headers['Range'] = range
  return { res: await fetch(stream.url, { headers }), stream }
}

const isRecoverable5xx = (status: number) => status >= 500 && status <= 599

export const GET = async (
  req: Request,
  ctx: { params: Promise<{ videoId: string }> },
): Promise<Response> => {
  const { videoId } = await ctx.params
  const range = req.headers.get('Range')

  let r = await upstream(videoId, range)
  // Refresh on URL-expiry-shaped errors or any upstream 5xx — the URL may be stale.
  if (r.res.status === 403 || r.res.status === 410 || isRecoverable5xx(r.res.status)) {
    log('warn', `upstream ${r.res.status} for ${videoId}; evicting and retrying`)
    _evictStream(videoId)
    r = await upstream(videoId, range)
  }

  // After one retry, if still 5xx, surface 502 to the client (clean signal to the source's refresh path).
  if (isRecoverable5xx(r.res.status)) {
    return new Response('upstream unavailable', { status: 502 })
  }

  const out = new Headers()
  for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const v = r.res.headers.get(h)
    if (v) out.set(h, v)
  }
  out.set('Cache-Control', 'no-store')
  // 416 (unsatisfiable range) is relayed as-is — Content-Range/* tells the client the current size.
  return new Response(r.res.body, { status: r.res.status, headers: out })
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- tests/unit/proxy.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/stream tests/unit/proxy.test.ts
git commit -m "feat: media proxy with range relay + URL refresh"
```

---

## Phase 6 — Server wiring (custom Node server + WS)

### Task 20: Custom Next.js server + WS attach

**Files:**
- Create: `server.ts`
- Modify: `package.json` scripts

- [ ] **Step 1: Write server**

Create `server.ts`:
```ts
import { createServer } from 'node:http'
import { parse } from 'node:url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { randomBytes } from 'node:crypto'
import qrcode from 'qrcode'
import os from 'node:os'
import { PORT } from './src/lib/config'
import { Store } from './src/lib/server/store'
import { Dispatcher, type IO } from './src/lib/server/dispatch'
import type { ClientMessage, ServerMessage } from './src/lib/types/protocol'
import { log } from './src/lib/log'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const SOURCE_TOKEN =
  process.env.SOURCE_TOKEN ??
  Array.from(randomBytes(2)).map((b) => b.toString(16).padStart(2, '0')).join('') +
  '-' +
  Array.from(randomBytes(2)).map((b) => b.toString(16).padStart(2, '0')).join('')

const store = new Store(SOURCE_TOKEN)

type ClientCtx = {
  ws: import('ws').WebSocket
  sessionId: string
  isSource: boolean
}

const clients = new Set<ClientCtx>()

const broadcast = (msg: ServerMessage) => {
  const data = JSON.stringify(msg)
  for (const c of clients) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(data)
  }
}

const dispatcher = new Dispatcher(store, {
  send: (msg) => { /* per-message send done inline below */ throw new Error('use perClient') },
  broadcast,
})

// We rebuild a per-client IO so `send` knows which socket to use.
const ioFor = (c: ClientCtx): IO => ({
  send: (msg) => c.ws.send(JSON.stringify(msg)),
  broadcast,
})

const dispatcherFor = (c: ClientCtx) => new Dispatcher(store, ioFor(c))

const lanIp = (): string => {
  const ifs = os.networkInterfaces()
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address
    }
  }
  return '127.0.0.1'
}

const printBanner = async () => {
  const url = `http://${lanIp()}:${PORT}`
  const qr = await qrcode.toString(url, { type: 'terminal', small: true })
  console.log('')
  console.log('  Karaoke server running')
  console.log(`  ${url}`)
  console.log(`  Source token:  ${SOURCE_TOKEN}`)
  console.log('')
  console.log(qr)
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res, parse(req.url ?? '/', true)))
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/ws', 'http://x')
    const sessionId = url.searchParams.get('sessionId') ?? randomBytes(8).toString('hex')
    const ctx: ClientCtx = { ws, sessionId, isSource: false }
    clients.add(ctx)
    const d = dispatcherFor(ctx)

    // Initial state
    ws.send(JSON.stringify({ type: 'state.full', state: store.snapshot() } as ServerMessage))

    ws.on('message', async (raw) => {
      let msg: ClientMessage
      try { msg = JSON.parse(String(raw)) } catch { return }
      if (msg.type === 'join' && msg.sourceToken && store.verifySourceToken(msg.sourceToken)) {
        ctx.isSource = true
        store.setSourceConnected(true)
      }
      try { await d.handle({ sessionId: ctx.sessionId, isSource: ctx.isSource }, msg) }
      catch (e) { log('warn', 'dispatcher error', { e: String(e) }) }
    })

    ws.on('close', () => {
      clients.delete(ctx)
      if (ctx.isSource) {
        store.setSourceConnected(false)
        store.setSourceReady(false)
        const stillSource = [...clients].some((c) => c.isSource)
        if (!stillSource) {
          // No-op for now — phones will see sourceConnected=false via next state.full
        }
      }
    })
  })

  // Re-broadcast snapshot every time the store changes.
  store.on(() => {
    broadcast({ type: 'state.full', state: store.snapshot() })
  })

  server.listen(PORT, () => {
    void printBanner()
  })
})
```

> Note on the `Dispatcher` constructor parameter: the `Dispatcher` needs to know which socket to reply to for `state.ack`/search results. We construct a fresh `Dispatcher` per client (cheap — they're just method dispatchers over a shared `Store`). The first `new Dispatcher(...)` at module top is unused; remove it before commit.

- [ ] **Step 2: Remove the unused top-level Dispatcher**

Edit `server.ts`: delete the lines:
```ts
const dispatcher = new Dispatcher(store, {
  send: (msg) => { /* per-message send done inline below */ throw new Error('use perClient') },
  broadcast,
})
```

- [ ] **Step 3: Switch `npm run dev` and `npm start` to use the custom server**

In `package.json` `scripts`, replace:
```json
"dev": "next dev",
"start": "next start"
```
with:
```json
"dev": "tsx server.ts",
"build": "next build",
"start": "NODE_ENV=production tsx server.ts"
```

- [ ] **Step 4: Verify boot**

Run: `npm run check-ytdlp` (sanity yt-dlp), then `npm run dev`.

Expected:
- Banner prints with LAN URL, source token, and a QR code in the terminal.
- `curl -s http://localhost:3000` returns Next.js HTML.
- `wscat -c 'ws://localhost:3000/ws?sessionId=test'` (install if needed: `brew install wscat`) connects and immediately receives a `state.full` message.

Stop with `Ctrl+C`.

- [ ] **Step 5: Commit**

```bash
git add server.ts package.json
git commit -m "feat: custom server with ws + startup banner + qr"
```

---

## Phase 7 — Visual foundation

### Task 21: Riso palette & global styles

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/styles/riso.css`

- [ ] **Step 1: Write Riso CSS**

Create `src/styles/riso.css`:
```css
:root {
  --ink-black:    #0a0808;
  --ink-deep:     #1a1410;
  --paper-cream:  #fff8e0;
  --riso-pink:    #ff4d8d;
  --riso-teal:    #4dffe5;
  --cigarette:    #d4a847;
  --hanko-red:    #c1272d;
  --ink-muted:    #6a4818;

  --display-font: 'Crimson Pro', Georgia, serif;
  --mono-font: 'JetBrains Mono', 'IBM Plex Mono', ui-monospace, monospace;
}

html, body { background: var(--ink-black); color: var(--paper-cream); }

.riso-noise {
  position: fixed; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(255,77,141,0.18) 0, transparent 35%),
    radial-gradient(circle at 80% 70%, rgba(77,255,229,0.18) 0, transparent 35%);
  mix-blend-mode: screen;
}

.paper-grain {
  background-image: radial-gradient(circle, rgba(0,0,0,0.04) 0.5px, transparent 1px);
  background-size: 3px 3px;
}

.tape-strip {
  position: relative;
}
.tape-strip::before {
  content: ''; position: absolute; top: -4px; left: 50%; width: 30px; height: 8px;
  background: rgba(212,168,71,0.7); transform: translateX(-50%) rotate(-2deg);
}

.hanko {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.6em; height: 1.6em; border: 1.5px solid var(--hanko-red);
  color: var(--hanko-red); font-family: var(--display-font); font-weight: 700;
  transform: rotate(-4deg);
}

.uc { letter-spacing: 0.2em; text-transform: uppercase; font-family: var(--mono-font); }

.paper-card {
  background: var(--paper-cream); color: var(--ink-black);
  padding: 12px 14px; transform: rotate(-0.5deg);
  box-shadow: 1px 1px 0 var(--cigarette);
}
.paper-card:nth-child(2n) { transform: rotate(0.5deg); }
```

- [ ] **Step 2: Wire Riso CSS and fonts**

Replace `src/app/globals.css` contents with:
```css
@import "tailwindcss";
@import "../styles/riso.css";
```

Edit `src/app/layout.tsx` to load fonts and add the noise overlay div:
```tsx
import type { Metadata } from 'next'
import { Crimson_Pro, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const display = Crimson_Pro({ subsets: ['latin'], weight: ['400', '900'], style: ['normal', 'italic'], variable: '--display-font' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--mono-font' })

export const metadata: Metadata = { title: 'Karaoke', description: 'Home karaoke' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>
        <div className="riso-noise" aria-hidden />
        <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Verify**

Run: `npm run dev` and load `http://localhost:3000`. The page should look pitch-black with subtle pink/teal noise.

Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/styles/riso.css src/app/globals.css src/app/layout.tsx
git commit -m "feat: riso palette + global noise overlay + fonts"
```

---

## Phase 8 — Client WS hook

### Task 22: useWebSocket / useServerState hook

**Files:**
- Create: `src/lib/client/ws.ts`

- [ ] **Step 1: Implement hook**

Create `src/lib/client/ws.ts`:
```ts
'use client'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import type { ClientMessage, ServerMessage } from '@/lib/types/protocol'
import type { ServerState } from '@/lib/types/state'

const SESSION_KEY = 'karaoke.sessionId'
const NAME_KEY = 'karaoke.name'
const TOKEN_KEY = 'karaoke.sourceToken'

export const getSessionId = () => {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export const getStoredName = () =>
  typeof window === 'undefined' ? '' : localStorage.getItem(NAME_KEY) ?? ''
export const setStoredName = (name: string) => localStorage.setItem(NAME_KEY, name)

export const getStoredSourceToken = () =>
  typeof window === 'undefined' ? '' : localStorage.getItem(TOKEN_KEY) ?? ''
export const setStoredSourceToken = (t: string) => localStorage.setItem(TOKEN_KEY, t)

export type Connection = {
  state: ServerState | null
  send: (msg: ClientMessage) => void
  ready: boolean
  ack: (msgId: string) => Promise<{ ok: boolean; error?: string }>
}

export const useConnection = (opts: {
  name: string
  sourceToken?: string
  onMessage?: (msg: ServerMessage) => void
}): Connection => {
  const [state, setState] = useState<ServerState | null>(null)
  const [ready, setReady] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const ackResolversRef = useRef<Map<string, (v: { ok: boolean; error?: string }) => void>>(new Map())
  const onMessage = opts.onMessage
  const sessionId = useMemo(() => getSessionId(), [])

  useEffect(() => {
    let alive = true
    let attempt = 0

    const connect = () => {
      const ws = new WebSocket(`ws://${location.host}/ws?sessionId=${sessionId}`)
      wsRef.current = ws
      ws.addEventListener('open', () => {
        attempt = 0
        setReady(true)
        ws.send(JSON.stringify({
          type: 'join',
          msgId: crypto.randomUUID(),
          sessionId,
          name: opts.name,
          sourceToken: opts.sourceToken,
        } satisfies ClientMessage))
      })
      ws.addEventListener('message', (e) => {
        const msg = JSON.parse(e.data) as ServerMessage
        if (msg.type === 'state.full') setState(msg.state)
        else if (msg.type === 'state.queue' || msg.type === 'state.player') {
          setState((s) => s && applyDelta(s, msg))
        }
        else if (msg.type === 'state.ack') {
          const r = ackResolversRef.current.get(msg.msgId)
          if (r) { r({ ok: msg.ok, error: msg.error }); ackResolversRef.current.delete(msg.msgId) }
        }
        onMessage?.(msg)
      })
      ws.addEventListener('close', () => {
        setReady(false)
        if (!alive) return
        const delay = Math.min(2000 + attempt * 500, 8000)
        attempt++
        setTimeout(connect, delay)
      })
    }
    connect()

    return () => {
      alive = false
      wsRef.current?.close()
    }
  }, [opts.name, opts.sourceToken, sessionId, onMessage])

  const send = useCallback((msg: ClientMessage) => {
    wsRef.current?.send(JSON.stringify(msg))
  }, [])

  const ack = useCallback((msgId: string) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      ackResolversRef.current.set(msgId, resolve)
      setTimeout(() => {
        if (ackResolversRef.current.has(msgId)) {
          ackResolversRef.current.delete(msgId)
          resolve({ ok: false, error: 'timeout' })
        }
      }, 6000)
    }), [])

  return { state, send, ready, ack }
}

const applyDelta = (s: ServerState, msg: ServerMessage): ServerState => {
  if (msg.type === 'state.queue') return { ...s, queue: msg.queue, history: msg.history }
  if (msg.type === 'state.player') return { ...s, player: msg.player }
  return s
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/client/ws.ts
git commit -m "feat: client ws hook with reconnect + ack futures"
```

---

## Phase 9 — Phone client

### Task 23: NameEntry

**Files:**
- Create: `src/components/phone/NameEntry.tsx`

- [ ] **Step 1: Implement**

Create `src/components/phone/NameEntry.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { setStoredName } from '@/lib/client/ws'

export const NameEntry = ({ onSubmit }: { onSubmit: (name: string) => void }) => {
  const [name, setName] = useState('')
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) { setStoredName(name.trim()); onSubmit(name.trim()) } }}
        className="paper-card paper-grain"
        style={{ width: 320 }}
      >
        <div className="uc" style={{ fontSize: 11, color: 'var(--ink-muted)', marginBottom: 8 }}>▌ enter the room</div>
        <h2 style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 22, marginBottom: 12 }}>
          What's your name?
        </h2>
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Sarah"
          style={{ width: '100%', padding: '8px 10px', fontFamily: 'var(--mono-font)', fontSize: 14, background: 'transparent', border: '1px solid var(--ink-black)' }}
        />
        <button
          type="submit"
          style={{ marginTop: 12, padding: '8px 14px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontFamily: 'var(--mono-font)', letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: 11 }}
        >Sign in</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/phone/NameEntry.tsx
git commit -m "feat(phone): name entry"
```

---

### Task 24: QueueView

**Files:**
- Create: `src/components/phone/QueueView.tsx`

- [ ] **Step 1: Implement**

Create `src/components/phone/QueueView.tsx`:
```tsx
'use client'
import type { Connection } from '@/lib/client/ws'
import type { QueueItem, PlayerState } from '@/lib/types/state'

export const QueueView = ({ conn, sessionId }: { conn: Connection; sessionId: string }) => {
  const state = conn.state
  if (!state) return <div className="uc" style={{ padding: 16 }}>Connecting…</div>

  const remove = (it: QueueItem) =>
    conn.send({ type: 'queue.remove', msgId: crypto.randomUUID(), itemId: it.id })

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <NowPlayingCard player={state.player} />
      <h3 className="uc" style={{ fontSize: 11 }}>▌ Up next · {state.queue.length}</h3>
      {state.queue.map((it, i) => (
        <div key={it.id} className="paper-card paper-grain" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>{String(i + 2).padStart(2, '0')} · {it.queuedBy.name}</div>
            <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 14 }}>{it.title}</div>
            {it.prePitch !== 0 && (
              <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>key {it.prePitch > 0 ? '+' : ''}{it.prePitch}</div>
            )}
          </div>
          {it.queuedBy.sessionId === sessionId && (
            <button onClick={() => remove(it)} aria-label="Remove" style={{ padding: 6 }}>✕</button>
          )}
        </div>
      ))}
    </div>
  )
}

const NowPlayingCard = ({ player }: { player: PlayerState }) => {
  if (player.status === 'idle') return (
    <div className="paper-card paper-grain"><div className="uc" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>▌ idle — queue something</div></div>
  )
  return (
    <div className="paper-card paper-grain tape-strip">
      <div className="uc" style={{ fontSize: 9, color: 'var(--riso-pink)' }}>▌ now playing</div>
      <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 18 }}>{player.item.title}</div>
      <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>{player.item.queuedBy.name} · key {player.livePitch >= 0 ? '+' : ''}{player.livePitch}</div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/phone/QueueView.tsx
git commit -m "feat(phone): queue view"
```

---

### Task 25: SearchTab

This task has two steps: first, extend `useConnection` to broadcast every server message as a `karaoke-msg` window event so ad-hoc components can subscribe; then build the SearchTab.

**Files:**
- Modify: `src/lib/client/ws.ts`
- Create: `src/components/phone/SearchTab.tsx`

- [ ] **Step 1: Add the global `karaoke-msg` event in `useConnection`**

In `src/lib/client/ws.ts`, inside the `ws.addEventListener('message', …)` handler — *after* the existing `onMessage?.(msg)` line — add:

```ts
if (typeof window !== 'undefined') {
  window.dispatchEvent(new CustomEvent('karaoke-msg', { detail: msg }))
}
```

(Keep the existing logic; this just adds a global event for ad-hoc components.)

- [ ] **Step 2: Implement SearchTab**

Create `src/components/phone/SearchTab.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { SearchResult } from '@/lib/types/state'
import type { ServerMessage } from '@/lib/types/protocol'
import { PrePitchSlider } from './PrePitchSlider'

export const SearchTab = ({ conn }: { conn: Connection }) => {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [pending, setPending] = useState<SearchResult | null>(null)
  const [pitch, setPitch] = useState(0)
  const [loading, setLoading] = useState(false)

  const doSearch = () => {
    if (!q.trim()) return
    setLoading(true)
    const msgId = crypto.randomUUID()
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type === 'search.results' && m.msgId === msgId) {
        setResults(m.results)
        setLoading(false)
        window.removeEventListener('karaoke-msg', handler)
      }
    }
    window.addEventListener('karaoke-msg', handler)
    conn.send({ type: 'search', msgId, query: q.trim() })
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="bohemian rhapsody karaoke"
          style={{ flex: 1, padding: '8px 10px', fontFamily: 'var(--mono-font)', fontSize: 14, background: 'var(--paper-cream)', color: 'var(--ink-black)' }}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()} />
        <button onClick={doSearch} className="uc" style={{ padding: '8px 12px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 11 }}>
          {loading ? '...' : 'GO'}
        </button>
      </div>
      {results.map((r) => (
        <div key={r.videoId} className="paper-card paper-grain" onClick={() => { setPending(r); setPitch(0) }}>
          <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 14 }}>{r.title}</div>
          <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>{r.channel} · {Math.floor(r.durationSec / 60)}:{String(r.durationSec % 60).padStart(2, '0')}</div>
        </div>
      ))}
      {pending && (
        <div className="paper-card paper-grain tape-strip" style={{ position: 'sticky', bottom: 0 }}>
          <div className="uc" style={{ fontSize: 9 }}>▌ Add to queue</div>
          <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 14 }}>{pending.title}</div>
          <PrePitchSlider value={pitch} onChange={setPitch} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={() => setPending(null)} className="uc" style={{ padding: '6px 10px' }}>Cancel</button>
            <button
              onClick={() => {
                conn.send({ type: 'queue.add', msgId: crypto.randomUUID(), videoId: pending.videoId, prePitch: pitch })
                setPending(null); setQ(''); setResults([])
              }}
              className="uc" style={{ padding: '6px 10px', background: 'var(--hanko-red)', color: 'var(--paper-cream)' }}
            >Add</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/phone/SearchTab.tsx src/lib/client/ws.ts
git commit -m "feat(phone): search tab + global karaoke-msg event bus"
```

---

### Task 26: PrePitchSlider

**Files:**
- Create: `src/components/phone/PrePitchSlider.tsx`

- [ ] **Step 1: Implement**

Create `src/components/phone/PrePitchSlider.tsx`:
```tsx
'use client'
export const PrePitchSlider = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
  <div style={{ marginTop: 8 }}>
    <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>
      key {value > 0 ? `+${value}` : value}
    </div>
    <input
      type="range" min={-6} max={6} step={1} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: '100%' }}
    />
  </div>
)
```

- [ ] **Step 2: Commit**

```bash
git add src/components/phone/PrePitchSlider.tsx
git commit -m "feat(phone): pre-pitch slider"
```

---

### Task 27: PasteTab

**Files:**
- Create: `src/components/phone/PasteTab.tsx`

- [ ] **Step 1: Implement**

Create `src/components/phone/PasteTab.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import { PrePitchSlider } from './PrePitchSlider'

const VIDEO_ID = /(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/

export const PasteTab = ({ conn }: { conn: Connection }) => {
  const [url, setUrl] = useState('')
  const [meta, setMeta] = useState<{ videoId: string; title: string; thumbnail: string; durationSec: number } | null>(null)
  const [pitch, setPitch] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const resolve = () => {
    const m = url.match(VIDEO_ID); if (!m) { setErr('Could not find a YouTube video id in that URL.'); return }
    setBusy(true); setErr(null)
    const msgId = crypto.randomUUID()
    const handler = (e: Event) => {
      const x = (e as CustomEvent).detail
      if (x.type === 'meta.result' && x.msgId === msgId) {
        setMeta({ videoId: x.videoId, title: x.title, thumbnail: x.thumbnail, durationSec: x.durationSec })
        setBusy(false); window.removeEventListener('karaoke-msg', handler)
      } else if (x.type === 'state.ack' && x.msgId === msgId && !x.ok) {
        setErr(x.error ?? 'failed'); setBusy(false); window.removeEventListener('karaoke-msg', handler)
      }
    }
    window.addEventListener('karaoke-msg', handler)
    conn.send({ type: 'meta.fetch', msgId, videoId: m[1]! })
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <textarea value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…"
        rows={3} style={{ width: '100%', padding: 8, fontFamily: 'var(--mono-font)', fontSize: 13, background: 'var(--paper-cream)', color: 'var(--ink-black)' }} />
      <button onClick={resolve} disabled={busy} className="uc" style={{ padding: '8px 12px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 11 }}>
        {busy ? 'Resolving…' : 'Resolve'}
      </button>
      {err && <div className="uc" style={{ fontSize: 10, color: 'var(--riso-pink)' }}>{err}</div>}
      {meta && (
        <div className="paper-card paper-grain tape-strip">
          <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 14 }}>{meta.title}</div>
          <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>{Math.floor(meta.durationSec / 60)}:{String(meta.durationSec % 60).padStart(2, '0')}</div>
          <PrePitchSlider value={pitch} onChange={setPitch} />
          <button
            onClick={() => {
              conn.send({ type: 'queue.add', msgId: crypto.randomUUID(), videoId: meta.videoId, prePitch: pitch })
              setMeta(null); setUrl('')
            }}
            className="uc" style={{ marginTop: 8, padding: '6px 10px', background: 'var(--hanko-red)', color: 'var(--paper-cream)' }}
          >Add</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/phone/PasteTab.tsx
git commit -m "feat(phone): paste url tab"
```

---

### Task 28: LivePitchSheet

**Files:**
- Create: `src/components/phone/LivePitchSheet.tsx`

- [ ] **Step 1: Implement**

Create `src/components/phone/LivePitchSheet.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { PlayerState } from '@/lib/types/state'

export const LivePitchSheet = ({ conn, sessionId }: { conn: Connection; sessionId: string }) => {
  const player: PlayerState | undefined = conn.state?.player
  const isMine =
    player && player.status !== 'idle' && player.item.queuedBy.sessionId === sessionId
  const [pitch, setPitch] = useState(0)

  useEffect(() => {
    if (player && player.status !== 'idle') setPitch(player.livePitch)
  }, [player?.status, player?.status === 'idle' ? 0 : player?.livePitch])

  if (!isMine || !player || player.status === 'idle') return null

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0,
      background: 'var(--ink-deep)', borderTop: '2px solid var(--riso-pink)',
      padding: 16, zIndex: 10,
    }}>
      <div className="uc" style={{ fontSize: 10, color: 'var(--riso-pink)' }}>▌ You're up</div>
      <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 18 }}>{player.item.title}</div>
      <div style={{ marginTop: 8 }}>
        <div className="uc" style={{ fontSize: 10, color: 'var(--cigarette)' }}>key {pitch >= 0 ? `+${pitch}` : pitch}</div>
        <input
          type="range" min={-6} max={6} step={1} value={pitch}
          onChange={(e) => {
            const v = Number(e.target.value); setPitch(v)
            conn.send({ type: 'player.setLivePitch', msgId: crypto.randomUUID(), semitones: v })
          }}
          style={{ width: '100%' }}
        />
        <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>Source has override</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/phone/LivePitchSheet.tsx
git commit -m "feat(phone): live pitch sheet for queuer"
```

---

### Task 29: Assemble phone client at `/`

**Files:**
- Replace: `src/app/page.tsx`

- [ ] **Step 1: Implement**

Replace `src/app/page.tsx` with:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { NameEntry } from '@/components/phone/NameEntry'
import { QueueView } from '@/components/phone/QueueView'
import { SearchTab } from '@/components/phone/SearchTab'
import { PasteTab } from '@/components/phone/PasteTab'
import { LivePitchSheet } from '@/components/phone/LivePitchSheet'
import { getSessionId, getStoredName, useConnection } from '@/lib/client/ws'

type Tab = 'queue' | 'search' | 'paste'

export default function Phone() {
  const [name, setName] = useState<string>('')
  const [tab, setTab] = useState<Tab>('queue')
  const sessionId = typeof window === 'undefined' ? '' : getSessionId()

  useEffect(() => { setName(getStoredName()) }, [])

  const conn = useConnection({ name })

  if (!name) return <NameEntry onSubmit={setName} />

  return (
    <main style={{ paddingBottom: 140 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid var(--ink-deep)' }}>
        <div className="uc" style={{ fontSize: 11 }}>● {name}</div>
        <nav style={{ display: 'flex', gap: 8 }}>
          {(['queue', 'search', 'paste'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="uc"
              style={{ padding: '6px 10px', fontSize: 10, background: tab === t ? 'var(--hanko-red)' : 'transparent', color: tab === t ? 'var(--paper-cream)' : 'var(--paper-cream)' }}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'queue' && <QueueView conn={conn} sessionId={sessionId} />}
      {tab === 'search' && <SearchTab conn={conn} />}
      {tab === 'paste' && <PasteTab conn={conn} />}

      <LivePitchSheet conn={conn} sessionId={sessionId} />
    </main>
  )
}
```

- [ ] **Step 2: Verify in browser**

Run: `npm run dev`. Visit `http://localhost:3000` on a phone (or in Chrome devtools mobile mode pointing to your LAN IP). Confirm:
- name entry appears, persists after reload
- tabs switch
- queue shows "idle — queue something"
- search returns results in <5s

Stop the server.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(phone): assemble phone client at /"
```

---

## Phase 10 — Source client

### Task 30: Bundle SoundTouch worklet

**Files:**
- Create: `public/worklets/soundtouch-worklet.js` (copied from npm package)

- [ ] **Step 1: Copy the worklet bundle**

Run:
```bash
mkdir -p public/worklets
cp node_modules/@soundtouchjs/audio-worklet/dist/soundtouch-worklet.js public/worklets/soundtouch-worklet.js
```

- [ ] **Step 2: Commit**

```bash
git add public/worklets/soundtouch-worklet.js
git commit -m "chore: vendor soundtouchjs audio worklet"
```

---

### Task 31: AudioGraph (source-only)

**Files:**
- Create: `src/lib/client/audio-graph.ts`

- [ ] **Step 1: Implement**

Create `src/lib/client/audio-graph.ts`:
```ts
'use client'

export type AudioGraph = {
  ctx: AudioContext
  video: HTMLVideoElement
  setPitch: (semitones: number) => void
  setVolume: (v: number) => void
  bypassPitch: () => void
  destroy: () => void
}

const semitoneToRatio = (s: number) => Math.pow(2, s / 12)

export const buildAudioGraph = async (mountEl: HTMLElement): Promise<AudioGraph> => {
  const ctx = new AudioContext()
  await ctx.audioWorklet.addModule('/worklets/soundtouch-worklet.js')
  if (ctx.state === 'suspended') await ctx.resume()

  const video = document.createElement('video')
  video.playsInline = true
  video.style.width = '100%'
  video.style.height = '100%'
  video.style.objectFit = 'contain'
  video.style.background = 'black'
  mountEl.appendChild(video)

  const src = ctx.createMediaElementSource(video)
  const worklet = new AudioWorkletNode(ctx, 'soundtouch-processor')
  const gain = ctx.createGain()
  src.connect(worklet)
  worklet.connect(gain)
  gain.connect(ctx.destination)

  let bypassed = false

  const setPitch = (semitones: number) => {
    if (bypassed) return
    const param = (worklet.parameters as Map<string, AudioParam>).get('pitch')
    if (param) param.value = semitoneToRatio(semitones)
  }

  const bypassPitch = () => {
    if (bypassed) return
    bypassed = true
    src.disconnect()
    src.connect(gain) // skip the worklet
  }

  return {
    ctx, video,
    setPitch,
    setVolume: (v) => { gain.gain.value = Math.max(0, Math.min(1, v)) },
    bypassPitch,
    destroy: () => { try { ctx.close() } catch {} mountEl.removeChild(video) },
  }
}
```

> Worklet param API is library-specific; we reference `'pitch'`. If the build exposes a different name (e.g. `'pitchSemitones'`), adjust here.

- [ ] **Step 2: Module-level ref for cross-component access (volume slider)**

Create `src/lib/client/audio-graph-ref.ts`:
```ts
'use client'
import type { AudioGraph } from './audio-graph'

let current: AudioGraph | null = null
const listeners = new Set<() => void>()

export const setAudioGraph = (g: AudioGraph | null) => {
  current = g
  for (const l of listeners) l()
}

export const getAudioGraph = (): AudioGraph | null => current

export const subscribeAudioGraph = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/client/audio-graph.ts src/lib/client/audio-graph-ref.ts
git commit -m "feat(source): audio graph factory + module ref for volume control"
```

---

### Task 32: TokenEntry + StartShowGesture

**Files:**
- Create: `src/components/source/TokenEntry.tsx`
- Create: `src/components/source/StartShowGesture.tsx`

- [ ] **Step 1: TokenEntry**

Create `src/components/source/TokenEntry.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { setStoredSourceToken } from '@/lib/client/ws'

export const TokenEntry = ({ onSubmit }: { onSubmit: (t: string) => void }) => {
  const [token, setToken] = useState('')
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <form onSubmit={(e) => { e.preventDefault(); if (token.trim()) { setStoredSourceToken(token.trim()); onSubmit(token.trim()) } }}
        className="paper-card paper-grain" style={{ width: 360 }}>
        <div className="uc" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>▌ source token</div>
        <h2 style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 22 }}>
          Enter the token printed in your terminal.
        </h2>
        <input autoFocus value={token} onChange={(e) => setToken(e.target.value)}
          placeholder="a4f9-7c12"
          style={{ width: '100%', padding: '8px 10px', fontFamily: 'var(--mono-font)', fontSize: 14, background: 'transparent', border: '1px solid var(--ink-black)' }} />
        <button type="submit" className="uc"
          style={{ marginTop: 12, padding: '8px 14px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 11 }}>
          Continue
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: StartShowGesture**

Create `src/components/source/StartShowGesture.tsx`:
```tsx
'use client'
export const StartShowGesture = ({ onClick, label = 'Start show' }: { onClick: () => void; label?: string }) => (
  <button onClick={onClick}
    style={{
      position: 'fixed', inset: 0, width: '100%', height: '100%',
      background: 'var(--ink-black)', color: 'var(--paper-cream)',
      fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 64,
      letterSpacing: -1, cursor: 'pointer', border: 'none',
    }}>
    ▶ {label}
  </button>
)
```

- [ ] **Step 3: Commit**

```bash
git add src/components/source/TokenEntry.tsx src/components/source/StartShowGesture.tsx
git commit -m "feat(source): token entry + start show gesture"
```

---

### Task 33: VideoPlayer (mounts AudioGraph + handles src/refresh/heartbeat)

**Files:**
- Create: `src/components/source/VideoPlayer.tsx`

- [ ] **Step 1: Implement**

Create `src/components/source/VideoPlayer.tsx`:
```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { buildAudioGraph, type AudioGraph } from '@/lib/client/audio-graph'
import { setAudioGraph } from '@/lib/client/audio-graph-ref'
import type { Connection } from '@/lib/client/ws'
import { POSITION_HEARTBEAT_MS } from '@/lib/config'

export const VideoPlayer = ({ conn, sourceToken }: { conn: Connection; sourceToken: string }) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<AudioGraph | null>(null)
  const lastEpochRef = useRef<number>(-1)
  const [graphReady, setGraphReady] = useState(false)
  const player = conn.state?.player

  // Mount audio graph once. Only after it's ready do we tell the server we're ready.
  useEffect(() => {
    let cancelled = false
    if (!mountRef.current) return
    buildAudioGraph(mountRef.current)
      .then((g) => {
        if (cancelled) { g.destroy(); return }
        graphRef.current = g
        setAudioGraph(g)
        setGraphReady(true)
        // Now safe to announce readiness — server can auto-advance.
        conn.send({ type: 'source.ready', msgId: crypto.randomUUID(), sourceToken })
      })
      .catch((e) => {
        console.error('Audio graph failed', e)
        if (graphRef.current === null) setGraphReady(false)
      })
    return () => {
      cancelled = true
      setAudioGraph(null)
      graphRef.current?.destroy()
      graphRef.current = null
    }
  }, [conn, sourceToken])

  // Sync src and pitch with server-driven player state
  useEffect(() => {
    const g = graphRef.current
    if (!g || !player || !graphReady) return
    if (player.status === 'idle') {
      g.video.pause(); g.video.removeAttribute('src'); g.video.load()
      lastEpochRef.current = player.epoch
      return
    }
    g.setPitch(player.livePitch)
    if (player.epoch !== lastEpochRef.current) {
      lastEpochRef.current = player.epoch
      g.video.src = `/api/stream/${player.item.videoId}?e=${player.epoch}`
      // Project the resume target: server's last positionSec + wall-clock since update.
      const drift = (Date.now() - player.positionUpdatedAt) / 1000
      const target = Math.min(
        Math.max(0, player.positionSec + (player.status === 'playing' ? drift : 0)),
        Math.max(0, player.item.durationSec - 0.5),
      )
      g.video.currentTime = target
      g.video.play().catch((e) => {
        conn.send({ type: 'player.error', epoch: player.epoch, itemId: player.item.id, message: String(e) })
      })
    }
    if (player.status === 'paused') g.video.pause()
    if (player.status === 'playing' && g.video.paused) void g.video.play()
  }, [
    graphReady,
    player?.status,
    (player && 'epoch' in player) ? player.epoch : -1,
    (player && 'livePitch' in player) ? player.livePitch : 0,
  ])

  // Heartbeat
  useEffect(() => {
    const id = setInterval(() => {
      const g = graphRef.current
      const p = conn.state?.player
      if (!g || !p || p.status === 'idle') return
      conn.send({ type: 'player.position', epoch: p.epoch, positionSec: g.video.currentTime })
    }, POSITION_HEARTBEAT_MS)
    return () => clearInterval(id)
  }, [conn])

  // Ended event
  useEffect(() => {
    const g = graphRef.current
    if (!g) return
    const onEnded = () => {
      const p = conn.state?.player
      if (p && p.status !== 'idle') conn.send({ type: 'player.ended', epoch: p.epoch })
    }
    g.video.addEventListener('ended', onEnded)
    return () => g.video.removeEventListener('ended', onEnded)
  }, [conn, graphRef.current])

  return <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/source/VideoPlayer.tsx
git commit -m "feat(source): video player with audio graph + heartbeat"
```

---

### Task 34: QueueOverlay + QrPanel + KeyboardShortcuts

**Files:**
- Create: `src/components/source/QueueOverlay.tsx`
- Create: `src/components/source/QrPanel.tsx`
- Create: `src/components/source/KeyboardShortcuts.tsx`

- [ ] **Step 1: QrPanel**

Install qrcode browser bundle (already installed). Create `src/components/source/QrPanel.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export const QrPanel = () => {
  const [dataUrl, setDataUrl] = useState<string>('')
  useEffect(() => {
    QRCode.toDataURL(`http://${location.host}`, { margin: 1, width: 240 }).then(setDataUrl)
  }, [])
  if (!dataUrl) return null
  return (
    <div className="paper-card paper-grain" style={{ width: 240, textAlign: 'center' }}>
      <div className="uc" style={{ fontSize: 10 }}>scan to join</div>
      <img src={dataUrl} alt="QR" style={{ width: 200, height: 200 }} />
      <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>{location.host}</div>
    </div>
  )
}
```

- [ ] **Step 2: QueueOverlay**

Create `src/components/source/QueueOverlay.tsx`:
```tsx
'use client'
import { useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import { QrPanel } from './QrPanel'
import { getAudioGraph } from '@/lib/client/audio-graph-ref'

export const QueueOverlay = ({ conn }: { conn: Connection }) => {
  const [volume, setVolume] = useState(0.9)
  const s = conn.state
  if (!s) return null
  const p = s.player

  const skip = () => conn.send({ type: 'player.skip', msgId: crypto.randomUUID(), epoch: p.epoch })
  const prev = () => conn.send({ type: 'player.prev', msgId: crypto.randomUUID(), epoch: p.epoch })
  const shuffle = () => conn.send({ type: 'queue.shuffle', msgId: crypto.randomUUID() })
  const setLive = (sem: number) =>
    conn.send({ type: 'player.setLivePitch', msgId: crypto.randomUUID(), semitones: sem })
  const moveTop = (id: string) =>
    conn.send({ type: 'queue.move', msgId: crypto.randomUUID(), itemId: id, toIndex: 0 })
  const onVolume = (v: number) => {
    setVolume(v)
    getAudioGraph()?.setVolume(v)
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid',
      gridTemplateColumns: '1fr 260px', gridTemplateRows: '1fr auto',
      pointerEvents: 'none', padding: 24, gap: 16, color: 'var(--paper-cream)',
    }}>
      <div style={{ gridColumn: 2, gridRow: 1, pointerEvents: 'auto' }}><QrPanel /></div>

      <div style={{ gridColumn: '1 / span 2', gridRow: 2, pointerEvents: 'auto' }}>
        {p.status !== 'idle' && (
          <div className="paper-card paper-grain tape-strip" style={{ marginBottom: 12 }}>
            <div className="uc" style={{ fontSize: 10, color: 'var(--riso-pink)' }}>▌ now playing</div>
            <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 28 }}>{p.item.title}</div>
            <div className="uc" style={{ fontSize: 11 }}>{p.item.queuedBy.name} · key {p.livePitch >= 0 ? '+' : ''}{p.livePitch} · {Math.floor(p.positionSec / 60)}:{String(Math.floor(p.positionSec) % 60).padStart(2, '0')}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button onClick={() => setLive(p.livePitch - 1)} className="uc">−</button>
              <span className="hanko">{p.livePitch >= 0 ? `+${p.livePitch}` : p.livePitch}</span>
              <button onClick={() => setLive(p.livePitch + 1)} className="uc">+</button>
              <button onClick={prev} className="uc">⏮</button>
              <button onClick={skip} className="uc">⏭</button>
              <button onClick={shuffle} className="uc">🔀</button>
              <span className="uc" style={{ fontSize: 9, marginLeft: 12 }}>vol</span>
              <input
                type="range" min={0} max={1} step={0.01} value={volume}
                onChange={(e) => onVolume(Number(e.target.value))}
                style={{ width: 100 }}
              />
            </div>
          </div>
        )}

        <div className="uc" style={{ fontSize: 11 }}>setlist · {s.queue.length}</div>
        {s.queue.map((it, i) => (
          <div key={it.id} className="paper-card paper-grain" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              <span className="uc" style={{ fontSize: 9, marginRight: 8 }}>{String(i + 2).padStart(2, '0')}</span>
              <span style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 16 }}>{it.queuedBy.name} — {it.title}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="uc" onClick={() => moveTop(it.id)}>⤴</button>
              <button className="uc" onClick={() => conn.send({ type: 'queue.remove', msgId: crypto.randomUUID(), itemId: it.id })}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: KeyboardShortcuts**

Create `src/components/source/KeyboardShortcuts.tsx`:
```tsx
'use client'
import { useEffect } from 'react'
import type { Connection } from '@/lib/client/ws'

export const KeyboardShortcuts = ({ conn }: { conn: Connection }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = conn.state?.player
      if (!p) return
      if (e.code === 'Space') { e.preventDefault(); conn.send({ type: p.status === 'paused' ? 'player.play' : 'player.pause', msgId: crypto.randomUUID() }) }
      if (e.code === 'ArrowRight') conn.send({ type: 'player.skip', msgId: crypto.randomUUID(), epoch: p.epoch })
      if (e.code === 'ArrowLeft') conn.send({ type: 'player.prev', msgId: crypto.randomUUID(), epoch: p.epoch })
      if (e.code === 'ArrowUp' && p.status !== 'idle')
        conn.send({ type: 'player.setLivePitch', msgId: crypto.randomUUID(), semitones: p.livePitch + 1 })
      if (e.code === 'ArrowDown' && p.status !== 'idle')
        conn.send({ type: 'player.setLivePitch', msgId: crypto.randomUUID(), semitones: p.livePitch - 1 })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [conn])
  return null
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/source/QueueOverlay.tsx src/components/source/QrPanel.tsx src/components/source/KeyboardShortcuts.tsx
git commit -m "feat(source): queue overlay, qr, keyboard shortcuts"
```

---

### Task 35: Source page — assemble at `/source`

**Files:**
- Create: `src/app/source/page.tsx`

- [ ] **Step 1: Implement**

Create `src/app/source/page.tsx`:
```tsx
'use client'
import { useState, useEffect } from 'react'
import { TokenEntry } from '@/components/source/TokenEntry'
import { StartShowGesture } from '@/components/source/StartShowGesture'
import { VideoPlayer } from '@/components/source/VideoPlayer'
import { QueueOverlay } from '@/components/source/QueueOverlay'
import { KeyboardShortcuts } from '@/components/source/KeyboardShortcuts'
import { getStoredSourceToken, useConnection } from '@/lib/client/ws'

export default function Source() {
  const [token, setToken] = useState<string>('')
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setToken(getStoredSourceToken()) }, [])

  const conn = useConnection({ name: 'source', sourceToken: token || undefined })

  if (!token) return <TokenEntry onSubmit={setToken} />
  if (!unlocked) return <StartShowGesture onClick={() => setUnlocked(true)} />

  // Note: we DO NOT send `source.ready` here. VideoPlayer sends it after
  // the AudioContext is unlocked and the AudioGraph has finished mounting,
  // so the server only auto-advances once the source can actually play.
  return (
    <main style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--ink-black)' }}>
      <VideoPlayer conn={conn} sourceToken={token} />
      <QueueOverlay conn={conn} />
      <KeyboardShortcuts conn={conn} />
    </main>
  )
}
```

- [ ] **Step 2: Verify in browser (success-criteria smoke test)**

Run: `npm run dev`. In two browser windows:
1. `http://localhost:3000/source` — enter the token from the terminal banner; click Start show.
2. `http://192.168.x.x:3000/` (from a phone or another browser) — enter a name.

From window (2): search "bohemian rhapsody karaoke", pick a result, set pitch −2, Add. Within ~5s, video plays on window (1) with audio shifted down 2 semitones. Drag the live-pitch slider; key changes within 500ms.

Verify against `docs/superpowers/specs/2026-05-06-karaoke-app-design.md` §8 Success criteria 2–8.

Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/app/source/page.tsx
git commit -m "feat(source): assemble source page at /source"
```

---

## Phase 11 — Failure paths and final touches

### Task 36: AudioWorklet failure → bypass-with-toast

**Files:**
- Modify: `src/components/source/VideoPlayer.tsx` (replace the failure handling in the mount effect)
- Modify: `src/lib/client/audio-graph.ts` (export a no-pitch builder)

- [ ] **Step 1: Add a no-pitch fallback builder**

In `src/lib/client/audio-graph.ts`, add:
```ts
export const buildAudioGraphNoPitch = async (mountEl: HTMLElement): Promise<AudioGraph> => {
  const ctx = new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
  const video = document.createElement('video')
  video.playsInline = true
  video.style.width = '100%'; video.style.height = '100%'
  video.style.objectFit = 'contain'; video.style.background = 'black'
  mountEl.appendChild(video)
  const src = ctx.createMediaElementSource(video)
  const gain = ctx.createGain()
  src.connect(gain); gain.connect(ctx.destination)
  return {
    ctx, video,
    setPitch: () => {},
    setVolume: (v) => { gain.gain.value = Math.max(0, Math.min(1, v)) },
    bypassPitch: () => {},
    destroy: () => { try { ctx.close() } catch {} mountEl.removeChild(video) },
  }
}
```

- [ ] **Step 2: Use the fallback when worklet load fails**

In `VideoPlayer.tsx`, replace the mount effect with the worklet-then-bypass pattern. Update imports to include `buildAudioGraphNoPitch`. Note we still call `setAudioGraph(g)` and `source.ready` after either path resolves — the show must always be able to start, even without pitch.

```tsx
useEffect(() => {
  let cancelled = false
  if (!mountRef.current) return
  const tryWorklet = async (): Promise<{ g: AudioGraph; bypassed: boolean }> => {
    try {
      return { g: await buildAudioGraph(mountRef.current!), bypassed: false }
    } catch (e) {
      console.warn('Worklet failed, bypassing pitch', e)
      return { g: await buildAudioGraphNoPitch(mountRef.current!), bypassed: true }
    }
  }
  tryWorklet().then(({ g, bypassed }) => {
    if (cancelled) { g.destroy(); return }
    graphRef.current = g
    setAudioGraph(g)
    setGraphReady(true)
    conn.send({ type: 'source.ready', msgId: crypto.randomUUID(), sourceToken })
    if (bypassed) {
      // Inform everyone — server will broadcast as a toast.
      conn.send({
        type: 'player.error', epoch: 0, itemId: '',
        message: 'Pitch shift unavailable — playing original key',
      } as any)
    }
  })
  return () => {
    cancelled = true
    setAudioGraph(null)
    graphRef.current?.destroy()
    graphRef.current = null
  }
}, [conn, sourceToken])
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/client/audio-graph.ts src/components/source/VideoPlayer.tsx
git commit -m "feat(source): graceful bypass when audio worklet fails"
```

---

### Task 37: Idle-state Shimokita splash on `/source`

**Files:**
- Modify: `src/components/source/QueueOverlay.tsx` to render a splash when `player.status === 'idle' && queue.length === 0`

- [ ] **Step 1: Add splash branch**

In `QueueOverlay.tsx`, before the main `return`, add:
```tsx
if (s.player.status === 'idle' && s.queue.length === 0) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24, pointerEvents: 'auto' }}>
      <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 96, letterSpacing: -2 }}>下北沢</div>
      <div className="uc" style={{ fontSize: 14, color: 'var(--cigarette)' }}>house lights on — scan to add the first song</div>
      <QrPanel />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/source/QueueOverlay.tsx
git commit -m "feat(source): idle-state shimokita splash"
```

---

### Task 38: README quickstart

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Create `README.md`:
```markdown
# Karaoke

Local-LAN home karaoke web app.

## Requirements

- macOS with Homebrew
- Node.js ≥ 22
- `yt-dlp` (`brew install yt-dlp`) — tested with version range documented below

## Tested yt-dlp versions

`2026.04.x` and newer. If extraction fails, run:

```bash
brew upgrade yt-dlp
npm run check-ytdlp
```

## Quickstart

```bash
npm install
npm run check-ytdlp     # smoke test
npm run dev             # prints LAN URL, source token, QR
```

1. Open the printed URL on the MacBook (e.g. `http://localhost:3000/source`), paste the source token, click "▶ Start show".
2. Scan the QR with your phone or open the LAN URL on any device on the same WiFi.
3. Search, paste, queue, sing.

## Tech notes

See `docs/superpowers/specs/2026-05-06-karaoke-app-design.md` for the full design.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add quickstart readme"
```

---

## Phase 12 — Final smoke + push

### Task 39: Run all tests + manual end-to-end + push

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all green.

- [ ] **Step 2: Run smoke**

```bash
npm run check-ytdlp
```

Expected: PASS.

- [ ] **Step 3: Manual end-to-end against the spec's success criteria**

Spin up `npm run dev`. Walk through every numbered item in `docs/superpowers/specs/2026-05-06-karaoke-app-design.md` §8. Take notes on anything that doesn't behave per the spec; file as follow-up commits before pushing.

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Spec-coverage self-review (engineer reading: skip; this is for the author)

Mapping every spec section to the task that implements it:

- §1 Summary — covered as a whole.
- §2 Goals — Tasks 23–35 deliver MVP scope; out-of-scope items are not implemented.
- §3 Architecture — Task 20 (custom server + WS).
- §4.1 Format selection / Range / TTL refresh — Tasks 11, 19.
- §4.2 Playback graph — Task 31.
- §4.3 Pitch shifting + failure path — Task 31, 36.
- §4.4 Pitch state — Task 14, 17, 18, 22, 28.
- §4.5 Source-only player controls — Task 18, 34.
- §4.6 Source startup — token, gesture, unlock — Tasks 32, 35.
- §5.1 Server state types — Tasks 6, 17.
- §5.2 Identity flow — Task 22, 23.
- §5.3 WS protocol — Tasks 5, 18, 22.
- §5.4 Auto-advance + epoch — Tasks 14, 18.
- §5.5 Search and paste — Tasks 9, 10, 25, 27.
- §5.6 Failure modes / reconnect — Tasks 18, 19, 22, 36.
- §6 Surfaces — Tasks 23–29 (phone), 32–35, 37 (source).
- §7 Visual style — Task 21.
- §8 Success criteria — Task 35 verification + Task 39 end-to-end.
- §9 Open risks — Task 12 (`check-ytdlp`); LAN trust documented in README/spec.
