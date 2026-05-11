# Karaoke UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape the karaoke app's UI per `docs/superpowers/specs/2026-05-08-karaoke-ui-redesign-design.md` while keeping the server protocol, audio graph, and Shimokitazawa Riso visual identity unchanged. End-state: `/source` is a left-video + right-rail layout (QR · setlist · volume) with a now-playing strip; the phone client is a sticky-tab shell with inline-expand search/paste, a full-takeover YOU'RE UP view, and shared pending-add / offline / toast plumbing.

**Architecture:** Purely client-side. Existing `Store`, `Dispatcher`, `Player`, WS protocol, idempotency, authority rules are untouched. Components are restructured around a `PhoneRoot` context that owns shared phone-shell state (pending adds, occluder height) and a `.source-root` CSS-grid layout that owns the source page's regions. Marquee, occluder-height, and pendingAdds get unit-tested logic; visual layout is verified in a real browser against §8 of the redesign spec.

**Tech Stack:** Next.js 16 + React 19 + TypeScript strict; existing `ws`/`@soundtouchjs/audio-worklet`/`yt-dlp` stack untouched; Vitest for the testable pieces (math, reducers, hook contracts).

**Operating principles:**
- TDD where headless tests have real value: marquee math, occluder-height summation, pendingAdds reducer lifecycle, KeyStepper clamp, NowPlayingStrip predicate helpers. For everything visual, write the code then verify in a real browser against §8 success criteria.
- The redesign spec is the source of truth. When a task says "render per §3.5", read that section before coding — every CSS class, breakpoint, and aria contract is normative.
- Surgical changes. Don't refactor unrelated code, don't add features not in the spec, don't touch the server.
- Commit after every task. Conventional commit prefixes (`feat`, `refactor`, `style`, `test`, `docs`).
- TokenEntry is already removed (commit `52e037a`); the spec mentions of token entry are out-of-date and are corrected in Task 1.

---

## Conventions used in this plan

- **Vitest** runs as `npm test -- --run` (CI-style, runs once). Watch mode is `npm run test:watch`.
- **Type-check** is `npx tsc --noEmit`.
- All paths are relative to the repo root (`/Users/jonathanyapeter/Documents/Karaoke App`).
- Imports use the `@/` path alias for `src/`.
- `git commit` lines use HEREDOC bodies and include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` on the last line.
- Class names in CSS-touching tasks are **normative** — the names quoted in the spec's §5.6 must appear verbatim so the cascade works.
- When a task says "render per §X.Y" it means: read that spec section in full before coding. The spec is the canonical source of every visual rule, aria label, and breakpoint.

---

## Phase 0 — Spec sync

### Task 1: Reflect the TokenEntry removal in the redesign spec

**Files:**
- Modify: `docs/superpowers/specs/2026-05-08-karaoke-ui-redesign-design.md`

**Context:** Commit `52e037a` removed the `TokenEntry` component and its surrounding flow (localhost auto-trusts the source). The redesign spec was written before that change and still references TokenEntry in three places: §3.4 (pre-show states), §5.4 (tap-target matrix row), and §6 (component change table). The plan downstream skips all TokenEntry work; this task makes the spec match.

- [ ] **Step 1: Update §3.4 (pre-show states)**

Replace the §3.4 block in the spec with:

```markdown
### 3.4 Pre-show state ("▶ Start show" gesture)

Token entry was removed in commit `52e037a` — the source page is always opened on the host machine, and the server now auto-trusts loopback WebSocket connections. The only remaining pre-show state on `/source` is:

- **"▶ Start show" gesture** — unchanged. Full-screen black button with cream Crimson Pro italic. Safe-area + 100dvh applied directly on the button per §5.4 (it is its own page root). See `StartShowGesture.tsx` row in §6.
- Loaded from a non-localhost origin, `/source` shows a one-card "open this on the host machine" message instead of the gesture. The card is upright (no rotation), styled like other paper-card surfaces.
```

- [ ] **Step 2: Update §5.4 tap-target matrix**

Remove the `TokenEntry submit | 48 | 32 | .hit-target` row. The row directly above it (`StartShowGesture button`) stays unchanged.

- [ ] **Step 3: Update §6 component matrix**

Delete the entire `src/components/source/TokenEntry.tsx` row from the table. The row immediately below it (`src/components/phone/QueueView.tsx`) stays.

- [ ] **Step 4: Update the §5.4 safe-area ownership table**

Replace the row `/source token entry, start-show gesture, idle splash` with `/source start-show gesture, idle splash` (drop the `.token-entry` selector from the example). Also remove `.token-entry,` from the §5.6 selector list in the `.page-root, .phone-root, .youre-up, ...` rule and from the `.token-entry, .start-show-gesture, ...` safe-area-owner rule.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-08-karaoke-ui-redesign-design.md
git commit -m "$(cat <<'EOF'
docs(spec): reflect TokenEntry removal in UI redesign spec

Commit 52e037a deleted TokenEntry; the source page now auto-trusts
localhost WS connections. Sync §3.4, §5.4, §5.6, and §6 to match.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 1 — Style and layout foundation

### Task 2: Rewrite `src/styles/riso.css` with the §5.5/§5.6 normative CSS

**Files:**
- Modify: `src/styles/riso.css`

**Context:** Today's `riso.css` is 52 lines: tokens, paper-grain, hanko, `.uc`, and `.paper-card` (which has the `rotate(-0.5deg)`/`+0.5deg:nth-child(2n)` rules the spec explicitly drops). The redesign needs **every** rule from §5.5 (animation definitions) and §5.6 (mobile-specific normative CSS), the hit-target utility, focus-visible ring, viewport-unit-fallback rules, single-scroll-container rules, safe-area ownership rules, paper-card variants (`--accent`, `--minor`), and the marquee skeleton. This single file becomes the policy surface for the whole UI redesign.

- [ ] **Step 1: Replace the file**

Write `src/styles/riso.css` exactly as below. The class names are normative — implementers downstream rely on this cascade.

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

  /* Phone-root sticky-header height. The <Tabs> component overwrites this
     on mount via ResizeObserver. Default includes safe-area-inset-top so
     notched-iPhone first paint doesn't under-pad the takeover. */
  --tabs-height: calc(56px + env(safe-area-inset-top, 0px));

  /* Sum of all currently-mounted top occluders (Tabs + OfflineBanner +
     PendingAddsTray). The single writer is the useTopOccluderHeight hook in
     PhoneRoot. Used by the takeover's min-height, sticky search/paste action
     rows' top offset, and <html>'s scroll-padding-top. */
  --top-occluder-height: var(--tabs-height);
}

html, body { background: var(--ink-black); color: var(--paper-cream); }

/* §5.4 single scroll owner. <html> is the only scroll container; body and
   .phone-root expand naturally. */
html {
  overflow-y: auto;
  scroll-padding-top: var(--top-occluder-height);
  scroll-padding-bottom: 96px;
}
body, .phone-root { overflow: visible; }
html, body { overscroll-behavior: contain; }

/* §4 modal scroll-lock. */
html.modal-open-lock { overflow: hidden; }
html.modal-open-lock body { overflow: hidden; }

/* §5.4: touch-action: manipulation on actual interactive controls only.
   NOT on generic div/li — applying it to non-controls causes iOS long-press
   quirks. */
button, input, textarea, select, a, [role="button"] {
  touch-action: manipulation;
}

/* §5.4 anti-zoom: form input text ≥16 CSS px. */
input, textarea, select { font-size: 16px; }

/* §5.4 focus-visible ring. */
:where(button, [role="button"], a, input, textarea, select):focus-visible {
  outline: 2px solid var(--hanko-red);
  outline-offset: 2px;
}

/* §5.4 viewport units. vh first, dvh second. Every full-screen root.
   .token-entry is intentionally absent — TokenEntry was removed. */
.page-root,
.phone-root,
.youre-up,
.start-show-gesture,
.source-root,
.source-offline,
.source-idle-splash,
.name-entry {
  min-height: 100vh;
  min-height: 100dvh;
}

/* §5.4 hit-target utility. Touch ≥48 / fine ≥32. Touch breakpoint wins. */
.hit-target {
  min-inline-size: 48px;
  min-block-size: 48px;
}
@media (pointer: fine) {
  .hit-target { min-inline-size: 32px; min-block-size: 32px; }
}
@media (max-width: 720px) {
  .hit-target { min-inline-size: 48px; min-block-size: 48px; }
}
/* Source strip is always touch-friendly (one mode is "walk over and tap"). */
.now-playing-strip .hit-target {
  min-inline-size: 48px !important;
  min-block-size: 48px !important;
}

/* Visuals — preserved from prior riso.css, ROTATION DROPPED per §5.1. */
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
.tape-strip { position: relative; }
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
  padding: 12px 14px;
  box-shadow: 1px 1px 0 var(--cigarette);
  /* NO rotation — §5.1. */
}
.paper-card--accent { border-left: 4px solid var(--hanko-red); }
.paper-card--minor { color: var(--ink-muted); }

/* §5.4 safe-area ownership. Each owner is annotated where it's set. */
.tabs {
  position: sticky;
  top: 0;
  padding-top: env(safe-area-inset-top); /* owns safe-area-inset-top */
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
.phone-root[data-takeover-mounted="0"] {
  padding-bottom: env(safe-area-inset-bottom); /* owns safe-area-inset-bottom */
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
.youre-up {
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
.youre-up__controls {
  padding-bottom: env(safe-area-inset-bottom); /* owns safe-area-inset-bottom */
}
.source-root {
  padding-top: env(safe-area-inset-top);
  padding-right: env(safe-area-inset-right);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
}
.start-show-gesture,
.source-offline,
.source-idle-splash,
.name-entry {
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
}

/* §3 source grid. Desktop: video + 160px rail. Mobile: stacked. */
.source-root {
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: 12px;
  padding-block: 12px;
}
.source-root__video { grid-column: 1; }
.source-root__rail  { grid-column: 2; display: flex; flex-direction: column; gap: 10px; }
@media (max-width: 720px) {
  .source-root { grid-template-columns: 1fr; }
  .source-root__video, .source-root__rail { grid-column: 1; }
}

/* Setlist panel — desktop-only internal scroll. */
.setlist-panel { overflow: visible; }
@media (min-width: 721px) {
  .setlist-panel {
    max-height: calc(100dvh - 200px);
    overflow-y: auto;
  }
}

/* §3.6 setlist row action group. */
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
  gap: 8px;
}
.setlist-row__actions > button {
  min-inline-size: 32px;
  min-block-size: 32px;
}
@media (max-width: 720px), (pointer: coarse) {
  .setlist-row__actions { gap: 12px; }
  .setlist-row__actions > button {
    min-inline-size: 48px;
    min-block-size: 48px;
  }
}

/* §4.3 search row explicit 56 CSS px. */
.search-row > button { min-block-size: 56px; }

/* §5.5 LIVE badge pulse. */
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

/* §5.5 search row body expand/collapse. Driven by data-expanded on .search-row;
   --row-content-h is measured by the component. */
.search-row__body {
  max-height: 0;
  overflow: hidden;
  transition: max-height 200ms ease-out;
}
.search-row[data-expanded="1"] .search-row__body {
  max-height: var(--row-content-h, 9999px);
}
.search-row[data-no-measure="1"] .search-row__body { transition: none; }
.search-row[data-expanded="1"][data-no-measure="1"] .search-row__body { max-height: none; }
@media (prefers-reduced-motion: reduce) {
  .search-row__body { transition: none; }
  .search-row[data-expanded="1"] .search-row__body { max-height: none; }
}

/* §5.5 YOU'RE UP tap flash + mount. */
@keyframes tap-flash {
  0%   { background: transparent; }
  20%  { background: var(--hanko-red); }
  100% { background: transparent; }
}
.youre-up__btn:active { animation: tap-flash 120ms ease-out; }
.youre-up { opacity: 0; transition: opacity 150ms ease-out; }
.youre-up[data-mounted="1"] { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .youre-up__btn:active { animation: none; }
  .youre-up { transition: none; opacity: 1; }
}

/* §5.5 toast mount/dismiss. Reduced-motion keeps the opacity fade (WCAG 2.3.3
   essential-information carve-out). */
.toast {
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 180ms ease-out, transform 180ms ease-out;
}
.toast[data-visible="1"] { opacity: 1; transform: translateY(0); }
@media (prefers-reduced-motion: reduce) {
  .toast { transition: opacity 180ms ease-out; transform: none; }
}

/* §5.3 marquee base. Per-instance duration is set inline via --marquee-duration
   and --marquee-distance. */
.marquee {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.marquee[data-overflow="1"] > span {
  display: inline-block;
  animation: marquee var(--marquee-duration, 14s) linear infinite;
}
@keyframes marquee {
  0%   { transform: translateX(0); }
  8%   { transform: translateX(0); }
  92%  { transform: translateX(calc(-1 * var(--marquee-distance, 100%))); }
  100% { transform: translateX(calc(-1 * var(--marquee-distance, 100%))); }
}
@media (prefers-reduced-motion: reduce) {
  .marquee[data-overflow="1"] > span { animation: none; transform: translateX(0); }
}

/* §3.5 / §5.6 youre-up takeover. */
.youre-up {
  min-height: calc(100vh - var(--top-occluder-height));
  min-height: calc(100dvh - var(--top-occluder-height));
}
.youre-up__readout { touch-action: pan-y; }

/* §5.4 status-critical mobile labels — 13 CSS px floor on phones. */
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

/* §3.5 phone-width source layout. */
@media (max-width: 720px) {
  .now-playing-strip {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
  }
  .now-playing-strip__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .now-playing-strip__controls {
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
  @media (max-width: 390px) {
    .now-playing-strip__controls { flex-direction: column; align-items: stretch; }
    .now-playing-strip__pitch,
    .now-playing-strip__transport { justify-content: space-between; }
  }

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
  .setlist-panel__header .shuffle-btn { flex: 0 0 auto; }
  @media (max-width: 360px) {
    .setlist-panel__header .qr-chip {
      width: 48px;
      height: 48px;
      flex: 0 0 48px;
    }
  }
}

/* §5.4 compact landscape (height ≤ 480px on phone widths). */
@media (max-width: 720px) and (max-height: 480px) {
  .youre-up__title    { font-size: 16px; }
  .youre-up__readout  { font-size: 24px; }
  .youre-up__btn      { min-height: 48px; min-width: 48px; }
  .queue-now-playing__title { font-size: 16px; }
  .search-row         { padding: 8px 10px; gap: 8px; }
  .search-row__body   { padding: 8px; gap: 8px; }
  .paste-tab__textarea { min-height: 4em; }

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

- [ ] **Step 2: Type-check + visual smoke**

Run `npx tsc --noEmit` (should be clean — CSS doesn't affect TS, but this catches any import drift). Then open the running app at `http://localhost:3000` and `http://localhost:3000/source` and confirm:
- Cards are upright (no tilt).
- No layout regressions on either page beyond the obvious "the redesign hasn't been wired yet".

It is fine and expected that components still reference inline styles — the cascade work happens in later tasks. Goal here is just "CSS file loads, nothing breaks."

- [ ] **Step 3: Commit**

