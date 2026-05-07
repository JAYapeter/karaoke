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

YouTube CDN URLs from `yt-dlp` are short-lived, IP-locked, and require specific request headers (User-Agent, sometimes cookies). Browsers cannot fetch them directly. The backend proxies all bytes.

> **Hard rule — same-origin only.** The `<video>` element must only ever see URLs on our own origin (`http://localhost:3000` for source, `http://<lan-ip>:3000` for any other client). **Never** issue a 3xx redirect to a YouTube CDN URL or expose the upstream URL to the client. `MediaElementAudioSourceNode` outputs **silence** if the underlying media is cross-origin without permissive CORS headers; we side-step that entirely by keeping bytes on our origin.

```
<video src="http://localhost:3000/api/stream/{videoId}">
                          │
                          ▼
        Backend /api/stream/[videoId]:
          1. Resolve format (see "Format selection"); cache per videoId
          2. Fetch upstream with the same headers yt-dlp used (UA, cookies if any)
          3. Pipe bytes to client
          4. Honor Range / 206 / Content-Range (see "Range semantics")
          5. On upstream 403/410 (URL expired) → re-resolve and resume transparently
```

#### Format selection

A single `-f` selector is brittle (YouTube progressive MP4 is often capped at 360p; format 22 is unreliable). The proxy uses an ordered policy:

1. **Preferred** — muxed progressive MP4, H.264 + AAC, ≤720p:
   `best[ext=mp4][vcodec^=avc1][acodec^=mp4a][height<=720]`
2. **Fallback A** — any progressive MP4 with audio: `best[ext=mp4][acodec!=none]`
3. **Fallback B** — any progressive container with both tracks: `best[acodec!=none][vcodec!=none]`
4. **Reject** — if only DASH-only formats exist, fail with `player.error` and a toast.

The selector list lives in a single config array so an extractor change can be patched without code edits. **MSE-based DASH assembly is explicitly out of scope for MVP** — we accept the ≤720p quality ceiling that progressive formats imply.

#### Range semantics

The proxy supports HTTP `Range` to enable seeking and progressive playback:

- Pass `Range` through to upstream; relay `206 Partial Content` and `Content-Range` verbatim.
- If client requests an unsatisfiable range, return `416`.
- If upstream lacks Range support for a given format, fall back to streaming from byte 0 (slow seeks become full restarts; acceptable for MVP).
- On upstream 5xx mid-range, drop the connection — client retries; proxy re-resolves the URL if needed.

#### URL lifecycle

Resolved URLs carry a TTL in their query string (typically ~6 hours). Proxy caches `(videoId → { url, expiresAt, headers })` per-process and:

- **Proactively re-resolves** when `expiresAt − now() < 5 min`, before the client hits an error.
- On any upstream `403`/`410`, evicts the entry and re-resolves once (single retry budget per request).

#### Pre-fetch

When a song starts, the backend kicks off `yt-dlp` resolution for the *next* queue item. Prevents the 1–3s stall between songs. No crossfade in MVP — the next song just starts.

#### Mid-song URL refresh

If the proxy can't recover from an upstream failure, it closes the response. Source then records `<video>.currentTime`, sets `<video>.src` to the same `/api/stream/...` URL with a cache-busting query param, and seeks back. AudioWorklet sits on the graph (not the element) and is unaffected; pitch preserved.

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
- **Failure path:** if the worklet module fails to load, `AudioContext` stays suspended >5 s, or the worklet reports persistent CPU overload, the source bypasses the worklet (video element plays directly to the audio device) and emits a toast: *"Pitch shift unavailable — playing at original key."* The next song retries the worklet from a clean state. The show continues either way.

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

### 4.6 Source startup — token, gesture, and unlock

Two things must happen before audio can play, both on the source device only:

1. **Source token** — when the server starts, it generates and prints a short token to the terminal:
   ```
   Karaoke server running at http://192.168.1.42:3000
   Source token:  a4f9-7c12   (enter once on the source device)
   ```
   `/source` displays a token field on first load. The entered token is stored in `localStorage` and sent on the WS `join` message; subsequent loads skip this step. The token authorizes source-only WS messages. **Without it, a phone that accidentally navigates to `/source` cannot seize the show.**

