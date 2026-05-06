# Karaoke App — Design Spec

**Date:** 2026-05-06
**Status:** Approved (brainstorming complete; ready for implementation planning)
**Author:** Jonathan + Claude

---

## 1. Summary

A web app for home karaoke. The user's MacBook is the **source** — connected to a TV and speakers, it plays YouTube karaoke videos full-screen and owns the audio pipeline. Friends and family use their phones (any device on the same WiFi) to **search**, **paste YouTube links**, and **queue songs** with a pre-selected pitch shift. While their song plays, the queuer can adjust the pitch in real time from their phone. The source has full queue control: skip, previous, push-to-top, shuffle, master volume, pitch override.

Real (musical) pitch control — not the playback-rate "chipmunk" effect. Speed unchanged.

---

## 2. Goals and non-goals

### In scope (MVP)

1. Source page (`/source`) plays video full-screen on the TV with audio routed through Web Audio for pitch shifting.
2. Phone page (`/`) for guests: name flow, search, paste-URL, queue view, per-user pitch slider when their song plays.
3. Real-time queue + player sync over WebSocket. Server is single source of truth.
4. Source-only controls: skip, prev, push-to-top reorder, shuffle, pause/play, master volume, pitch override.
5. Pre-pitch on add. Live pitch by queuer or source.
6. QR-code join overlay on `/source`.
7. `yt-dlp` for both search (`ytsearch10:`) and stream-URL extraction; backend proxies the YouTube CDN bytes.
8. H1 Shimokitazawa Riso visual style across both surfaces.

### Out of scope (deferred)

- Persistent storage (DB)
- Multiple rooms / sessions
- Account login or auth
- Native mobile app
- Recording, scoring, mic input
- Cloud hosting (local-only on the MacBook)
- Robust handling of embed-blocked or geo-restricted videos beyond a "skip with toast" failure mode

---

## 3. System architecture

### Process model

A single Node process running a Next.js 16 App Router app with a custom `server.ts` that adds a WebSocket endpoint. One port (default 3000). Started with `npm run start` (or a one-click `.command` file that runs the same command).

### Surfaces

| Route | Device | Connects via |
|---|---|---|
| `/source` | MacBook (driving TV) | `http://localhost:3000` |
| `/` | Phones | `http://<lan-ip>:3000` |

### Why local-only is fine for AudioWorklet

Web Audio's `AudioWorklet` requires a *secure context* (HTTPS or `localhost`).
- The source is `localhost` → secure → AudioWorklet works.
- Phones don't run Web Audio at all — they just send commands over WebSocket. Plain `http://` over LAN is fine for them.

No HTTPS, certificates, or local-domain trickery required.

### Backend modules (single Node process)

1. **Next.js HTTP** — pages, API routes, static assets.
2. **Media proxy** (`/api/stream/[videoId]`) — fetches YouTube CDN URL via `yt-dlp`, pipes bytes through, supports `Range` headers for seeking and progressive playback.
3. **WebSocket server** — attached to the same HTTP server via the `ws` library. One channel for all clients; no rooms (MVP).
4. **`yt-dlp` worker** — child-process wrapper exposing `searchYouTube(query)` and `getStreamUrls(videoId)`. URLs cached per `videoId` until expiry.
5. **In-memory state** — queue, history, users, player. No database. State dies on restart (acceptable for a party).

### Tech stack

- Next.js 16 (App Router), React 19, TypeScript strict mode
- `ws` (raw WebSockets — we control the protocol; small surface area)
- `@soundtouchjs/audio-worklet` for pitch shifting
- `yt-dlp` binary (assumed installed via Homebrew — startup script checks)
- Tailwind CSS for utility; custom CSS for riso textures and tape/hanko details

---

## 4. Audio + video pipeline

The technically critical part. Three sub-problems: getting bytes, playing them, bending pitch independent of speed.

### 4.1 Getting bytes

YouTube CDN URLs from `yt-dlp` are short-lived and IP-locked. Browsers cannot always fetch them directly (CORS, user-agent checks). We proxy:

```
<video src="http://localhost:3000/api/stream/{videoId}">
                          │
                          ▼
        Backend /api/stream/[videoId]:
          1. yt-dlp -f "best[ext=mp4]/best" -g {videoId}   (memo'd per video)
          2. Open upstream connection, pipe bytes to response
          3. Pass through `Range` headers to upstream
```

We use **muxed MP4** (combined video + audio in one file) so we don't have to sync two streams. Quality is typically 720p with AAC audio — fine for karaoke.

