# Karaoke App — UI Redesign Spec

**Date:** 2026-05-08
**Status:** Approved (brainstorming complete; ready for implementation planning)
**Supersedes the UI portions of:** `docs/superpowers/specs/2026-05-06-karaoke-app-design.md` §6

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

- **▌ LIVE 出演中** badge — top-left, riso-pink mono caps, 2-3px letter-spacing. Subtle slow-pulse animation (no flicker; opacity 0.7 → 1.0 over ~1.5s) when player is `playing`. Hidden when idle.
- **Now-playing strip** — bottom edge of the frame, full-width, paper-cream background, ink-black text. Contains, in one row:
  - **Title** (Crimson Pro 900 italic, 14–16px), **marquee** if it overflows the available width. Marquee rule: pause 1.5s, scroll left at ~30px/s, pause 1.5s at end, snap back. Use CSS `@keyframes` with `prefers-reduced-motion` honored (no marquee for users who prefer reduced motion — title just truncates).
  - **Sub-line** (mono, 8–9px, ink-muted, letter-spacing 0.15em): `QUEUER · KEY ±N · m:ss / m:ss`.
  - **Pitch controls** on the right: `[−]` button, hanko-stamp readout `−2`, `[+]` button.
  - **Transport controls** further right: `⏮  ⏯/▶  ⏭` (shuffle is *not* here — it's on the queue header).
  - All buttons: 32–36px tall with 8px+ horizontal padding, monospace icons, hover/focus state visible.

**Right rail (~140–180px wide on desktop).** Three stacked panels with `gap: 10–12px`:

1. **QR panel** — paper-card with paper-grain. Contains a 96–110px QR + caption "SCAN TO JOIN" (mono caps, letter-spacing 0.2em) + the LAN host:port (small, ink-muted). Significantly smaller than the previous design.
2. **Setlist panel** — paper-card. Header row: "SETLIST · N" (mono caps, left), `🔀` button (right) with aria-label "Shuffle queue". Border-bottom under header. Then up to 8 queue rows: `02 · MIKE — Don't Stop Believin'` (mono prefix + Crimson Pro italic title). 1st upcoming row is full ink-black; subsequent rows fade to ink-muted for visual rhythm (closer = brighter). If `queue.length > 8`: a final centered row reads `+ N MORE` in mono caps. Setlist scrolls only when the panel content overflows the panel itself (which it shouldn't with the 8-cap, but allow it for very narrow heights).
3. **Volume panel** — paper-card, single row. `VOL` (mono caps, left) + horizontal slider (filled track in hanko-red, thumb in ink-black). 12–16px tall. Tied directly to the AudioGraph via `audio-graph-ref` (no WS roundtrip).

### 3.3 Idle state (no songs queued, post-unlock)

The right rail is unchanged. The **video frame becomes the splash**:

- Background: linear-gradient `135deg` from `var(--ink-deep)` to `var(--ink-black)`.
- Centered: `下北沢` in Crimson Pro 900 italic at 96–144px (responsive), letter-spacing −1px, paper-cream color.
- Below: `HOUSE LIGHTS ON` in mono caps, cigarette-yellow, letter-spacing 3px.
- The **▌ LIVE** badge is hidden in this state. The now-playing strip is also hidden.
- The setlist panel shows an empty-state row: "queue something to start the show" in Crimson Pro italic, ink-muted. The header still reads `SETLIST · 0`.

### 3.4 Pre-show states (token entry, "▶ Start show" gesture)

Unchanged in structure from the current implementation, but visually aligned with the new aesthetic:

- **Token entry** — same centered paper-card on a dark background. No rotation on the form (was `transform: rotate(-0.5deg)` via `.paper-card` class — see §5.1 for class change).
- **"▶ Start show" gesture** — unchanged. Full-screen black button with cream Crimson Pro italic.

### 3.5 Mobile responsive (phone-width viewport on `/source`)

When viewport width ≤ 720px, the layout collapses to a single column:

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

- Video frame becomes full-width with the now-playing strip below it (still attached, same component).
- QR shrinks to a chip (≤72px) and tucks **inline with the setlist header**, left of the "SETLIST · N" label.
- Setlist still caps at 8 visible (or fewer to fit screen height) with "+N MORE".
- Volume panel becomes a single full-width row at the bottom.

### 3.6 Behaviors

- **Marquee** runs only when title.scrollWidth > container.clientWidth. Honors `prefers-reduced-motion: reduce` (no marquee, just ellipsis).
- **LIVE badge pulse** runs only when player.status === 'playing' and is paused on `prefers-reduced-motion`.
- **Setlist panel** shows up to 8 rows. Row colors: index 0 = `var(--ink-black)`, indices 1–7 = `var(--ink-muted)`. Indices 8+ are aggregated as "+N MORE".
- **Shuffle** button on setlist header sends `queue.shuffle`. No keyboard shortcut.
- **Volume** slider 0–1, tied directly to `getAudioGraph()?.setVolume(v)`. Initial state matches GainNode default (1.0).
- **Pitch controls** on the strip send `player.setLivePitch` with the new value (clamped −6 to +6 server-side anyway).
- **Transport** controls send `player.prev`, `player.pause` / `player.play`, `player.skip` based on current state.

---

## 4. Phone client (`/`)

### 4.1 Header + tabs (preserved)

Top bar unchanged in structure:

```
●  SARAH · ⚙              [QUEUE] [SEARCH] [PASTE]
```

- Left: `●` glyph + name (mono caps), `⚙` settings (renames the user) on tap.
- Right: three tab buttons. Active tab: hanko-red background, paper-cream text. Inactive: transparent, paper-cream text. Underline on the bottom of the tab strip in `var(--ink-deep)`.
- Tabs do **not** rotate. Tap target ≥44pt tall.

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
│ │ Don't Stop Believin' │ │  Crimson Pro italic, 13-14px
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
- **Now-playing card** at the top of the tab. `▌ NOW PLAYING` badge in riso-pink mono caps. Title in Crimson Pro 900 italic. Sub-line in mono caps with ink-muted color. Below: thin progress bar (3px tall, hanko-red on ink-muted track) showing `positionSec / item.durationSec`.
- **▌ UP NEXT · N** section header. Mono caps, paper-cream, letter-spacing 0.2em.
- **Queue rows** show the index (`02 · MIKE`) in mono caps as a small eyebrow above the Crimson-Pro italic title. `KEY ±N` line shown only if non-zero pre-pitch. `[✕]` button (visible 24×24px) on the right edge — only when `queuedBy.sessionId === mySessionId`. Tap: sends `queue.remove`.

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

1. User types and submits a query. Loading state on the GO button (spinner or `…`).
2. Results render as upright paper-cards. Each row has: title (Crimson Pro italic), channel · duration (mono caps, ink-muted), and a `▾` glyph at the right edge.
3. **Tap a row** → that row expands in place; any previously-expanded row collapses. Expanded state:
   - 4px hanko-red left border replaces the regular paper-card edge.
   - The body grows downward to reveal: a `KEY` label (mono caps), a `[−] [−2] [+]` stepper (44×44pt buttons; readout is a hanko-stamp shape), and an `[ADD]` button (right-aligned, hanko-red filled).
   - The `▾` flips to `▴` (also hanko-red).
4. **Tap [ADD]** → sends `queue.add { videoId, prePitch: <stepper value> }`. Optimistic UI: clear search results, switch to **Queue** tab.
5. **Tap [✕] / outside the row** OR scroll past it → collapses back. (Implementation: just tapping the same row's `▴` toggle, or the new tap on a different row.)

**Behaviors:**

- Stepper clamps to −6..+6.
- Tapping the same row twice = collapse (toggle).
- Search results clear on new query submission. Pending row state resets.
- Listener cleanup on unmount + 8s timeout — already implemented; preserve.

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
│ SING KING · 5:55         │  mono caps, cigarette
│                          │
│                          │
│                          │
│ KEY                      │  mono caps, ink-muted
│ ┌────┐  ┌────────┐ ┌────┐│
│ │ −  │  │  −2    │ │ +  ││  big tappable buttons
│ └────┘  └────────┘ └────┘│  44pt+ height
│                          │
│ SOURCE HAS OVERRIDE      │  mono caps, ink-muted
└──────────────────────────┘
```

- **Big readout** — the `−2` is the focal point: Crimson Pro 900 italic, 32px, hanko-red. "SEMITONES" label below in mono caps, 8px.
- **Big buttons** — `−` and `+` are 56–64px wide, 48–56px tall, paper-cream borders, transparent background. Active feedback: brief hanko-red flash on tap.
- **Drag interaction** — additionally to `[−]` and `[+]`, the user can horizontally drag on the readout area to change pitch (snap to integer semitones, ±6 cap).
- "SOURCE HAS OVERRIDE" stays as a footnote so users understand the source can change pitch from the rail.
- When the song ends or someone else's song starts, the takeover dismisses and the regular queue view returns.

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

```css
.marquee {
  display: block;
  white-space: nowrap;
  overflow: hidden;
}
.marquee[data-overflow="1"] > span {
  display: inline-block;
  padding-left: 100%;
  animation: marquee 14s linear infinite;
}
@keyframes marquee {
  0%, 8% { transform: translateX(0); }
  92%, 100% { transform: translateX(-100%); }
}
@media (prefers-reduced-motion: reduce) {
  .marquee[data-overflow="1"] > span { animation: none; transform: translateX(0); }
}
```

Implementation note: a tiny client hook measures `scrollWidth` vs `clientWidth` and toggles the `data-overflow` attribute on title text changes.

---

## 6. Component changes — at a glance

| Component | Status | Notable change |
|---|---|---|
| `src/components/source/QueueOverlay.tsx` | Major rewrite | Becomes a stacked rail (QR · setlist · volume); shuffle moves to setlist header; cap setlist at 8 + "+N MORE"; volume row separated. |
| `src/components/source/VideoPlayer.tsx` | Touch | Render now-playing strip with controls inline (title marquee, pitch ±, transport). |
| New: `src/components/source/NowPlayingStrip.tsx` | New | Bottom strip for the video frame. |
| New: `src/components/source/MarqueeText.tsx` | New | Title marquee component; honors `prefers-reduced-motion`. |
| `src/app/source/page.tsx` | Touch | Switch from absolute-overlay layout to CSS grid (video / rail). Add responsive breakpoint at 720px. |
| `src/components/source/QrPanel.tsx` | Touch | Smaller default size (96–110px); responsive variant. |
| `src/components/source/StartShowGesture.tsx` | Untouched | — |
| `src/components/source/TokenEntry.tsx` | Touch | Drop card rotation. |
| `src/components/phone/QueueView.tsx` | Major rewrite | Upright rows, eyebrow `02 · MIKE`, progress bar on now-playing card, ✕ on own items, "▌ NOW PLAYING" badge, "▌ UP NEXT" section header. |
| `src/components/phone/SearchTab.tsx` | Major rewrite | Inline-expand pattern; drop rotation; key picker + Add inside the row. |
| `src/components/phone/PasteTab.tsx` | Major rewrite | Same inline-expand for the resolved preview. |
| `src/components/phone/PrePitchSlider.tsx` | Repurpose | Becomes a `<KeyStepper />` component (`[−] [readout] [+]`). 44pt+ tap targets. |
| `src/components/phone/LivePitchSheet.tsx` | Major rewrite | Becomes `<YoureUpView />` — full takeover replacing the queue body. Big readout, drag-to-change. |
| `src/components/phone/NameEntry.tsx` | Touch | Drop card rotation. |
| `src/components/shared/Toaster.tsx` | Untouched | — |
| `src/styles/riso.css` | Touch | Remove rotation rules; add `.paper-card--accent`, `.paper-card--minor`, `.marquee`, `@keyframes marquee`. |

---

## 7. Server protocol

**No changes.** The server's WS message types, idempotency, authority rules, epoch model, and proxy stay exactly as they are. The redesign is a pure client-side rework.

---

## 8. Success criteria

The redesign is "done" when, on a freshly built repo:

1. Open `/source` in Chrome on the MacBook → the Shimokitazawa splash sits inside a 16:9 video frame on the left, with a small QR · setlist · volume rail on the right.
2. Open the LAN URL on a phone → name entry appears with no card rotation. Sign in.
3. Tap the **search** tab, search "bohemian rhapsody karaoke" → results render upright. Tap one → it expands inline with `KEY [−][0][+]` and `ADD`. Tap a different result → first collapses, second expands.
4. Set key to −2, tap Add → switches to **queue** tab; the song appears in `▌ UP NEXT` with the eyebrow `02 · YOU` and `KEY −2`.
5. The source page video frame switches from the splash to the karaoke video; the LIVE badge appears; the now-playing strip shows the title (marquees if it overflows) and the pitch + transport controls.
6. Drag the source's volume slider — audio level changes immediately. Click `[−]` on the source's pitch — pitch drops by one semitone within 500ms.
7. Click 🔀 on the setlist header — queue order changes.
8. When *your* song starts, the phone's **queue tab body** becomes the YOU'RE UP takeover with the big −2 readout. Tap `[+]` twice → readout becomes `0`; the song's pitch follows on the source. Tap `[QUEUE]` again — same takeover. Tap `[SEARCH]` — leaves the takeover (other tabs are navigable).
9. Resize the source page below 720px wide — layout collapses to single-column with the video on top, then strip, then setlist (with QR inline at its header), then volume.
10. With `prefers-reduced-motion: reduce` set in the OS, the marquee does not animate; the LIVE badge does not pulse.

---

## 9. Risks

- **Marquee correctness.** Measuring `scrollWidth` after font load is the usual gotcha. Use `document.fonts.ready` and re-measure on resize.
- **Drag-to-change on the YOU'RE UP readout.** Mobile Safari pointer events have quirks; use `touch-action: none` on the readout and pointer events for unification. Ship without drag if it bites; the `[−] [+]` buttons remain the primary control.
- **Setlist row overflow on very small phones (320px width).** "02 · MIKE — Don't Stop Believin'" wraps. Fallback: title truncates with ellipsis when row width < 200px.
- **Source mobile responsive breakpoint** (720px). Some 8" tablets are right around this boundary; pick a single breakpoint and accept the imperfection rather than adding a third layout.