```bash
git add src/styles/riso.css
git commit -m "$(cat <<'EOF'
style(riso): replace stylesheet with §5.5/§5.6 normative CSS

Drops card rotation, adds paper-card variants, hit-target utility,
focus-visible ring, marquee skeleton, LIVE badge / search row / YOU'RE
UP / toast animations, single-scroll-container rules, safe-area
ownership rules, source-grid layout, and 720/390/360px breakpoints
exactly as specified in the redesign spec §5.5 and §5.6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Update `src/app/layout.tsx` viewport + landmarks

**Files:**
- Modify: `src/app/layout.tsx`

**Context:** The current layout sets the `<html>` element's font classes and renders the riso-noise overlay. It doesn't set the viewport meta — Next.js's auto-generated one (`width=device-width, initial-scale=1`) is missing `viewport-fit=cover`, which §5.4 mandates so `env(safe-area-inset-*)` resolves to non-zero on iOS. Also need to make sure no `user-scalable=no` slips in.

- [ ] **Step 1: Replace the file**

```tsx
import type { Metadata, Viewport } from 'next'
import { Crimson_Pro, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import '@/styles/riso.css'

const display = Crimson_Pro({ subsets: ['latin'], weight: ['400', '900'], style: ['normal', 'italic'], variable: '--display-font' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--mono-font' })

export const metadata: Metadata = { title: 'Karaoke', description: 'Home karaoke' }

// §5.4 viewport meta: viewport-fit=cover is required for env(safe-area-inset-*)
// to resolve to non-zero on iOS. user-scalable=no would be an a11y regression.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

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

Note: `import '@/styles/riso.css'` is added because Next.js App Router requires CSS imported through a module graph to apply globally. If `globals.css` already `@import`s riso.css, leave the import here as well — duplicate is harmless and protects against accidental globals.css edits.

- [ ] **Step 2: Verify**

`npx tsc --noEmit` → clean. Open Safari iOS simulator (or `http://localhost:3000` on a real iPhone) and confirm safe-area insets resolve (visible as bottom padding on the home indicator on iOS 13+). On desktop Chrome the change is invisible — that's expected.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "$(cat <<'EOF'
style(layout): set viewport-fit=cover for iOS safe-area insets

Without viewport-fit=cover, env(safe-area-inset-*) resolves to 0 on
iOS Safari, which would break every safe-area-ownership rule in §5.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Implement `MarqueeText` with unit-testable math

**Files:**
- Create: `src/lib/client/marquee-math.ts`
- Create: `src/components/shared/MarqueeText.tsx`
- Create: `tests/unit/marquee-math.test.ts`

**Context:** §5.3 gives a canonical timing rule: `overflowPx = title.scrollWidth - container.clientWidth`; `duration = (overflowPx / 30) + 3.0`. The math is testable headless; the DOM measurement and ResizeObserver wiring are not (verify in browser). Splitting math out keeps the test suite fast and the component thin.

- [ ] **Step 1: Write the failing test**

`tests/unit/marquee-math.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeMarqueeDuration, shouldMarquee } from '@/lib/client/marquee-math'

describe('marquee math', () => {
  it('duration is overflowPx / 30 + 3.0 seconds', () => {
    expect(computeMarqueeDuration(0)).toBeCloseTo(3.0)
    expect(computeMarqueeDuration(300)).toBeCloseTo(13.0)
    expect(computeMarqueeDuration(60)).toBeCloseTo(5.0)
  })

  it('shouldMarquee is true iff scrollWidth strictly exceeds clientWidth', () => {
    expect(shouldMarquee(200, 100)).toBe(true)
    expect(shouldMarquee(100, 100)).toBe(false)
    expect(shouldMarquee(50, 100)).toBe(false)
  })

  it('shouldMarquee uses a 1px tolerance to absorb sub-pixel layout jitter', () => {
    // 100.4 vs 100 should NOT trigger marquee — within the 1px floor.
    expect(shouldMarquee(100.4, 100)).toBe(false)
    expect(shouldMarquee(101.5, 100)).toBe(true)
  })
})
```

Run: `npx vitest run tests/unit/marquee-math.test.ts`. Expected: fails — module not found.

- [ ] **Step 2: Implement the math module**

`src/lib/client/marquee-math.ts`:

```ts
// §5.3: marquee scroll speed = 30 px/s; pause = 1.5 s at each end.
const SPEED_PX_PER_SEC = 30
const PAUSE_TOTAL_SEC = 3.0
// Sub-pixel jitter (browser font-metric drift) can falsely flip overflow at the
// wrap threshold. 1 CSS px is a comfortable floor — typical jitter is <0.5px.
const OVERFLOW_TOLERANCE_PX = 1

export const computeMarqueeDuration = (overflowPx: number): number =>
  Math.max(0, overflowPx) / SPEED_PX_PER_SEC + PAUSE_TOTAL_SEC

export const shouldMarquee = (scrollWidth: number, clientWidth: number): boolean =>
  scrollWidth - clientWidth > OVERFLOW_TOLERANCE_PX
```

Run the test again: passes.

- [ ] **Step 3: Implement the component**

`src/components/shared/MarqueeText.tsx`:

```tsx
'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { computeMarqueeDuration, shouldMarquee } from '@/lib/client/marquee-math'

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

export const MarqueeText = ({ text, className }: { text: string; className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [overflow, setOverflow] = useState(false)
  const [duration, setDuration] = useState(3.0)
  const [distancePx, setDistancePx] = useState(0)

  const measure = () => {
    const c = containerRef.current
    const i = innerRef.current
    if (!c || !i) return
    const sw = i.scrollWidth
    const cw = c.clientWidth
    const o = shouldMarquee(sw, cw)
    setOverflow(o)
    if (o) {
      const d = sw - cw
      setDistancePx(d)
      setDuration(computeMarqueeDuration(d))
    } else {
      setDistancePx(0)
    }
  }

  // §5.3 remeasure trigger 1: text change.
  useIsomorphicLayoutEffect(() => { measure() }, [text])

  // §5.3 remeasure trigger 2: document.fonts.ready (Crimson Pro swap-in).
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return
    let cancelled = false
    document.fonts.ready.then(() => { if (!cancelled) measure() }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  // §5.3 remeasure trigger 3: ResizeObserver on the container, throttled via rAF.
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    })
    ro.observe(c)
    return () => { ro.disconnect(); cancelAnimationFrame(raf) }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`marquee ${className ?? ''}`}
      data-overflow={overflow ? '1' : '0'}
      style={overflow
        ? ({ ['--marquee-distance' as any]: `${distancePx}px`, ['--marquee-duration' as any]: `${duration}s` })
        : undefined}
      title={text}
    >
      <span ref={innerRef}>{text}</span>
    </div>
  )
}
```

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit  # clean
npx vitest run tests/unit/marquee-math.test.ts  # passes (3 tests)
git add src/lib/client/marquee-math.ts src/components/shared/MarqueeText.tsx tests/unit/marquee-math.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): add MarqueeText with unit-tested overflow math

Implements §5.3 marquee with measurement on text change,
document.fonts.ready, and ResizeObserver (rAF-throttled). Math is
extracted into marquee-math.ts so the timing rule (30px/s + 3s
pause) is tested in isolation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Implement `useTopOccluderHeight` hook with unit tests

**Files:**
- Create: `src/lib/client/use-top-occluder-height.ts`
- Create: `tests/unit/top-occluder-height.test.ts`

**Context:** §5.6 says `--top-occluder-height` has a **single writer** that recomputes from DOM on every mount/unmount/resize of the chrome elements (Tabs, OfflineBanner, PendingAddsTray) — never incremental add/subtract. The hook owns:
1. An array of refs to observe.
2. A ResizeObserver attached to each that triggers full recomputation.
3. `getBoundingClientRect()` summation across non-null refs.
4. Writes the sum to `document.documentElement.style.setProperty('--top-occluder-height', `${total}px`)`.

The summation logic is testable headless; the DOM glue is verified in browser.

- [ ] **Step 1: Write the failing test**

`tests/unit/top-occluder-height.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { sumOccluderHeights } from '@/lib/client/use-top-occluder-height'

describe('top occluder height summation', () => {
  it('returns 0 for empty input', () => {
    expect(sumOccluderHeights([])).toBe(0)
  })
  it('skips null entries (unmounted occluders)', () => {
    expect(sumOccluderHeights([null, 30, null, 20])).toBe(50)
  })
  it('sums positive heights', () => {
    expect(sumOccluderHeights([56, 32, 48])).toBe(136)
  })
  it('clamps negative heights to 0 (rect can be negative if element is offscreen)', () => {
    expect(sumOccluderHeights([56, -10, 20])).toBe(76)
  })
  it('rounds to integer pixels to keep the CSS variable stable', () => {
    expect(sumOccluderHeights([56.4, 32.2])).toBe(89)
  })
})
```

Run: fails (module not found).

- [ ] **Step 2: Implement**

`src/lib/client/use-top-occluder-height.ts`:

```ts
'use client'
import { useEffect, useRef, type RefObject } from 'react'

// Tested. Pure function: array of measured heights (or null for "unmounted")
// → integer sum, with negatives clamped to 0.
export const sumOccluderHeights = (heights: Array<number | null>): number => {
  let total = 0
  for (const h of heights) {
    if (h === null) continue
    if (h > 0) total += h
  }
  return Math.round(total)
}

// §5.6 single-writer rule. Pass an array of refs to elements that occlude the
// top of the phone-root viewport (Tabs, OfflineBanner, PendingAddsTray). The
// hook attaches a ResizeObserver to each currently-mounted element, recomputes
// the total via getBoundingClientRect() on every change, and writes to
// :root --top-occluder-height. On every recompute we read fresh refs, so the
// add/subtract drift bug from incremental updates is structurally impossible.
export const useTopOccluderHeight = (refs: ReadonlyArray<RefObject<HTMLElement | null>>) => {
  // Stable identity for the observers across renders.
  const refsRef = useRef(refs)
  refsRef.current = refs

  useEffect(() => {
    if (typeof window === 'undefined') return

    const recompute = () => {
      const heights = refsRef.current.map((r) => {
        const el = r.current
        if (!el) return null
        const rect = el.getBoundingClientRect()
        return rect.height
      })
      const total = sumOccluderHeights(heights)
      document.documentElement.style.setProperty('--top-occluder-height', `${total}px`)
    }

    // Recompute now (covers initial mount, ref-set timing) and on resize.
    recompute()

    const ros = refsRef.current
      .map((r) => r.current)
      .filter((el): el is HTMLElement => el !== null)
      .map((el) => {
        const ro = new ResizeObserver(() => recompute())
        ro.observe(el)
        return ro
      })

    // Cover window resize / address-bar collapse explicitly — RO does not fire
    // for viewport-relative size changes on iOS.
    window.addEventListener('resize', recompute)

    return () => {
      for (const ro of ros) ro.disconnect()
      window.removeEventListener('resize', recompute)
    }
    // Re-run when the ref array length changes (occluder mounts/unmounts).
  }, [refs.length])
}
```

Run the test: passes (5 cases).

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit  # clean
npx vitest run tests/unit/top-occluder-height.test.ts  # 5 passing
git add src/lib/client/use-top-occluder-height.ts tests/unit/top-occluder-height.test.ts
git commit -m "$(cat <<'EOF'
feat(ui): add useTopOccluderHeight hook with unit-tested summation

Single writer for --top-occluder-height per §5.6. Sum is computed
from getBoundingClientRect on every recompute, never incremental, so
mount/unmount races can't leave a stale value.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Shared phone shell components

### Task 6: Implement `Tabs.tsx`

**Files:**
- Create: `src/components/phone/Tabs.tsx`

**Context:** §4.1 preserves the structure but extracts the header + tab strip as a sticky component. It's **read-only** with respect to `--top-occluder-height` (the PhoneRoot hook in Task 7 owns the measurement). Tabs renders the `●  NAME · ⚙` left block and the `[QUEUE] [SEARCH] [PASTE]` right block, applies `.tabs` (which owns `safe-area-inset-top`), and forwards a ref so the PhoneRoot hook can measure it.

- [ ] **Step 1: Create the component**

`src/components/phone/Tabs.tsx`:

```tsx
'use client'
import { forwardRef } from 'react'

export type Tab = 'queue' | 'search' | 'paste'

export type TabsProps = {
  name: string
  activeTab: Tab
  onTabChange: (t: Tab) => void
  onEditName: () => void
  /** Optional badge count for the QUEUE tab — set on §4.3 "Added — N in queue" path. */
  queueBadge?: number
}

export const Tabs = forwardRef<HTMLElement, TabsProps>(function Tabs(
  { name, activeTab, onTabChange, onEditName, queueBadge },
  ref,
) {
  return (
    <header
      ref={ref}
      className="tabs"
      role="banner"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        background: 'var(--ink-black)',
        borderBottom: '1px solid var(--ink-deep)',
        padding: '8px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span aria-hidden style={{ color: 'var(--riso-pink)' }}>●</span>
        <span className="uc" style={{ fontSize: 13, color: 'var(--paper-cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
        <button
          type="button"
          aria-label="Edit name"
          onClick={onEditName}
          className="hit-target uc"
          style={{ background: 'transparent', color: 'var(--paper-cream)', fontSize: 14 }}
        >
          ⚙
        </button>
      </div>
      <nav style={{ display: 'flex', gap: 6 }} aria-label="Phone client tabs">
        {(['queue', 'search', 'paste'] as Tab[]).map((t) => {
          const active = activeTab === t
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTabChange(t)}
              aria-current={active ? 'page' : undefined}
              className="hit-target uc"
              style={{
                padding: '8px 12px',
                fontSize: 11,
                background: active ? 'var(--hanko-red)' : 'transparent',
                color: 'var(--paper-cream)',
                border: '1px solid transparent',
              }}
            >
              {t === 'queue' && typeof queueBadge === 'number' && queueBadge > 0
                ? `${t.toUpperCase()} · ${queueBadge}`
                : t.toUpperCase()}
            </button>
          )
        })}
      </nav>
    </header>
  )
})
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit  # clean
git add src/components/phone/Tabs.tsx
git commit -m "$(cat <<'EOF'
feat(phone): add sticky Tabs header component

Sticky header with ●/name/⚙ on the left and QUEUE/SEARCH/PASTE on the
right per §4.1. Owns safe-area-inset-top via the .tabs class; ref is
forwarded so the PhoneRoot occluder hook can measure it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Implement `OfflineBanner.tsx`

**Files:**
- Create: `src/components/phone/OfflineBanner.tsx`

**Context:** §3.3a defines this as a SINGLE-INSTANCE banner mounted ONCE in the phone-root layout (between Tabs and the active tab body), visible when `sourceConnected === false || sourceReady === false`. Belongs to the `--top-occluder-height` measurement set, so it forwards a ref.

- [ ] **Step 1: Create**

`src/components/phone/OfflineBanner.tsx`:

```tsx
'use client'
import { forwardRef } from 'react'

export const OfflineBanner = forwardRef<HTMLDivElement>(function OfflineBanner(_props, ref) {
  return (
    <div
      ref={ref}
      className="offline-banner uc"
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 'var(--tabs-height)',
        zIndex: 4,
        padding: '6px 12px',
        background: 'var(--ink-deep)',
        color: 'var(--riso-pink)',
        borderBottom: '1px solid var(--ink-black)',
        fontSize: 12,
        textAlign: 'center',
      }}
    >
      ▌ source offline — playback paused
    </div>
  )
})
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/phone/OfflineBanner.tsx
git commit -m "$(cat <<'EOF'
feat(phone): add OfflineBanner single-instance banner

Mounted once in PhoneRoot between Tabs and the tab body per §3.3a.
Ref forwarded so the occluder hook includes it in the height sum.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Implement the `pendingAdds` reducer + context with TDD

**Files:**
- Create: `src/lib/client/pending-adds.ts`
- Create: `tests/unit/pending-adds.test.ts`

**Context:** §4.3 defines a complex lifecycle for in-flight `queue.add` operations. It must survive tab switches, query edits, and component re-renders; clear only on `state.ack` or user dismiss; never auto-evict; downgrade to "expired" label after 5 minutes; track the bounded-retry-window via three thresholds. This is the most logic-dense module of the redesign — TDD it.

Decisions locked by the spec:
- Map primary key is `msgId` (not `videoId`).
- Lookup by `videoId` is via filtering values.
- Entries clear only on (a) `state.ack` of any outcome, or (b) explicit dismiss.
- 5-minute mark relabels the UI but does NOT remove the entry.
- Three-threshold bounded-retry-window (80 mutations OR ≥3 epoch jump OR 2 minutes wall-clock) flips the "tap to retry" to "Start new add anyway".