**Pre-fetch:** when a song starts, the backend kicks off `yt-dlp` for the *next* queue item so its URL is hot when needed. Prevents a 1–3s gap between songs.

**Refresh:** if the proxy errors mid-stream (URL expired), source records `currentTime`, asks server for a fresh URL, swaps `<video>.src`, seeks back. AudioWorklet is unaffected (it sits on the audio graph, not the element). Pitch preserved.

### 4.2 Playback graph

```
<video> ──▶ MediaElementAudioSourceNode
              ──▶ AudioWorkletNode (SoundTouchJS, pitch only)
                    ──▶ GainNode (master volume — source only)
                          ──▶ AudioContext.destination
```

Connecting the video into a `MediaElementAudioSourceNode` redirects its audio output into the graph; the element does not play to the device directly. One audio path; one sync point (the video element). Lyrics show on screen via the same element.

### 4.3 Pitch shifting

- **Library:** `@soundtouchjs/audio-worklet`. Real-time WSOLA pitch shifter; ~50ms latency.
- **Time-stretch is locked off.** Pitch only. No speed change.
- **Range:** ±6 semitones, integer steps. Quality holds well in this range.
- **Granularity:** integer semitones (one step = one half-tone).

### 4.4 Pitch state

Three values exist for any song:

- `prePitch` — set when adding to queue, stored on the queue item, applied at song start.
- `livePitch` — currently applied pitch during playback; initialized from `prePitch` when the song starts.
- Either the **queuer** or the **source** can change `livePitch` mid-song.

Server is the source of truth for `livePitch`. Updates flow:

```
Phone slider ─set─▶ WS server ─broadcast─▶ Source (applies to worklet)
                                       └──▶ All phones (UI updates)

Source slider ────────────────────▶  same path
```

When the next song starts: `livePitch = newItem.prePitch`.

### 4.5 Source-only player controls

- **Skip / Prev** — skip pushes current to history and pops next; prev pulls last from history into the queue front.
- **Pause / Play** — standard.
- **Master volume** — `GainNode` between worklet and destination, 0–1.
- **Pitch override** — source's slider always works, even on someone else's song.

---

## 5. Realtime sync and data model

### 5.1 Server state (in-memory)

```ts
type SessionId = string  // crypto.randomUUID() per device, stored in phone localStorage

type User = {
  sessionId: SessionId
  name: string
  joinedAt: number
}

type QueueItem = {
  id: string                                    // server-assigned
  videoId: string                               // YouTube video id
  title: string
  thumbnail: string
  durationSec: number
  queuedBy: { sessionId: SessionId, name: string }   // snapshot — survives if user leaves
  prePitch: number                              // -6..+6, default 0
  addedAt: number
}

type PlayerState =
  | { status: 'idle' }
  | {
      status: 'playing' | 'paused'
      item: QueueItem
      livePitch: number                         // -6..+6
      positionSec: number                       // last-reported playhead from source
      positionUpdatedAt: number                 // server clock when posted
    }

type ServerState = {
  users: Map<SessionId, User>
  queue: QueueItem[]                            // index 0 = up next
  history: QueueItem[]                          // index 0 = most recent
  player: PlayerState
  sourceConnected: boolean
}
```

`queuedBy.name` is snapshotted into the queue item so a guest leaving the WiFi does not erase attribution.

### 5.2 Identity flow

1. Phone hits `/`. Read `sessionId` and `name` from localStorage.
2. **No session:** show name input → `POST /api/join { name }` → server creates a `User`, returns `sessionId` → phone stores both.
3. **Has session:** open WebSocket with `?sessionId=...`. Server registers/refreshes the user.
4. **Pitch ownership rule:** phone shows the live-pitch slider only when `player.item.queuedBy.sessionId === mySessionId`. Source always shows it.

No accounts, no passwords. URL + WiFi is the access control. Home-party trust model.

### 5.3 WebSocket protocol

Every message is `{ type, ...payload }`. Server validates and rejects malformed or unauthorized messages.

**Client → Server:**

| `type` | Payload | Allowed |
|---|---|---|
| `join` | `{ sessionId, name }` | Anyone |
| `queue.add` | `{ videoId, prePitch }` | Anyone |
| `queue.remove` | `{ itemId }` | Source, or queuer of that item |
| `queue.move` | `{ itemId, toIndex }` | Source only |
| `queue.shuffle` | `{}` | Source only |
| `player.skip` | `{}` | Source only |
| `player.prev` | `{}` | Source only |
| `player.pause` | `{}` | Source only |
| `player.play` | `{}` | Source only |
| `player.setLivePitch` | `{ semitones }` | Source, or queuer of current song |
| `player.setPrePitch` | `{ itemId, semitones }` | Source, or queuer of that item |
| `player.setVolume` | `{ volume }` | Source only |
| `player.position` | `{ positionSec }` | Source only — heartbeat (1Hz) |
| `player.ended` | `{}` | Source only — triggers auto-advance |
| `player.error` | `{ itemId, message }` | Source only — triggers skip-with-toast |
| `search` | `{ query, requestId }` | Anyone |

