# Karaoke App — UI Redesign Spec

**Date:** 2026-05-08
**Status:** Approved (brainstorming complete; ready for implementation planning)
**Supersedes the UI portions of:** `docs/superpowers/specs/2026-05-06-karaoke-app-design.md` §6 and §8 success criteria #6 — see "Supersession of base spec" immediately below.

### Supersession of base spec

This redesign supersedes the following parts of the base spec (`2026-05-06-karaoke-app-design.md`):

- **Base §6.2 "Phone — `/`"**: replaced wholesale by §4 of this document. The base spec's prose about a "Big, draggable" live-pitch slider as the takeover's focal point is replaced by the **button-first** model in §4.5; drag is phase-2 only and gated by `karaoke.featureFlags.dragPitch`.
- **Base §8 success criterion #6** (which says "dragging the queuer's pitch slider to +1"): replaced by **redesign criterion #15** in §8 of this document — *tap [+]* on the takeover and verify pitch advances within 500 ms. The drag verification is moved to the optional phase-2 flagged path and is not part of release acceptance.
- **Base §6.1 "Source — `/source`"**: replaced wholesale by §3 of this document.

All other parts of the base spec (architecture, WS protocol, server logic, success criteria #1-5, #7-10) are unchanged.

---

## 1. Why

The app shipped functionally complete but the layouts felt clunky in real use. Specifically:

- The **source page** ran the video full-bleed with overlays floating on top, which competed with the lyrics and made the QR / setlist feel like clutter rather than structure.
- The **phone search tab** used rotated paper cards (visual noise that fought scanning), and tapping a result opened a sticky bottom-of-screen "Add to queue" sheet — jarring, easy to miss, and made the list feel like a side-effect.
- The **shuffle** button lived inside the now-playing controls, even though it shuffles the *queue*.
- The **QR panel** was the same size during playback as during idle — wasted real estate while a song is on.
- Long song titles truncated abruptly with no marquee.

This spec keeps the Shimokitazawa Riso visual identity (palette, fonts, tape strips, hanko stamps) unchanged. It only restructures **layout** and **interaction**.

---

## 2. Goals and non-goals

### In scope

1. Restructure `/source` to give the video its own persistent rectangle and put queue + QR + volume in a right-hand rail.
2. Move shuffle onto the queue header (where it logically belongs).
3. Cap the visible setlist to the next 8 songs with a "+N MORE" affordance below.
4. Marquee long titles in the now-playing strip when they overflow.
5. Drop card rotation on the phone search and queue tabs.
6. Replace the bottom-sheet "Add to queue" popup with **inline expansion** of the tapped result.
7. Replace the small "you're up" bottom sheet with a **full-screen takeover** of the queue tab when it's the user's turn to sing.
8. Make `/source` responsive — on phone-width viewports the rail stacks below the video.
9. Preserve all current behaviors: pitch shift, source-only authority, msgId dedup, QR scan-to-join, idle splash with 下北沢, source-token entry, "▶ Start show" gesture.

### Out of scope (deferred or unchanged)

- The Shimokitazawa Riso palette, fonts, riso-noise overlay, paper-grain texture, hanko stamps, tape strips — all preserved.
- The data flow / WS protocol / server logic — none of it changes.
- Persistent storage, native mobile app, login, recording, and other long-deferred items.
- Cursor-fade-on-inactivity for the source overlay (deferred from the prior codex review). Not part of this redesign.

---

## 3. Source page (`/source`)

### 3.1 Layout — Layout A (video left + rail right)

```
┌────────────────────────────────────────────────────────────────┐
│                                                  ┌──────────┐ │
│                                                  │  small   │ │
│                                                  │   QR     │ │
│                                                  │  ~120px  │ │
│                                                  │ scan to  │ │
│                                                  │   join   │ │
│  ┌──────────────────────────────────────────┐    │ host:port│ │
│  │                                          │    └──────────┘ │
│  │                                          │    ┌──────────┐ │
│  │       ▌ LIVE 出演中                       │    │ SETLIST  │ │
│  │                                          │    │  ─── 🔀  │ │
│  │            ▶  video area                 │    │ 02 mike… │ │
│  │            (16:9, scales)                │    │ 03 aria… │ │
│  │                                          │    │ 04 jon…  │ │
│  │                                          │    │ 05 zoe…  │ │
│  │                                          │    │ 06 dan…  │ │
│  │                                          │    │ 07 lia…  │ │
│  │                                          │    │ 08 kim…  │ │
│  │                                          │    │ 09 amy…  │ │
│  ├──────────────────────────────────────────┤    │ + 4 MORE │ │
│  │ Bohemian Rhapsody (Karaoke …) →          │    └──────────┘ │
│  │ SARAH · KEY −2 · 1:42 / 5:55             │    ┌──────────┐ │
│  │                  [−][−2][+]  [⏮ ⏯ ⏭]    │    │ VOL ━━━━ │ │
│  └──────────────────────────────────────────┘    └──────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Regions

**Video frame (left, ~75% of width).** Riso-deep border (`var(--ink-deep)` with `1.5px solid var(--cigarette)` outline), 16:9 aspect ratio that scales with the viewport. Contains:

- **▌ LIVE 出演中** badge — top-left, riso-pink mono caps, **12px on desktop / ≥13px on phones (≤720px)** to match the §5.4 status-critical-label rule, with relative letter-spacing **`0.16em`**. **Background**: a semi-opaque `var(--ink-black)` pill at 70% opacity behind the text (`background: rgba(10, 8, 8, 0.7); padding: 2px 6px; border-radius: 2px`) so the riso-pink stays legible against bright lyrics frames in the video. Three explicit visual states keyed off `player.status`:
  - `playing` → rendered, slow-pulse animation (opacity 0.7 → 1.0 over ~1.5s).
  - `paused` → rendered, **static**, no pulse, opacity 0.6 (so it's clearly paused, not idle).
  - `idle` → hidden.
- **Now-playing strip** — bottom edge of the frame, full-width, paper-cream background, ink-black text. Contains, in one row:
  - **Title** (Crimson Pro 900 italic, 14–16px), **marquee** if it overflows the available width. See §5.3 for the canonical marquee timing.
  - **Sub-line** (mono, **12px min**, ink-muted, letter-spacing 0.15em): `QUEUER · KEY ±N · m:ss / m:ss`.
  - **Pitch controls** on the right: `[−]` button, hanko-stamp readout `−2`, `[+]` button.
  - **Transport controls** further right: `⏮  ⏯/▶  ⏭` (shuffle is *not* here — it's on the queue header).
  - All interactive buttons in the strip are at least **48 CSS px** even on desktop with a fine pointer. This is an **explicit exception** to the §5.4 desktop minimum (32 CSS px) — the source page is typically viewed across the room from a TV, and one of its primary input modes is "I walked over and tapped a button on the MacBook." The strip stays touch-friendly at all viewport widths. Hover/focus state always visible.

**Right rail (~140–180px wide on desktop).** Three stacked panels with `gap: 10–12px`:

1. **QR panel** — paper-card with paper-grain. Contains a 96–110px QR + caption "SCAN TO JOIN" (mono caps, letter-spacing 0.2em, 12px min) + the LAN host:port (mono, **12px min**, ink-muted, single line — wrap is fine on narrow rails but no smaller font). Significantly smaller than the previous design.
2. **Setlist panel** — paper-card. Header row: "SETLIST · N" (mono caps, left), `🔀` button (right) with aria-label "Shuffle queue". Border-bottom under header. Then up to 8 queue rows: `02 · MIKE — Don't Stop Believin'` (mono prefix + Crimson Pro italic title). 1st upcoming row is full ink-black; subsequent rows fade to ink-muted for visual rhythm (closer = brighter). If `queue.length > 8`: a final centered row reads `+ N MORE` in mono caps. **On desktop only** (>720px), the panel may scroll internally if its 8 rows + header exceed the rail's available height (rare; it shouldn't with the 8-cap). **On mobile** (≤720px), the panel does not create its own scroll — page-level scroll is the only scroll container per §5.4.
3. **Volume panel** — paper-card, single row. `VOL` (mono caps, left) + horizontal slider (filled track in hanko-red, thumb in ink-black; visible track height **12–16px**, but the slider element itself is wrapped in a 48 CSS px tall hitbox so the touch target meets §5.4). Tied directly to the AudioGraph via `audio-graph-ref` (no WS roundtrip).

### 3.3 Idle state (no songs queued, post-unlock)

The right rail is unchanged. The **video frame becomes the splash**:

- Background: linear-gradient `135deg` from `var(--ink-deep)` to `var(--ink-black)`.
- Centered: `下北沢` in Crimson Pro 900 italic at 96–144px (responsive), letter-spacing −1px, paper-cream color.
- Below: `HOUSE LIGHTS ON` in mono caps at **16px** (large enough that the cigarette-yellow on dark passes WCAG AA), letter-spacing 3px. *Do not use cigarette-yellow on dark below 14px — see §5.4 for the contrast rule.*
- The **▌ LIVE** badge is hidden in this state. The now-playing strip is also hidden.
- The setlist panel shows an empty-state row: "queue something to start the show" in Crimson Pro italic, ink-muted. The header still reads `SETLIST · 0`.

### 3.3-bis Idle with queued songs (transient — source ready, player idle)

This is a real but short-lived state: `player.status === 'idle'` AND `queue.length > 0` AND `sourceReady === true`. It happens during a transition (the previous song just ended; the server is about to auto-advance) or after a recoverable race. The video frame and right rail render as follows:

- Video frame shows the same idle splash from §3.3 (the 下北沢 wordmark + "HOUSE LIGHTS ON"). The LIVE badge is hidden. The now-playing strip is hidden. **Auto-advance is the normal recovery path**, but on real devices it can take a few hundred ms; we don't want to flash a recovery CTA on every legitimate transition. Rule:
  - The state `(player.status === 'idle' && queue.length > 0 && sourceReady)` must persist for **≥1.5 seconds** before any recovery affordance appears.
  - After 1.5 s, the splash adds a **"▶ Start next song"** button below the wordmark — paper-cream Crimson Pro italic, 18px, 48 CSS px tall.
  - Tapping the button sends `player.skip { msgId: <new>, epoch: state.player.epoch }` (matches base spec §5.3 — `player.skip` requires both `msgId` and the current epoch; the server's stale-epoch handling makes this safe even if a real auto-advance lands milliseconds before the user taps).
  - Once the state changes (auto-advance fires, or the user taps), the button is unmounted with the splash. If the state recurs, the timer restarts.
  - This avoids stranding non-technical hosts in a stuck idle state without inviting accidental double-skips on normal transitions.
- Right rail: the setlist panel renders the queued items normally — the user can still see what's coming up, can still shuffle/move items.
- This state is logically equivalent to "house lights on, between songs" — it's not an error.

### 3.3a Source-offline / queued-but-not-playing state

When `sourceConnected === false || sourceReady === false` AND `queue.length > 0` (the base spec's §5.6 case), the source page may not be observing this since it *is* the source — but if a phone reaches `/source` accidentally, or the source is mid-reconnect, render this dedicated state:

- Video frame: same dark gradient as idle splash, but with `▌ SOURCE OFFLINE — RECONNECTING…` in riso-pink mono caps at 16px centered. No 下北沢 wordmark (the show isn't starting; we're recovering).
- Right rail unchanged. The setlist still shows the queued songs so the host can see what's pending.
- Phone clients render the offline banner from a **single component** (`<OfflineBanner />`) mounted ONCE in the phone-root layout, between the sticky `<Tabs>` header and the active tab body. Individual tab components (QueueView, SearchTab, PasteTab) do NOT render their own banners. Wording: "Source offline — playback paused" (mono caps, 13px min on phones for legibility, riso-pink). It's visible on every tab because it sits in the shared layout shell, not inside any tab. Dismiss only by reconnect. Visibility predicate: `(sourceConnected === false || sourceReady === false)`.

**Banner vs. takeover precedence** (when both would render at once on the phone):

- If `(sourceConnected === false || sourceReady === false)` AND the user is in the YOU'RE UP takeover, the banner **replaces** the takeover header for the duration of the disconnect:
  - Sticky bar at the top of the takeover shows the riso-pink "▌ SOURCE OFFLINE — RECONNECTING…" banner instead of `▌ YOU'RE UP   m:ss / m:ss`.
  - The pitch readout and ± buttons stay visible and remain interactive — pitch changes are queued and replayed on reconnect, with this concrete contract:
    - The phone holds `pendingPitch: { value: number; itemId: string; epoch: number } | null`. On every ± press while `sourceConnected === false`, the value is updated to `{ value: <new>, itemId: <currentItem.id>, epoch: <currentEpoch> }` (last-write-wins).
    - On reconnect, before replaying: check that `pendingPitch.itemId === state.player.item?.id` AND `pendingPitch.epoch === state.player.epoch` (the song hasn't changed since the offline edit). If either differs, **discard `pendingPitch`** — it would apply to the wrong song.
    - If still current: if `pendingPitch.value` differs from `state.player.livePitch`, send `player.setLivePitch { msgId: <new>, semitones: pendingPitch.value }` and clear `pendingPitch` on `state.ack`. **Retry semantics depend on outcome**:
      - **No ack within 6 s** → retry with the *same* `msgId` (the server's dedup will return the cached ack if it has already processed it).
      - **`state.ack { ok: false }`** → the server rejected the change (bad pitch, no current song, etc.); retrying with the same `msgId` would just replay the same failure. Generate a *new* `msgId` for any retry, but in this case we just drop silently and let the readout reflect the server's latest reported pitch.
    - This avoids both "drop offline taps" and "replay every tap as a flood after reconnect."
  - When `sourceReady` flips back to `true`, the banner unmounts and the normal takeover header returns. The reconnect-resume rule from the base spec §5.6 handles the resume.

### 3.4 Pre-show states (token entry, "▶ Start show" gesture)

Unchanged in structure from the current implementation, but visually aligned with the new aesthetic:

- **Token entry** — same centered paper-card on a dark background. No rotation on the form (was `transform: rotate(-0.5deg)` via `.paper-card` class — see §5.1 for class change).
- **"▶ Start show" gesture** — unchanged. Full-screen black button with cream Crimson Pro italic.

### 3.5 Mobile responsive (phone-width viewport on `/source`)

**Breakpoint source of truth:** the only allowed expression of the boundary is the CSS media query `@media (max-width: 720px)`. JavaScript that needs to react to the breakpoint MUST use `window.matchMedia('(max-width: 720px)')` — never compare `window.innerWidth` directly, which drifts under zoom and fractional widths. When viewport width is at or below **720px**, the layout collapses to a single column:

```
┌──────────────────────────┐
│   ▌ LIVE                 │
│   [video, full width]    │
│   16:9                   │
├──────────────────────────┤
│ Bohemian Rhapsody →      │
│ SARAH · KEY −2 · 1:42    │
│ [−][−2][+]  [⏮ ⏯ ⏭]    │
├──────────────────────────┤
│ ┌───┐ SETLIST · 12  🔀   │
│ │QR │ 02 mike · don't…   │
│ └───┘ 03 aria · wonder…  │
│       04 jon · africa    │
│       05 zoe · creep     │
│       + 8 MORE           │
├──────────────────────────┤
│ VOL ━━━━━━━━━━━━━        │
└──────────────────────────┘
```

- Video frame becomes full-width.
- **Now-playing strip switches to a 2-row layout on phones** (the desktop "everything in one row" layout cannot fit four 48-CSS-px control groups + marquee title + sub-line at <=720px without illegible compression):
  - **Row 1** (above the strip): marquee title and sub-line stack — title on its own line; sub-line below it.
  - **Row 2**: pitch ± stepper (left) and ⏮ ⏯ ⏭ transport (right), each 48-CSS-px tall, in a flex row with `gap: 8px`.
  - Both rows sit inside the same paper-cream strip; padding tightens to 8px on phones.
  - **Sub-breakpoint at `<=390px`** (covers iPhone SE 1st gen at 320 px through standard iPhone Mini at 360 px and iPhone 13 mini at 390 px — the realistic small-phone range): Row 2 splits to **two stacked rows**: a pitch row (`[−][−2][+]`) and a separate transport row (`⏮ ⏯ ⏭`). Both rows still have 48-CSS-px tall controls; the strip becomes 3 rows total (title/sub-line + pitch + transport). The canonical implementation uses `flex-direction: column` on `.now-playing-strip__controls` (matches §5.6 CSS at the `(max-width: 390px)` sub-breakpoint, raised from the prior 360 px boundary to give realistic safe-area + localization headroom). Each child row remains a horizontal flex layout with `justify-content: space-between`. (Earlier prose mentioning `flex-wrap: wrap` is superseded by this rule — `flex-direction: column` is what §5.6 actually applies.)
- QR shrinks to a chip (≤72px) and tucks **inline with the setlist header**, left of the "SETLIST · N" label.
- Setlist still caps at **8 visible**. The cap is independent of viewport height. `+N MORE` always renders when `queue.length > 8`, with `N = queue.length − 8`. **The setlist panel does not scroll internally on phones** — page-level scroll is the only scroll container (§5.4 single-scroll rule).
- Volume panel becomes a single full-width row at the bottom.
- The page root owns both top and bottom safe-area insets (`/source` has no sticky bar — it falls under the "root owns" branch of §5.4). See §5.4 ownership table for the exact element.

### 3.6 Behaviors

- **Marquee** runs only when `title.scrollWidth > container.clientWidth`. The measurement re-runs on **(a)** title text change, **(b)** `document.fonts.ready` resolving (so freshly-loaded Crimson Pro is included), and **(c)** every `window` resize / `ResizeObserver` event on the strip. Honors `prefers-reduced-motion: reduce` (no scroll, just ellipsis).
- **LIVE badge** rendering is keyed off `player.status` per §3.2: `playing` → animated pulse, `paused` → static at 0.6 opacity, `idle` → not rendered. The pulse animation is suppressed under `prefers-reduced-motion: reduce` (the badge stays at full opacity instead).
- **Setlist panel** shows up to 8 rows. Row colors: index 0 = `var(--ink-black)`, indices 1–7 = `var(--ink-muted)`. When `queue.length > 8`, the 9th row position renders `+ N MORE` where `N = queue.length − 8`. The cap is fixed; viewport height does not change `N`.
- **Shuffle** button on the setlist header sends `queue.shuffle`. `aria-label="Shuffle queue"`. No keyboard shortcut.
- **Per-row source affordances** (visible only on `/source`, on every setlist row): two icon buttons on the right edge of the row, in this order — `⤴` push-to-top and `✕` remove. They share an inline group separated by **8 px** (gap between the two buttons; tight enough to keep the row compact but wide enough that thumbs don't tap the wrong one on phone-width). On phone-width viewports (≤720px or coarse pointer), the gap grows to **12 px**.
  - **Hit box size**: 32×32 CSS px on desktop fine-pointer (`@media (pointer: fine)`); **48×48 CSS px on coarse-pointer / phone-width viewports** (`@media (max-width: 720px), (pointer: coarse)`). The phone-width breakpoint applies even on `/source` — when a phone happens to load `/source`, those buttons must be touch-friendly. This matches the §5.4 source-of-truth rule (touch ≥48 / fine ≥32) without exception.
  - `⤴` — `aria-label="Move to top"`. Sends `queue.move { itemId, toIndex: 0 }`. **Mistap protection**: same 6-second undo toast pattern as `✕` — `▌ Moved <title> to top · UNDO`. Tapping UNDO sends `queue.move { itemId, toIndex: <originalIndex> }` to restore the original position. Symmetric with `✕` so accidental thumb-taps in the `⤴`/`✕` row group are recoverable in either direction.
  - `✕` — `aria-label="Remove from queue"`. Sends `queue.remove { itemId }`. The source has authority to remove any item (per base spec §5.3). **Distinct from** the phone queue tab's `✕` (`aria-label="Remove your queued song"`) since the source removes any guest's song; the phone removes only the user's own.
  - **Mistap protection.** Tapping `✕` on `/source` immediately removes the item AND emits a 6-second toast `▌ Removed: <title> · UNDO`. The toast's `UNDO` button restores the item via `queue.add` (server-resolved metadata) at the same position if possible (`queue.move toIndex: <originalIndex>` chained after the add). If the user does nothing, the removal stands. The undo affordance covers the accidental-thumb-tap case for `⤴ ✕` adjacency on phone widths without requiring a confirm dialog (which would slow the legitimate-remove case).
  - Both affordances were on the previous overlay; both are preserved here so `queue.move` and `queue.remove` are still reachable from the source UI without requiring a phone.
- **Volume** slider 0–1, tied directly to `getAudioGraph()?.setVolume(v)`. Persistence:
  - Read `localStorage["karaoke.volume"]` (range 0–1, fallback 1.0) at component mount and on every `subscribeAudioGraph()` change. **The persisted value is re-applied every time the AudioGraph becomes available**, not only at first render — so unlocking the AudioContext after a reload doesn't lose the user's preferred level.
  - Every slider change writes to `localStorage["karaoke.volume"]` synchronously.
  - This avoids the failure mode where the AudioGraph's GainNode was at 1.0 because the persisted value was applied before the graph existed.
- **Pitch controls** on the strip send `player.setLivePitch` with the new value (clamped −6 to +6 server-side anyway).
- **Transport** controls send `player.prev`, `player.pause` / `player.play` (toggle based on `player.status`), `player.skip`.
- **Source keyboard shortcuts** (preserved unchanged from base spec §6.1): `Space` toggles play/pause, `→` skips, `←` previous, `↑` / `↓` adjust pitch ±1. The redesign supersedes base §6.1 wholesale, but these shortcuts remain part of the source page's behavior — the existing `<KeyboardShortcuts />` component is unchanged.

---

## 4. Phone client (`/`)

### 4.1 Header + tabs (preserved)

Top bar unchanged in structure:

```
●  SARAH · ⚙              [QUEUE] [SEARCH] [PASTE]
```

- Left: `●` glyph + name (mono caps), `⚙` settings (renames the user) on tap.
- Right: three tab buttons. Active tab: hanko-red background, paper-cream text. Inactive: transparent, paper-cream text. Underline on the bottom of the tab strip in `var(--ink-deep)`.
- Tabs do **not** rotate. Tap target ≥48 CSS px tall.

### 4.2 Queue tab

```
┌──────────────────────────┐
│ ●  SARAH · ⚙   [Q] S  P  │
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │ ▌ NOW PLAYING        │ │  paper-card, no rotation
│ │ Bohemian Rhapsody    │ │  Crimson Pro 900 italic, 16-18px
│ │ SARAH · KEY −2       │ │  mono caps, ink-muted
│ │ ━━━━━━━━━━━━━━━     │ │  thin progress bar (hanko-red)
│ └──────────────────────┘ │
│                          │
│ ▌ UP NEXT · 4            │  mono caps, paper-cream, letter-spacing
│                          │
│ ┌──────────────────────┐ │
│ │ 02 · MIKE            │ │  mono caps prefix
│ │ Don't Stop Believin' │ │  Crimson Pro italic, ≥14px
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ 03 · ARIA            │ │
│ │ Wonderwall           │ │
│ │ KEY +1               │ │  shown only if prePitch ≠ 0
│ └──────────────────────┘ │
│ ┌──────────────────────┐ │
│ │ 04 · YOU         [✕] │ │  ✕ visible because queuedBy is me
│ │ Africa               │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

- **No card rotations.** All cards are upright. `.paper-card` class keeps its shadow + grain, drops `transform: rotate(...)`.
- **Now-playing card** at the top of the tab. Variants by `player.status` and connection:
  - `playing` — `▌ NOW PLAYING` badge (riso-pink mono caps). Title in Crimson Pro 900 italic. Sub-line in mono caps, ink-muted. Thin progress bar (3px tall, hanko-red on ink-muted track) showing `positionSec / item.durationSec`.
  - `paused` — `▌ PAUSED` badge in **`var(--ink-black)` at 14px font-weight 700** (the badge sits on a paper-cream card, where cigarette-yellow on cream fails contrast — ink-black on cream passes AAA). Same title/sub-line. Progress bar present but not animating.
  - `idle` AND `queue.length > 0` — `▌ NEXT UP` badge in **`var(--ink-black)` 14px font-weight 700** (same reasoning). Title is the next item's title (preview). Sub-line shows `<queuer> · KEY ±N` from the next item's prePitch. No progress bar.
  - `idle` AND `queue.length === 0` — entire card is replaced by an empty-state row: "▌ idle — queue something" in mono caps, ink-muted.
  - **Source-offline with prior player snapshot** (covered by §3.3a) — banner appears above this card, card itself shows the last known state but with the badge replaced by `▌ OFFLINE` in riso-pink.
  - **Source-offline with no prior player snapshot** (e.g. the phone just connected and the source is offline) — entire card is replaced by `▌ OFFLINE · waiting for source` in mono caps, riso-pink, **13px min on phones** (status-critical label per §5.4). No title row.
- **▌ UP NEXT · N** section header. Mono caps, paper-cream, letter-spacing 0.2em.
- **Queue rows** show the index (`02 · MIKE`) in mono caps (≥12px) as a small eyebrow above the Crimson-Pro italic title. `KEY ±N` line shown only if non-zero pre-pitch. `[✕]` button on the right edge — visible glyph 24×24px **inside a 48 CSS px hit-target box** (transparent padding); only when `queuedBy.sessionId === mySessionId`. Tap: sends `queue.remove`. `aria-label="Remove your queued song"`.
- **Phone remove undo (matches the source `/source` ✕ undo).** When the user taps `✕` on their own queued song, the row removes immediately AND a 6-second toast renders `▌ Removed: <title> · UNDO`. Tapping UNDO re-sends `queue.add { videoId, prePitch }` to restore the song; we accept that the new entry will be appended at the end (the user's own song re-added — the position-restore via `queue.move` is source-only, so on the phone the undo can only re-add). If the toast expires, the removal stands.

### 4.3 Search tab — the big fix

```
┌──────────────────────────┐
│ ●  SARAH        Q [S] P  │
├──────────────────────────┤
│ [bohemian rhapsody…] [GO]│
│                          │
│ ┌──────────────────────┐ │
│ │ Bohemian Rhapsody…   │ │  collapsed
│ │ SING KING · 5:55  ▾  │ │
│ └──────────────────────┘ │
│                          │
│ ┌──────────────────────┐ │
│ │ ┃ Bohemian Rhapsody  │ │  EXPANDED
│ │ ┃ KARAOKE VIBES·5:42 │ │  hanko-red 4px left border
│ │ ┃                  ▴ │ │
│ │ ┃ KEY [−][−2][+] [ADD]│ │  inline picker + Add
│ │ ┃                    │ │
│ └──────────────────────┘ │
│                          │
│ ┌──────────────────────┐ │
│ │ Bohemian Rhapsody…   │ │  collapsed
│ │ CHORDS · 5:30     ▾  │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

**Interaction model:**

1. User types and submits a query. Loading state on the GO button: the label switches to a static `…` (three dots) — **no spinner animation** (avoids needing another entry in the §5.5 animation registry; the static character communicates loading well enough). The query input has `inputmode="search"` and an `enterkeyhint="search"` for the iOS keyboard.
2. Results render as upright paper-cards. Each row has: title (Crimson Pro italic, ≥14px), channel · duration (mono caps, ink-muted, ≥12px), and a `▾` glyph at the right edge. Each whole row is the tap target — minimum **56 CSS px tall** (≥48 CSS px baseline + breathing room) with `aria-expanded="false"`.
3. **Tap a row** → that row expands in place; any previously-expanded row collapses (canonical rule — see "Collapse contract" below). Expanded state:
   - 4px hanko-red left border replaces the regular paper-card edge.
   - The body grows downward to reveal: a `KEY` label (mono caps, ≥12px), a `[−] [−2] [+]` stepper (48 CSS px buttons; readout is a hanko-stamp shape with `aria-live="polite"`), and an `[ADD]` button (right-aligned, hanko-red filled, full-bleed minimum 48 CSS px tall).
   - The `▾` flips to `▴` (also hanko-red). Row sets `aria-expanded="true"`.
4. **Tap [ADD]** →
   - Enter **pending** state, which freezes the entire row's interactive surface:
     - `[ADD]` has the native HTML `disabled` attribute applied (and `aria-disabled="true"`); both are needed because `aria-disabled` alone does not block native button activation.
     - The `−`/`+` stepper buttons are disabled the same way (`disabled` + `aria-disabled`) so the displayed key cannot diverge from the submitted `prePitch`.
     - The row's collapse/expand toggle is disabled the same way; the chevron stays as `▴`.
     - The displayed key value is frozen at the submitted value.
   - Generate `msgId` once for this add operation (call it the **operation id**) and send `queue.add { msgId, videoId, prePitch }`.
   - On `state.ack { msgId, ok: true }`:
     - **If the user is still on the Search tab** (active tab is "search") with the originating row still expanded: clear search results, switch to the **Queue** tab so the user sees their addition.
     - **Otherwise** (user navigated away — different tab, edited query, etc.): do not yank focus. Show a 2-second toast `▌ Added — N in queue` and increment the queue count badge in the Tabs header (`[QUEUE · N]`). The user discovers the addition naturally when they return to the queue tab.
     - Either way, remove the entry from `pendingAdds`.
   - On `state.ack { msgId, ok: false, error }`: exit pending state, show inline error (`▌ <error>`, riso-pink mono caps below the stepper).
   - On 6 s timeout with no ack: exit pending and show the message `"timed out — tap to retry"`. **Tapping ADD again immediately re-sends with the same operation id** (the same `msgId`). The retry path is *not* blocked by the pendingAdds map — that's the entire point of "tap to retry". Server-side `msgId` dedup (base spec §5.3) ensures a delayed-success-then-retry combination does not produce two queued songs because the second send returns the cached ack of the first.
   - **Pending operations persist across query edits and tab switches.** The pending set lives at the `<SearchTab>` (or higher) component level — not on the result row — so changing the query or expanding a different row does NOT forget the in-flight `queue.add`. Concretely: the component holds a map `pendingAdds: Map<msgId, { videoId, prePitch, sentAt }>` **keyed by `msgId`** (not by `videoId`). Each operation has its own entry. The map is also indexable by `videoId` (computed via `Array.from(pendingAdds.values()).filter(v => v.videoId === id)`) — so you can ask "are there any in-flight adds for this video?" — but the *primary key* is `msgId` so two distinct add attempts at different pre-pitch values can coexist as separate pending entries. This means: a guest who legitimately wants to queue the same song twice (different keys, two singers covering the same track) is not blocked. **Two distinct concepts live here, and they must not be conflated:**
     - **Visual expansion state** (which row is expanded, what the stepper shows) — *resets* on new query submission and on tab switch. This is the "pending row state resets" rule referenced elsewhere.
     - **`pendingAdds` map** (in-flight `queue.add` operations) — *persists* across query edits, tab switches, and component re-renders. It clears only on `state.ack` (any `ok` value) or when an entry's tombstone TTL expires (next bullet).
   - **Lifetime — single canonical rule.** A `pendingAdds` entry is removed from the map ONLY on (a) `state.ack` of any outcome, or (b) explicit user cancel/dismiss via the row's `[×]` action. **No automatic time-based eviction.** The 5-minute mark only changes the row's visual label/action affordance (see "Bounded stale-op cleanup" below) — it does NOT remove the map entry. (Removal would defeat the dedup-via-msgId contract; visual relabeling preserves the contract while still surfacing "this is taking suspiciously long" to the user.)
   - **Bounded stale-op cleanup (visual labeling, not auto-removal).** A `pendingAdds` entry that has gone unresolved for **5 minutes** has its UI shift: the originating row label becomes `▌ expired (server may have applied this)` in riso-pink mono caps, and the `[×]` action (which during the in-flight phase reads "cancel") changes to `[×] dismiss`. Tapping dismiss removes the entry from the map; nothing else does at this stage. The map entry survives reload only if the user has not dismissed it (see "Persistence across reloads" below — actually it does NOT survive reload). This bounds the worst case where a server message is genuinely lost (WS reconnect that drops the cached ack older than 100 mutations on the server side, then network truly drops the resend). The 5-minute window is generous; most real adds resolve in <2 s.
   - **Persistence across reloads + recent-add warning.** `pendingAdds` is in-memory only. **Phone reload drops the map** — pending operations are forgotten. To mitigate the "user re-adds the same song after reload, original was actually still in flight" duplicate, the phone records `lastAddSentAt: number | null` in `localStorage` (a single timestamp, not the operation details). On reconnect, if `(Date.now() - lastAddSentAt) < 10_000` (10 seconds), show a non-blocking toast `▌ A recent add may still be processing — wait a moment before retrying`. This is purely informational — it doesn't prevent the user from re-adding, it just nudges them. Server-side dedup still applies for the next ~80 mutations on the same `msgId`, but since the phone has lost the `msgId` it would only re-create dedup safety by happening to send the same string. We accept the tradeoff: a reload mid-pending occasionally produces a duplicate if the server hadn't yet processed the original AND the user re-adds the same song after reload. This is acceptable for a home-party app; a dropped operation is more visible than a duplicate (the user can remove the duplicate manually). We deliberately do NOT use `localStorage`/`sessionStorage` for this — persisting a pending op id across reloads creates new failure modes (orphaned tombstones, stale dedup IDs) that aren't worth the rare-case win.

   - **Bounded retry window** (interaction with base spec §5.3 dedup). The base spec's server keeps the most-recent **100 `msgId`s per session**. The client cannot directly observe how many of those slots are still allocated to its own messages (other clients on the same session — there shouldn't be any in our home-party model, but the spec says "per session" — and server-side automatic events could conceivably consume slots). The client therefore expires same-`msgId` retry on **a combination of three conditions, whichever fires first**:
     - The local session has dispatched **80 mutating messages** (`queue.*` and `player.set*`/skip/prev/pause/play) since the original `queue.add` was sent. Counted as a monotonic `mutationsSentSince` field on the entry.
     - **OR** an `epoch` boundary has been crossed: `currentPlayer.epoch` changed by ≥3 since the entry's `sentAt`.
     - **OR** **2 minutes** of wall-clock time elapsed since `sentAt`.

     These three combined keep the same-`msgId` retry guarantee meaningful even in unusual conditions. When an entry crosses any threshold:
     - The "tap to retry" affordance is replaced with a confirm-style button: **"Start new add anyway"** (mono caps, inline with the row).
     - Tapping that button issues a *new* `msgId` for the same `(videoId, prePitch)` and, in exchange, the user accepts a small risk of duplication if the original is still in flight server-side.
     - This bounds the duplicate window: only the very rare combination of (original ack delayed >80 mutations) AND (user mashes "Start new add anyway") creates a duplicate. A user can always remove the duplicate from the queue.
     - The threshold is conservative — most karaoke parties never approach 80 mutations.
   - **Per-row state when a result has matching pending entries.** When a search result row's `videoId` matches one or more `pendingAdds` entries, the row's primary affordance changes:
     - If the user reuses the same row that originated the pending op, the ADD button label is `"queueing…"` (in flight) or `"tap to retry"` (after timeout). Tapping retries the **same `msgId`**.
     - If the user opens a *different* row with the same `videoId` (e.g. duplicates in search results, or the same song re-found later), that row gets a normal stepper + ADD. Submitting **creates a new pending entry with a fresh `msgId`** — the user is making a deliberately distinct add (perhaps with a different key). The two operations dedup independently.
     - When the row is the originator AND the user wants to abandon the in-flight op, a small `[×] cancel` action appears next to the `"queueing…"`/`"tap to retry"` label. Tapping it removes that specific `msgId` entry from `pendingAdds`. The server may still apply the original add (the user accepted that risk by canceling); cancel is best-effort UX, not a server-side abort.

**Collapse contract (canonical — replaces all conflicting prose elsewhere):**

- The row is a binary toggle. There is exactly one expanded row at a time, or zero.
- Expanding row B while row A is expanded collapses A first.
- Tapping the same row's `▾`/`▴` toggle collapses it.
- Tapping anywhere else inside the page does **not** auto-collapse (no outside-click dismissal — too fragile on touch where any scroll counts as a tap on iOS).
- **Editing the query input collapses any expanded row immediately** (on every keystroke, not just on submit). This prevents adding a stale result after retyping. Submitting clears the results entirely.
- Switching tabs collapses any expanded row.

**Event handling inside expanded rows.** The header is a real `<button>` (see "Toggle row accessibility" below). The expanded body is a **sibling** of the button, not nested inside it. Because the body and button are siblings, no event will naturally bubble from the body to the button — there is no need for `stopPropagation`. Implementers must NOT regress to a `<div onClick>` row pattern: nested interactive elements inside a `<div>` would re-introduce the bubble bug *and* break keyboard semantics. Concrete shape:

```tsx
// CORRECT — `aria-expanded` lives on the BUTTON, not the <li>. The body is a
// sibling of the button. The <li> is just a layout container with no a11y role.
<li className="search-row" data-expanded={isExpanded}>
  <button
    type="button"
    onClick={toggle}
    aria-expanded={isExpanded}
    aria-controls={bodyId}
  >
    {/* title + channel · duration + chevron */}
  </button>
  <div id={bodyId} className="search-row__body" hidden={!isExpanded}>
    {/* KEY stepper + ADD — these are unaffected by the toggle */}
  </div>
</li>
```

The `data-expanded` attribute on `<li>` is for CSS styling hooks only (the accent border, the chevron rotation), not accessibility. The `aria-expanded` and `hidden` attributes on the button + body do the screen-reader work.

Avoid both `<div onClick>` row containers and putting the body inside the button.

**Behaviors:**

- Stepper clamps to −6..+6.
- Search results clear on new query submission. Pending row state resets.
- Listener cleanup on unmount + 8s timeout — already implemented; preserve.
- **Pending Adds tray (global retry/cancel UX).** The **Queue, Search, AND Paste tabs** all render a small **"Pending adds"** tray above their main content whenever `pendingAdds.size > 0` (the tray is owned by the parent that wraps all three tabs, so it sits between the sticky `<Tabs>` header and the active tab body). The tray lists each pending operation as a single row: title (or videoId if metadata isn't yet known) + key + state badge (`queueing…` / `tap to retry` / `expired`) + a `[×]` button with `aria-label="Dismiss pending add for <title>"`. The row's primary tap target (the title area) sends a **retry** with the stored `msgId` and `aria-label="Retry pending add for <title>"`. The retry/dismiss actions work regardless of which tab the user is on or whether the originating result row is still visible.
- **Search request race protection**: every search dispatches a fresh `msgId` and stores it as `activeSearchMsgId`. The `karaoke-msg` listener accepts a `search.results` payload only if its `msgId === activeSearchMsgId`; older payloads are discarded. Without this, a slow first response can overwrite a fast second response and surface stale results.
- **Search submit lock**: the GO button is disabled (`disabled` + `aria-disabled`) while `activeSearchMsgId` is set (i.e. one request is in flight). Pressing Enter on the input while disabled is a no-op. The lock clears on `search.results` for the active id, an 8 s timeout, or **explicit cancel**. While the lock is on, the GO button changes label to `"…"` and a small `[×] cancel current` action appears next to it. Tapping cancel clears `activeSearchMsgId` immediately, allowing the user to submit a corrected query without waiting for the timeout. (The previous in-flight `search.results`, if it ever arrives, is discarded by the existing race-protection rule.) This closes both the network-jitter spam loophole and the user-stuck-waiting frustration loophole.

**Toggle row accessibility (semantic markup):**

- The row's clickable header is a real `<button type="button">` (not a `<div onClick>`), so Enter/Space activation, focus order, and screen-reader semantics are correct by default.
- The button gets `aria-expanded={isExpanded}` and `aria-controls="<row-id>-body"`. The body has `id="<row-id>-body"`.
- The expanded body (the stepper + ADD container) is a sibling of the button, not nested inside it (a `<button>` cannot legally contain interactive children).
- Visible focus: the §5.4 `:focus-visible` ring applies to the row button.

### 4.4 Paste tab

Same upright cards. Same inline-expand pattern as search (after URL resolves, the resulting "preview card" is automatically in expanded state with key picker + Add):

```
┌──────────────────────────┐
│ ●  SARAH        Q  S [P] │
├──────────────────────────┤
│ ┌──────────────────────┐ │
│ │ https://youtube.com/…│ │  textarea, 3 rows
│ └──────────────────────┘ │
│ [   RESOLVE   ]          │
│                          │
│ ┌──────────────────────┐ │  expanded preview card
│ │ ┃ Bohemian Rhapsody  │ │
│ │ ┃ 5:42               │ │
│ │ ┃ KEY [−][ 0 ][+]    │ │
│ │ ┃             [ADD]  │ │
│ └──────────────────────┘ │
└──────────────────────────┘
```

- Preserves the existing meta.fetch + state.ack-failure logic.
- **Pending-add lifecycle is shared with Search.** Tapping ADD on a resolved Paste preview uses the same `pendingAdds` map, the same operation-id keying, the same retry-with-same-msgId rule, and the same global "Pending Adds tray" UX as Search (see §4.3). Only the *resolution* step (paste → meta.fetch) differs; the post-meta-fetch flow is identical.
- On error (regex miss, server failure, timeout), display an inline error line in riso-pink mono caps below the textarea: e.g. `▌ INVALID URL`.

### 4.5 "You're up" takeover

When `player.status !== 'idle'` and `player.item.queuedBy.sessionId === mySessionId`:

- The **Queue tab is replaced entirely** by the takeover (other tabs still navigable). The header + tab strip remain visible at the top so the user can switch tabs to add another song while singing.
- Body of the queue tab becomes a single full-screen panel:

```
┌──────────────────────────┐
│ ●  SARAH        [Q] S  P │
├──────────────────────────┤
│ ▌ YOU'RE UP    1:42/5:55 │
│                          │
│ Bohemian                 │  Crimson Pro 900 italic
│ Rhapsody                 │  24-32px, paper-cream
│ SING KING · 5:55         │  mono caps, paper-cream (NOT cigarette: 14px would fail contrast at small size — see §5.4)
│                          │
│                          │
│                          │
│ KEY                      │  mono caps, ink-muted
│ ┌────┐  ┌────────┐ ┌────┐│
│ │ −  │  │  −2    │ │ +  ││  big tappable buttons
│ └────┘  └────────┘ └────┘│  48 CSS px
│                          │
│ SOURCE HAS OVERRIDE      │  mono caps, ink-muted
└──────────────────────────┘
```

- **Big readout** — the `−2` is the focal point: Crimson Pro 900 italic, 32px, hanko-red. "SEMITONES" label below in mono caps, **12px min**, ink-muted. The readout is `aria-live="polite"` so screen readers announce changes from `[−]` / `[+]` button presses. **During a drag gesture (phase-2 flag), `aria-live` is temporarily set to `off` to prevent rapid-fire announcements; the live region is restored to `polite` on `pointerup` (or `pointercancel`/`lostpointercapture`) so the final snapped value is announced once.**
- **Big buttons** — `−` and `+` are 56–64 CSS px wide, 48–56 CSS px tall (always ≥48 CSS px), paper-cream borders, transparent background. Each has `aria-label="Lower pitch by one semitone"` / `"Raise pitch by one semitone"`. Active feedback: brief hanko-red flash on tap (suppressed under `prefers-reduced-motion`).
- **Drag interaction** — **Phase-2 / off by default behind a feature flag.** The release baseline is **buttons only**; the drag-to-change-pitch gesture is gated behind a localStorage flag (`karaoke.featureFlags.dragPitch === "1"`) and is not enabled in any default install. The buttons satisfy every success criterion. The drag spec below stays in this document as the implementation reference for if/when the flag is flipped.
  - Pointer Events API (works in iOS Safari ≥13).
  - `touch-action: pan-y` on the readout — vertical scroll passes through, horizontal pointer is captured.
  - **8px horizontal dead-zone** before any pitch change registers (prevents accidental nudge during a tap).
  - **Axis-lock**: if the first 8px of the gesture has `|dy| > |dx|`, abort drag and let the page scroll. Otherwise call `setPointerCapture` and consume horizontal motion.
  - Each 24px of horizontal travel = 1 semitone (snap on release).
  - **Cancellation handling.** Required listeners on the readout element: `pointerdown`, `pointermove`, `pointerup`, **`pointercancel`**, **`lostpointercapture`**. Both `pointercancel` and `lostpointercapture` reset the drag state (release the pointer capture, restore `aria-live="polite"`, snap to the nearest committed semitone, fire one final `player.setLivePitch`). Without these, an iOS interruption (incoming call, multitouch, alert) leaves the drag in a stuck state.
- "SOURCE HAS OVERRIDE" stays as a footnote (mono caps, 12px min, **`var(--paper-cream)` color at `opacity: 0.7`** — ink-muted on the dark takeover background fails WCAG AA at small sizes; cream-on-dark passes AAA even with reduced opacity).
- **Layout sizing & DOM ownership.** The takeover panel sits **inside** the queue tab body, *below* the `<Tabs>` sticky header which stays visible AND below any pending-add tray / offline banner that may also be mounted there. The takeover root uses `min-height: calc(100dvh - var(--top-occluder-height))` (with `100vh` fallback in the same form). `--top-occluder-height` reflects tabs + banner + tray heights; without subtracting that full chrome the takeover would overshoot the viewport when extra rows are present. The takeover's DOM is exactly:

  ```tsx
  <section className="youre-up" aria-label="You're up — pitch control">
    <div className="youre-up__sub-header">▌ YOU'RE UP   {time}</div>
    <div className="youre-up__title-block">{title}{subline}</div>
    <div className="youre-up__controls">
      {/* KEY label, ± buttons, big readout, "SOURCE HAS OVERRIDE" footnote */}
    </div>
  </section>
  ```

  Per the §5.4 ownership table, **only `.youre-up__controls`** sets `padding-bottom: env(safe-area-inset-bottom)` (this is THE bottom-inset owner; no other element sets bottom inset on this screen). **No element in this tree sets a top inset** — that's the global `<Tabs>` sticky header's job, outside this DOM. The `.youre-up` root, the sub-header, and the title-block all leave `env(safe-area-inset-*)` alone. Implementers must annotate `.youre-up__controls` in code with `// owns safe-area-inset-bottom` so reviewers can spot accidental duplication.
- **When the takeover dismisses** (precedence: idle wins over offline):
  - **`player.status === 'idle'`** → return to the regular queue view immediately. This wins over the offline-banner-replaces-takeover-header rule from §3.3a — if the song just ended *and* the source disconnected in the same tick, idle takes precedence and the takeover unmounts cleanly. The offline banner then renders above the regular queue body, not inside a stale takeover shell.
  - `player.item.queuedBy.sessionId` becomes a different session (someone else's song starts) → return to the regular queue view.
  - The phone re-loads mid-takeover → reconnects, receives `state.full`, re-evaluates the same predicate, restores the takeover if still applicable.
  - The source pauses (but is still connected, status === 'paused') → takeover **stays visible** with `▌ PAUSED` mono caps in place of the time, so the singer knows playback has stopped without losing their pitch context.
- **Same-user back-to-back transition.** If song A (queued by me) ends and song B (also queued by me) starts immediately, the takeover **stays mounted**: only the title, sub-line, time, and pitch readout swap atomically inside the existing DOM. The component does not unmount/remount. This avoids the visual flicker of an empty queue-view frame and suppresses spurious `aria-live` announcements from a re-mount. Implementation note: the takeover root component is rendered whenever the predicate `(player.status !== 'idle') && (player.item.queuedBy.sessionId === mySessionId)` is true; React diffing keeps it mounted across `player.item.id` changes as long as the predicate stays true.

### 4.6 Name entry

Unchanged in structure:

```
┌──────────────────────────┐
│ ▌ ENTER THE ROOM         │
│ What's your name?        │
│ [Sarah______________]    │
│ [   SIGN IN   ]          │
└──────────────────────────┘
```

- Drop the `transform: rotate(-0.5deg)` on the form's `.paper-card`. Otherwise unchanged.

---

## 5. Visual style — preserved with two tweaks

### 5.1 Card rotation

The `.paper-card` utility class currently has:
```css
.paper-card { transform: rotate(-0.5deg); ... }
.paper-card:nth-child(2n) { transform: rotate(0.5deg); }
```

**Drop both rules.** All cards stand upright. Keep the box-shadow (cigarette-yellow offset) and the `paper-grain` texture combination — those are the parts that read as "paper."

### 5.2 Card variants

Introduce two opt-in classes (no rotation):

- `.paper-card--accent` — adds a 4px hanko-red left border. Used by the expanded search/paste row, and by the "▌ NOW PLAYING" card on phone.
- `.paper-card--minor` — text color shifts to `var(--ink-muted)`. Used by setlist rows after the first.

Existing `.paper-card`, `.paper-grain`, `.tape-strip`, `.hanko`, `.uc`, `.riso-noise` classes keep their definitions.

### 5.3 Marquee class

Add a `.marquee` utility for the now-playing title. Triggers only when content width > container; otherwise behaves like a normal truncated div.

**Canonical timing rule:** scroll speed is constant across titles, regardless of how long the title is. Effective speed = **30 px/s** of horizontal travel; pause **1.5 s** at each end. The component computes:

- `overflowPx = title.scrollWidth - container.clientWidth` (the *exact* number of pixels the title overflows by; never `100%` of the container, which would over-scroll).
- `duration = (overflowPx / 30) + 3.0` seconds (3.0 = 1.5 s pause at each end).
- Two inline CSS variables are written on the `.marquee[data-overflow="1"] > span` element: `--marquee-distance: <overflowPx>px` and `--marquee-duration: <duration>s`. The keyframes use the distance variable, never `-100%`.

```css
.marquee {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  /* When data-overflow="0" (no overflow), inner content uses ellipsis. */
  text-overflow: ellipsis;
  min-width: 0; /* allows flex children to shrink and ellipsis to engage */
}
.marquee[data-overflow="1"] > span {
  display: inline-block;
  /* No padding-left: the animation translates by the actual overflow distance,
     so the title scrolls until its right edge reaches the container's right edge. */
  animation: marquee var(--marquee-duration, 14s) linear infinite;
}
@keyframes marquee {
  0%   { transform: translateX(0); }
  /* The pause + scroll percentages are derived from --marquee-duration:
     the 1.5 s pauses at each end are roughly the first/last 1.5/duration
     fraction of the timeline. The simpler rule the component implements is
     to interpolate the keyframe stops based on duration; concretely it
     emits the @keyframes inline with computed stops. The static rule below
     is shown for the typical 8% pause case. */
  8%   { transform: translateX(0); }
  92%  { transform: translateX(calc(-1 * var(--marquee-distance, 100%))); }
  100% { transform: translateX(calc(-1 * var(--marquee-distance, 100%))); }
}
@media (prefers-reduced-motion: reduce) {
  .marquee[data-overflow="1"] > span { animation: none; transform: translateX(0); }
}
```

If the static keyframe stops above don't yield a 1.5 s pause for very short or very long titles, the component may write a per-instance inline `@keyframes` (with a unique animation-name) to place the pause stops at exactly `1.5 / duration` and `1 - (1.5 / duration)`. **Lifecycle for these per-instance keyframes (required to prevent leaks):**

- The animation-name uses a deterministic id derived from the component instance id (e.g. `marquee-${id}`) — not a random UUID — so the same instance reuses the same name across re-renders.
- The injected `<style>` element is keyed by that id; updating the keyframes replaces the same `<style>` node, never appends a new one.
- On unmount, the component removes its `<style>` node from the DOM.
- The `--marquee-distance` variable is the canonical pixel value regardless of which keyframe approach is used.
- **Reduced-motion**: before injecting any per-instance keyframes, check `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. If `true`, **skip the injection entirely** — the static `.marquee` rules and the `prefers-reduced-motion` override block above are sufficient. The component must also subscribe to media-query changes so it removes its `<style>` node when the user enables reduced motion mid-session. **API compat**: prefer `media.addEventListener('change', cb)`; older Safari (≤13) only exposes `media.addListener(cb)`. Use a small polyfill: `if (media.addEventListener) media.addEventListener('change', cb); else media.addListener(cb);` and pair the cleanup with the matching remove call.

**Measurement & remeasure triggers (all required):**

1. **Title text change** — recompute on every prop change.
2. **`document.fonts.ready`** — recompute once after fonts load (Crimson Pro is loaded via `next/font`; the initial measurement before fonts settle would be wrong).
3. **`ResizeObserver`** on the strip's container element — recompute on layout changes (window resize, devtools open, address bar collapse). **Throttle**: coalesce ResizeObserver callbacks via `requestAnimationFrame` so multiple events in the same frame produce one measurement. **The overflow boolean is always recomputed** on title changes and `document.fonts.ready`; the 4-px-delta guard *only* skips the duration recalculation, never the overflow flip — small width changes near the wrap threshold still need to flip `data-overflow`.
4. On overflow detected: set `data-overflow="1"` and inline `style="--marquee-duration: <distance/30 + 3.0>s"`. On no overflow: set `data-overflow="0"` and clear the inline variable; the title falls back to ellipsis truncation via `text-overflow: ellipsis`.

### 5.4 Mobile UX rules (cross-cutting)

These rules apply to every screen unless an explicit exception is stated.

- **Tap targets — control-to-class matrix.** Every interactive element listed in this spec MUST either carry the `.hit-target` class OR meet the size rule directly via component-level CSS. The complete matrix (controls referenced anywhere in this spec → mechanism):

  | Control | Phone min size | Desktop fine min | Mechanism |
  |---|---|---|---|
  | `<Tabs>` tab buttons (QUEUE/SEARCH/PASTE) | 48 | 32 | `.hit-target` |
  | Phone header `⚙` settings | 48 | 32 | `.hit-target` |
  | Search row toggle button (header) | 56 (explicit) | 56 | `.search-row > button` rule |
  | Search GO / cancel-current | 48 | 32 | `.hit-target` |
  | Search ADD, Paste ADD | 48 | 32 | `.hit-target` |
  | Search/Paste KEY ± stepper | 48 | 32 | `.hit-target` |
  | Phone queue row `✕` | 48 | 32 | `.hit-target` |
  | Paste RESOLVE | 48 | 32 | `.hit-target` |
  | Paste textarea | 48 (height) | n/a | `.hit-target` |
  | Pending tray row body / `[×]` | 48 | 32 | `.hit-target` |
  | YOU'RE UP `−` / `+` | 48 (explicit ≥48) | 48 (explicit ≥48) | `.youre-up__btn` rule |
  | Source pitch ± / transport | 48 always | 48 always | `.now-playing-strip .hit-target` |
  | Source setlist `⤴` / `✕` | 48 | 32 | `.setlist-row__actions > button` rule |
  | Source shuffle on setlist header | 48 | 32 | `.hit-target` |
  | Source volume slider (clickable area) | 48 (height wrapper) | 32 | `.hit-target` |
  | TokenEntry submit | 48 | 32 | `.hit-target` |
  | NameEntry submit | 48 | 32 | `.hit-target` |
  | Mobile QR chip button | 48 | n/a (desktop has no chip) | `.hit-target` |
  | JoinUrlModal close, copy URL | 48 | 32 | `.hit-target` |
  | Toast UNDO buttons | 48 | 32 | `.hit-target` |
  | StartShowGesture button | 48 (whole screen anyway) | 48 (whole screen) | n/a — full-bleed |

  Implementers must verify each row of this matrix during component build; missing a `.hit-target` class on a listed control is a spec violation.

- **Tap targets — global rule** (subordinate to the matrix above): under the touch breakpoint (`@media (max-width: 720px), (pointer: coarse)` — note the **comma**, which is CSS's "OR" between media queries; do not write `or`), every interactive element has a hit-target of **at least 48×48 CSS px** (= max of iOS HIG 44pt and Android Material 48dp; in CSS px both round up to 48). The visible glyph may be smaller; pad the surrounding hit area with transparent padding to reach 48 CSS px. **On desktop with a fine pointer** (`@media (pointer: fine)`), the minimum drops to **32×32 CSS px** (matching the source page's right-rail density at desktop sizes — the 8-row setlist + per-row ⤴ button needs the smaller hit target to fit; mouse precision makes 32 CSS px comfortable). Whenever this spec elsewhere says "44pt" the binding rule is "48 CSS px on touch / 32 CSS px on fine pointer" — this section is the source of truth. **Width units are CSS px throughout this spec; we do not use the `pt` unit.**
- **`touch-action`**: scoped to actual interactive *controls* — `<button>`, `<input>`, `<a>`, the search row toggle button, the takeover ± buttons, etc. — set `touch-action: manipulation` (defeats the legacy 300 ms double-tap-to-zoom delay and the unwanted default double-tap zoom). Generic card/row container `<div>` and `<li>` elements do **not** set `touch-action: manipulation` — applying it to non-controls causes long-press/callout quirks on iOS for no benefit. The takeover readout (a tappable region with drag) uses `touch-action: pan-y` instead (lets vertical scroll through but captures horizontal pointer for the optional drag).
- **Viewport meta**: the document `<meta name="viewport">` is `width=device-width, initial-scale=1, viewport-fit=cover` — `viewport-fit=cover` is required for `env(safe-area-inset-*)` to resolve to non-zero on iOS. Do not include `user-scalable=no` (accessibility regression).
- **iOS keyboard-visible behavior**: when the on-screen keyboard opens (search or paste textarea is focused), the focused control and any related action target (the GO button, the expanded ADD row) must remain visible. Implementation:
  - The page root has `scroll-padding-top: var(--top-occluder-height)` (the FULL top chrome — tabs + banner + tray) and `scroll-padding-bottom: 96px` so any `scrollIntoView` call honors all sticky chrome and the bottom safe area.
  - **Fallback when `visualViewport` is unavailable or quirky.** Some Android WebViews and older browsers expose `visualViewport` as `undefined`, or fire `resize` inconsistently. If `window.visualViewport` is `undefined`, register a `window.addEventListener('resize', …)` plus `document.addEventListener('focusin', …)` / `focusout` instead. The keyboard is considered open after `focusin` on an `input`/`textarea` AND a `window.resize` lands within 300 ms. Closed: `focusout`, OR a resize that returns the viewport to within 100 px of `screen.height`. The hysteresis from the primary path is approximated by the focus events. The fallback is functionally similar but less precise — acceptable for the small percentage of clients that lack `visualViewport`.
  - **Detection rule with hysteresis (primary path, when `visualViewport` exists)** to prevent flapping. Define two thresholds derived from the viewport:
    - `OPEN_THRESHOLD  = max(120, window.innerHeight * 0.18)`
    - `CLOSE_THRESHOLD = max(80,  window.innerHeight * 0.10)`
    - `OPEN_THRESHOLD > CLOSE_THRESHOLD` (this is the hysteresis gap; address-bar jitter falls between them and does not toggle state).

    Register `visualViewport.addEventListener('resize', …)`. Compute `delta = window.innerHeight − visualViewport.height`. Maintain an internal `keyboardOpen` boolean (initial `false`):
    - **Transition closed → open**: `keyboardOpen` was `false` AND `delta > OPEN_THRESHOLD` AND `document.activeElement` is an `<input>` or `<textarea>`.
    - **Transition open → closed**: `keyboardOpen` was `true` AND (`delta < CLOSE_THRESHOLD` OR `document.activeElement` is no longer an `<input>`/`<textarea>`).

    The handler is debounced with 50 ms trailing edge. URL-bar collapse alone produces a delta under both thresholds and never toggles `keyboardOpen`.
  - When transitioning to "open": call `focusedElement.scrollIntoView({ block: 'center', behavior: 'auto' })` on the **focused input only**. Do NOT also scroll a paired action button — sequential `scrollIntoView` calls on iOS visualViewport resize can oscillate. After the first scroll completes (next animation frame), determine the **primary action button** for the active tab and check its occlusion (`getBoundingClientRect().bottom > visualViewport.height`):
    - Search tab: primary = GO button if a query is being typed; ADD button if a result row is currently expanded.
    - Paste tab: primary = RESOLVE button if textarea has focus; ADD button if a preview is rendered.
    - If primary is occluded, call `scrollIntoView` on it once.
  - This is a single-follow-up rule (max two scrollIntoViews per transition: input + at most one action button). (`'auto'` is the standards-canonical value for "no smooth scrolling"; never use `'instant'`, which was a non-standard alias and is unreliable in iOS Safari.)
  - The **toaster does not reposition** when the keyboard opens — it stays anchored at `top: var(--top-occluder-height)` per its single-rule placement (§ Toaster.tsx in §6). The keyboard handling repositions only the focused input via scroll, not other UI.
  - When transitioning to "closed": no action — the layout returns to normal naturally.
- **Landmarks**: every page provides screen-reader landmarks. Specifically:
  - Phone `/` root: `<header>` (the `<Tabs>` strip, role `banner`), `<main>` (the active tab body, with an `aria-label` of "Queue", "Search", or "Paste").
  - Phone takeover: still has the `<header>` Tabs at top; the takeover body is `<section aria-label="You're up — pitch control">` so screen-reader users can land on it directly.
  - `/source`: `<main aria-label="Karaoke source display">` containing `<section aria-label="Now playing">` (video frame) and `<aside aria-label="Setlist and join controls">` (right rail).
  - The toaster lives in a `<div role="status" aria-live="polite" aria-atomic="true">` wrapper, exempt from the landmark count (status regions are not landmarks).
- **Body / label minimums**:
  - Body text: ≥**14px**.
  - Mono caps labels (uc class): ≥**12px** desktop, **≥13px on phones (≤720px)** for status-critical labels (LIVE badge, "▌ NOW PLAYING", "▌ YOU'RE UP", source-offline banner, error toasts). Decorative or secondary labels (e.g. timestamps inside the now-playing strip sub-line) may stay at 12px even on phones because they're paired with always-visible context.
  - **Form input text (`<input>`, `<textarea>`, `<select>`): ≥16 CSS px.** This is required to prevent iOS Safari from auto-zooming the page when the user focuses an input — auto-zoom breaks the layout, scrolls the focused input partly off-screen, and corrupts the keyboard-visible behavior described above. 16 CSS px is iOS Safari's threshold below which auto-zoom triggers; we always meet it.
  - Letter-spacing on uc class: 0.15em–0.20em (existing rule; keep).
  - Tiny labels under 12px are **not allowed**.
- **Color contrast**: text against its background must meet **WCAG AA** (4.5:1 normal, 3:1 large ≥18px / 14px-bold). Specifically:
  - `var(--cigarette)` (#d4a847) on `var(--ink-black)` (#0a0808) is allowed only at ≥**14px bold or ≥18px normal**. Below that, use `var(--paper-cream)` (cream on dark passes AAA) or `var(--riso-pink)` (passes AA at 4.5:1).
  - `var(--ink-muted)` (#6a4818) on `var(--paper-cream)` (#fff8e0) passes AA; ok for setlist secondary rows.
  - Hanko-red (#c1272d) on cream is the primary accent; passes AA.
- **Safe-area insets — single owner per edge per screen.** Each of the four edges (top, right, bottom, left) has exactly one owning element on each screen. Different edges on the same screen can have different owners. **Lateral (left/right) ownership** is delegated to the sticky `<Tabs>` header for the chrome area (so its content stays clear of landscape-notch cutout), AND independently owned by the body root for the tab body content below the sticky header — these are non-overlapping vertical regions, so both can own lateral insets without double-padding any single point. (The "single owner per edge per screen" rule is interpreted per-region: the sticky chrome region and the scrollable body region are distinct vertical strips.) The CSS in §5.6 is the binding implementation. The table below names owners by edge:

  | Screen | Top inset owner | Bottom inset owner |
  |---|---|---|
  | Phone `/` (queue/search/paste tabs, **takeover not active**) | `<Tabs>` sticky header | Body root |
  | Phone `/` queue tab with **takeover active** | `<Tabs>` sticky header (still visible — owns top inset) | The takeover's controls panel (bottom of viewport) |
  | Phone `/` SEARCH/PASTE tabs while own song is playing (takeover would render in queue tab but its DOM is **not** mounted on these tabs) | `<Tabs>` sticky header | Body root |
  | Phone `/` name entry | Page root | Page root |
  | `/source` desktop (>720px) | Page root | Page root |
  | `/source` mobile (≤720px) | Page root | Page root (the volume panel sits at the bottom but does not own the inset; the root applies bottom padding around it) |
  | `/source` token entry, start-show gesture, idle splash | Page root (here the "page root" IS the screen's top-level component — `.token-entry`, `.start-show-gesture`, etc. — NOT a `.source-root` wrapper. There is no outer `.source-root` for these pre-show states.) | Same as top |
  | `/source` source-offline state | Page root | Page root |

  Implementers must annotate the owning element in code with a comment: `// owns safe-area-inset-top` / `// owns safe-area-inset-bottom`. No element may set safe-area inset padding without that comment.
- **Viewport units**: every full-screen panel uses `min-height: 100dvh` with `min-height: 100vh` as a **same-property fallback**. The order is required: declare `min-height: 100vh;` first, then `min-height: 100dvh;` immediately after, in that order. Modern browsers honor the second rule (cascade order); legacy browsers that don't recognize `dvh` ignore the second rule and fall back to the `vh` value. Reversing the order would let legacy browsers ignore the `dvh` (the modern value) and modern browsers happily honor it — but writing them in the wrong order makes some build chains drop the unknown unit, leaving only `vh` everywhere. Always: vh first, dvh second.
- **Scroll behavior — single scroll container.** The `<html>` element is the only scroll container on every page (binds via `html { overflow-y: auto }` in §5.6). `body`, `.phone-root`, and every internal panel set `overflow: visible` and expand naturally. No internal panel creates a nested scroll container on phones. This avoids nested-scroll trap on iOS.
  - On desktop (>720px), the source-page setlist panel may scroll internally (it sits in a fixed-height rail), but only there.
  - `overscroll-behavior: contain` is applied to **both `html` and `body`** (matches the §5.6 CSS) — both are needed because some Android browsers honor it on `html` and some on `body`, and applying to both is harmless. The behavior we want is "block bounce-scroll from leaking outside the app", which is a single consistent behavior regardless of which element actually owns the scroll.
- **Aria labels**: every icon-only button has an `aria-label`. Specifically required:
  - `⚙` → "Edit name"
  - **Search row toggle**: the visible *text* (title + channel · duration) is the accessible name of the row's `<button>` — DO NOT add an aria-label that would override that. The `▾` / `▴` chevron is decorative and `aria-hidden="true"`. The row's `aria-expanded` attribute communicates state.
  - `⏮` → "Previous song"
  - `⏯` / `▶` → "Pause" / "Play"
  - `⏭` → "Skip"
  - `🔀` → "Shuffle queue"
  - `⤴` → "Move to top"
  - `✕` (phone queue tab — only on user's own items) → "Remove your queued song"
  - `✕` (source setlist row — source can remove any item) → "Remove from queue"
  - `−` / `+` (key stepper) → "Lower pitch by one semitone" / "Raise pitch by one semitone"
- **Focus-visible**: every interactive element has a visible focus ring (`:focus-visible`) — 2px hanko-red outline with 2px offset. Don't rely on browser defaults; they're inconsistent.
- **`prefers-reduced-motion: reduce`** scope: every animation/transition referenced in this spec must be defined explicitly in §5 with a `@media (prefers-reduced-motion: reduce)` override. The override **must remove all motion (translate/scale/rotate) and any decorative animation**. Pure opacity fades that communicate functional state (e.g. a toast appearing) are *permitted* under reduced motion at ≤200 ms — this is the WCAG 2.3.3 carve-out for essential information delivery; everything else must be `none`. The animations that exist:
  1. **Marquee scroll** — defined in §5.3; reduced-motion override sets `animation: none`.
  2. **LIVE badge pulse** — defined in §5.5; reduced-motion override sets `animation: none` and locks opacity to 1.
  3. **Search row expand/collapse** — `max-height` transition (200 ms ease-out); reduced-motion override sets `transition: none` and uses `max-height: none` for the expanded state.
  4. **YOU'RE UP button tap-flash** (`.youre-up__btn`) — keyframe animation on the buttons (120 ms hanko-red flash); reduced-motion override sets `animation: none`.
  5. **YOU'RE UP mount** (`.youre-up`) — `opacity` transition (150 ms); reduced-motion override sets `transition: none`.
  6. **Toaster mount/dismiss** — slide-in from above + fade (180 ms); reduced-motion override removes the translate but **retains the opacity fade** under the WCAG carve-out above.

  Implementers may not introduce additional animations without adding them to this list. **§5.4 is the policy source of truth (which animations exist, what reduced-motion does); §5.5 is the implementation source of truth (the actual CSS rules). They must agree; if they ever appear to disagree, §5.4 is authoritative for behavior and §5.5 must be patched to match.**
- **Landscape phone (height ≤ 480px)**: the compact variant applies to **every tab**, not only queue/takeover:
  - **Queue tab**: now-playing title forced to **16 CSS px** (override of the 16–18 baseline; pick the lower bound deterministically), takeover title forced to **16 CSS px**, takeover big-readout **24 CSS px**, button heights 48 CSS px.
  - **Search tab**: query input + GO row stays sticky-top (just below the Tabs header); result rows become more compact (title 14px, duration row 12px); expanded body still uses 48 CSS px controls but tightens vertical spacing (8px gaps instead of 12px).
  - **Paste tab**: textarea collapses to 2 rows (from 3); RESOLVE button stays full-width 48 CSS px; expanded preview card uses the same compact spacing as search.
  - The **acceptance target** is "no horizontal overflow; all controls reachable; vertical scroll is allowed if the design doesn't fit." Single-scroll-container rule still applies — vertical scroll happens at the page root, not in any inner panel.

### 5.5 Animation definitions (consolidated)

This is the source of truth for every CSS animation/transition referenced elsewhere in the spec. All entries include the `prefers-reduced-motion` override.

```css
/* §3.2 LIVE badge pulse */
@keyframes live-pulse {
  0%, 100% { opacity: 1.0; }
  50%      { opacity: 0.7; }
}
.live-badge[data-status="playing"] {
  animation: live-pulse 1.5s ease-in-out infinite;
}
.live-badge[data-status="paused"] { opacity: 0.6; animation: none; }
.live-badge[data-status="idle"]   { display: none; }
@media (prefers-reduced-motion: reduce) {
  .live-badge[data-status="playing"] { animation: none; opacity: 1; }
}

/* §4.3 Search row expand/collapse — measured height, never clipped.
   The component sets `--row-content-h` from a useEffect that measures the
   children's natural scrollHeight; the CSS animates to that value. If the
   measurement fails or is 0, fall back to `none` (instant, no animation).
   The expand state is keyed off the `<li>`'s `data-expanded` attribute,
   not aria-expanded — aria-expanded lives on the button per §4.3. */
.search-row__body {
  max-height: 0;
  overflow: hidden;
  transition: max-height 200ms ease-out;
}
.search-row[data-expanded="1"] .search-row__body {
  max-height: var(--row-content-h, 9999px); /* fallback large to never clip */
}
/* When the component cannot measure (e.g. body content not yet rendered), it sets
   `data-no-measure="1"` on the .search-row, which switches off the transition AND
   forces max-height to none — instant expand, no animation flicker on huge fallback. */
.search-row[data-no-measure="1"] .search-row__body {
  transition: none;
}
.search-row[data-expanded="1"][data-no-measure="1"] .search-row__body {
  max-height: none;
}
@media (prefers-reduced-motion: reduce) {
  .search-row__body { transition: none; }
  .search-row[data-expanded="1"] .search-row__body { max-height: none; }
}

/* §4.5 YOU'RE UP button tap flash (matches the `.youre-up__btn` namespace used elsewhere). */
@keyframes tap-flash {
  0%   { background: transparent; }
  20%  { background: var(--hanko-red); }
  100% { background: transparent; }
}
.youre-up__btn:active { animation: tap-flash 120ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .youre-up__btn:active { animation: none; }
}

/* §4.5 YOU'RE UP mount */
.youre-up { opacity: 0; transition: opacity 150ms ease-out; }
.youre-up[data-mounted="1"] { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .youre-up { transition: none; opacity: 1; }
}

/* Toaster mount/dismiss (in shared/Toaster.tsx)
   Reduced-motion exception: `prefers-reduced-motion: reduce` does not require zero motion
   on functionally-helpful indicators (per WCAG 2.3.3, "Animation from Interactions" is
   essential when removing it would cause loss of information). A toast that simply pops
   into existence is fine; we keep a 180ms opacity fade so the appearance isn't jarring.
   The transform/translate IS removed under reduced-motion. */
.toast {
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 180ms ease-out, transform 180ms ease-out;
}
.toast[data-visible="1"] { opacity: 1; transform: translateY(0); }
@media (prefers-reduced-motion: reduce) {
  .toast { transition: opacity 180ms ease-out; transform: none; }
}
```

The marquee animation lives in §5.3 alongside its measurement rules.

### 5.6 Mobile-specific layout (normative CSS)

These selectors are the source of truth for the §3.5 mobile prose; implementers must match the structure and class names so the rules cascade correctly.

```css
/* Default --tabs-height so layout that depends on it doesn't collapse to 0
   during the first paint before <Tabs> measures itself. The default
   includes safe-area-inset-top so notched-iPhone first paint doesn't
   under-pad the takeover. The <Tabs> component overwrites this variable
   on mount via ResizeObserver with its measured height. */
:root {
  --tabs-height: calc(56px + env(safe-area-inset-top, 0px));
  /* --top-occluder-height = total height of every sticky/inserted element
     above the tab body content. Updated by a SINGLE occluder manager
     (a small hook in the phone-root component) that, on every mount/unmount/
     resize event of any sticky chrome (Tabs, offline banner, pending tray),
     measures all currently-mounted occluders via getBoundingClientRect and
     writes the SUM to --top-occluder-height. This avoids the add/subtract
     drift bug where unmount races could leave a stale value: each update is
     a full recomputation from DOM, never an increment.
     Used by:
     - the takeover's `min-height: calc(100dvh - var(--top-occluder-height))`
     - sticky search/paste action rows' `top` offset
     - `<html>`'s `scroll-padding-top` (so iOS keyboard scrollIntoView
       respects the full top chrome). */
  --top-occluder-height: var(--tabs-height);
}

/* §5.4: every interactive control gets touch-action: manipulation.
   Selector covers all real interactive elements — matches the §5.4 prose. */
button, input, textarea, select, a, [role="button"] {
  touch-action: manipulation;
}

/* §5.4 form input anti-zoom: ≥16 CSS px on every form input prevents
   iOS Safari's auto-zoom on focus, which would break our keyboard
   detection and viewport sizing. */
input, textarea, select {
  font-size: 16px;
}
/* Drag readout in the YOU'RE UP takeover overrides this for vertical scroll passthrough. */
.youre-up__readout {
  touch-action: pan-y;
}

/* §5.4: body root prevents Android bounce-scroll from leaking out. */
html, body {
  overscroll-behavior: contain;
}

/* §5.4: focus-visible ring on every interactive element. */
:where(button, [role="button"], a, input, textarea, select):focus-visible {
  outline: 2px solid var(--hanko-red);
  outline-offset: 2px;
}

/* §5.4: SINGLE scroll owner — the `<html>` element. The body and the
   `.phone-root` div both have `overflow: visible` so they don't create
   nested scroll containers; the document-level scroll on `<html>` is
   the only path that vertical content can scroll through. This is the
   simplest portable model that works across iOS Safari, Chrome on Android,
   and desktop browsers without nested-scroll-trap surprises. */
html {
  overflow-y: auto;
  scroll-padding-top: var(--top-occluder-height);
  scroll-padding-bottom: 96px;
}
body, .phone-root {
  overflow: visible;
}

/* §4.5 / Modal scroll-lock — applied to <html> when any modal is open.
   The `.modal-open-lock` class is set on <html> by the modal component on
   mount and removed on cleanup. Locking both <html> and <body> covers
   browsers that scroll on either. This is the only safe scroll-lock pattern
   for our single-scroll-container model. */
html.modal-open-lock {
  overflow: hidden;
}
html.modal-open-lock body {
  overflow: hidden;
}

/* §5.4 viewport units — every full-screen root applies BOTH rules in this
   exact order. The cascade picks `100dvh` on modern browsers, falls back
   to `100vh` on legacy. Selector list covers EVERY full-screen state
   referenced in §3 / §4: phone root, takeover, source running root, source
   pre-show / offline / idle states, name + token entry, start-show. */
.page-root,
.phone-root,
.youre-up,
.start-show-gesture,
.token-entry,
.source-root,
.source-offline,
.source-idle-splash,
.name-entry {
  min-height: 100vh;
  min-height: 100dvh;
}

/* §5.4 safe-area ownership — see ownership table for which element owns
   each inset. Concrete CSS for each owner: */

/* Phone `/` Tabs sticky header — owns top inset on phone client (and during takeover).
   Also owns left+right insets so the tabs label/buttons stay clear of the
   landscape notch / camera cutout on iPhones. */
.tabs {
  position: sticky;
  top: 0;
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
  /* The component reads its rendered height post-mount and writes
     --tabs-height on :root. */
}

/* Phone `/` body root — owns bottom + lateral insets when no takeover is mounted.
   `padding-inline` covers landscape iPhone notch/camera intrusion on the sides. */
.phone-root[data-takeover-mounted="0"] {
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

/* Phone YOU'RE UP takeover — controls panel owns bottom inset; takeover root owns lateral. */
.youre-up {
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
.youre-up__controls {
  /* owns safe-area-inset-bottom */
  padding-bottom: env(safe-area-inset-bottom);
}

/* /source page root for the running show (post-unlock) — root owns ALL FOUR insets. */
.source-root {
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
}

/* /source pre-show / non-running states + phone NameEntry — each is its own
   page root component (no shared wrapper). Each owns its own safe-area padding. */
.token-entry,
.start-show-gesture,
.source-offline,
.source-idle-splash,
.name-entry {
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
}

/* Phone YOU'RE UP takeover (`.youre-up`) sits inside the queue tab body
   below the sticky `<Tabs>` header AND any pending-add tray / offline
   banner that may also be mounted above the body. Height = full visible
   viewport minus the FULL top occluder. NOTE: this is a phone-client
   takeover rule, not a `/source` rule — `/source` does not have a YOU'RE UP. */
.youre-up {
  min-height: calc(100vh - var(--top-occluder-height));
  min-height: calc(100dvh - var(--top-occluder-height));
}

/* §4.3 search row tap target — explicit 56 CSS px override above the global 48. */
.search-row > button {
  min-block-size: 56px;
}

/* §5.4 status-critical mobile labels — concrete 13 CSS px floor on phones.
   Class names match the component matrix. The desktop default is 12px;
   the phone bump prevents any drift below 13px on the labels users rely on
   to understand state at a glance. */
@media (max-width: 720px) {
  .live-badge,
  .youre-up__sub-header,
  .offline-banner,
  .now-playing-badge,
  .paused-badge,
  .next-up-badge {
    font-size: 13px;
  }
}

/* §3 source page layout — desktop grid + mobile stack.
   Desktop: video left + rail right; mobile (<=720px): single column. */
.source-root {
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: 12px;
  padding-block: 12px;
}
.source-root__video { grid-column: 1; }
.source-root__rail  { grid-column: 2; display: flex; flex-direction: column; gap: 10px; }
@media (max-width: 720px) {
  .source-root {
    grid-template-columns: 1fr;
  }
  .source-root__video { grid-column: 1; }
  .source-root__rail  { grid-column: 1; }
}

/* Desktop setlist panel — internal scroll only on desktop, never on phones. */
.setlist-panel {
  /* Default: no internal scroll (mobile rule). */
  overflow: visible;
}
@media (min-width: 721px) {
  .setlist-panel {
    /* Desktop: cap height so 8+ rows scroll inside the rail rather than
       force the whole rail taller than the video frame. */
    max-height: calc(100dvh - 200px);
    overflow-y: auto;
  }
}

/* §3.6 source setlist row action group — concrete CSS. */
/* The setlist row is a flex container with the title taking flex: 1
   (with min-width: 0 so it shrinks before the actions clip) and the
   actions reserved as a fixed-width column on the right. This guarantees
   the action buttons never overlap the title even at 320 px. */
.setlist-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.setlist-row__title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.setlist-row__actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 8px; /* desktop fine-pointer */
}
.setlist-row__actions > button {
  min-inline-size: 32px;
  min-block-size: 32px;
}
@media (max-width: 720px), (pointer: coarse) {
  .setlist-row__actions {
    gap: 12px;
    /* Reserve a fixed column width so the actions never crowd the title. */
    flex: 0 0 auto;
  }
  .setlist-row__actions > button {
    min-inline-size: 48px;
    min-block-size: 48px;
  }
}

/* StartShowGesture — the button IS the page root on this screen.
   Same comment annotation requirement as elsewhere. */
.start-show-gesture {
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
}

/* Hit-target enforcement utility — every interactive control either uses
   class `.hit-target` or directly applies these min-sizes. CSS-level defense
   against undersized buttons drift. */
.hit-target,
button.hit-target,
[role="button"].hit-target {
  min-inline-size: 48px;
  min-block-size: 48px;
}
@media (pointer: fine) {
  .hit-target,
  button.hit-target,
  [role="button"].hit-target {
    min-inline-size: 32px;
    min-block-size: 32px;
  }
}
/* Phone-width override (declared AFTER the fine-pointer rule so cascade order picks
   this when both match — e.g. a narrow desktop window on a fine-pointer machine
   that also crosses the touch breakpoint). The touch breakpoint always wins. */
@media (max-width: 720px) {
  .hit-target,
  button.hit-target,
  [role="button"].hit-target {
    min-inline-size: 48px;
    min-block-size: 48px;
  }
}
/* Source page strip is the desktop touch-pointer-friendly exception (always 48). */
.now-playing-strip .hit-target {
  min-inline-size: 48px !important;
  min-block-size: 48px !important;
}

/* Phone breakpoint */
@media (max-width: 720px) {
  /* §3.5: now-playing strip becomes 2 rows */
  .now-playing-strip {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
  }
  .now-playing-strip__text   { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .now-playing-strip__controls {
    /* 361–720px: single row, no wrap (prevents accidental third-row layout
       on common phone widths). The <=360px sub-breakpoint below switches
       to a column layout explicitly. */
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: nowrap;
    gap: 8px;
  }
  .now-playing-strip__pitch,
  .now-playing-strip__transport {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  /* Buttons inside both groups satisfy §5.4 48 CSS px touch target. */

  /* §3.5: small phones (<=390px) — wrap pitch + transport onto separate lines.
     Boundary raised from 360 to 390 to absorb realistic safe-area + localization
     pressure on iPhone 13 mini and similar phones. */
  @media (max-width: 390px) {
    .now-playing-strip__controls { flex-direction: column; align-items: stretch; }
    .now-playing-strip__pitch,
    .now-playing-strip__transport { justify-content: space-between; }
  }

  /* §3.5: setlist header inlines the QR chip on mobile.
     The mobile QR chip is **image-only** — the "SCAN TO JOIN" caption and
     host:port text are dropped on phone widths to fit the chip beside
     SETLIST and shuffle without truncation. The chip is wrapped in a
     `<button aria-label="Show join URL">` and **tapping it opens a
     `<JoinUrlModal />` dialog**. The modal contract:
     - Renders via the native `<dialog>` element opened with `.showModal()`,
       which provides focus trap, Escape-to-close, and backdrop click-to-close
       on iOS Safari ≥15.4 / Chrome ≥37.
     - On open: move focus to the modal's Close button; record the
       previously-focused element. On close (Escape, backdrop tap, or
       Close button): restore focus to the chip.
     - Content: 240 CSS px QR + caption "SCAN TO JOIN" + host:port +
       Copy URL button + Close button (`aria-label="Close"`). **Compact
       landscape variant** (height ≤ 480 px): QR shrinks to **160 CSS px**;
       modal body becomes scrollable internally (`max-height: calc(100dvh - 32px);
       overflow-y: auto`) so all controls remain reachable when the screen
       is short. **This is the ONE explicit exception to the §5.4
       single-scroll rule**, scoped to "while the modal is open." When
       the modal closes, the single-scroll model is restored automatically.
     - The modal owns its own safe-area padding (`padding: env(safe-area-inset-*)`
       on all four edges).
     - **Background scroll lock**: while the modal is open, both `<html>` and
       `<body>` get `overflow: hidden` (the `<html>` lock covers our single
       scroll-container model from §5.4; the `<body>` lock is belt-and-braces
       for browsers that scroll on `body`). Lock applied via a single
       `.modal-open-lock` utility on `<html>` that the modal sets in `useEffect`
       and clears in cleanup. Concretely: `html.modal-open-lock { overflow: hidden; }`
       and `html.modal-open-lock body { overflow: hidden; }`.
     - **Fallback when `<dialog>.showModal()` is unavailable** (some embedded
       WebViews, very old browsers): mount a `<div role="dialog" aria-modal="true">`
       fixed to the viewport with the same content. Implement focus-trap
       manually (capture-phase `keydown` on `Tab`, cycle focus among focusable
       descendants), `Escape` to close, backdrop click to close. Same
       `.modal-open-lock` scroll-lock utility.
     The desktop rail keeps the full QR panel (image + caption + host:port)
     inline; the modal is mobile-only.
     Header overflow: each child has min-width:0 + ellipsis on the SETLIST
     label so long counts truncate instead of pushing the shuffle button
     off-screen. The QR chip shrinks to 48 CSS px on very narrow widths
     so 56 doesn't crowd a 320 px viewport. */
  .setlist-panel__header {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .setlist-panel__header .qr-chip {
    width: 56px;
    height: 56px;
    flex: 0 0 56px;
  }
  .setlist-panel__header .setlist-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .setlist-panel__header .shuffle-btn {
    flex: 0 0 auto;
  }
  @media (max-width: 360px) {
    .setlist-panel__header .qr-chip {
      width: 48px;
      height: 48px;
      flex: 0 0 48px;
    }
  }
}

/* Compact landscape (also a phone breakpoint) */
@media (max-width: 720px) and (max-height: 480px) {
  .youre-up__title       { font-size: 16px; }   /* compact target — replaces 18 px on portrait phones */
  .youre-up__readout     { font-size: 24px; }
  .youre-up__btn         { min-height: 48px; min-width: 48px; }
  /* Queue tab now-playing card title — matched compact size to the takeover. */
  .queue-now-playing__title { font-size: 16px; }
  .search-row            { padding: 8px 10px; gap: 8px; }
  .search-row__body      { padding: 8px; gap: 8px; }
  /* Paste textarea: 2 rows in compact landscape — set the HTML `rows` attribute
     in the component (`<textarea rows={isCompact ? 2 : 3} />`); CSS does not
     have a `rows` property. The `min-height` rule below pins the visual height
     for browsers that ignore the attribute. */
  .paste-tab__textarea   { min-height: 4em; }

  /* Sticky search/paste action rows — keep the input + GO/Resolve button
     reachable when the user has scrolled through results in compact landscape.
     Anchor below the FULL top occluder (tabs + banner + tray) so they don't
     tuck under chrome when those rows are mounted. */
  .search-tab__query-row,
  .paste-tab__action-row {
    position: sticky;
    top: var(--top-occluder-height, 0);
    z-index: 1;
    background: var(--ink-black);
    padding-block: 6px;
  }
}
```

The CSS uses class names that are normative — implementers may add prefixes, but the *structure* (a `.now-playing-strip` with text + controls children; pitch and transport as inline-flex groups; setlist header with an optional `.qr-chip`) must be present so this CSS applies. The takeover panel uses `.youre-up__controls` as the bottom-inset owner per §5.4.

---

## 6. Component changes — at a glance

| Component | Status | Notable change |
|---|---|---|
| `src/components/source/QueueOverlay.tsx` | Major rewrite | Becomes a stacked rail (QR · setlist · volume); shuffle moves to setlist header; cap setlist at 8 + "+N MORE"; volume row separated; **per-row `⤴` AND `✕` buttons** preserve both `queue.move` and `queue.remove` for source-only fast control. |
| `src/components/source/VideoPlayer.tsx` | Touch | Wraps the now-playing strip; LIVE badge state-machine (playing/paused/idle). |
| New: `src/components/source/NowPlayingStrip.tsx` | New | Bottom strip with marquee title, sub-line, pitch ±, transport. |
| New: `src/components/source/MarqueeText.tsx` | New | Title marquee component; measurement on title-change + `document.fonts.ready` + ResizeObserver; honors `prefers-reduced-motion`. |
| New: `src/components/source/SourceOfflineState.tsx` | New | The §3.3a "source offline / queued but not playing" panel. |
| `src/app/source/page.tsx` | Touch | Switch from absolute-overlay layout to CSS grid (video / rail). Add responsive breakpoint at 720px (inclusive, `<=`). Apply safe-area + 100dvh. |
| `src/components/source/QrPanel.tsx` | Touch | Smaller default size (96–110px); responsive variant; inline-with-setlist header on mobile. |
| `src/components/source/StartShowGesture.tsx` | Touch | The full-screen button **is** the page root on this screen (it occupies the entire `<main>`); per the §5.4 ownership table, "page root" owner means the button itself. Apply `padding: env(safe-area-inset-top) … env(safe-area-inset-bottom)` and `min-height: 100dvh` directly on the button. Do NOT wrap it in another element that also sets safe-area padding. |
| `src/components/source/TokenEntry.tsx` | Touch | Drop card rotation; safe-area on root. |
| `src/components/phone/QueueView.tsx` | Major rewrite | Upright rows, eyebrow `02 · MIKE`, progress bar on now-playing card, ✕ on own items (48 CSS px hit target), "▌ NOW PLAYING" badge, "▌ UP NEXT" section header, source-offline banner. |
| `src/components/phone/SearchTab.tsx` | Major rewrite | Inline-expand with the canonical collapse contract; drop rotation; key picker + Add inside the row; ADD pending-lock until `state.ack`. |
| `src/components/phone/PasteTab.tsx` | Major rewrite | Same inline-expand for the resolved preview; same ADD pending-lock. |
| `src/components/phone/PrePitchSlider.tsx` | Repurpose | Becomes `<KeyStepper />` (`[−] [readout] [+]`). 48 CSS px buttons; `aria-live="polite"` on readout. |
| `src/components/phone/LivePitchSheet.tsx` | Major rewrite | Becomes `<YoureUpView />` — full takeover replacing the queue body. Big readout, ± buttons (drag-to-change is **phase-2, behind `karaoke.featureFlags.dragPitch` and not enabled by default**); per the §5.4 ownership table the `<Tabs>` header owns the top inset (the takeover sub-header does NOT add safe-area-top), and the takeover's bottom controls panel owns the bottom inset; sized at `min-height: calc(100dvh − var(--top-occluder-height))` (the FULL top chrome, not just tabs — see §3.5). |
| `src/components/phone/NameEntry.tsx` | Touch | Drop card rotation; safe-area on root. |
| New: `src/components/phone/Tabs.tsx` | New | The header + tab strip extracted as a sticky component with safe-area top padding. The Tabs component is **read-only** with respect to `--top-occluder-height`; it doesn't measure or write that variable. The single writer is the phone-root layout component (next row). |
| New: `src/components/phone/PhoneRoot.tsx` (or equivalent in `src/app/page.tsx` layout effect) | New | **Single owner** of `--top-occluder-height`. Hosts a measurement loop that, on every mount/unmount/resize of `<Tabs>`, `<OfflineBanner>`, and `<PendingAddsTray>` (using ResizeObserver on each), measures their current heights via `getBoundingClientRect`, sums them, and writes the result to `:root --top-occluder-height`. No other component writes this variable. |
| New: `src/components/phone/JoinUrlModal.tsx` | New | Mobile-only modal opened by tapping the QR chip on `/source` (when viewed on a phone). Uses native `<dialog>` with focus trap and the `.modal-open-lock` scroll-lock; falls back to `<div role="dialog">` with manual focus trap on browsers without `<dialog>` support. |
| New: `src/components/phone/OfflineBanner.tsx` | New | **SINGLE banner** mounted ONCE in the phone-root layout (between `<Tabs>` and the active tab body). NOT rendered by individual tabs. Visible when `sourceConnected === false || sourceReady === false`. Belongs to the `--top-occluder-height` measurement set. |
| New: `src/components/phone/PendingAddsTray.tsx` | New | Pending Adds tray mounted ONCE in the phone-root layout, above the active tab body. Visible whenever `pendingAdds.size > 0`. Belongs to the `--top-occluder-height` measurement set. |
| `src/components/shared/Toaster.tsx` | Touch | Toast container respects `prefers-reduced-motion` (no slide-in). It does **not** add its own `safe-area-inset-top` (that would duplicate the §5.4 owner). Instead it positions absolutely with `top: var(--top-occluder-height, 0)` so it floats below the **full** top chrome (sticky Tabs + offline banner + pending tray, whichever are mounted), never overlapping their actionable controls. |
| `src/styles/riso.css` | Touch | Remove rotation rules; add `.paper-card--accent`, `.paper-card--minor`, `.marquee`, `@keyframes marquee`; add `:focus-visible` outline; declare safe-area + `100dvh` page-root rules. |

---

## 7. Server protocol

**No changes.** The server's WS message types, idempotency, authority rules, epoch model, and proxy stay exactly as they are. The redesign is a pure client-side rework.

---

## 8. Success criteria

**This list is additive.** Base spec success criteria **#1–5 and #7–10** (`docs/superpowers/specs/2026-05-06-karaoke-app-design.md` §8 lines 484–493) remain mandatory. **Base #6** (the live-pitch slider drag) is superseded by redesign criterion #15 in this section. Verbatim mapping:

- **Base #1** — `brew install yt-dlp` → `npm install` → `npm run start` prints LAN URL, QR code, source token.
- **Base #2** — Opening `/source` on the MacBook prompts for the token; entering it persists. "▶ Start show" unlocks audio.
- **Base #3** — Phone scans QR, opens app, asks for a name, shows an empty queue.
- **Base #4** — Searching "bohemian rhapsody karaoke" returns ≥5 plausible results within 5 s.
- **Base #5** — Adding a song with pre-pitch −2 plays the song down 2 semitones at start, lyrics visible, no speed change.
- **Base #6** — *Superseded* (replaced by redesign criterion #15 — tap [+] / [−] on YOU'RE UP).
- **Base #7** — A second phone joining and adding their own song shows up in the queue with their name.
- **Base #8** — From `/source`, skip advances; prev returns to the just-played song; race-protected against in-flight `player.ended`.
- **Base #9** — Refreshing the source page mid-song restores the same item at the correct position after "▶ Resume show", with pitch preserved.
- **Base #10** — Closing both phone browsers does not break playback or the queue.

The redesign is "done" when, on a freshly built repo, the base criteria above pass AND:

1. Open `/source` in Chrome on the MacBook → the Shimokitazawa splash sits inside a 16:9 video frame on the left, with a small QR · setlist · volume rail on the right.
2. Open the LAN URL on a phone → name entry appears with no card rotation. Sign in.
3. Tap the **search** tab, search "bohemian rhapsody karaoke" → results render upright. Tap one → it expands inline with `KEY [−][0][+]` and `ADD`. Tap a different result → first collapses, second expands.
4. Set key to −2, tap Add → switches to **queue** tab; the song appears in `▌ UP NEXT` with the eyebrow `02 · YOU` and `KEY −2`.
5. The source page video frame switches from the splash to the karaoke video; the LIVE badge appears; the now-playing strip shows the title (marquees if it overflows) and the pitch + transport controls.
6. Drag the source's volume slider — audio level changes immediately. Click `[−]` on the source's pitch — pitch drops by one semitone within 500ms.
7. Click 🔀 on the setlist header — queue order changes.
8. When *your* song starts, the phone's **queue tab body** becomes the YOU'RE UP takeover with the big −2 readout. Tap `[+]` twice → readout becomes `0`; the song's pitch follows on the source. Tap `[QUEUE]` again — same takeover. Tap `[SEARCH]` — leaves the takeover (other tabs are navigable).
9. Resize the source page to **720px** or narrower — layout collapses to single-column with the video on top, then strip, then setlist (with QR inline at its header), then volume. (Inclusive boundary: at exactly 720px it is collapsed.)
10. With `prefers-reduced-motion: reduce` set in the OS, every motion-bearing animation listed in §5.4 is suppressed: the marquee does not scroll, the LIVE badge does not pulse, the takeover tap-flash does not flash, no slide/expand/translate transitions play. **Exempt** (per §5.4): a toast may opacity-fade ≤200 ms (the WCAG 2.3.3 essential-information carve-out). The §5.4 list is the source of truth — if §5.4 and §5.5 ever appear to disagree, §5.4 prevails.
11. On an iPhone in portrait, the YOU'RE UP takeover does not hide controls behind the home indicator (`safe-area-inset-bottom` honored); the page does not jump when Safari's address bar collapses (uses `100dvh`).
12. On an iPhone in landscape (height ≤ 480px), the takeover applies the compact variant: **title 16 CSS px** (matching §5.4 / §5.6), readout 24 CSS px, no horizontal overflow, controls reachable. Vertical page scroll is permitted if the layout doesn't fit a 480px viewport.
13. Keyboard / screen-reader audit: tabbing through `/source` and `/` reaches every interactive element with a visible focus ring; VoiceOver announces every icon button by its aria-label.
14. Search → Add: tap a row, set key, tap ADD. The button shows a pending state and is disabled while pending (with the explicit timeout-retry escape per §4.3 — "tap to retry" after 6 s of no ack uses the same `msgId`). Double-tapping ADD during the same pending window does not result in two queued songs.
15. **YOU'RE UP pitch latency.** While your song is playing, tap `[+]` once on the takeover. Within 500 ms, the source's audio pitches up one semitone, the source overlay's pitch readout updates to match, and the takeover's big readout updates to match. Same test for `[−]`.

---

## 9. Risks

- **Marquee correctness.** Covered by the §5.3 measurement triggers (title-change + `document.fonts.ready` + `ResizeObserver`). The remaining risk is `Crimson_Pro` swap timing under aggressive font loading — accept brief mis-measure during the very first 200 ms.
- **Drag-to-change on the YOU'RE UP readout.** Mobile Safari pointer events are quirky; the §4.5 spec requires Pointer Events, axis-lock, 8 px dead-zone, and `setPointerCapture`. If field testing shows accidental pitch changes during scroll, ship without drag — the `[−] [+]` buttons are sufficient.
- **Setlist row overflow on very small phones (320 px width).** `02 · MIKE — Don't Stop Believin'` wraps. Fallback: title truncates with ellipsis when row width < 200 px (each row is `display: flex; min-width: 0; overflow: hidden`).
- **Source mobile responsive breakpoint** (720 px, inclusive — `<=`). Some 8" tablets sit right at this boundary; pick this single breakpoint and accept the imperfection rather than adding a third layout.
- **Volume blast on reload** mitigated by §3.6's `localStorage["karaoke.volume"]` persistence. Edge case: a guest's first time on a freshly-reset MacBook will get 1.0; that's the same as the GainNode default and acceptable.
- **Pointer events vs. iOS Safari ≤ 12.** Drag-on-readout requires Pointer Events. iOS Safari ≥ 13 has them; older versions silently lose the drag, but the buttons still work.