- [ ] **Step 1: Write the failing tests**

`tests/unit/pending-adds.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  pendingAddsReducer,
  initialPendingAdds,
  type PendingAddsState,
  type PendingAddsAction,
  classifyPendingState,
  STALE_VISUAL_MS,
  RETRY_WINDOW_MUTATIONS,
  RETRY_WINDOW_EPOCH_JUMP,
  RETRY_WINDOW_WALL_MS,
} from '@/lib/client/pending-adds'

const addAction = (over: Partial<{ msgId: string; videoId: string; prePitch: number; sentAt: number; epoch: number }> = {}): PendingAddsAction => ({
  type: 'add',
  msgId: over.msgId ?? 'm1',
  videoId: over.videoId ?? 'vid1',
  prePitch: over.prePitch ?? 0,
  sentAt: over.sentAt ?? 1_000_000,
  epoch: over.epoch ?? 0,
})

describe('pendingAdds reducer', () => {
  it('starts empty', () => {
    expect(initialPendingAdds.size).toBe(0)
  })

  it('add inserts an entry keyed by msgId', () => {
    const s = pendingAddsReducer(initialPendingAdds, addAction())
    expect(s.size).toBe(1)
    expect(s.get('m1')?.videoId).toBe('vid1')
    expect(s.get('m1')?.prePitch).toBe(0)
  })

  it('add of same msgId is idempotent (does not overwrite sentAt)', () => {
    const s1 = pendingAddsReducer(initialPendingAdds, addAction({ sentAt: 1_000 }))
    const s2 = pendingAddsReducer(s1, addAction({ sentAt: 9_000 }))
    expect(s2.size).toBe(1)
    expect(s2.get('m1')?.sentAt).toBe(1_000)
  })

  it('two distinct msgIds for the same videoId coexist (different keys)', () => {
    const s1 = pendingAddsReducer(initialPendingAdds, addAction({ msgId: 'a', videoId: 'v', prePitch: 0 }))
    const s2 = pendingAddsReducer(s1, addAction({ msgId: 'b', videoId: 'v', prePitch: 3 }))
    expect(s2.size).toBe(2)
  })

  it('ack removes the entry regardless of outcome', () => {
    const s1 = pendingAddsReducer(initialPendingAdds, addAction())
    const sOk = pendingAddsReducer(s1, { type: 'ack', msgId: 'm1', ok: true })
    expect(sOk.size).toBe(0)
    const sFail = pendingAddsReducer(s1, { type: 'ack', msgId: 'm1', ok: false, error: 'x' })
    expect(sFail.size).toBe(0)
  })

  it('ack for an unknown msgId is a no-op (does not crash)', () => {
    const s = pendingAddsReducer(initialPendingAdds, { type: 'ack', msgId: 'missing', ok: true })
    expect(s.size).toBe(0)
  })

  it('dismiss removes a specific entry', () => {
    const s1 = pendingAddsReducer(initialPendingAdds, addAction({ msgId: 'a' }))
    const s2 = pendingAddsReducer(s1, addAction({ msgId: 'b' }))
    const s3 = pendingAddsReducer(s2, { type: 'dismiss', msgId: 'a' })
    expect(s3.size).toBe(1)
    expect(s3.has('b')).toBe(true)
  })

  it('incrementMutations advances mutationsSentSince on EVERY entry', () => {
    const s1 = pendingAddsReducer(initialPendingAdds, addAction({ msgId: 'a' }))
    const s2 = pendingAddsReducer(s1, addAction({ msgId: 'b' }))
    const s3 = pendingAddsReducer(s2, { type: 'incrementMutations' })
    expect(s3.get('a')?.mutationsSentSince).toBe(1)
    expect(s3.get('b')?.mutationsSentSince).toBe(1)
  })

  describe('classifyPendingState', () => {
    const now = 1_000_000
    it('returns "queueing" before timeout, no thresholds crossed', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - 1000, mutationsSentSince: 5, epochAtSent: 7 },
        { now, currentEpoch: 7, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('queueing')
    })
    it('returns "retry" after 6s ack timeout, still inside retry window', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - 7000, mutationsSentSince: 5, epochAtSent: 7 },
        { now, currentEpoch: 7, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('retry')
    })
    it('returns "expired-window" after the 80-mutation threshold', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - 7000, mutationsSentSince: RETRY_WINDOW_MUTATIONS, epochAtSent: 7 },
        { now, currentEpoch: 7, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('expired-window')
    })
    it('returns "expired-window" after the epoch-jump threshold', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - 7000, mutationsSentSince: 5, epochAtSent: 7 },
        { now, currentEpoch: 7 + RETRY_WINDOW_EPOCH_JUMP, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('expired-window')
    })
    it('returns "expired-window" after the 2-minute wall-clock threshold', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - RETRY_WINDOW_WALL_MS, mutationsSentSince: 5, epochAtSent: 7 },
        { now, currentEpoch: 7, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('expired-window')
    })
    it('returns "stale-visual" past 5 minutes (overrides expired-window)', () => {
      const c = classifyPendingState(
        { msgId: 'm', videoId: 'v', prePitch: 0, sentAt: now - STALE_VISUAL_MS, mutationsSentSince: 200, epochAtSent: 7 },
        { now, currentEpoch: 7, ackedTimeoutMs: 6000 },
      )
      expect(c).toBe('stale-visual')
    })
  })
})
```

Run: `npx vitest run tests/unit/pending-adds.test.ts`. Fails — module not found.

- [ ] **Step 2: Implement the reducer + classifier**

`src/lib/client/pending-adds.ts`:

```ts
// §4.3 pending-adds lifecycle. See spec for the canonical rules.

export type PendingAdd = {
  msgId: string
  videoId: string
  prePitch: number
  sentAt: number
  mutationsSentSince: number
  epochAtSent: number
}

export type PendingAddsState = ReadonlyMap<string, PendingAdd>

export type PendingAddsAction =
  | { type: 'add'; msgId: string; videoId: string; prePitch: number; sentAt: number; epoch: number }
  | { type: 'ack'; msgId: string; ok: boolean; error?: string }
  | { type: 'dismiss'; msgId: string }
  | { type: 'incrementMutations' }

export const initialPendingAdds: PendingAddsState = new Map()

export const pendingAddsReducer = (
  state: PendingAddsState,
  action: PendingAddsAction,
): PendingAddsState => {
  switch (action.type) {
    case 'add': {
      // Idempotent: re-adding the same msgId preserves the original sentAt.
      if (state.has(action.msgId)) return state
      const next = new Map(state)
      next.set(action.msgId, {
        msgId: action.msgId,
        videoId: action.videoId,
        prePitch: action.prePitch,
        sentAt: action.sentAt,
        mutationsSentSince: 0,
        epochAtSent: action.epoch,
      })
      return next
    }
    case 'ack':
    case 'dismiss': {
      if (!state.has(action.msgId)) return state
      const next = new Map(state)
      next.delete(action.msgId)
      return next
    }
    case 'incrementMutations': {
      if (state.size === 0) return state
      const next = new Map<string, PendingAdd>()
      for (const [k, v] of state) {
        next.set(k, { ...v, mutationsSentSince: v.mutationsSentSince + 1 })
      }
      return next
    }
  }
}

// §4.3 thresholds (named constants so they're testable and discoverable).
export const RETRY_WINDOW_MUTATIONS = 80
export const RETRY_WINDOW_EPOCH_JUMP = 3
export const RETRY_WINDOW_WALL_MS = 2 * 60 * 1000
export const STALE_VISUAL_MS = 5 * 60 * 1000

export type PendingClassification =
  | 'queueing'        // still within the no-ack-yet window
  | 'retry'           // past ack timeout, inside the retry window
  | 'expired-window'  // any of the three retry-window thresholds crossed
  | 'stale-visual'    // past 5 min — the spec says relabel, not remove

export const classifyPendingState = (
  entry: PendingAdd,
  ctx: { now: number; currentEpoch: number; ackedTimeoutMs: number },
): PendingClassification => {
  const age = ctx.now - entry.sentAt
  if (age >= STALE_VISUAL_MS) return 'stale-visual'

  const epochDelta = ctx.currentEpoch - entry.epochAtSent
  const expiredWindow =
    entry.mutationsSentSince >= RETRY_WINDOW_MUTATIONS ||
    epochDelta >= RETRY_WINDOW_EPOCH_JUMP ||
    age >= RETRY_WINDOW_WALL_MS

  if (expiredWindow) return 'expired-window'
  if (age >= ctx.ackedTimeoutMs) return 'retry'
  return 'queueing'
}
```

Run the tests: all green.

- [ ] **Step 3: Add a React hook + context wrapper**

Add to the same file:

```ts
// React glue lives below. Pure logic above stays import-clean for tests.
'use client'
// Re-import-safe — same file used as both pure module and React module.
import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from 'react'

const reactify = <S, A>(reducer: (s: S, a: A) => S) => reducer

type Ctx = {
  pendingAdds: PendingAddsState
  add: (msgId: string, videoId: string, prePitch: number, epoch: number) => void
  ack: (msgId: string, ok: boolean, error?: string) => void
  dismiss: (msgId: string) => void
  incrementMutations: () => void
}

const PendingAddsContext = createContext<Ctx | null>(null)

export const PendingAddsProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reactify(pendingAddsReducer), initialPendingAdds)
  const add = useCallback((msgId: string, videoId: string, prePitch: number, epoch: number) =>
    dispatch({ type: 'add', msgId, videoId, prePitch, sentAt: Date.now(), epoch }), [])
  const ack = useCallback((msgId: string, ok: boolean, error?: string) =>
    dispatch({ type: 'ack', msgId, ok, error }), [])
  const dismiss = useCallback((msgId: string) => dispatch({ type: 'dismiss', msgId }), [])
  const incrementMutations = useCallback(() => dispatch({ type: 'incrementMutations' }), [])
  const value = useMemo<Ctx>(() => ({ pendingAdds: state, add, ack, dismiss, incrementMutations }), [state, add, ack, dismiss, incrementMutations])
  return <PendingAddsContext.Provider value={value}>{children}</PendingAddsContext.Provider>
}

export const usePendingAdds = (): Ctx => {
  const v = useContext(PendingAddsContext)
  if (!v) throw new Error('usePendingAdds must be used inside <PendingAddsProvider>')
  return v
}
```

Note: putting `'use client'` mid-file is unusual but tolerated by Next's module graph because the `createContext`/`useReducer` imports force the whole module to client. Verify by `npx tsc --noEmit`. If a downstream task hits an SSR boundary issue, split into `pending-adds.ts` (pure) + `pending-adds-context.tsx` (React) at that time.

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit  # clean
npx vitest run tests/unit/pending-adds.test.ts  # all green
git add src/lib/client/pending-adds.ts tests/unit/pending-adds.test.ts
git commit -m "$(cat <<'EOF'
feat(phone): add pending-adds reducer + React context per §4.3

Lifecycle: msgId-keyed; entries clear only on ack or dismiss; 5-min
mark relabels but does not evict; bounded retry window via three
thresholds (80 mutations OR 3-epoch jump OR 2-min wall clock).
Reducer and classifier are pure functions tested headless.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Implement `PendingAddsTray.tsx`

**Files:**
- Create: `src/components/phone/PendingAddsTray.tsx`

**Context:** §4.3 says the tray is owned by PhoneRoot and renders above every tab's body when `pendingAdds.size > 0`. Each row: title (or videoId fallback), key, state badge (queueing / tap to retry / expired-window / expired), `[×]` dismiss, primary tap target retries. The tray forwards a ref for the occluder hook.

- [ ] **Step 1: Create**

`src/components/phone/PendingAddsTray.tsx`:

```tsx
'use client'
import { forwardRef, useEffect, useState } from 'react'
import { classifyPendingState, usePendingAdds, type PendingClassification } from '@/lib/client/pending-adds'

const ACK_TIMEOUT_MS = 6000

const labelFor = (c: PendingClassification): string => {
  switch (c) {
    case 'queueing':       return 'queueing…'
    case 'retry':          return 'tap to retry'
    case 'expired-window': return 'start new add anyway'
    case 'stale-visual':   return 'expired (server may have applied this)'
  }
}

export type PendingAddsTrayProps = {
  currentEpoch: number
  onRetry: (msgId: string) => void
}

export const PendingAddsTray = forwardRef<HTMLDivElement, PendingAddsTrayProps>(function PendingAddsTray(
  { currentEpoch, onRetry },
  ref,
) {
  const { pendingAdds, dismiss } = usePendingAdds()

  // The classification reads Date.now(); recompute on a 1s tick so the
  // queueing→retry→expired-window→stale-visual transitions surface live.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (pendingAdds.size === 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [pendingAdds.size])

  if (pendingAdds.size === 0) return null

  return (
    <div
      ref={ref}
      className="pending-adds-tray"
      role="region"
      aria-label="Pending adds"
      style={{
        position: 'sticky',
        top: 'calc(var(--tabs-height))',
        zIndex: 3,
        background: 'var(--ink-deep)',
        borderBottom: '1px solid var(--ink-black)',
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {Array.from(pendingAdds.values()).map((entry) => {
        const cls = classifyPendingState(entry, { now, currentEpoch, ackedTimeoutMs: ACK_TIMEOUT_MS })
        return (
          <div
            key={entry.msgId}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <button
              type="button"
              className="hit-target uc"
              aria-label={`Retry pending add for ${entry.videoId}`}
              onClick={() => onRetry(entry.msgId)}
              style={{
                flex: '1 1 auto',
                minWidth: 0,
                textAlign: 'left',
                padding: '6px 8px',
                background: 'transparent',
                color: cls === 'stale-visual' ? 'var(--riso-pink)' : 'var(--paper-cream)',
                fontSize: 11,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.videoId} · key {entry.prePitch >= 0 ? '+' : ''}{entry.prePitch} · {labelFor(cls)}
            </button>
            <button
              type="button"
              className="hit-target uc"
              aria-label={`Dismiss pending add for ${entry.videoId}`}
              onClick={() => dismiss(entry.msgId)}
              style={{ background: 'transparent', color: 'var(--riso-pink)', fontSize: 12 }}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
})
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/phone/PendingAddsTray.tsx
git commit -m "$(cat <<'EOF'
feat(phone): add PendingAddsTray rendering pending-adds entries

Live-ticked classification surfaces the queueing → retry →
expired-window → stale-visual transitions per §4.3. Forwards a ref
for the occluder height hook; primary tap retries, [×] dismisses.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Update `Toaster.tsx` for `--top-occluder-height` anchor and UNDO support

**Files:**
- Modify: `src/components/shared/Toaster.tsx`

**Context:** §5.4 says the toaster anchors at `top: var(--top-occluder-height, 0)` — it does NOT own a safe-area inset. §5.5 says reduced-motion keeps the opacity fade but drops the translate. The redesign also introduces UNDO toasts (queue remove on phone, queue remove/move on source) — the toast surface needs to support an optional action button. The current Toaster reads `type: 'toast'` server messages; UNDO toasts are CLIENT-side only (no protocol change), so we add an imperative `showToast({ level, message, undo })` exposed via a context.

- [ ] **Step 1: Rewrite the file**

`src/components/shared/Toaster.tsx`:

```tsx
'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { ServerMessage } from '@/lib/types/protocol'

type Level = 'info' | 'warn' | 'error'

type Toast = {
  id: number
  level: Level
  message: string
  /** Optional UNDO action — when present, renders a tap target inside the toast. */
  undo?: { label: string; onTap: () => void }
}

const COLORS: Record<Level, string> = {
  info: 'var(--cigarette)',
  warn: 'var(--riso-pink)',
  error: 'var(--hanko-red)',
}

const DEFAULT_TTL_MS = 4500
const UNDO_TTL_MS = 6000

type Ctx = {
  showToast: (t: { level: Level; message: string; undo?: { label: string; onTap: () => void }; ttlMs?: number }) => void
}

const ToasterContext = createContext<Ctx | null>(null)

