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