**Server → Client:**

| `type` | Payload |
|---|---|
| `state.full` | Full `ServerState` (sent on connect and after large changes) |
| `state.queue` | `{ queue, history }` |
| `state.player` | `PlayerState` |
| `search.results` | `{ requestId, results: SearchResult[] }` |
| `error` | `{ code, message }` |
| `toast` | `{ level, message }` (e.g. "Couldn't load *Title*") |

A "source token" is established when the first client connects to `/source`. Subsequent `/source` connections take over the token (the previous source disconnects gracefully). The token authorizes source-only actions.

### 5.4 Auto-advance

- When `player.status === 'idle'` and `queue.length > 0` → server pops `queue[0]`, sets `PlayerState` to `playing` with `livePitch = prePitch`, broadcasts.
- Source receives `state.player`, loads the stream, plays, sends `player.position` heartbeats.
- On `player.ended`: server pushes current item to `history`, pops next, broadcasts.
- On `player.error`: server pushes failed item to `history` (so prev still works) with a flag, broadcasts a toast, advances.

### 5.5 Search and paste

`queue.add` accepts only `{ videoId, prePitch }`. The server resolves `title`, `thumbnail`, and `durationSec` server-side (via `yt-dlp`) when handling the message and only then constructs the `QueueItem` and broadcasts. Phones use `/api/meta/:videoId` purely for the *preview UX* before adding.

- **Paste tab:** regex extracts `videoId` from a YouTube URL; phone calls `/api/meta/:videoId` (yt-dlp metadata) for a preview; user picks pre-pitch; "Add to queue" sends `queue.add`.
- **Search tab:** phone calls `/api/search?q=...` (yt-dlp `ytsearch10:`); user taps a result; same preview sheet appears.

### 5.6 Failure modes

- **yt-dlp fails for a video:** source posts `player.error`; server skips item with a toast.
- **Source disconnects mid-song:** player state freezes; phones show "Source offline." On reconnect, source resumes from the last known `positionSec`.
- **Phone disconnects:** irrelevant to playback. Their queued items still show their snapshotted name.

---

## 6. Surfaces (screens)

### 6.1 Source — `/source`

Single full-screen page. Video fills the viewport. Queue and controls are an overlay that fades in on cursor move and out after 3 seconds of inactivity.

```
┌────────────────────────────────────────────────────┐
│                                                    │
│           ▶  YouTube karaoke video                 │
│              (lyrics on screen)                    │
│                                                    │
│   ┌──────────────────────────────────┐  ┌────────┐ │
│   │ NOW: Bohemian Rhapsody           │  │  QR    │ │
│   │ Sarah  ──  KEY −2  ──  1:42      │  │  scan  │ │
│   │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━     │  │  to    │ │
│   │ [pitch −][ −2 ][+]  [⏮ ⏸ ⏭] [🔀] │  │  join  │ │
│   └──────────────────────────────────┘  └────────┘ │
│                                                    │
│   SETLIST  ━━━━━━━━━━━━━━━━━                       │
│   02. Mike — Don't Stop Believin'    [⤴][✕]       │
│   03. Aria — Wonderwall              [⤴][✕]       │
│   04. Jon — Africa                   [⤴][✕]       │
└────────────────────────────────────────────────────┘
```

**Idle state** (empty queue): Shimokitazawa "house lights on" splash with the QR code centered and "scan to add the first song" caption.

**Keyboard shortcuts**: `Space` toggle play/pause, `→` skip, `←` prev, `↑/↓` adjust pitch ±1.

### 6.2 Phone — `/`

Three tabs at the top: **QUEUE** · **SEARCH** · **PASTE**. The bottom of the screen reserved for a "your song is up" sheet that takes over when it's the user's turn.

**Default (any tab):**

```
┌──────────────────────┐
│  ●  Sarah · ⚙        │
├──────────────────────┤
│ [QUEUE] SEARCH PASTE │
├──────────────────────┤
│ NOW PLAYING          │
│ Bohemian Rhapsody    │
│ Sarah · key −2       │   <- inline slider when it's MY song
│ ━━━━━━━━━━━━━        │
├──────────────────────┤
│ UP NEXT · 4          │
│ 02 Mike · DSB     ✕  │   <- ✕ shown only on own items
│ 03 Aria · Wonder     │
│ 04 You  · Africa  ✕  │
└──────────────────────┘
```