export const useToaster = (): Ctx => {
  const v = useContext(ToasterContext)
  if (!v) throw new Error('useToaster must be used inside <Toaster>')
  return v
}

export const Toaster = ({ children }: { children?: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextIdRef = useRef(1)

  const showToast = useCallback<Ctx['showToast']>((t) => {
    const id = nextIdRef.current++
    const ttl = t.ttlMs ?? (t.undo ? UNDO_TTL_MS : DEFAULT_TTL_MS)
    const toast: Toast = { id, level: t.level, message: t.message, undo: t.undo }
    setToasts((cur) => [...cur, toast])
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), ttl)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type !== 'toast') return
      showToast({ level: m.level, message: m.message })
    }
    window.addEventListener('karaoke-msg', handler)
    return () => window.removeEventListener('karaoke-msg', handler)
  }, [showToast])

  const value = useMemo<Ctx>(() => ({ showToast }), [showToast])

  return (
    <ToasterContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'fixed',
          top: 'calc(var(--top-occluder-height, 0px) + 12px)',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
          maxWidth: 'min(420px, calc(100vw - 24px))',
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="paper-card paper-grain toast"
            data-visible="1"
            style={{
              pointerEvents: 'auto',
              minWidth: 220,
              maxWidth: 360,
              borderLeft: `4px solid ${COLORS[t.level]}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div style={{ flex: '1 1 auto', minWidth: 0 }}>
              <div className="uc" style={{ fontSize: 9, color: COLORS[t.level], marginBottom: 2 }}>{t.level}</div>
              <div style={{ fontFamily: 'var(--mono-font)', fontSize: 12, wordBreak: 'break-word' }}>{t.message}</div>
            </div>
            {t.undo && (
              <button
                type="button"
                className="hit-target uc"
                onClick={() => {
                  t.undo!.onTap()
                  setToasts((cur) => cur.filter((x) => x.id !== t.id))
                }}
                style={{
                  background: 'transparent',
                  color: COLORS[t.level],
                  border: `1px solid ${COLORS[t.level]}`,
                  padding: '6px 10px',
                  fontSize: 10,
                }}
              >
                {t.undo.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToasterContext.Provider>
  )
}
```

The Toaster is now a context provider — it wraps its children with the `useToaster` context AND renders the toast surface. The old prop-less `<Toaster />` shape changes to `<Toaster>{children}</Toaster>`; all current call sites mount Toaster as a sibling, not a wrapper, so we keep the empty-children form working by accepting `children` as optional. Existing call sites stay valid (`<Toaster />`) until the rewrites in later tasks switch to the provider form.

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/shared/Toaster.tsx
git commit -m "$(cat <<'EOF'
refactor(toaster): anchor at --top-occluder-height + add UNDO support

Toaster now exposes a useToaster() hook for imperative client-side
toasts with optional UNDO actions per §3.6 and §4.2. Container
anchors below the full top chrome via --top-occluder-height; the
.toast class supplies the reduced-motion-aware mount animation per
§5.5. Existing `<Toaster />` call sites stay valid.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Source page rewrite

### Task 11: Rewrite `src/app/source/page.tsx` with `.source-root` grid

**Files:**
- Modify: `src/app/source/page.tsx`

**Context:** Today the source page is a `<main>` with `position: relative; overflow: hidden` and absolute-positioned `VideoPlayer` + `QueueOverlay` siblings. §3.1 / §3.5 / §5.6 say it should be a CSS-grid `.source-root` with `<section aria-label="Now playing">` (video frame) and `<aside aria-label="Setlist and join controls">` (right rail), responsive at 720px. The wrapper also owns all four safe-area insets per §5.4. TokenEntry has already been removed in `52e037a`; the page renders the non-localhost guard, then `StartShowGesture`, then the running show.

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'
import { useState, useEffect } from 'react'
import { StartShowGesture } from '@/components/source/StartShowGesture'
import { VideoPlayer } from '@/components/source/VideoPlayer'
import { QueueOverlay } from '@/components/source/QueueOverlay'
import { KeyboardShortcuts } from '@/components/source/KeyboardShortcuts'
import { Toaster } from '@/components/shared/Toaster'
import { useConnection } from '@/lib/client/ws'

const isLocalhostOrigin = () => {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]'
}

export default function Source() {
  const [local, setLocal] = useState<boolean | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  useEffect(() => { setLocal(isLocalhostOrigin()) }, [])

  const conn = useConnection({ name: 'source' })

  if (local === null) return null
  if (!local) {
    return (
      <div className="page-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="paper-card paper-grain" style={{ maxWidth: 420 }}>
          <div className="uc" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>▌ wrong device</div>
          <h2 style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 22, margin: '8px 0 12px' }}>
            Open this page on the host machine.
          </h2>
          <p style={{ fontFamily: 'var(--mono-font)', fontSize: 12, lineHeight: 1.5 }}>
            <code>/source</code> is the TV display and runs on the MacBook that started the server. To add songs from this device, go to <code>/</code> instead.
          </p>
        </div>
      </div>
    )
  }
  if (!unlocked) return <StartShowGesture onClick={() => setUnlocked(true)} />

  // The .source-root grid (defined in riso.css) owns all four safe-area insets,
  // 100dvh sizing, and the desktop video-left + rail-right layout (single column on ≤720px).
  return (
    <Toaster>
      <main className="source-root" aria-label="Karaoke source display">
        <section className="source-root__video" aria-label="Now playing" style={{ position: 'relative' }}>
          <VideoPlayer conn={conn} />
        </section>
        <aside className="source-root__rail" aria-label="Setlist and join controls">
          <QueueOverlay conn={conn} />
        </aside>
        <KeyboardShortcuts conn={conn} />
      </main>
    </Toaster>
  )
}
```

Note: existing video/overlay components keep their current shapes for now; they're rewritten in following tasks.

- [ ] **Step 2: Verify + commit**

`npx tsc --noEmit` clean. Open `/source` on localhost: page renders, audio gesture still works, video/overlay still appear (in old shapes). Resize <720px: single column.

```bash
git add src/app/source/page.tsx
git commit -m "feat(source): switch /source to CSS-grid .source-root layout

Replaces the absolute-overlay shell with a .source-root grid that
owns safe-area insets and 100dvh per §5.4/§5.6. Adds landmark roles.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Create `NowPlayingStrip.tsx`

**Files:**
- Create: `src/components/source/NowPlayingStrip.tsx`

**Context:** §3.2 — bottom strip of video frame: marquee title, sub-line, pitch ± stepper, ⏮⏯⏭ transport (shuffle is on setlist header, not here). §5.6 phone layout splits to 2 rows on ≤720px, 3 rows on ≤390px — class names below match those normative selectors.

- [ ] **Step 1: Create**

`src/components/source/NowPlayingStrip.tsx`:

```tsx
'use client'
import { randomUUID } from '@/lib/client/uuid'
import type { Connection } from '@/lib/client/ws'
import type { PlayerState } from '@/lib/types/state'
import { MarqueeText } from '@/components/shared/MarqueeText'

const fmtMmSs = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
const fmtKey = (p: number) => (p >= 0 ? `+${p}` : String(p))

export const NowPlayingStrip = ({ conn, player }: { conn: Connection; player: Exclude<PlayerState, { status: 'idle' }> }) => {
  const setLive = (sem: number) =>
    conn.send({ type: 'player.setLivePitch', msgId: randomUUID(), semitones: sem })
  const skip = () => conn.send({ type: 'player.skip', msgId: randomUUID(), epoch: player.epoch })
  const prev = () => conn.send({ type: 'player.prev', msgId: randomUUID(), epoch: player.epoch })
  const togglePause = () =>
    conn.send({ type: player.status === 'paused' ? 'player.play' : 'player.pause', msgId: randomUUID() })

  const subline = `${player.item.queuedBy.name} · KEY ${fmtKey(player.livePitch)} · ${fmtMmSs(player.positionSec)} / ${fmtMmSs(player.item.durationSec)}`

  return (
    <div
      className="now-playing-strip paper-card paper-grain"
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 12,
      }}
    >
      <div className="now-playing-strip__text" style={{ flex: '1 1 auto', minWidth: 0 }}>
        <MarqueeText text={player.item.title} className="now-playing-strip__title" />
        <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)', letterSpacing: '0.15em' }}>{subline}</div>
      </div>
      <div className="now-playing-strip__controls" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="now-playing-strip__pitch" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="hit-target uc" aria-label="Lower pitch by one semitone" onClick={() => setLive(player.livePitch - 1)} style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}>−</button>
          <span className="hanko" aria-live="polite" style={{ minWidth: '2.4em', textAlign: 'center' }}>{fmtKey(player.livePitch)}</span>
          <button type="button" className="hit-target uc" aria-label="Raise pitch by one semitone" onClick={() => setLive(player.livePitch + 1)} style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}>+</button>
        </div>
        <div className="now-playing-strip__transport" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="hit-target uc" aria-label="Previous song" onClick={prev} style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}>⏮</button>
          <button type="button" className="hit-target uc" aria-label={player.status === 'paused' ? 'Play' : 'Pause'} onClick={togglePause} style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}>{player.status === 'paused' ? '▶' : '⏸'}</button>
          <button type="button" className="hit-target uc" aria-label="Skip" onClick={skip} style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}>⏭</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/source/NowPlayingStrip.tsx
git commit -m "feat(source): add NowPlayingStrip component (§3.2 + §5.6)

Marquee title + sub-line + pitch ± + transport. Class names match
the §5.6 normative CSS so the 2-row (≤720px) and 3-row (≤390px)
phone layouts cascade. Shuffle is on the setlist header, not here.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Refit `VideoPlayer.tsx` for the framed layout

**Files:**
- Modify: `src/components/source/VideoPlayer.tsx`

**Context:** §3.2 — frame contains a `▌ LIVE 出演中` badge state machine and the bottom strip. The audio-graph mount keeps writing into the inner mount div; we wrap it. The component should also render `IdleSplash` when `player.status === 'idle'` (the splash component is created in Task 18 — we add the import + branch now and the file will exist after Task 18; if necessary, stub `IdleSplash` as a one-line export to keep TS happy while sequencing, or do this task AFTER Task 18 lands).

**Sequencing note:** This task assumes Task 18 (IdleSplash) lands first. Reorder if executing sequentially: 18 before 13.

Actually, restructuring: let's do Task 13 in TWO commits — (a) wrap in frame + add LIVE badge + NowPlayingStrip when player is playing/paused; (b) the IdleSplash hookup lives in Task 18. That keeps each task self-contained.

- [ ] **Step 1: Edit the return**

Locate the current `return <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />` near the bottom of `VideoPlayer.tsx`. Replace with:

```tsx
const player = conn.state?.player
const isPlaying = player && player.status !== 'idle'

return (
  <div
    className="source-video-frame"
    style={{
      position: 'relative', aspectRatio: '16 / 9', width: '100%', maxHeight: '100%',
      background: 'var(--ink-deep)', border: '1.5px solid var(--cigarette)', overflow: 'hidden',
    }}
  >
    <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
    {isPlaying && (
      <>
        <div
          className="live-badge uc"
          data-status={player.status}
          style={{
            position: 'absolute', top: 8, left: 8, padding: '2px 6px',
            background: 'rgba(10, 8, 8, 0.7)', color: 'var(--riso-pink)',
            letterSpacing: '0.16em', fontSize: 12, borderRadius: 2, pointerEvents: 'none',
          }}
        >
          ▌ LIVE 出演中
        </div>
        <NowPlayingStrip conn={conn} player={player} />
      </>
    )}
  </div>
)
```

Add the import at the top:

```tsx
import { NowPlayingStrip } from './NowPlayingStrip'
```

- [ ] **Step 2: Verify + commit**

`npx tsc --noEmit`. Test: queue a song → video plays inside a 16:9 frame, LIVE badge pulses, strip shows. Pause → badge stops pulsing at 0.6 opacity.

```bash
git add src/components/source/VideoPlayer.tsx
git commit -m "feat(source): wrap VideoPlayer in 16:9 frame + LIVE badge + strip

The 16:9 frame is the §3.1 video region. .live-badge state machine
wires through to the §5.5 pulse; NowPlayingStrip renders along the
bottom when player.status !== 'idle'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Rewrite `QrPanel.tsx` (full + chip variants)

**Files:**
- Modify: `src/components/source/QrPanel.tsx`

**Context:** §3.2 desktop: full paper-card with 110px QR + caption + host:port. §3.5 mobile: image-only chip that opens `JoinUrlModal` on tap.

- [ ] **Step 1: Replace**

`src/components/source/QrPanel.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import qrcode from 'qrcode'

type Variant = 'full' | 'chip'

export type QrPanelProps = {
  variant?: Variant
  onOpenJoinModal?: () => void
}

const useJoinUrl = () => {
  const [url, setUrl] = useState<string>('')
  useEffect(() => {
    if (typeof window === 'undefined') return
    setUrl(`${window.location.protocol}//${window.location.host}/`)
  }, [])
  return url
}
const useQrDataUrl = (url: string, size: number) => {
  const [dataUrl, setDataUrl] = useState<string>('')
  useEffect(() => {
    if (!url) return
    qrcode.toDataURL(url, { margin: 1, width: size }).then(setDataUrl).catch(() => setDataUrl(''))
  }, [url, size])
  return dataUrl
}