2. **User gesture** — `AudioContext` and `<video>.play()` cannot start without a user gesture. After token entry, `/source` shows a full-screen "▶ Start show" button. On click:
   1. Construct `AudioContext`; load the SoundTouch worklet module.
   2. Resume the context.
   3. Pre-create the `<video>` element and wire it into the audio graph.
   4. Send WS `source.ready { sourceToken }`. Server sets `sourceReady: true` and broadcasts; auto-advance and pre-fetch begin.

If the source page is reloaded mid-party, the token is remembered, but a "▶ Resume show" gesture is required again. The queue and history persist across the reload (server is the source of truth).

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
  | { status: 'idle', epoch: number }
  | {
      status: 'playing' | 'paused'
      epoch: number                             // monotonic; increments on every transition
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
  sourceReady: boolean                          // source has unlocked AudioContext
  sourceToken: string                           // generated on server startup
}
```

`queuedBy.name` is snapshotted into the queue item so a guest leaving the WiFi does not erase attribution.

### 5.2 Identity flow

All control plane is over WebSocket. There is no `POST /api/join`; HTTP routes are limited to media plane (`/api/stream/:videoId`) and the static page bundle.

1. Phone hits `/`. Read `sessionId` and `name` from `localStorage`.
2. **No session:** show name input. Phone generates `sessionId` via `crypto.randomUUID()`. Stores both.
3. **Open WebSocket** with `?sessionId=…`. First message is `join { sessionId, name, sourceToken? }`. Server registers or refreshes the user.
4. **Source claim:** the source device sends `sourceToken` on `join`. Server matches it against the per-startup `sourceToken`; on success, that connection is flagged as the source for source-only authority.
5. **Pitch ownership rule:** phone shows the live-pitch slider only when `player.item.queuedBy.sessionId === mySessionId`. Source always shows it.

**Trust model.** Session IDs are client-generated and are *not* a security boundary; on a plain HTTP LAN connection a malicious LAN actor can spoof any sessionId. This is acceptable for a home-party app — everyone on the WiFi is trusted. The source token prevents accidental source hijack but is also not a security boundary against a determined attacker on the same WiFi.

### 5.3 WebSocket protocol

Every message is `{ type, ...payload }`. Mutating client→server messages carry a `msgId` (client-generated UUID). The server replies to each with `state.ack { msgId, ok, error? }` and broadcasts the resulting state delta. **The server keeps the most recent 100 `msgId`s per session** and is idempotent on replay: an already-applied `msgId` returns the cached `ack` without re-doing the action. Reconnect-retries can therefore safely re-send any in-flight mutation.

Source-only messages (player control + queue mutations beyond the queuer's own item) require the connection to have been flagged as the source via the source-token claim in `join`.

**Client → Server (mutating — carry `msgId`):**

| `type` | Payload | Allowed |
|---|---|---|
| `queue.add` | `{ msgId, videoId, prePitch }` | Anyone |
| `queue.remove` | `{ msgId, itemId }` | Source, or queuer of that item |
| `queue.move` | `{ msgId, itemId, toIndex }` | Source only |
| `queue.shuffle` | `{ msgId }` | Source only |
| `player.skip` | `{ msgId, epoch }` | Source only |
| `player.prev` | `{ msgId, epoch }` | Source only |
| `player.pause` | `{ msgId }` | Source only |
| `player.play` | `{ msgId }` | Source only |
| `player.setLivePitch` | `{ msgId, semitones }` | Source, or queuer of current song |
| `player.setPrePitch` | `{ msgId, itemId, semitones }` | Source, or queuer of that item |
| `player.setVolume` | `{ msgId, volume }` | Source only |

**Client → Server (non-mutating — carry `msgId` for response correlation):**

| `type` | Payload | Allowed |
|---|---|---|
| `join` | `{ msgId, sessionId, name, sourceToken? }` | First message on every connection |
| `source.ready` | `{ msgId, sourceToken }` | After AudioContext unlock on source |
| `search` | `{ msgId, query }` | Anyone |
| `meta.fetch` | `{ msgId, videoId }` | Anyone |

**Client → Server (source-emitted events — carry `epoch`, no `msgId`):**

| `type` | Payload | Allowed |
|---|---|---|
| `player.position` | `{ epoch, positionSec }` | Source only — heartbeat (1 Hz) |
| `player.ended` | `{ epoch }` | Source only — triggers auto-advance |
| `player.error` | `{ epoch, itemId, message }` | Source only — triggers skip-with-toast |

These events are **discarded by the server if `epoch ≠ player.epoch`**, so a stale `player.ended` for an already-skipped song is a no-op. (See §5.4.)

**Server → Client:**

| `type` | Payload |
|---|---|
| `state.full` | Full `ServerState` (sent on connect and after large changes) |
| `state.queue` | `{ queue, history }` |
| `state.player` | `PlayerState` |
| `state.ack` | `{ msgId, ok: boolean, error?: string }` |
| `search.results` | `{ msgId, results: SearchResult[] }` |
| `meta.result` | `{ msgId, videoId, title, thumbnail, durationSec }` |
| `error` | `{ code, message }` |
| `toast` | `{ level, message }` (e.g. "Couldn't load *Title*") |

### 5.4 Auto-advance and the playback epoch

Every player transition increments `player.epoch` (start → +1, end → +1, skip → +1, prev → +1, error → +1). The epoch makes transitions idempotent and forms the contract between server and source.

- When `player.status === 'idle'` and `queue.length > 0` and `sourceReady === true` → server pops `queue[0]`, increments epoch, sets `PlayerState` to `playing` with `livePitch = item.prePitch`, broadcasts.
- Source receives `state.player`, remembers the new epoch, loads the stream, plays, and tags every `player.position` / `player.ended` / `player.error` event with that epoch.
- On `player.ended` (with current epoch): server pushes current to `history`, increments epoch, pops next, broadcasts.
- On `player.ended` (with stale epoch): **discarded silently** — the song was already skipped/replaced.
- On `player.error` (current epoch): server pushes the failed item to `history` flagged as errored (so `prev` can still navigate over it), increments epoch, advances, broadcasts a toast.
- On `player.skip` / `player.prev`: server increments epoch, mutates queue/history, broadcasts. The next `state.player` carries the new epoch; source updates its local copy and ignores any in-flight events from the old epoch.

This eliminates the double-advance race when a manual skip and a `player.ended` arrive close together.

### 5.5 Search and paste

All control plane is over WebSocket — there is no `/api/search` or `/api/meta` HTTP endpoint. The only HTTP route is `/api/stream/:videoId` (media plane).

- **Paste tab:** regex extracts `videoId` from a YouTube URL; phone sends `meta.fetch { msgId, videoId }`; server replies `meta.result { msgId, ... }`; user picks pre-pitch; "Add to queue" sends `queue.add`.
- **Search tab:** phone sends `search { msgId, query }`; server replies `search.results { msgId, results }`; user taps a result; same preview sheet appears.

`queue.add` carries only `{ videoId, prePitch }`. The server re-resolves metadata at add time (with a 5-minute in-process cache) before constructing the `QueueItem` and broadcasting. Phones never authoritatively supply queue-item metadata.

### 5.6 Failure modes and reconnect rules

**yt-dlp resolution fails for a video:** source posts `player.error` (with current epoch); server skips with a toast.

**Source disconnects mid-song:** server clears `sourceConnected` and `sourceReady`; player state remains; phones show "Source offline." Auto-advance halts until the source comes back. On reconnect:

1. Server sends `state.full` (which includes current `player` and `epoch`).
2. Source compares the received `epoch` to its last known epoch:
   - **Same epoch, `status === 'playing'`:** resume the *same item* at `positionSec` (server-side `positionSec + (now − positionUpdatedAt)` projection is used as the seek target, capped at `durationSec`).
   - **Higher epoch:** the show advanced while source was offline (e.g. another source claimed and yielded, or a manual transition was issued). Load whatever the new `player.item` is and start from `positionSec` (typically 0).
   - **`status === 'idle' | 'paused'`:** wait for the next transition.
3. Source then re-runs the gesture-unlock if the page was reloaded (see §4.6); otherwise resumes immediately. Server only marks `sourceReady = true` after `source.ready` is received.

**Phone disconnects:** irrelevant to playback. Their queued items still show the snapshotted name. On reconnect, the phone re-sends `join`; any in-flight mutating message can be safely re-sent (server dedupes on `msgId`).

**Source-token mismatch on `join`:** server ignores the `sourceToken` field and treats the connection as a regular phone. Toast: *"Invalid source token."*

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

**Source startup states** (§4.6):
- **Token entry** (first load only): centered card with a "source token" input, the prompt *"Enter the token printed in your terminal."* Stored in `localStorage` after acceptance.
- **Gesture unlock**: full-screen "▶ Start show" / "▶ Resume show" button. Tapping unlocks the AudioContext and sends `source.ready`.

**Idle state** (post-unlock, empty queue): Shimokitazawa "house lights on" splash with the QR code centered and "scan to add the first song" caption.

**Keyboard shortcuts** (post-unlock): `Space` toggle play/pause, `→` skip, `←` prev, `↑/↓` adjust pitch ±1.

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

1. `brew install yt-dlp` → `npm install` → `npm run start` prints a LAN URL, a QR code, and a source token.
2. Opening `/source` on the MacBook prompts for the token; after entering it once, the source remembers it. Clicking "▶ Start show" unlocks audio.
3. From a phone on the same WiFi, scanning the QR opens the app, asks for a name, and shows an empty queue.
4. Searching "bohemian rhapsody karaoke" returns at least 5 plausible results within 5 seconds.
5. Adding a song with pre-pitch −2 makes the song play on the MacBook with audio shifted down 2 semitones, lyrics visible, no audible speed change.
6. With the song playing, dragging the queuer's pitch slider to +1 changes the audio in <500 ms with no glitch.
7. A second phone joining and adding their own song shows up in the queue with their name.
8. From `/source`, "skip" advances; "prev" returns to the just-played song. Pressing skip while a `player.ended` is in flight (orchestrated test) advances exactly once.
9. Refreshing the source page mid-song restores the same item at the correct position after a "▶ Resume show" tap, with pitch preserved.
10. Closing both phone browsers does not break playback or the queue.

---

## 9. Open risks

- **YouTube format brittleness.** `yt-dlp` is a moving target; a YouTube change can break extraction. Mitigations:
  - The format selector is an ordered policy (§4.1) with documented fallbacks rather than a single `-f` string.
  - `npm run check-ytdlp` runs at `npm install` and on server start: verifies the installed `yt-dlp` major version, runs a smoke-test extraction against a known-good public test video, and prints a friendly upgrade hint if either fails.
  - We document the tested `yt-dlp` version range in `README.md`. Update procedure: `brew upgrade yt-dlp` → re-run `check-ytdlp` → bump the documented range. Homebrew "pin" alone is not relied on as a stability guarantee.
- **AudioWorklet quality at extreme pitches.** SoundTouch holds at ±6 semitones; degrades past ±8. UI is capped at ±6.
- **AudioWorklet runtime failure.** Covered by the §4.3 degrade path (bypass worklet, play original audio, toast).
- **Embed-blocked / DRM / DASH-only videos.** Skipped with a toast; no workarounds in MVP.
- **LAN trust model.** The MVP assumes everyone on the WiFi is trusted (§5.2). Session IDs and the source token prevent accidental missteps but are not a security boundary against a malicious LAN actor. Out of scope for a home-party app.
- **No persistence.** Restarting the server clears the queue. Acceptable for parties; a future iteration could add a tiny SQLite store.
