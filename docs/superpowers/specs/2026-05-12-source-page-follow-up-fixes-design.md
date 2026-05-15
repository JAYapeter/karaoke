# Source-Page Follow-Up Fixes — Design Spec

**Date:** 2026-05-12
**Status:** Approved (brainstorming concluded; ready for plan).
**Scope:** Three usability defects surfaced after the karaoke UI redesign (PR #1) shipped, all on the `/source` (host TV) page.

This is a small targeted patch on top of the redesign — not a feature pass. Server protocol, audio graph, phone-side UX, and Shimokitazawa Riso visual identity stay unchanged unless explicitly amended below.

---

## §1 Goals

1. Phones can scan the source page's QR and reach the actual phone client (currently encodes `localhost:3000`).
2. Setlist titles in the right rail are readable at a glance; long titles surface their full text.
3. Every interactive control on `/source` (setlist actions, transport, pitch ±) has visible cursor / hover / focus / press affordance — currently invisible.

## §2 Non-goals

- **Phone-side button affordance audit.** Phone client buttons may have similar gaps, but they are out of scope for this patch.
- **QR size change.** The 110 px QR scans fine inside the 240 px rail; no resize.
- **Multi-interface IP picking heuristic changes.** Reuse whatever `server.ts` already chose for the boot banner; do not invent new selection logic.
- **HTTPS / mDNS / IPv6 advertising.** HTTP IPv4 only.
- **Drag-to-change-pitch / Phase-2 features.** Still deferred per the original redesign spec §11.

---

## §3 Issue 1 — QR encodes `localhost:3000` instead of LAN IP

### §3.1 Symptom
Host opens `/source` on `http://localhost:3000/source` (mandatory — non-localhost is gated by the source-trust guard at `src/app/source/page.tsx:10-14`). The QR panel renders the URL `http://localhost:3000/`, which phones on the same LAN cannot reach.

### §3.2 Root cause
`src/components/source/QrPanel.tsx:16` reads `window.location.host` to compose the join URL. On the host machine that's `localhost:3000`. The phone client doesn't have this problem because the host IP is the phone's `window.location.host`.

### §3.3 Design

The server already detects its primary LAN IPv4 at boot (used in the `Karaoke server running http://10.0.0.22:3000` banner) via `os.networkInterfaces()`. Plumb that value to clients via the existing WS state pipe.

**Server changes:**

1. `src/lib/types/state.ts` — add `serverHost: string | null` to `ServerState`. Default `null`.
2. `src/lib/server/store.ts` — add `setServerHost(host: string | null)` action that mutates the store and emits a `state.full` (existing emit pattern). Initial value `null`.
3. `server.ts` — at startup, resolve the LAN host string (`<ip>:<port>`) using the same selection logic that produces the boot banner. Call `store.setServerHost(...)` once, before the WS server starts accepting connections.
4. **Override hook:** if `process.env.KARAOKE_LAN_HOST` is set and non-empty, use that string verbatim (no port suffix appended — the env value is taken as-is). This is the user-friendly escape hatch for custom DNS hostnames (`shimokita.local`) or non-default ports.

**Client changes:**

5. `src/components/source/QrPanel.tsx` — `useJoinUrl` derives the host from `conn.state?.serverHost ?? window.location.host`. When `serverHost` is `null` (state hasn't arrived yet, or the env didn't resolve a LAN IP), fall back to `window.location.host` so the phone client and SSR snapshots continue to work as before.
6. The hook re-runs whenever `conn.state?.serverHost` changes (it's part of the React state subscription); QR re-encodes automatically.
7. `useJoinUrl` continues to compose `${protocol}//${host}/` — protocol stays `http:` / `https:` from `window.location.protocol`. No protocol injection.

### §3.4 Edge cases & contracts
- **`serverHost` arrives after first paint.** The QR will briefly encode `localhost:3000`, then re-encode to the LAN host within the WS connect round trip (typically <100 ms). Acceptable; users will not be scanning during that window.
- **Server has no resolvable LAN IPv4** (e.g., loopback only). `serverHost` stays `null`; QR uses `window.location.host` as today. Behavior unchanged from before this fix.
- **Server selects a different IP than what the user expects** (multi-homed host). Use `KARAOKE_LAN_HOST` to override. Documented in `README.md`.
- **`serverHost` includes port.** Always. Format: `"<ip>:<port>"` or `"<dns-name>:<port>"`. Avoids ambiguity if Next.js / the WS server use different ports in some future config.

### §3.5 Verification
- Headless: a unit test for the `useJoinUrl` derivation (env-arg → `serverHost` value → fallback chain). Vitest, Node env (no DOM needed for the pure derivation function).
- Manual: open `/source` on host. Scan the QR with a phone. Phone client loads. Repeat with `KARAOKE_LAN_HOST=foo.local:3000` set; QR encodes that string verbatim.

---

## §4 Issue 2 — Right rail too narrow for setlist titles

### §4.1 Symptom
At the spec'd width of 160 px, real karaoke titles (e.g., "Rich It All - Bruno Mars (Karaoke Songs With Lyrics - Original Key)") ellipsize to almost nothing. The setlist becomes a list of `02 ·... ⤴ ✕` rows with no readable content.

### §4.2 Root cause
`src/styles/riso.css:216` sets `.source-root { grid-template-columns: 1fr 160px }`. The width was chosen during the redesign to maximize video real estate, but no test was performed against realistic title lengths.

### §4.3 Design

**Two changes:**

1. **Widen the rail to 240 px.** `src/styles/riso.css` — change the source-root grid template:
   - Desktop: `grid-template-columns: 1fr 240px` (was `1fr 160px`).
   - Mobile (`@media (max-width: 720px)`): unchanged — `grid-template-columns: 1fr` collapse rule still applies.
   - Net effect on a 1920 px source page: video drops from ~1740 px wide to ~1660 px wide (~5% smaller); rail grows from 160 px to 240 px (+50%).

2. **Marquee long titles in setlist rows.** `src/components/source/SetlistPanel.tsx` — replace the row title's `<span style={{ ...ellipsis... }}>` with the existing `<MarqueeText text={...} />` component (created in the original redesign as `src/components/shared/MarqueeText.tsx`). MarqueeText:
   - Renders the title statically when it fits the container (no animation).
   - Scrolls horizontally at 30 px/s with a 3 s pause at each end when the title overflows.
   - Already honors `prefers-reduced-motion: reduce` (animation disabled, title clipped at end).
   - Already font-load aware (re-measures on `document.fonts.ready`).

### §4.4 Edge cases & contracts
- **MarqueeText container width** is the row's title cell. The cell must have `flex: 1 1 auto; min-width: 0` so the marquee gets a finite width to compare against. Verify this is set on the parent row's title cell wrapper. Pre-existing CSS in `riso.css` `.setlist-row__title` should already have these properties; if not, add them.
- **MarqueeText hover behavior** unchanged — its existing `title={text}` attribute remains so a hover tooltip surfaces the full title even on touch-no-hover devices.
- **Per-row remount.** When the setlist re-renders due to queue mutations, MarqueeText instances re-mount only for items whose `key` changes (React `key={item.id}`). Identity-stable items keep their measurement; new items measure fresh.
- **Performance.** Source page renders ≤8 setlist rows (per `SetlistPanel.tsx:9`). Eight MarqueeText instances each with a ResizeObserver is well within budget.

### §4.5 Verification
- Headless: existing `tests/unit/marquee-math.test.ts` already covers the math. No new test required for this change (just a different mounting site).
- Manual: queue 4–8 songs with varied title lengths. Confirm short titles render statically; long titles scroll. Confirm `@media (max-width: 720px)` collapse still works (resize source window narrower than 720 px).

---

## §5 Issue 3 — Source-page buttons lack interactive affordance

### §5.1 Symptom
On `/source`, the setlist row buttons (⤴ move-to-top, × remove, 🔀 shuffle), the transport buttons (⏮ ⏸/▶ ⏭), and the pitch ± buttons in `NowPlayingStrip` render as bare glyphs over a transparent background. No cursor change on hover, no background change, no press feedback. A user has no visual signal that these are clickable.

### §5.2 Root cause
The redesign spec specified semantic class names (`.hit-target`, `.uc`) that own size + typography but no interactive-state styles. Inline styles set `background: transparent` and no `:hover` / `:focus-visible` / `:active` overrides exist. The global `:focus-visible` rule in `riso.css:53` does cover keyboard focus, but pointer affordance is missing.

### §5.3 Design

**Add a shared CSS utility class `.icon-btn` (plus a `--on-dark` modifier) to `src/styles/riso.css`:**

```css
.icon-btn {
  cursor: pointer;
  border-radius: 2px;
  transition: background-color 150ms ease-out;
}
/* Default tint — for buttons sitting on the cream `.paper-card` surface. */
.icon-btn:hover {
  background-color: rgba(10, 8, 8, 0.08);
}
/* Inverted tint — for buttons sitting on the dark video-frame / ink-black surface. */
.icon-btn--on-dark:hover {
  background-color: rgba(255, 248, 224, 0.08);
}
.icon-btn:active {
  animation: tap-flash 150ms ease-out;
}
/* Disabled / aria-disabled buttons should not show clickable affordance. */
.icon-btn[disabled],
.icon-btn[aria-disabled="true"] {
  cursor: not-allowed;
}
.icon-btn[disabled]:hover,
.icon-btn[aria-disabled="true"]:hover,
.icon-btn--on-dark[disabled]:hover,
.icon-btn--on-dark[aria-disabled="true"]:hover {
  background-color: transparent;
}
@media (prefers-reduced-motion: reduce) {
  .icon-btn { transition: none; }
  .icon-btn:active { animation: none; }
}
```

**`tap-flash` keyframe** is already defined in `riso.css` (used by `.youre-up__btn`); no new animation needed. The `prefers-reduced-motion` override mirrors the pattern already established for `.youre-up__btn` in the redesign.

**Sites to apply `.icon-btn`:**

| File | Element | Existing classes | Surface | Add |
|---|---|---|---|---|
| `SetlistPanel.tsx:137` | ⤴ move-to-top button | (inline only) | cream | `icon-btn` |
| `SetlistPanel.tsx:138` | × remove button | (inline only) | cream | `icon-btn` |
| `SetlistPanel.tsx` (header) | 🔀 shuffle button | `.shuffle-btn` | cream | `icon-btn` |
| `NowPlayingStrip.tsx` | pitch − / + buttons | `.hit-target uc` | dark (in video frame) | `icon-btn icon-btn--on-dark` |
| `NowPlayingStrip.tsx` | transport ⏮ ⏸/▶ ⏭ buttons | `.hit-target uc` | dark (in video frame) | `icon-btn icon-btn--on-dark` |
| `QrPanel.tsx` (chip variant only) | chip wrapper | `.qr-chip .hit-target` | dark (rail BG) | `icon-btn icon-btn--on-dark` |

Add the listed classes alongside (NOT instead of) the existing ones.

### §5.4 Edge cases & contracts
- **Hover background contrast.** `.icon-btn:hover` (default tint, `rgba(10, 8, 8, 0.08)`) is visible on cream `var(--paper-cream)` but invisible on dark `var(--ink-black)`. Buttons on dark surfaces must additionally carry the `.icon-btn--on-dark` modifier. The application table in §5.3 specifies which buttons need it: NowPlayingStrip transport + pitch (inside video frame) get `--on-dark`; SetlistPanel ⤴/×/🔀 (inside cream `.paper-card`) get the default. The QrPanel chip variant sits on the dark rail background and gets `--on-dark`.
- **Disabled state.** `KeyStepper` and YOU'RE UP buttons aren't on `/source` — out of scope. The transport play/pause toggle is never disabled in current code; no new disabled-state UI needed.
- **`:focus-visible`** is already provided by the global `riso.css:53` rule (`outline: 2px solid var(--hanko-red); outline-offset: 2px`). `.icon-btn` does not override it.
- **Tap-flash conflict.** `tap-flash` keyframe sets background-color via animation. The `transition` on `.icon-btn` would normally compete — but tap-flash uses an explicit color and finishes in 150 ms; the next state (hover or rest) takes over via transition. No flicker observed in the existing `.youre-up__btn` callsite that uses the same pattern.

### §5.5 Verification
- Manual: hover each annotated button on `/source`. Tint appears, cursor is `pointer`, click triggers brief tap-flash. Tab through with keyboard — focus ring visible.
- Manual: enable `prefers-reduced-motion` in DevTools. Hover transitions disappear; tap-flash does not run. Cursor still changes; focus ring still visible.
- No new automated test (purely visual).

---

## §6 Affected files (summary)

| File | Change |
|---|---|
| `src/lib/types/state.ts` | Add `serverHost: string \| null` to `ServerState` |
| `src/lib/server/store.ts` | Add `setServerHost` action |
| `server.ts` | Resolve LAN host at boot, call `store.setServerHost` |
| `src/components/source/QrPanel.tsx` | `useJoinUrl` reads `conn.state?.serverHost`, falls back to `window.location.host` |
| `src/components/source/SetlistPanel.tsx` | Wrap row title in `MarqueeText`; add `.icon-btn` to ⤴/×/🔀 buttons |
| `src/components/source/NowPlayingStrip.tsx` | Add `.icon-btn .icon-btn--on-dark` to transport + pitch buttons |
| `src/components/source/QrPanel.tsx` | Add `.icon-btn` to chip variant button (apply `--on-dark` if it sits on dark surface) |
| `src/styles/riso.css` | Change `.source-root` columns to `1fr 240px`; add `.icon-btn` + `.icon-btn--on-dark` rules + reduced-motion override |
| `tests/unit/use-join-url.test.ts` (new) | Test `useJoinUrl` derivation: env-set serverHost wins, null falls back to window.location.host |
| `README.md` | Document `KARAOKE_LAN_HOST` env override |

## §7 Verification checklist (post-implementation)

- [ ] `npx tsc --noEmit` clean
- [ ] `npm test -- --run` — all tests pass; new test for `useJoinUrl` derivation included
- [ ] `npx next build` succeeds
- [ ] Manual: phone scans source-page QR and reaches phone client
- [ ] Manual: with `KARAOKE_LAN_HOST` set, QR encodes the override
- [ ] Manual: setlist long titles marquee-scroll; short titles static
- [ ] Manual: every annotated source-page button shows hover tint + cursor + focus ring + tap-flash
- [ ] Manual: `prefers-reduced-motion` disables transitions and tap-flash
- [ ] Visual smoke: source page on a 1920×1080 viewport — video frame still cinematic; rail fits all standard panels comfortably