export const QrPanel = ({ variant = 'full', onOpenJoinModal }: QrPanelProps) => {
  const url = useJoinUrl()
  const fullDataUrl = useQrDataUrl(url, 220)
  const chipDataUrl = useQrDataUrl(url, 120)

  if (variant === 'chip') {
    return (
      <button
        type="button"
        className="qr-chip hit-target"
        aria-label="Show join URL"
        onClick={onOpenJoinModal}
        style={{ padding: 0, background: 'var(--paper-cream)', border: '1px solid var(--ink-deep)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {chipDataUrl && <img src={chipDataUrl} alt="" style={{ width: '100%', height: '100%', display: 'block' }} />}
      </button>
    )
  }

  return (
    <div className="paper-card paper-grain" style={{ textAlign: 'center' }}>
      <div className="uc" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--ink-muted)' }}>scan to join</div>
      <div style={{ margin: '6px auto', width: 110, height: 110, background: 'var(--paper-cream)' }}>
        {fullDataUrl && <img src={fullDataUrl} alt={`Join URL ${url}`} width={110} height={110} style={{ display: 'block' }} />}
      </div>
      <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)', wordBreak: 'break-all' }}>
        {url.replace(/^https?:\/\//, '')}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add src/components/source/QrPanel.tsx
git commit -m "refactor(source): QrPanel full + chip variants

Desktop renders 110px QR card per §3.2; chip variant is an
image-only button per §3.5 that opens the JoinUrlModal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Create `JoinUrlModal.tsx`

**Files:**
- Create: `src/components/phone/JoinUrlModal.tsx`

**Context:** §3.5/§5.6 — native `<dialog>` with `.showModal()` for focus trap + Escape + backdrop close. Manual fallback for browsers without `<dialog>`. Lock page scroll via `html.modal-open-lock`. Compact landscape (height ≤480px): modal body scrolls internally — this is the ONE exception to single-scroll-container, scoped to "while modal is open."

- [ ] **Step 1: Create**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import qrcode from 'qrcode'

export type JoinUrlModalProps = { open: boolean; onClose: () => void }

const useJoinUrl = () => {
  const [url, setUrl] = useState<string>('')
  useEffect(() => {
    if (typeof window === 'undefined') return
    setUrl(`${window.location.protocol}//${window.location.host}/`)
  }, [])
  return url
}
const useScrollLock = (locked: boolean) => {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return
    document.documentElement.classList.add('modal-open-lock')
    return () => document.documentElement.classList.remove('modal-open-lock')
  }, [locked])
}
const supportsDialog = () =>
  typeof window !== 'undefined' &&
  typeof window.HTMLDialogElement === 'function' &&
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  typeof (HTMLDialogElement.prototype as any).showModal === 'function'

export const JoinUrlModal = ({ open, onClose }: JoinUrlModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const url = useJoinUrl()
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!url) return
    qrcode.toDataURL(url, { margin: 1, width: 320 }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [url])
  useScrollLock(open)
  useEffect(() => {
    if (!open) return
    if (supportsDialog() && dialogRef.current) {
      const d = dialogRef.current
      const prev = document.activeElement as HTMLElement | null
      d.showModal()
      closeBtnRef.current?.focus()
      const onCancel = (e: Event) => { e.preventDefault(); onClose() }
      d.addEventListener('cancel', onCancel)
      return () => {
        d.removeEventListener('cancel', onCancel)
        if (d.open) d.close()
        prev?.focus()
      }
    }
    const prev = document.activeElement as HTMLElement | null
    closeBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); prev?.focus() }
  }, [open, onClose])

  const onBackdropTap = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) onClose()
  }
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { setCopied(false) }
  }

  if (!open) return null

  const Body = (
    <div
      className="join-url-modal__body"
      style={{
        padding: 'env(safe-area-inset-top, 12px) env(safe-area-inset-right, 12px) env(safe-area-inset-bottom, 12px) env(safe-area-inset-left, 12px)',
        maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
        background: 'var(--ink-deep)', color: 'var(--paper-cream)',
        minWidth: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}
    >
      <div className="uc" style={{ fontSize: 12, letterSpacing: '0.2em' }}>scan to join</div>
      <div className="join-url-modal__qr" style={{ width: 240, height: 240, background: 'var(--paper-cream)' }}>
        {qrDataUrl && <img src={qrDataUrl} alt={`Join URL ${url}`} width={240} height={240} style={{ display: 'block' }} />}
      </div>
      <div className="uc" style={{ fontSize: 13, wordBreak: 'break-all', textAlign: 'center' }}>{url}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" className="hit-target uc" onClick={onCopy} style={{ padding: '8px 12px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 11 }}>
          {copied ? 'copied' : 'copy URL'}
        </button>
        <button ref={closeBtnRef} type="button" className="hit-target uc" aria-label="Close" onClick={onClose} style={{ padding: '8px 12px', background: 'transparent', color: 'var(--paper-cream)', border: '1px solid var(--paper-cream)', fontSize: 11 }}>
          close
        </button>
      </div>
    </div>
  )

  if (supportsDialog()) {
    return (
      <dialog ref={dialogRef} onClick={onBackdropTap} style={{ padding: 0, border: 'none', background: 'transparent', color: 'inherit' }}>
        {Body}
      </dialog>
    )
  }
  return (
    <div
      role="dialog" aria-modal="true" aria-label="Join URL"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {Body}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add src/components/phone/JoinUrlModal.tsx
git commit -m "feat(phone): add JoinUrlModal (native <dialog> + fallback)

Native <dialog>.showModal() for focus trap, Escape, and backdrop
close; manual <div role='dialog'> fallback. Scroll-lock via
.modal-open-lock per §5.6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Create `SetlistPanel.tsx`

**Files:**
- Create: `src/components/source/SetlistPanel.tsx`

**Context:** §3.2 + §3.6 — header `SETLIST · N` + 🔀 shuffle, ≤8 rows, `+N MORE`, per-row `⤴/✕` with 6s undo toasts. First row ink-black, others ink-muted (via `.paper-card--minor` toggle).

- [ ] **Step 1: Create**

```tsx
'use client'
import { randomUUID } from '@/lib/client/uuid'
import type { Connection } from '@/lib/client/ws'
import type { QueueItem } from '@/lib/types/state'
import { useToaster } from '@/components/shared/Toaster'

const VISIBLE_CAP = 8
const UNDO_TTL_MS = 6000

export type SetlistPanelProps = {
  conn: Connection
  queue: QueueItem[]
  qrChip?: React.ReactNode | null
}

export const SetlistPanel = ({ conn, queue, qrChip }: SetlistPanelProps) => {
  const { showToast } = useToaster()
  const visible = queue.slice(0, VISIBLE_CAP)
  const more = Math.max(0, queue.length - VISIBLE_CAP)

  const shuffle = () => conn.send({ type: 'queue.shuffle', msgId: randomUUID() })

  const remove = (item: QueueItem) => {
    const originalIndex = queue.findIndex((q) => q.id === item.id)
    conn.send({ type: 'queue.remove', msgId: randomUUID(), itemId: item.id })
    showToast({
      level: 'warn', message: `Removed: ${item.title}`, ttlMs: UNDO_TTL_MS,
      undo: { label: 'UNDO', onTap: () => {
        conn.send({ type: 'queue.add', msgId: randomUUID(), videoId: item.videoId, prePitch: item.prePitch })
        if (originalIndex >= 0) {
          conn.send({ type: 'queue.move', msgId: randomUUID(), itemId: item.id, toIndex: originalIndex })
        }
      }},
    })
  }

  const moveTop = (item: QueueItem) => {
    const originalIndex = queue.findIndex((q) => q.id === item.id)
    conn.send({ type: 'queue.move', msgId: randomUUID(), itemId: item.id, toIndex: 0 })
    showToast({
      level: 'info', message: `Moved ${item.title} to top`, ttlMs: UNDO_TTL_MS,
      undo: { label: 'UNDO', onTap: () => {
        if (originalIndex >= 0) {
          conn.send({ type: 'queue.move', msgId: randomUUID(), itemId: item.id, toIndex: originalIndex })
        }
      }},
    })
  }

  return (
    <div className="setlist-panel paper-card paper-grain">
      <div className="setlist-panel__header">
        {qrChip}
        <div className="uc setlist-label" style={{ fontSize: 11 }}>SETLIST · {queue.length}</div>
        <button
          type="button" className="shuffle-btn hit-target uc"
          aria-label="Shuffle queue" onClick={shuffle}
          style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}
        >🔀</button>
      </div>
      <div style={{ borderBottom: '1px solid var(--ink-deep)', margin: '6px 0' }} />
      {queue.length === 0 && (
        <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', color: 'var(--ink-muted)', padding: '8px 0' }}>
          queue something to start the show
        </div>
      )}
      {visible.map((it, i) => (
        <div key={it.id} className={`setlist-row ${i > 0 ? 'paper-card--minor' : ''}`} style={{ padding: '4px 0' }}>
          <div className="setlist-row__title">
            <span className="uc" style={{ fontSize: 10, color: 'var(--ink-muted)', marginRight: 8 }}>
              {String(i + 2).padStart(2, '0')} · {it.queuedBy.name.toUpperCase()}
            </span>
            <span style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 14 }}>{it.title}</span>
          </div>
          <div className="setlist-row__actions">
            <button type="button" aria-label="Move to top" onClick={() => moveTop(it)} className="uc" style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 12 }}>⤴</button>
            <button type="button" aria-label="Remove from queue" onClick={() => remove(it)} className="uc" style={{ background: 'transparent', color: 'var(--hanko-red)', fontSize: 12 }}>✕</button>
          </div>
        </div>
      ))}
      {more > 0 && (
        <div className="uc" style={{ textAlign: 'center', padding: '6px 0', fontSize: 11, color: 'var(--ink-muted)' }}>
          + {more} more
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add src/components/source/SetlistPanel.tsx
git commit -m "feat(source): add SetlistPanel (8 cap + N MORE + per-row undo)

§3.6 shuffle on header, ⤴/✕ row actions with 6s undo toasts, first
row ink-black + others .paper-card--minor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: Create `VolumePanel.tsx`

**Files:**
- Create: `src/components/source/VolumePanel.tsx`
- Modify: `src/lib/client/audio-graph-ref.ts` (add subscribe API if missing)

**Context:** §3.6 — slider 0–1 ties directly to `getAudioGraph().setVolume()`. Persisted to `localStorage["karaoke.volume"]`. Re-applied on every audio-graph subscribe callback (so unlocking after a reload restores the level).

- [ ] **Step 1: Add `subscribeAudioGraph` if missing**

```bash
grep -n "subscribe\|setVolume" /Users/jonathanyapeter/Documents/Karaoke\ App/src/lib/client/audio-graph-ref.ts
```

If `subscribeAudioGraph` is not exported, edit the file to add a listener set. Pattern:

```ts
const listeners = new Set<(g: AudioGraph | null) => void>()
export const subscribeAudioGraph = (fn: (g: AudioGraph | null) => void): (() => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
// In existing setAudioGraph:
export const setAudioGraph = (g: AudioGraph | null) => {
  current = g
  for (const l of listeners) l(g)
}
```

Adapt to the file's actual shape.

- [ ] **Step 2: Create VolumePanel**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { getAudioGraph, subscribeAudioGraph } from '@/lib/client/audio-graph-ref'

const STORAGE_KEY = 'karaoke.volume'

const readStored = (): number => {
  if (typeof window === 'undefined') return 1
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return 1
  const n = Number(raw)
  if (!isFinite(n) || n < 0 || n > 1) return 1
  return n
}

export const VolumePanel = () => {
  const [volume, setVolume] = useState<number>(() => readStored())
  const volumeRef = useRef(volume)
  volumeRef.current = volume

  useEffect(() => {
    const apply = () => { getAudioGraph()?.setVolume(volumeRef.current) }
    apply()
    return subscribeAudioGraph(apply)
  }, [])

  const onChange = (v: number) => {
    setVolume(v)
    localStorage.setItem(STORAGE_KEY, String(v))
    getAudioGraph()?.setVolume(v)
  }

  return (
    <div className="paper-card paper-grain volume-panel" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="uc" style={{ fontSize: 11 }}>VOL</span>
      <div className="hit-target" style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center' }}>
        <input type="range" min={0} max={1} step={0.01} value={volume}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Output volume" style={{ width: '100%' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add src/components/source/VolumePanel.tsx src/lib/client/audio-graph-ref.ts
git commit -m "feat(source): add VolumePanel with localStorage persistence

Re-applies persisted level on every audio-graph subscribe so the
GainNode picks up the user's preference even when the graph is
mounted late (post-reload unlock).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: Restructure `QueueOverlay.tsx` + add `IdleSplash` / `SourceOfflineState`

**Files:**
- Modify: `src/components/source/QueueOverlay.tsx`
- Create: `src/components/source/IdleSplash.tsx`
- Create: `src/components/source/SourceOfflineState.tsx`
- Modify: `src/components/source/VideoPlayer.tsx` (hook IdleSplash into idle branch)

**Context:** §3.3 splash with the 下北沢 wordmark + "house lights on", §3.3-bis transient skip button after 1.5s. §3.3a source-offline panel. The rebuilt QueueOverlay becomes a pure right-rail composition.

- [ ] **Step 1: Create `IdleSplash.tsx`**

```tsx
'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useEffect, useState } from 'react'
import type { Connection } from '@/lib/client/ws'

const TRANSIENT_DELAY_MS = 1500

export type IdleSplashProps = { conn: Connection; transientWithQueue: boolean }

export const IdleSplash = ({ conn, transientWithQueue }: IdleSplashProps) => {
  const [showSkip, setShowSkip] = useState(false)
  useEffect(() => {
    if (!transientWithQueue) { setShowSkip(false); return }
    const id = setTimeout(() => setShowSkip(true), TRANSIENT_DELAY_MS)
    return () => { clearTimeout(id); setShowSkip(false) }
  }, [transientWithQueue])

  const startNext = () => {
    const p = conn.state?.player
    const epoch = p && 'epoch' in p ? p.epoch : 0
    conn.send({ type: 'player.skip', msgId: randomUUID(), epoch })
  }

  return (
    <div
      className="source-idle-splash"
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 16, background: 'linear-gradient(135deg, var(--ink-deep), var(--ink-black))',
        color: 'var(--paper-cream)',
      }}
    >
      <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 'clamp(96px, 12vw, 144px)', letterSpacing: '-1px' }}>下北沢</div>
      <div className="uc" style={{ fontSize: 16, letterSpacing: 3, color: 'var(--cigarette)' }}>house lights on</div>
      {showSkip && (
        <button
          type="button" className="hit-target uc"
          onClick={startNext}
          style={{ marginTop: 12, padding: '10px 20px', background: 'transparent', color: 'var(--paper-cream)', border: '1px solid var(--paper-cream)', fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 18 }}
        >
          ▶ Start next song
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `SourceOfflineState.tsx`**

```tsx
'use client'
export const SourceOfflineState = () => (
  <div
    className="source-offline"
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--ink-deep), var(--ink-black))', color: 'var(--riso-pink)' }}
  >
    <div className="uc offline-banner" style={{ fontSize: 16, letterSpacing: '0.2em' }}>
      ▌ source offline — reconnecting…
    </div>
  </div>
)
```

- [ ] **Step 3: Rewrite `QueueOverlay.tsx`**

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import { QrPanel } from './QrPanel'
import { SetlistPanel } from './SetlistPanel'
import { VolumePanel } from './VolumePanel'
import { JoinUrlModal } from '@/components/phone/JoinUrlModal'

export const QueueOverlay = ({ conn }: { conn: Connection }) => {
  const s = conn.state
  const [joinModalOpen, setJoinModalOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-width: 720px)')
    const apply = () => setIsMobile(mql.matches)
    apply()
    if (mql.addEventListener) mql.addEventListener('change', apply)
    else mql.addListener(apply)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', apply)
      else mql.removeListener(apply)
    }
  }, [])

  if (!s) return null

  return (
    <>
      {!isMobile && <QrPanel variant="full" />}
      <SetlistPanel
        conn={conn}
        queue={s.queue}
        qrChip={isMobile ? <QrPanel variant="chip" onOpenJoinModal={() => setJoinModalOpen(true)} /> : null}
      />
      <VolumePanel />
      <JoinUrlModal open={joinModalOpen} onClose={() => setJoinModalOpen(false)} />
    </>
  )
}
```

- [ ] **Step 4: Hook `IdleSplash` into `VideoPlayer`**

In `VideoPlayer.tsx`, replace the `isPlaying` ternary from Task 13 with:

```tsx
const isPlaying = player && player.status !== 'idle'
const queueLen = conn.state?.queue.length ?? 0
```

Then in the JSX:

```tsx
{isPlaying ? (
  <>
    <div className="live-badge uc" data-status={player.status} style={{ /* same as Task 13 */ }}>
      ▌ LIVE 出演中
    </div>
    <NowPlayingStrip conn={conn} player={player} />
  </>
) : (
  <IdleSplash conn={conn} transientWithQueue={queueLen > 0} />
)}
```

Add the import:

```tsx
import { IdleSplash } from './IdleSplash'
```

- [ ] **Step 5: Verify + commit**

`npx tsc --noEmit`. Run on localhost:
- Idle: splash inside video frame, right rail with QR + empty setlist + volume.
- Queue a song from phone: splash unmounts, video plays, LIVE pulses, strip shows.
- ≤720px: rail stacks below video, QR chip inlines into setlist header, modal opens on tap.
- After a song ends, splash reappears with a "▶ Start next song" button after 1.5s.

```bash
git add src/components/source/QueueOverlay.tsx src/components/source/IdleSplash.tsx src/components/source/SourceOfflineState.tsx src/components/source/VideoPlayer.tsx
git commit -m "feat(source): split into rail + idle splash + offline state

QueueOverlay is now a thin rail composition (QR + Setlist + Volume +
JoinUrlModal). VideoPlayer renders IdleSplash inside the framed
section when player.status === 'idle'; SourceOfflineState covers
§3.3a. §3.3-bis transient skip button appears after 1.5s.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Touch `StartShowGesture.tsx`

**Files:**
- Modify: `src/components/source/StartShowGesture.tsx`

- [ ] **Step 1: Replace**