**Search tab:** input → results (yt-dlp `ytsearch10:`). Tapping a result opens an "Add to queue" sheet with a pitch slider (`−6 … 0 … +6`) and the "Add" button.

**Paste tab:** textarea + "Resolve" button → same preview sheet.

**Your-song-is-up takeover** (when the current song's queuer matches `mySessionId`):

```
┌──────────────────────────────┐
│ ▌ YOU'RE UP                   │
│ Bohemian Rhapsody              │
│                                │
│ KEY     −6 ──●──── +6          │
│              −2                │
│                                │
│ Source has override            │
└──────────────────────────────┘
```

The slider is the focus. Big, draggable, optimistic UI with server reconciliation.

---

## 7. Visual style — H1 Shimokitazawa Riso

Pitch-black walls, riso-print pink + teal mottle, cigarette-cream paper, hanko-red stamp accents. Setlist as taped paper. Bilingual JP/EN labeling on the source page.

### Palette

```css
--ink-black:    #0a0808   /* venue walls */
--ink-deep:     #1a1410   /* secondary surfaces */
--paper-cream:  #fff8e0   /* taped paper, primary text-on-dark */
--riso-pink:    #ff4d8d   /* riso ink 1 */
--riso-teal:    #4dffe5   /* riso ink 2 */
--cigarette:    #d4a847   /* warm yellow accent */
--hanko-red:    #c1272d   /* stamp red */
--ink-muted:    #6a4818   /* faded text-on-cream */
```

### Type stack

- **Display** (titles, song names): a serif with weight — Crimson Pro 900 italic, fallback Georgia.
- **UI / labels / monospace**: JetBrains Mono or IBM Plex Mono.
- **All-caps labels**: `letter-spacing: 0.2em`.

### Texture system

1. **Riso noise** — fixed-position pseudo-element with two large radial gradients (pink + teal), `mix-blend-mode: screen`, low opacity. No image asset.
2. **Paper grain** — `radial-gradient(circle, rgba(0,0,0,0.04) 0.5px, transparent 1px) 0 0 / 3px 3px` over cream surfaces.
3. **Tape strip** — thin yellow rectangle pseudo-element, `transform: rotate(-2deg)`, on top edge of cream "paper" cards only.
4. **Hanko stamp** — a small red-bordered square containing 印 or a number, slight rotation; used as a status indicator (current song, queue position).
5. **Slight rotations** — paper cards rotated `±0.5deg`. Restraint: not every element.

### Component style notes

- Song-row in queue = mini ticket-stub card (cream, mono number, alternating slight rotation).
- Pitch slider = horizontal track with a hanko-red knob; current value shown as a hanko stamp.
- Play / skip icons = monospace glyphs (`▶ ⏭ ⏮ ⏸`), not material icons.
- "LIVE" indicator = pink mono text with subtle flicker animation.

---

## 8. Success criteria

The app is "done" for v1 when, on a freshly cloned repo on the user's MacBook:

1. `brew install yt-dlp` → `npm install` → `npm run start` prints a LAN URL and a QR code.
2. From a phone on the same WiFi, scanning the QR opens the app, asks for a name, and shows an empty queue.
3. Searching "bohemian rhapsody karaoke" returns at least 5 plausible results within 5 seconds.
4. Adding a song with pre-pitch −2 makes the song play on the MacBook with audio shifted down 2 semitones, lyrics visible, no audible speed change.
5. With the song playing, dragging the queuer's pitch slider to +1 changes the audio in <500 ms with no glitch.
6. A second phone joining and adding their own song shows up in the queue with their name.
7. From `/source`, "skip" advances; "prev" returns to the just-played song.
8. Closing both phone browsers does not break playback or the queue.

---

## 9. Open risks

- **YouTube format brittleness.** `yt-dlp` is a moving target; a YouTube change could break extraction. We pin a known-good `yt-dlp` version via Homebrew and provide an `npm run update-ytdlp` script.
- **AudioWorklet quality at extreme pitches.** SoundTouch quality holds at ±6 semitones; degrades past ±8. We cap at ±6 in the UI.
- **Embed-blocked / DRM videos.** Some music labels block extraction; the app skips with a toast — we don't attempt workarounds.
- **No persistence.** Restarting the server clears the queue. Acceptable for parties; a future iteration could add a tiny SQLite store.
