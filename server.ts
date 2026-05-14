import { createServer } from 'node:http'
import { parse } from 'node:url'
import next from 'next'
import { WebSocketServer } from 'ws'
import { randomBytes } from 'node:crypto'
import qrcode from 'qrcode'
import os from 'node:os'
import { PORT } from './src/lib/config'
import { Store } from './src/lib/server/store'
import { Dispatcher, createIdempotencyState, type IO } from './src/lib/server/dispatch'
import type { ClientMessage, ServerMessage } from './src/lib/types/protocol'
import { log } from './src/lib/log'
import { runYtDlp } from './src/lib/ytdlp/runner'

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const SOURCE_TOKEN =
  process.env.SOURCE_TOKEN ??
  Array.from(randomBytes(2)).map((b) => b.toString(16).padStart(2, '0')).join('') +
  '-' +
  Array.from(randomBytes(2)).map((b) => b.toString(16).padStart(2, '0')).join('')

const store = new Store(SOURCE_TOKEN)
// Shared idempotency state — must outlive any single socket so reconnects honor msgId dedup.
const idem = createIdempotencyState()

type ClientCtx = {
  ws: import('ws').WebSocket
  sessionId: string
  isSource: boolean
  isLocalhost: boolean
}

// Loopback peers are the host machine itself. We trust them as source authority
// without a token, so the user doesn't have to type one to claim the TV display.
const LOOPBACK_ADDRS = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1'])
const isLoopback = (addr?: string) => !!addr && LOOPBACK_ADDRS.has(addr)

const clients = new Set<ClientCtx>()

const broadcast = (msg: ServerMessage) => {
  const data = JSON.stringify(msg)
  for (const c of clients) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(data)
  }
}

// We rebuild a per-client IO so `send` knows which socket to use.
const ioFor = (c: ClientCtx): IO => ({
  send: (msg) => c.ws.send(JSON.stringify(msg)),
  broadcast,
})

const dispatcherFor = (c: ClientCtx) => new Dispatcher(store, ioFor(c), idem)

const lanIp = (): string => {
  const ifs = os.networkInterfaces()
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address
    }
  }
  return '127.0.0.1'
}

const checkYtDlp = async () => {
  try {
    const v = await runYtDlp(['--version'], { timeoutMs: 4000 })
    log('info', `yt-dlp ready: ${v.trim()}`)
  } catch {
    log('warn', 'yt-dlp not found on PATH — search and stream extraction will fail. Install with `brew install yt-dlp`.')
  }
}

const printBanner = async () => {
  const url = `http://${lanIp()}:${PORT}`
  const qr = await qrcode.toString(url, { type: 'terminal', small: true })
  console.log('')
  console.log('  Karaoke server running')
  console.log(`  ${url}`)
  console.log('')
  console.log(qr)
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res, parse(req.url ?? '/', true)))
  // noServer: we manually route upgrades so Turbopack HMR (/_next/webpack-hmr)
  // can pass through to Next's own upgrade handler.
  const wss = new WebSocketServer({ noServer: true })
  const nextUpgrade = app.getUpgradeHandler()

  server.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '/').split('?')[0]
    if (path === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req))
    } else {
      void nextUpgrade(req, socket, head)
    }
  })

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/ws', 'http://x')
    const sessionId = url.searchParams.get('sessionId') ?? randomBytes(8).toString('hex')
    const localhost = isLoopback(req.socket.remoteAddress ?? undefined)
    const ctx: ClientCtx = { ws, sessionId, isSource: false, isLocalhost: localhost }
    clients.add(ctx)
    const d = dispatcherFor(ctx)

    // Initial state
    ws.send(JSON.stringify({ type: 'state.full', state: store.snapshot() } as ServerMessage))

    ws.on('message', async (raw) => {
      let msg: ClientMessage
      try { msg = JSON.parse(String(raw)) } catch { return }
      if (msg.type === 'join') {
        // Localhost is auto-trusted (the MacBook running this server IS the source).
        // Non-localhost peers must still present the source token to claim authority.
        if (ctx.isLocalhost) {
          if (!ctx.isSource) {
            ctx.isSource = true
            store.setSourceConnected(true)
          }
        } else if (msg.sourceToken !== undefined) {
          if (store.verifySourceToken(msg.sourceToken)) {
            ctx.isSource = true
            store.setSourceConnected(true)
          } else {
            ws.send(JSON.stringify({ type: 'toast', level: 'warn', message: 'Invalid source token' } as ServerMessage))
          }
        }
      }
      try { await d.handle({ sessionId: ctx.sessionId, isSource: ctx.isSource, isLocalhost: ctx.isLocalhost }, msg) }
      catch (e) { log('warn', 'dispatcher error', { e: String(e) }) }
    })

    ws.on('close', () => {
      clients.delete(ctx)
      if (ctx.isSource) {
        // Round-7 #2: stale-close guard. If a *newer* source ws already
        // claimed authority (e.g. host hit Cmd-R, the close for the OLD
        // socket landed AFTER the new socket joined), don't clobber the
        // freshly-set connection flags. Only clear if no other client
        // currently holds isSource.
        let stillHaveSource = false
        for (const c of clients) {
          if (c.isSource) { stillHaveSource = true; break }
        }
        if (!stillHaveSource) {
          store.setSourceConnected(false)
          store.setSourceReady(false)
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
    void checkYtDlp()
  })
})