```tsx
'use client'

export const StartShowGesture = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="start-show-gesture"
    aria-label="Start the show — unlocks audio"
    style={{
      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--ink-black)', color: 'var(--paper-cream)', border: 'none',
      fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900,
      fontSize: 'clamp(48px, 8vw, 96px)', cursor: 'pointer',
    }}
  >
    ▶ Start show
  </button>
)
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add src/components/source/StartShowGesture.tsx
git commit -m "style(source): make StartShowGesture its own .start-show-gesture root

Safe-area + 100dvh applied via the class in riso.css per §6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — Phone client rewrite

### Task 20: Rename + rewrite `PrePitchSlider.tsx` → `KeyStepper.tsx`

**Files:**
- Delete: `src/components/phone/PrePitchSlider.tsx`
- Create: `src/components/phone/KeyStepper.tsx`
- Create: `tests/unit/key-stepper-clamp.test.ts`

**Context:** §4.3/§4.4/§4.5 use `[−] readout [+]` instead of a slider. The readout is hanko-stamp styled, `aria-live="polite"`. Clamp is −6..+6. The pure clamp helper is testable.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { clampPitch } from '@/components/phone/KeyStepper'

describe('clampPitch', () => {
  it('clamps to [-6, 6] inclusive', () => {
    expect(clampPitch(0)).toBe(0)
    expect(clampPitch(6)).toBe(6)
    expect(clampPitch(-6)).toBe(-6)
    expect(clampPitch(7)).toBe(6)
    expect(clampPitch(-7)).toBe(-6)
    expect(clampPitch(99)).toBe(6)
    expect(clampPitch(-99)).toBe(-6)
  })
  it('rounds non-integer inputs (defensive)', () => {
    expect(clampPitch(2.4)).toBe(2)
    expect(clampPitch(-2.6)).toBe(-3)
  })
})
```

- [ ] **Step 2: Implement**

`src/components/phone/KeyStepper.tsx`:

```tsx
'use client'

const PITCH_MIN = -6
const PITCH_MAX = 6

export const clampPitch = (n: number): number => {
  if (!isFinite(n)) return 0
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(n)))
}

const fmtKey = (p: number) => (p >= 0 ? `+${p}` : String(p))

export type KeyStepperProps = {
  value: number
  onChange: (v: number) => void
  disabled?: boolean
  readoutSize?: 'sm' | 'lg'
}

export const KeyStepper = ({ value, onChange, disabled, readoutSize = 'sm' }: KeyStepperProps) => {
  const bump = (delta: number) => onChange(clampPitch(value + delta))
  const isLg = readoutSize === 'lg'
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        className="hit-target uc"
        aria-label="Lower pitch by one semitone"
        onClick={() => bump(-1)}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        style={{ background: 'transparent', color: 'inherit', fontSize: isLg ? 24 : 14 }}
      >−</button>
      <span
        className="hanko"
        aria-live="polite"
        aria-label={`Key ${fmtKey(value)} semitones`}
        style={{ minWidth: isLg ? '3em' : '2.4em', textAlign: 'center', fontSize: isLg ? 32 : undefined }}
      >
        {fmtKey(value)}
      </span>
      <button
        type="button"
        className="hit-target uc"
        aria-label="Raise pitch by one semitone"
        onClick={() => bump(1)}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        style={{ background: 'transparent', color: 'inherit', fontSize: isLg ? 24 : 14 }}
      >+</button>
    </div>
  )
}
```

- [ ] **Step 3: Delete the old slider**

```bash
rm src/components/phone/PrePitchSlider.tsx
```

- [ ] **Step 4: Find and update any imports**

```bash
grep -rn "PrePitchSlider" src tests
```

If any caller is found (SearchTab, PasteTab in current code), leave them broken for now — they're rewritten in Tasks 23/24 to use `KeyStepper`. Confirm only Search/Paste reference it.

Actually we need to keep the app compiling. Stub the rewrite paths inline:

In `SearchTab.tsx` and `PasteTab.tsx`, temporarily replace `import { PrePitchSlider }` with `import { KeyStepper } from '@/components/phone/KeyStepper'` and replace `<PrePitchSlider value={pitch} onChange={setPitch} />` with `<KeyStepper value={pitch} onChange={setPitch} />`. They still work; the proper rewrites happen in Tasks 23/24.

- [ ] **Step 5: Commit**

```bash
npx tsc --noEmit
npx vitest run tests/unit/key-stepper-clamp.test.ts
git add src/components/phone/KeyStepper.tsx src/components/phone/PrePitchSlider.tsx src/components/phone/SearchTab.tsx src/components/phone/PasteTab.tsx tests/unit/key-stepper-clamp.test.ts
git commit -m "refactor(phone): replace PrePitchSlider with KeyStepper

[−] readout [+] per §4.3/§4.4/§4.5; aria-live readout; clamp -6..+6
unit-tested. SearchTab/PasteTab updated to use the new component;
full inline-expand rewrites land in following tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Touch `NameEntry.tsx` (drop rotation, safe-area, 16px input)

**Files:**
- Modify: `src/components/phone/NameEntry.tsx`

**Context:** §4.6. Drop card rotation (already global via riso.css); apply `.name-entry` root class for safe-area + 100dvh; verify input is 16+px (handled globally by riso.css input rule, but make sure the inline style doesn't override).

- [ ] **Step 1: Inspect**

```bash
cat /Users/jonathanyapeter/Documents/Karaoke\ App/src/components/phone/NameEntry.tsx
```

- [ ] **Step 2: Rewrite**

```tsx
'use client'
import { useState } from 'react'
import { setStoredName } from '@/lib/client/ws'

export const NameEntry = ({ onSubmit }: { onSubmit: (n: string) => void }) => {
  const [name, setName] = useState('')
  return (
    <div
      className="name-entry"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const n = name.trim()
          if (n) { setStoredName(n); onSubmit(n) }
        }}
        className="paper-card paper-grain"
        style={{ width: 360, maxWidth: '100%' }}
      >
        <div className="uc" style={{ fontSize: 10, color: 'var(--ink-muted)' }}>▌ enter the room</div>
        <h2 style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 22, margin: '8px 0 12px' }}>
          What&apos;s your name?
        </h2>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Sarah"
          aria-label="Your name"
          style={{
            width: '100%', padding: '10px 12px',
            fontFamily: 'var(--mono-font)', fontSize: 16,
            background: 'transparent', color: 'var(--ink-black)',
            border: '1px solid var(--ink-black)',
          }}
        />
        <button
          type="submit"
          className="hit-target uc"
          style={{ marginTop: 12, padding: '10px 16px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 11 }}
        >
          Sign in
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add src/components/phone/NameEntry.tsx
git commit -m "style(phone): NameEntry on .name-entry root (no rotation, safe-area)

Apply .name-entry class for safe-area + 100dvh per §5.4/§5.6;
input font-size: 16 to prevent iOS auto-zoom; submit gets
.hit-target.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 22: Rewrite `QueueView.tsx`

**Files:**
- Modify: `src/components/phone/QueueView.tsx`

**Context:** §4.2 — now-playing card variants (`▌ NOW PLAYING` / `▌ PAUSED` / `▌ NEXT UP` / `▌ OFFLINE` / `▌ idle — queue something`), upright rows with mono eyebrow `02 · MIKE`, Crimson Pro italic title, `KEY ±N` line when prePitch ≠ 0, `[✕]` only on own items with 6s undo toast. Thin progress bar (3px tall, hanko-red on ink-muted track) showing `positionSec / item.durationSec` on the playing card.

- [ ] **Step 1: Rewrite**

```tsx
'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useEffect, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { QueueItem, PlayerState, ServerState } from '@/lib/types/state'
import { useToaster } from '@/components/shared/Toaster'

const UNDO_TTL_MS = 6000

type Props = { conn: Connection; sessionId: string; sourceConnected: boolean; sourceReady: boolean }

export const QueueView = ({ conn, sessionId, sourceConnected, sourceReady }: Props) => {
  const state = conn.state
  const { showToast } = useToaster()
  if (!state) return <div className="uc" style={{ padding: 16 }}>Connecting…</div>

  const remove = (it: QueueItem) => {
    conn.send({ type: 'queue.remove', msgId: randomUUID(), itemId: it.id })
    showToast({
      level: 'warn', message: `Removed: ${it.title}`, ttlMs: UNDO_TTL_MS,
      undo: { label: 'UNDO', onTap: () => {
        conn.send({ type: 'queue.add', msgId: randomUUID(), videoId: it.videoId, prePitch: it.prePitch })
      }},
    })
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <NowPlayingCard state={state} sourceConnected={sourceConnected} sourceReady={sourceReady} />
      <h3 className="uc" style={{ fontSize: 12, color: 'var(--paper-cream)', letterSpacing: '0.2em' }}>
        ▌ up next · {state.queue.length}
      </h3>
      {state.queue.length === 0 && (
        <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', color: 'var(--ink-muted)' }}>
          nothing queued yet — try search or paste
        </div>
      )}
      {state.queue.map((it, i) => (
        <div key={it.id} className="paper-card paper-grain" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              {String(i + 2).padStart(2, '0')} · {it.queuedBy.sessionId === sessionId ? 'YOU' : it.queuedBy.name.toUpperCase()}
            </div>
            <div className="queue-now-playing__title" style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {it.title}
            </div>
            {it.prePitch !== 0 && (
              <div className="uc" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
                KEY {it.prePitch > 0 ? '+' : ''}{it.prePitch}
              </div>
            )}
          </div>
          {it.queuedBy.sessionId === sessionId && (
            <button
              type="button" className="hit-target uc"
              aria-label="Remove your queued song"
              onClick={() => remove(it)}
              style={{ background: 'transparent', color: 'var(--hanko-red)', fontSize: 12 }}
            >✕</button>
          )}
        </div>
      ))}
    </div>
  )
}

const NowPlayingCard = ({ state, sourceConnected, sourceReady }: { state: ServerState; sourceConnected: boolean; sourceReady: boolean }) => {
  const p = state.player
  const offline = !sourceConnected || !sourceReady

  // Source-offline with no prior snapshot.
  if (offline && p.status === 'idle') {
    return (
      <div className="paper-card paper-grain paper-card--accent">
        <div className="uc" style={{ fontSize: 13, color: 'var(--riso-pink)' }}>▌ offline · waiting for source</div>
      </div>
    )
  }

  if (p.status === 'idle' && state.queue.length === 0) {
    return (
      <div className="paper-card paper-grain">
        <div className="uc" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>▌ idle — queue something</div>
      </div>
    )
  }

  if (p.status === 'idle' && state.queue.length > 0) {
    const next = state.queue[0]!
    return (
      <div className="paper-card paper-grain paper-card--accent">
        <div className="next-up-badge uc" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-black)' }}>▌ NEXT UP</div>
        <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 18 }}>{next.title}</div>
        <div className="uc" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
          {next.queuedBy.name.toUpperCase()} · KEY {next.prePitch >= 0 ? '+' : ''}{next.prePitch}
        </div>
      </div>
    )
  }

  // playing or paused — we have a real item
  const progress = Math.max(0, Math.min(1, p.positionSec / Math.max(1, p.item.durationSec)))
  const badge =
    p.status === 'paused'
      ? (<div className="paused-badge uc" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-black)' }}>▌ PAUSED</div>)
      : (<div className="now-playing-badge uc" style={{ fontSize: 11, color: 'var(--riso-pink)' }}>▌ NOW PLAYING</div>)
  return (
    <div className="paper-card paper-grain paper-card--accent">
      {offline ? (
        <div className="uc" style={{ fontSize: 13, color: 'var(--riso-pink)' }}>▌ OFFLINE</div>
      ) : badge}
      <div className="queue-now-playing__title" style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 18 }}>
        {p.item.title}
      </div>
      <div className="uc" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
        {p.item.queuedBy.name.toUpperCase()} · KEY {p.livePitch >= 0 ? '+' : ''}{p.livePitch}
      </div>
      <div style={{ marginTop: 6, height: 3, background: 'var(--ink-muted)' }}>
        <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--hanko-red)', transition: p.status === 'playing' ? 'width 0.2s linear' : 'none' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add src/components/phone/QueueView.tsx
git commit -m "feat(phone): QueueView card variants + ✕ undo per §4.2

Now-playing card branches into now-playing / paused / next-up /
offline-no-snapshot / idle-no-queue / playing-but-offline. Queue
rows use mono eyebrow + Crimson Pro italic title + 6s ✕ undo for
the user's own items.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 23: Rewrite `SearchTab.tsx` (inline-expand + pendingAdds + collapse contract)

**Files:**
- Modify: `src/components/phone/SearchTab.tsx`

**Context:** §4.3 is the densest spec section. Required behaviors:
- One expanded row at a time (binary toggle).
- Tap a row → expand; tap same row's chevron → collapse; tap a different row → collapses the first.
- Editing the query collapses any expanded row immediately.
- Submitting clears all results.
- `pendingAdds` map is global (lives in the PhoneRoot context from Task 8); a queue.add operation has a single `msgId` (the "operation id") used for retries.
- ADD button pending lock: native `disabled` + `aria-disabled`; stepper buttons also disabled during pending.
- Search race protection: `activeSearchMsgId` filter; submit lock until results / timeout / cancel.
- Cancel current search action while in flight.
- Semantic markup: `<button>` row header, body is a sibling, `aria-expanded` on the button.

- [ ] **Step 1: Rewrite**

```tsx
'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { SearchResult } from '@/lib/types/state'
import type { ServerMessage } from '@/lib/types/protocol'
import { KeyStepper, clampPitch } from './KeyStepper'
import { usePendingAdds } from '@/lib/client/pending-adds'

const SEARCH_TIMEOUT_MS = 8000

export const SearchTab = ({ conn, currentEpoch, onAddedSwitchToQueue }: {
  conn: Connection
  currentEpoch: number
  onAddedSwitchToQueue: () => void
}) => {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeSearchMsgId, setActiveSearchMsgId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [pitch, setPitch] = useState(0)
  const [errorByRow, setErrorByRow] = useState<Record<string, string>>({})
  const searchCleanupRef = useRef<(() => void) | null>(null)
  const { pendingAdds, add: addPending, ack: ackPending } = usePendingAdds()

  // Cleanup any in-flight search on unmount.
  useEffect(() => () => searchCleanupRef.current?.(), [])

  // Listen for state.ack so we can clear pendingAdds entries we own.
  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type === 'state.ack' && pendingAdds.has(m.msgId)) {
        ackPending(m.msgId, m.ok, m.error)
        if (!m.ok && m.error) setErrorByRow((prev) => {
          const entry = pendingAdds.get(m.msgId)
          if (!entry) return prev
          return { ...prev, [entry.videoId]: m.error! }
        })
      }
    }
    window.addEventListener('karaoke-msg', handler)
    return () => window.removeEventListener('karaoke-msg', handler)
  }, [pendingAdds, ackPending])

  const doSearch = useCallback(() => {
    if (!q.trim()) return
    searchCleanupRef.current?.()
    const msgId = randomUUID()
    setActiveSearchMsgId(msgId)
    const onMsg = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type === 'search.results' && m.msgId === msgId) {
        setResults(m.results)
        setActiveSearchMsgId(null)
        cleanup()
      }
    }
    const timer = setTimeout(() => {
      setActiveSearchMsgId(null)
      cleanup()
    }, SEARCH_TIMEOUT_MS)
    const cleanup = () => {
      window.removeEventListener('karaoke-msg', onMsg)
      clearTimeout(timer)
      if (searchCleanupRef.current === cleanup) searchCleanupRef.current = null
    }
    searchCleanupRef.current = cleanup
    window.addEventListener('karaoke-msg', onMsg)
    setResults([])
    setExpandedId(null)
    conn.send({ type: 'search', msgId, query: q.trim() })
  }, [conn, q])

  const cancelSearch = useCallback(() => {
    searchCleanupRef.current?.()
    setActiveSearchMsgId(null)
  }, [])

  const onQueryChange = (v: string) => {
    setQ(v)
    setExpandedId(null) // §4.3: every keystroke collapses any expanded row
  }

  const toggle = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id))
    setPitch(0)
  }

  const doAdd = (r: SearchResult, existingMsgId?: string) => {
    const msgId = existingMsgId ?? randomUUID()
    setErrorByRow((prev) => { const { [r.videoId]: _, ...rest } = prev; return rest })
    if (!existingMsgId) {
      addPending(msgId, r.videoId, clampPitch(pitch), currentEpoch)
    }
    conn.send({ type: 'queue.add', msgId, videoId: r.videoId, prePitch: clampPitch(pitch) })
    // On ack we switch tabs and clear results.
    const onMsg = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type === 'state.ack' && m.msgId === msgId) {
        window.removeEventListener('karaoke-msg', onMsg)
        if (m.ok) {
          // Only switch if the user is still on Search with the originating row expanded.
          if (expandedId === r.videoId) {
            setResults([])
            setQ('')
            setExpandedId(null)
            onAddedSwitchToQueue()
          }
        }
      }
    }
    window.addEventListener('karaoke-msg', onMsg)
  }

  const inFlightForRow = (videoId: string) => {
    for (const v of pendingAdds.values()) {
      if (v.videoId === videoId) return v
    }
    return null
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="search-tab__query-row" style={{ display: 'flex', gap: 8 }}>
        <input
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch() }}
          inputMode="search"
          enterKeyHint="search"
          placeholder="bohemian rhapsody karaoke"
          aria-label="Search YouTube"
          style={{
            flex: '1 1 auto', minWidth: 0, padding: '10px 12px',
            fontFamily: 'var(--mono-font)', fontSize: 16,
            background: 'var(--paper-cream)', color: 'var(--ink-black)',
          }}
        />
        <button
          type="button"
          className="hit-target uc"
          onClick={doSearch}
          disabled={activeSearchMsgId !== null || !q.trim()}
          aria-disabled={activeSearchMsgId !== null || !q.trim() || undefined}
          style={{ padding: '10px 14px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 11 }}
        >
          {activeSearchMsgId !== null ? '…' : 'GO'}
        </button>
        {activeSearchMsgId !== null && (
          <button
            type="button"
            className="hit-target uc"
            onClick={cancelSearch}
            aria-label="Cancel current search"
            style={{ padding: '10px 12px', background: 'transparent', color: 'var(--paper-cream)', border: '1px solid var(--paper-cream)', fontSize: 11 }}
          >× cancel</button>
        )}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {results.map((r) => {
          const isExpanded = expandedId === r.videoId
          const bodyId = `search-row-${r.videoId}-body`
          const pending = inFlightForRow(r.videoId)
          const rowError = errorByRow[r.videoId]
          return (
            <SearchRow
              key={r.videoId}
              result={r}
              isExpanded={isExpanded}
              bodyId={bodyId}
              onToggle={() => toggle(r.videoId)}
              pitch={isExpanded ? pitch : 0}
              setPitch={setPitch}
              onAdd={() => doAdd(r, pending?.msgId)}
              pending={pending}
              error={rowError}
            />
          )
        })}
      </ul>
    </div>
  )
}

type SearchRowProps = {
  result: SearchResult
  isExpanded: boolean
  bodyId: string
  onToggle: () => void
  pitch: number
  setPitch: (n: number) => void
  onAdd: () => void
  pending: { msgId: string; videoId: string; prePitch: number; sentAt: number } | null
  error?: string
}

const SearchRow = ({ result, isExpanded, bodyId, onToggle, pitch, setPitch, onAdd, pending, error }: SearchRowProps) => {
  const isPending = !!pending
  return (
    <li
      className={`search-row paper-card paper-grain ${isExpanded ? 'paper-card--accent' : ''}`}
      data-expanded={isExpanded ? '1' : '0'}
      data-no-measure="1"  /* fall back to instant expand without max-height measurement; honors reduced-motion via riso.css */
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={bodyId}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 10px', background: 'transparent', color: 'inherit',
          border: 'none', textAlign: 'left',
        }}
      >
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {result.title}
          </div>
          <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
            {result.channel} · {Math.floor(result.durationSec / 60)}:{String(result.durationSec % 60).padStart(2, '0')}
          </div>
        </div>
        <span aria-hidden style={{ color: isExpanded ? 'var(--hanko-red)' : 'var(--ink-muted)' }}>
          {isExpanded ? '▴' : '▾'}
        </span>
      </button>
      <div id={bodyId} className="search-row__body" hidden={!isExpanded}>
        <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>KEY</span>
            <KeyStepper value={pitch} onChange={setPitch} disabled={isPending} />
          </div>
          <button
            type="button"
            onClick={onAdd}
            disabled={isPending && !error}
            aria-disabled={(isPending && !error) || undefined}
            className="hit-target uc"
            style={{
              padding: '10px 16px',
              background: isPending ? 'var(--ink-muted)' : 'var(--hanko-red)',
              color: 'var(--paper-cream)', fontSize: 11,
            }}
          >
            {isPending ? (error ? 'tap to retry' : 'queueing…') : 'ADD'}
          </button>
        </div>
        {error && (
          <div className="uc" style={{ padding: '4px 10px', fontSize: 11, color: 'var(--riso-pink)' }}>▌ {error}</div>
        )}
      </div>
    </li>
  )
}
```

Note: We use `data-no-measure="1"` so the search-row body expands instantly (no max-height animation) — matches the §5.5 fallback path and avoids the per-row measurement complexity in this first iteration. If the verification pass shows the snap-open feels jarring, swap to the measured path later.

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add src/components/phone/SearchTab.tsx
git commit -m "feat(phone): SearchTab inline-expand + pendingAdds + collapse contract

Implements §4.3: <button> row header with aria-expanded; expanded
body is a sibling; canonical collapse on keystroke / submit / different
row tap; ADD pending-lock keyed on shared pendingAdds map; cancel
button while search in flight.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 24: Rewrite `PasteTab.tsx`

**Files:**
- Modify: `src/components/phone/PasteTab.tsx`

**Context:** §4.4 — same `pendingAdds`-driven ADD flow as Search. Difference: resolve happens first (meta.fetch via WS), then the resolved preview is the expanded card. On error, inline riso-pink message.

- [ ] **Step 1: Rewrite**

```tsx
'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useEffect, useRef, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { ServerMessage } from '@/lib/types/protocol'
import { KeyStepper, clampPitch } from './KeyStepper'
import { usePendingAdds } from '@/lib/client/pending-adds'

const VIDEO_ID = /(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/
const RESOLVE_TIMEOUT_MS = 12000

type Meta = { videoId: string; title: string; thumbnail: string; durationSec: number }

export const PasteTab = ({ conn, currentEpoch }: { conn: Connection; currentEpoch: number }) => {
  const [url, setUrl] = useState('')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [pitch, setPitch] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const { pendingAdds, add: addPending, ack: ackPending } = usePendingAdds()

  useEffect(() => () => cleanupRef.current?.(), [])

  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type === 'state.ack' && pendingAdds.has(m.msgId)) {
        ackPending(m.msgId, m.ok, m.error)
        if (m.ok) {
          setMeta(null)
          setUrl('')
        } else if (m.error) {
          setErr(m.error)
        }
      }
    }
    window.addEventListener('karaoke-msg', handler)
    return () => window.removeEventListener('karaoke-msg', handler)
  }, [pendingAdds, ackPending])

  const resolve = () => {
    const m = url.match(VIDEO_ID)
    if (!m) { setErr('Could not find a YouTube video id in that URL.'); return }
    cleanupRef.current?.()
    setBusy(true); setErr(null); setMeta(null)
    const msgId = randomUUID()
    const onMsg = (e: Event) => {
      const x = (e as CustomEvent<ServerMessage>).detail
      if (x.type === 'meta.result' && x.msgId === msgId) {
        setMeta({ videoId: x.videoId, title: x.title, thumbnail: x.thumbnail, durationSec: x.durationSec })
        setBusy(false); cleanup()
      } else if (x.type === 'state.ack' && x.msgId === msgId && !x.ok) {
        setErr(x.error ?? 'failed'); setBusy(false); cleanup()
      }
    }
    const timer = setTimeout(() => {
      setErr('Timed out waiting for YouTube metadata.'); setBusy(false); cleanup()
    }, RESOLVE_TIMEOUT_MS)
    const cleanup = () => {
      window.removeEventListener('karaoke-msg', onMsg)
      clearTimeout(timer)
      if (cleanupRef.current === cleanup) cleanupRef.current = null
    }
    cleanupRef.current = cleanup
    window.addEventListener('karaoke-msg', onMsg)
    conn.send({ type: 'meta.fetch', msgId, videoId: m[1]! })
  }

  const inFlight = meta ? Array.from(pendingAdds.values()).find((v) => v.videoId === meta.videoId) ?? null : null

  const doAdd = () => {
    if (!meta) return
    const existing = inFlight?.msgId
    const msgId = existing ?? randomUUID()
    if (!existing) addPending(msgId, meta.videoId, clampPitch(pitch), currentEpoch)
    conn.send({ type: 'queue.add', msgId, videoId: meta.videoId, prePitch: clampPitch(pitch) })
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="paste-tab__action-row" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          className="paste-tab__textarea"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=…"
          aria-label="YouTube URL"
          rows={3}
          style={{ width: '100%', padding: 10, fontFamily: 'var(--mono-font)', fontSize: 16, background: 'var(--paper-cream)', color: 'var(--ink-black)' }}
        />
        <button
          type="button"
          onClick={resolve}
          disabled={busy || !url.trim()}
          aria-disabled={busy || !url.trim() || undefined}
          className="hit-target uc"
          style={{ padding: '10px 14px', background: 'var(--hanko-red)', color: 'var(--paper-cream)', fontSize: 11 }}
        >
          {busy ? 'Resolving…' : 'RESOLVE'}
        </button>
      </div>
      {err && <div className="uc" style={{ fontSize: 11, color: 'var(--riso-pink)' }}>▌ {err}</div>}
      {meta && (
        <div className="paper-card paper-grain paper-card--accent">
          <div style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontSize: 16 }}>{meta.title}</div>
          <div className="uc" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
            {Math.floor(meta.durationSec / 60)}:{String(meta.durationSec % 60).padStart(2, '0')}
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>KEY</span>
              <KeyStepper value={pitch} onChange={setPitch} disabled={!!inFlight && !err} />
            </div>
            <button
              type="button"
              onClick={doAdd}
              disabled={!!inFlight && !err}
              aria-disabled={(!!inFlight && !err) || undefined}
              className="hit-target uc"
              style={{
                padding: '10px 16px',
                background: inFlight ? 'var(--ink-muted)' : 'var(--hanko-red)',
                color: 'var(--paper-cream)', fontSize: 11,
              }}
            >
              {inFlight ? (err ? 'tap to retry' : 'queueing…') : 'ADD'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
npx tsc --noEmit
git add src/components/phone/PasteTab.tsx
git commit -m "feat(phone): PasteTab inline-expand + shared pendingAdds

Resolve → preview-as-expanded-card → ADD with the same pendingAdds
map as Search per §4.4. Inline riso-pink error line on regex miss /
server failure / timeout.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 25: Rewrite `LivePitchSheet.tsx` → `YoureUpView.tsx`

**Files:**
- Delete: `src/components/phone/LivePitchSheet.tsx`
- Create: `src/components/phone/YoureUpView.tsx`

**Context:** §4.5 — full-screen takeover replacing the queue tab body when `player.status !== 'idle' && player.item.queuedBy.sessionId === mySessionId`. Big readout (32px hanko-red italic), big ± buttons (≥48 CSS px), "SOURCE HAS OVERRIDE" footnote. The Tabs header stays visible (it's outside this DOM). Drag-to-change is phase-2 (flag-gated, NOT implemented in this plan). Buttons cover success criterion #15.

Same-user back-to-back transition: the component stays mounted across `player.item.id` changes (the predicate is checked at the parent in Task 26; this component just renders whatever player is current).

Pending-pitch reconnect contract (§3.3a): when source disconnects, queue the latest tap as `pendingPitch`; replay on reconnect with same-msgId retry on no-ack and new-msgId discard on `ok: false`. Implement that here.

- [ ] **Step 1: Delete the old file**

```bash
rm src/components/phone/LivePitchSheet.tsx
```

- [ ] **Step 2: Create the takeover**

```tsx
'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useEffect, useRef, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { PlayerState } from '@/lib/types/state'
import type { ServerMessage } from '@/lib/types/protocol'
import { KeyStepper, clampPitch } from './KeyStepper'

const PENDING_RETRY_TIMEOUT_MS = 6000

const fmtMmSs = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

type PendingPitch = { value: number; itemId: string; epoch: number; msgId: string | null }

export type YoureUpViewProps = {
  conn: Connection
  player: Exclude<PlayerState, { status: 'idle' }>
  sourceConnected: boolean
  sourceReady: boolean
}

export const YoureUpView = ({ conn, player, sourceConnected, sourceReady }: YoureUpViewProps) => {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [pitch, setPitch] = useState(player.livePitch)
  const pendingRef = useRef<PendingPitch | null>(null)

  // Source-driven live pitch updates that originated elsewhere should sync the
  // local readout when the user is NOT offline-editing.
  useEffect(() => {
    if (sourceConnected && sourceReady) {
      setPitch(player.livePitch)
    }
  }, [player.livePitch, sourceConnected, sourceReady])

  // Listen for state.ack so we can clear our pending entry on success and
  // generate a new msgId for any subsequent retry on ok=false.
  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type !== 'state.ack') return
      const p = pendingRef.current
      if (p && p.msgId === m.msgId) {
        if (m.ok) {
          pendingRef.current = null
        } else {
          // Server rejected; further retries need a fresh msgId. Drop pending and
          // let the next live-pitch update from the server reflect ground truth.
          pendingRef.current = null
        }
      }
    }
    window.addEventListener('karaoke-msg', handler)
    return () => window.removeEventListener('karaoke-msg', handler)
  }, [])

  const sendLivePitch = (v: number, msgIdOverride?: string) => {
    const msgId = msgIdOverride ?? randomUUID()
    pendingRef.current = { value: v, itemId: player.item.id, epoch: player.epoch, msgId }
    conn.send({ type: 'player.setLivePitch', msgId, semitones: clampPitch(v) })
  }

  // Reconnect replay: when sourceConnected flips from false → true, replay the
  // pending pitch (same msgId on no-ack timeout, new msgId on prior ok=false).
  const wasConnectedRef = useRef(sourceConnected && sourceReady)
  useEffect(() => {
    const nowConnected = sourceConnected && sourceReady
    if (!wasConnectedRef.current && nowConnected) {
      const p = pendingRef.current
      if (p && p.itemId === player.item.id && p.epoch === player.epoch && p.value !== player.livePitch) {
        // Same msgId — server dedup will return the cached ack if it already processed.
        sendLivePitch(p.value, p.msgId ?? undefined)
      } else if (p && (p.itemId !== player.item.id || p.epoch !== player.epoch)) {
        // Song changed under us — discard.
        pendingRef.current = null
      }
    }
    wasConnectedRef.current = nowConnected
  }, [sourceConnected, sourceReady, player.item.id, player.epoch, player.livePitch])

  const onPitchChange = (v: number) => {
    const clamped = clampPitch(v)
    setPitch(clamped)
    if (sourceConnected && sourceReady) {
      sendLivePitch(clamped)
    } else {
      // Hold while offline; replay on reconnect.
      pendingRef.current = { value: clamped, itemId: player.item.id, epoch: player.epoch, msgId: null }
    }
  }

  const offline = !sourceConnected || !sourceReady

  return (
    <section
      className="youre-up"
      data-mounted={mounted ? '1' : '0'}
      aria-label="You're up — pitch control"
    >
      <div
        className="youre-up__sub-header uc"
        style={{
          padding: '8px 16px',
          color: offline ? 'var(--riso-pink)' : 'var(--paper-cream)',
          fontSize: 13,
          letterSpacing: '0.2em',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>{offline ? '▌ source offline — reconnecting…' : '▌ YOU’RE UP'}</span>
        <span>{offline ? '' : (player.status === 'paused' ? '▌ PAUSED' : `${fmtMmSs(player.positionSec)} / ${fmtMmSs(player.item.durationSec)}`)}</span>
      </div>
      <div className="youre-up__title-block" style={{ padding: '24px 16px 8px' }}>
        <h1 className="youre-up__title" style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 32, margin: 0, color: 'var(--paper-cream)' }}>
          {player.item.title}
        </h1>
        <div className="uc" style={{ fontSize: 12, color: 'var(--paper-cream)', letterSpacing: '0.15em', marginTop: 4 }}>
          {player.item.queuedBy.name.toUpperCase()} · {fmtMmSs(player.item.durationSec)}
        </div>
      </div>
      <div className="youre-up__controls" style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 'auto', color: 'var(--paper-cream)' }}>
        <div className="uc" style={{ fontSize: 12, color: 'var(--paper-cream)', opacity: 0.8 }}>KEY</div>
        <div className="youre-up__readout" aria-live="polite" style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 32, color: 'var(--hanko-red)' }}>
          {pitch >= 0 ? `+${pitch}` : pitch}
        </div>
        <KeyStepper value={pitch} onChange={onPitchChange} readoutSize="lg" />
        <div className="uc" style={{ fontSize: 12, color: 'var(--paper-cream)', opacity: 0.7, letterSpacing: '0.2em' }}>
          source has override
        </div>
      </div>
    </section>
  )
}
```

Note: the inner `<KeyStepper readoutSize="lg" />` renders ± and a hanko readout; the visible "big readout" above is a separate element so the takeover's focal point looks like a stamp on the page (per §4.5). Both are wired to the same `pitch` state.

The drag-to-change interaction is NOT implemented here (phase-2 flag-gated per spec). The buttons satisfy criterion #15.

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add src/components/phone/LivePitchSheet.tsx src/components/phone/YoureUpView.tsx
git commit -m "feat(phone): replace LivePitchSheet with YoureUpView takeover

Full-screen takeover with big ± buttons + hanko readout per §4.5.
Implements pendingPitch reconnect-resume per §3.3a: while
sourceConnected is false, taps stash a pendingPitch; on reconnect we
replay with same msgId. Drag-to-change is phase-2 flag-gated and not
shipped here — the buttons cover success criterion #15.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 26: Rewrite `src/app/page.tsx` as the PhoneRoot composition

**Files:**
- Modify: `src/app/page.tsx`

**Context:** This task assembles every shared phone-shell piece built in Phases 1–2 and Phase 4:
- Wraps everything in `<Toaster>` (provider form) and `<PendingAddsProvider>`.
- Renders `<Tabs>`, optional `<OfflineBanner>`, optional `<PendingAddsTray>`, and the active tab body (QueueView / SearchTab / PasteTab) OR the takeover (YoureUpView).
- Owns the `--top-occluder-height` measurement via `useTopOccluderHeight`.
- Sets `data-takeover-mounted` on `.phone-root` so the safe-area-inset-bottom owner switches per §5.4.
- Implements the takeover precedence per §4.5 (idle wins over offline; same-user back-to-back keeps mounted).
- Tracks an `incrementMutations` call on every outbound mutating message so `pendingAdds.classifyPendingState` advances the bounded-retry counter. The simplest hookup: monkey-patch `conn.send` is fragile; instead, expose a `useSendMutationTracked` helper inline that calls `incrementMutations()` whenever it sends one of the mutating types. The tabs / takeover / queue view already call `conn.send` directly today; for this iteration we wrap the same `conn.send` reference passed down to children with a tracked version.

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NameEntry } from '@/components/phone/NameEntry'
import { QueueView } from '@/components/phone/QueueView'
import { SearchTab } from '@/components/phone/SearchTab'
import { PasteTab } from '@/components/phone/PasteTab'
import { YoureUpView } from '@/components/phone/YoureUpView'
import { Tabs, type Tab } from '@/components/phone/Tabs'
import { OfflineBanner } from '@/components/phone/OfflineBanner'
import { PendingAddsTray } from '@/components/phone/PendingAddsTray'
import { Toaster } from '@/components/shared/Toaster'
import { PendingAddsProvider, usePendingAdds } from '@/lib/client/pending-adds'
import { useTopOccluderHeight } from '@/lib/client/use-top-occluder-height'
import { getSessionId, getStoredName, useConnection } from '@/lib/client/ws'
import type { ClientMessage } from '@/lib/types/protocol'
import type { Connection } from '@/lib/client/ws'

const MUTATING_PREFIXES = ['queue.', 'player.set']
const MUTATING_EXACT = new Set(['player.skip', 'player.prev', 'player.pause', 'player.play'])

const isMutatingClientMessage = (m: ClientMessage): boolean => {
  if (MUTATING_EXACT.has(m.type)) return true
  return MUTATING_PREFIXES.some((p) => m.type.startsWith(p))
}

const useTrackedConn = (conn: Connection): Connection => {
  const { incrementMutations } = usePendingAdds()
  return useMemo<Connection>(() => ({
    ...conn,
    send: (msg) => {
      if (isMutatingClientMessage(msg)) incrementMutations()
      conn.send(msg)
    },
  }), [conn, incrementMutations])
}

export default function Phone() {
  return (
    <Toaster>
      <PendingAddsProvider>
        <PhoneApp />
      </PendingAddsProvider>
    </Toaster>
  )
}

const PhoneApp = () => {
  const [name, setName] = useState<string>('')
  const [tab, setTab] = useState<Tab>('queue')
  const sessionId = typeof window === 'undefined' ? '' : getSessionId()

  useEffect(() => { setName(getStoredName()) }, [])

  const baseConn = useConnection({ name })
  const conn = useTrackedConn(baseConn)

  const tabsRef = useRef<HTMLElement>(null)
  const offlineBannerRef = useRef<HTMLDivElement>(null)
  const trayRef = useRef<HTMLDivElement>(null)

  const state = conn.state
  const sourceConnected = state?.sourceConnected ?? false
  const sourceReady = state?.sourceReady ?? false
  const offline = !sourceConnected || !sourceReady

  const player = state?.player
  const isOwnTurn =
    player && player.status !== 'idle' && player.item.queuedBy.sessionId === sessionId
  const showTakeoverInQueueTab = isOwnTurn && tab === 'queue'

  // §4.5: idle wins over offline — if the player is idle, the takeover must
  // not render even if offline is true. The predicate above already covers
  // this (`player.status !== 'idle'`).

  const { pendingAdds } = usePendingAdds()
  const currentEpoch = player && 'epoch' in player ? player.epoch : 0

  // Build the dynamic ref array — refs are unmounted when their elements are.
  const refs = useMemo(() => [tabsRef, offlineBannerRef, trayRef], [])
  useTopOccluderHeight(refs)

  // Switch tabs on "Added — N in queue" from SearchTab.
  const onAddedSwitchToQueue = () => setTab('queue')

  // §5.4 safe-area ownership flips when the takeover is mounted.
  const takeoverMountedAttr = showTakeoverInQueueTab ? '1' : '0'

  if (!name) return <NameEntry onSubmit={setName} />

  return (
    <div className="phone-root" data-takeover-mounted={takeoverMountedAttr}>
      <Tabs
        ref={tabsRef}
        name={name}
        activeTab={tab}
        onTabChange={setTab}
        onEditName={() => setName('')}
        queueBadge={state?.queue.length}
      />
      {offline && <OfflineBanner ref={offlineBannerRef} />}
      {pendingAdds.size > 0 && (
        <PendingAddsTray
          ref={trayRef}
          currentEpoch={currentEpoch}
          onRetry={(msgId) => {
            const entry = pendingAdds.get(msgId)
            if (!entry) return
            conn.send({ type: 'queue.add', msgId, videoId: entry.videoId, prePitch: entry.prePitch })
          }}
        />
      )}
      {showTakeoverInQueueTab ? (
        <YoureUpView
          conn={conn}
          player={player!}
          sourceConnected={sourceConnected}
          sourceReady={sourceReady}
        />
      ) : (
        <main aria-label={tab === 'queue' ? 'Queue' : tab === 'search' ? 'Search' : 'Paste'}>
          {tab === 'queue' && (
            <QueueView
              conn={conn}
              sessionId={sessionId}
              sourceConnected={sourceConnected}
              sourceReady={sourceReady}
            />
          )}
          {tab === 'search' && (
            <SearchTab conn={conn} currentEpoch={currentEpoch} onAddedSwitchToQueue={onAddedSwitchToQueue} />
          )}
          {tab === 'paste' && (
            <PasteTab conn={conn} currentEpoch={currentEpoch} />
          )}
        </main>
      )}
    </div>
  )
}
```

`useConnection` already returns a fresh `conn` object every render (per `src/lib/client/ws.ts`); `useTrackedConn` wraps that and forwards. Children that close over `conn` get the tracked send.

**Caveat for the implementer:** `state.sourceConnected` / `state.sourceReady` are present on `ServerState` per the base spec. Verify the type by `grep "sourceConnected" src/lib/types/state.ts` — if absent, this task additionally needs to surface those flags through the snapshot. The current `Store.snapshot()` in `src/lib/server/store.ts` includes them per base spec §5.4 — verify before consuming.

- [ ] **Step 2: Smoke test**

```bash
npx tsc --noEmit
npm test -- --run
```

If type errors complain about `ServerState.sourceConnected`/`.sourceReady` being missing on the client `Connection['state']`, inspect `src/lib/types/state.ts` and add fields if they aren't there:

```ts
export type ServerState = {
  ...
  sourceConnected: boolean
  sourceReady: boolean
}
```

And ensure `Store.snapshot()` emits them. (Likely already true; verify before committing the change.)

- [ ] **Step 3: Manual browser smoke**

Open `http://localhost:3000/` on phone-width and full-width windows:
- Sign in → tabs sticky on top.
- Queue tab: now-playing card + queue rows.
- Search a song → row expands inline → adjust key → ADD → switches to queue tab; new song appears in NEXT UP.
- When your queued song starts, the queue tab body becomes YOU'RE UP; the QUEUE/SEARCH/PASTE tabs still navigable.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/lib/types/state.ts src/lib/server/store.ts
git commit -m "feat(phone): assemble PhoneRoot — tabs, banner, tray, takeover

Wraps the phone client in Toaster + PendingAddsProvider. Mounts
Tabs / OfflineBanner / PendingAddsTray as the chrome stack and
either the active tab body or the YOU'RE UP takeover. Owns the
--top-occluder-height measurement and flips data-takeover-mounted
for the §5.4 safe-area-inset-bottom owner. Outbound mutating sends
are wrapped so pendingAdds advances mutationsSentSince.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 27: Final code review pass

**Files:**
- All `src/`, all `tests/`

**Context:** Subagent-driven development asks for a final review across the whole implementation after the per-task reviews land. Dispatch a code-reviewer subagent (or perform inline) to walk the implementation against the success criteria and check for:

- **Spec drift:** any §X.Y rule that lacks an implementation. Cross-reference §5.4 tap-target matrix, §5.4 ownership table, §5.4 animation registry, §5.5 keyframes against the final code.
- **Type-check + tests:** `npx tsc --noEmit && npm test -- --run` clean. All Phase-1 tests still pass.
- **Lint:** `npm run lint` (if configured) clean — fix any obvious warnings introduced by the rewrites.
- **Dead code:** look for unused imports, unreferenced helpers, ghost components left behind.

- [ ] **Step 1: Run the full suite**

```bash
cd /Users/jonathanyapeter/Documents/Karaoke\ App
npx tsc --noEmit
npm test -- --run
```

Expected: no TS errors. Test count should be base 56 + new (marquee-math: 3, top-occluder-height: 5, pending-adds: ~12, key-stepper-clamp: 2, dispatch.test.ts localhost case: 1) ≈ 79 tests.

- [ ] **Step 2: Diff vs. spec**

For each section of the redesign spec, confirm the corresponding code path exists:
- §3.1 grid layout → `.source-root` CSS + `source/page.tsx`
- §3.2 video frame regions → `VideoPlayer.tsx` + `NowPlayingStrip.tsx`
- §3.3 / §3.3-bis idle splash + transient skip → `IdleSplash.tsx`
- §3.3a offline state → `SourceOfflineState.tsx` (exists; verify it's mounted from a top-level guard if applicable)
- §3.6 setlist row ⤴/✕ + undo → `SetlistPanel.tsx`
- §4.2 queue card variants → `QueueView.tsx`
- §4.3 inline-expand + pendingAdds + collapse contract → `SearchTab.tsx`
- §4.4 paste preview-as-expanded → `PasteTab.tsx`
- §4.5 YOU'RE UP takeover → `YoureUpView.tsx`
- §4.6 NameEntry → `NameEntry.tsx`
- §5.x cross-cutting → `riso.css` + `layout.tsx`

If any section is missing, file a fix task before moving on.

- [ ] **Step 3: Commit the verification record**

If any inline fixes are made during this review, commit them together:

```bash
git add -p  # stage selectively
git commit -m "$(cat <<'EOF'
fix(ui): close gaps from final review pass

[Summarize what was fixed.]

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 28: Manual success-criteria walkthrough

**Files:** none — manual

**Context:** §8 of the redesign spec lists 15 criteria (base #1–5 and #7–10 plus redesign #1–10 augmented by criterion #15). Verify each on a real device.

- [ ] **Step 1: Set up**

Start the dev server:

```bash
npm run dev
```

Note the LAN URL from the banner. Open `/source` on the MacBook, complete "▶ Start show". Open the LAN URL on a phone.

- [ ] **Step 2: Walk through criteria #1–10 (base) and #1–15 (redesign)**

Use the spec section "§8 Success criteria" as the literal test plan. For each item, perform the action and check the outcome:

1. Source page shows 下北沢 splash in 16:9 frame + right rail.
2. Phone shows name entry without rotation; sign-in works.
3. Search "bohemian rhapsody karaoke" → ≥1 result; rows expand inline with KEY + ADD.
4. Different result tap → first collapses.
5. Set key to −2, tap ADD → switches to queue tab; new song in NEXT UP.
6. Source: splash → video; LIVE pulses; strip controls work.
7. Source volume slider responsive; pitch − changes audio.
8. Source shuffle reorders queue.
9. Your turn → queue tab becomes YOU'RE UP; ± works; SEARCH still navigable.
10. Resize source ≤720px → single column, QR chip in setlist header.
11. `prefers-reduced-motion: reduce` (DevTools rendering panel) → no marquee, no pulse, no flash.
12. iPhone portrait: takeover bottom controls not under home indicator.
13. iPhone landscape ≤480px: takeover title 16px; readout 24px; no overflow.
14. Keyboard tab order works; focus ring visible; VoiceOver announces aria-labels.
15. Tap [+] on YOU'RE UP → source pitches up within 500ms; readouts match.

- [ ] **Step 3: Record outcomes**

For each criterion either ✓ or note the failure with a one-line fix. If anything fails, return to the relevant component task, fix inline, re-commit.

- [ ] **Step 4: Mark plan complete**

When all criteria pass, the redesign is shipped. The next plan can layer the phase-2 drag-to-change-pitch feature behind the `karaoke.featureFlags.dragPitch` flag if/when desired — that work is intentionally NOT in this plan.

---

## Plan self-review

Run after writing the plan:

- **Spec coverage**: every §3, §4, §5 subsection is mapped to a task (verified above).
- **TokenEntry removal**: handled in Task 1 (spec sync) and unmounted in Task 11 (source page).
- **Server protocol**: untouched per §7 of the redesign spec.
- **Phase-2 drag**: deferred per §4.5 — buttons satisfy criterion #15 in Task 25.
- **Test cadence**: TDD where it pays (marquee math, occluder hook, pendingAdds reducer, KeyStepper clamp); visual rendering verified in browser.
- **Commit cadence**: one commit per task, conventional prefixes, co-author trailer.


