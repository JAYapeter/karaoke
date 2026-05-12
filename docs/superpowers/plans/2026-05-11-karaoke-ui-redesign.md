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

## Phase 0 — Preamble (no-op verification)

### Task 1: Acknowledge the TokenEntry removal

**Files:** none — verification only.

**Context:** Commit `52e037a` removed the `TokenEntry` component and its flow before this plan was written (localhost now auto-trusts the source). The redesign spec was written before that change and still mentions TokenEntry in §3.4 (pre-show states), §5.4 (tap-target matrix), §5.6 (selectors), and §6 (component matrix). **This plan does not amend the spec** — the spec stays as written and any TokenEntry references in it are obsolete by user direction. Downstream tasks in this plan also do not implement TokenEntry; the source page renders only the non-localhost guard, `StartShowGesture`, and the running show.

If at any point a future task seems to ask for TokenEntry work, treat that as a spec-out-of-date signal and skip it. The relevant spec rows to ignore:

- §3.4 "Pre-show states (token entry, ...)" — only the StartShowGesture half applies; treat the TokenEntry half as removed.
- §5.4 tap-target matrix row `TokenEntry submit` — N/A.
- §5.6 `.token-entry,` entries in the `.page-root, …` and `.token-entry, .start-show-gesture, …` selectors — `.token-entry` no longer applies; the riso.css rewrite in Task 2 already omits it.
- §6 component matrix row `src/components/source/TokenEntry.tsx` — N/A.

- [ ] **Step 1: Verify the removal is already in place**

```bash
test ! -f /Users/jonathanyapeter/Documents/Karaoke\ App/src/components/source/TokenEntry.tsx \
  && echo "OK: TokenEntry already removed" \
  || echo "WARN: TokenEntry still exists — re-check commit 52e037a"
```

Expected: `OK: TokenEntry already removed`. If it prints `WARN`, stop and reconcile manually before proceeding.

- [ ] **Step 2: No commit**

This task touches no files; nothing to commit.

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

/* §5.4 / §5.6 viewport units. vh first, dvh second. Every page-root class
   declared in the spec, kept as the spec writes it so the source-of-truth
   selector list stays implementable verbatim. The components in this plan
   never render `.source-offline` / `.source-idle-splash` as page roots —
   they use the `--overlay` modifier classes (defined below) when rendered
   inside the `.source-root` video frame, so the page-root rules don't fire
   in that case. `.token-entry` is absent — TokenEntry was removed in
   commit 52e037a. */
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

/* §5.4 safe-area ownership. Each owner is annotated where it's set.
   `.tabs` bakes 8px vertical + 12px horizontal breathing room into the
   safe-area calc so the inline padding on <header> can be omitted —
   inline `padding` shorthands would otherwise clobber padding-top and
   strip the env(safe-area-inset-top) the class owns. */
.tabs {
  position: sticky;
  top: 0;
  padding-top: calc(env(safe-area-inset-top, 0px) + 8px); /* owns safe-area-inset-top */
  padding-bottom: 8px;
  padding-left: calc(env(safe-area-inset-left, 0px) + 12px);
  padding-right: calc(env(safe-area-inset-right, 0px) + 12px);
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
  /* owns safe-area-inset-bottom. Padding shorthand below bakes 24px vertical
     + 16px horizontal breathing room INTO the class so consumers don't need
     to set inline `padding` shorthand (which would override the bottom-inset). */
  padding: 24px 16px calc(env(safe-area-inset-bottom, 0px) + 24px) 16px;
}
/* .source-root padding includes safe-area insets AND 12px breathing room
   on top/bottom. The later `.source-root` rule below sets `display: grid`
   etc. — its `padding-block` was previously clobbering these insets, which
   would let content run under the notch / home indicator. Merging the
   vertical padding into a single calc() per side keeps the insets owned. */
.source-root {
  padding-top: calc(env(safe-area-inset-top) + 12px);
  padding-right: env(safe-area-inset-right);
  padding-bottom: calc(env(safe-area-inset-bottom) + 12px);
  padding-left: env(safe-area-inset-left);
}
.start-show-gesture,
.source-offline,
.source-idle-splash {
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
           env(safe-area-inset-bottom) env(safe-area-inset-left);
}
/* .name-entry bakes 24px breathing room into the safe-area shorthand so the
   component can drop its inline `padding: 24` (which otherwise clobbered the
   class's safe-area shorthand). */
.name-entry {
  padding:
    calc(env(safe-area-inset-top, 0px) + 24px)
    calc(env(safe-area-inset-right, 0px) + 24px)
    calc(env(safe-area-inset-bottom, 0px) + 24px)
    calc(env(safe-area-inset-left, 0px) + 24px);
}

/* In-frame overlay modifier — used by IdleSplash and SourceOfflineState when
   they render INSIDE the .source-root video frame. The base classes above
   declare page-root behavior (100dvh + safe-area). The overlay modifiers
   reset that to fill the parent frame instead. Same class names are used
   in components: <div className="source-idle-splash source-idle-splash--overlay">. */
.source-idle-splash--overlay,
.source-offline--overlay {
  min-height: 0;
  padding: 0;
  position: absolute;
  inset: 0;
}

/* §3 source grid. Desktop: video + 160px rail. Mobile: stacked.
   Vertical padding is owned by the rule above (which includes safe-area
   + 12px breathing room); this rule sets only grid layout. */
.source-root {
  display: grid;
  grid-template-columns: 1fr 160px;
  gap: 12px;
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

/* §5.4 status-critical labels — class-level floors so inline component
   fontSize is unnecessary. Desktop: 12px minimum; phones (≤720px): 13px.
   Components MUST NOT set inline `font-size` on these classes — let the
   cascade win so the phone bump applies. */
.live-badge,
.youre-up__sub-header,
.offline-banner,
.now-playing-badge,
.paused-badge,
.next-up-badge {
  font-size: 12px;
}
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

/* §3.5 phone-width source layout.
   Desktop default for .now-playing-strip lives here so inline `padding`
   on the component can be dropped — otherwise inline `padding: 8 12`
   would override the spec'd phone `padding: 8 10` below. */
.now-playing-strip {
  padding: 8px 12px;
}
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
// top of the phone-root viewport (Tabs, OfflineBanner, PendingAddsTray). Also
// pass a `mountVersion` integer that the caller bumps whenever an occluder
// mounts or unmounts — the hook re-observes when the version changes. We
// can't depend on `refs.length` alone because in practice callers pass a
// fixed-length array of refs whose `.current` toggles between an element and
// null as components mount/unmount; the array length never changes.
//
// On every recompute we read fresh refs and sum from DOM, so the add/subtract
// drift bug from incremental updates is structurally impossible.
export const useTopOccluderHeight = (
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
  mountVersion: number,
) => {
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

    recompute()

    const ros = refsRef.current
      .map((r) => r.current)
      .filter((el): el is HTMLElement => el !== null)
      .map((el) => {
        const ro = new ResizeObserver(() => recompute())
        ro.observe(el)
        return ro
      })

    window.addEventListener('resize', recompute)

    return () => {
      for (const ro of ros) ro.disconnect()
      window.removeEventListener('resize', recompute)
    }
    // Re-run on every mount/unmount of an occluder. `mountVersion` is the
    // explicit signal because `refs.length` doesn't change when refs are
    // stable and only their `.current` toggles between an element and null.
  }, [mountVersion])
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

**Context:** §4.1 preserves the structure but extracts the header + tab strip as a sticky component. Tabs renders the `●  NAME · ⚙` left block and the `[QUEUE] [SEARCH] [PASTE]` right block, applies `.tabs` (which owns `safe-area-inset-top`), and forwards a ref so the PhoneRoot occluder hook can measure it. Tabs also owns its own `--tabs-height` writer (the spec §5.6 default in riso.css is a guess; the component overwrites it from its measured height on mount and on every resize). The `--top-occluder-height` sum is computed elsewhere in PhoneRoot.

- [ ] **Step 1: Create the component**

`src/components/phone/Tabs.tsx`:

```tsx
'use client'
import { forwardRef, useEffect, useState } from 'react'

export type Tab = 'queue' | 'search' | 'paste'

export type TabsProps = {
  name: string
  activeTab: Tab
  onTabChange: (t: Tab) => void
  onEditName: () => void
  /** Optional badge count for the QUEUE tab — set on §4.3 "Added — N in queue" path. */
  queueBadge?: number
}

// Self-writes :root --tabs-height from its measured height. Without this the
// PhoneRoot occluder math would use the riso.css default (an estimate); the
// real height varies with notched-vs-non-notched iPhones, landscape, and
// localized name strings.
const useWriteTabsHeight = (target: HTMLElement | null) => {
  useEffect(() => {
    if (!target || typeof window === 'undefined') return
    const write = () => {
      const h = target.getBoundingClientRect().height
      document.documentElement.style.setProperty('--tabs-height', `${Math.round(h)}px`)
    }
    write()
    const ro = new ResizeObserver(write)
    ro.observe(target)
    window.addEventListener('resize', write)
    return () => { ro.disconnect(); window.removeEventListener('resize', write) }
  }, [target])
}

export const Tabs = forwardRef<HTMLElement, TabsProps>(function Tabs(
  { name, activeTab, onTabChange, onEditName, queueBadge },
  ref,
) {
  // State-mediated callback ref so the height-writer effect actually re-runs
  // when the element attaches. A plain useRef's .current does not trigger
  // re-renders, so useEffect would never observe a non-null target.
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useWriteTabsHeight(target)
  const setRefs = (el: HTMLElement | null) => {
    setTarget(el)
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  return (
    <header
      ref={setRefs}
      className="tabs"
      role="banner"
      // NOTE: padding is owned by the .tabs CSS class (riso.css) so it can
      // include env(safe-area-inset-top). Don't add a `padding` shorthand
      // here — it would override the safe-area calc.
      style={{
        zIndex: 5,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        background: 'var(--ink-black)',
        borderBottom: '1px solid var(--ink-deep)',
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
        textAlign: 'center',
        // font-size enforced by .offline-banner cascade in riso.css (12 desktop, 13 phones).
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
- Create: `src/lib/client/pending-adds.ts` (pure: types, reducer, classifier, constants)
- Create: `src/lib/client/pending-adds-context.tsx` (React: provider, hook, ack listener)
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
  /** §4.3: tray displays title when known, falls back to videoId. Search
   *  knows the title at add time; Paste resolves it first. The reducer
   *  stores whatever the caller passes. */
  title?: string
  prePitch: number
  sentAt: number
  mutationsSentSince: number
  epochAtSent: number
}

export type PendingAddsState = ReadonlyMap<string, PendingAdd>

export type PendingAddsAction =
  | { type: 'add'; msgId: string; videoId: string; title?: string; prePitch: number; sentAt: number; epoch: number }
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
        title: action.title,
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

- [ ] **Step 3: Create the React provider + hook in a separate `.tsx` file**

The pure module above stays a `.ts` file with no React imports — so tests run without a DOM. The provider, hook, and the global `state.ack` listener live in a sibling `.tsx`. The listener is hoisted here (out of SearchTab/PasteTab) so an in-flight `queue.add` whose originating tab unmounts still gets its ack cleared.

`src/lib/client/pending-adds-context.tsx`:

```tsx
'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import type { ServerMessage } from '@/lib/types/protocol'
import { useToaster } from '@/components/shared/Toaster'
import {
  initialPendingAdds,
  pendingAddsReducer,
  type PendingAddsState,
} from './pending-adds'

type Ctx = {
  pendingAdds: PendingAddsState
  add: (msgId: string, videoId: string, prePitch: number, epoch: number, title?: string) => void
  ack: (msgId: string, ok: boolean, error?: string) => void
  dismiss: (msgId: string) => void
  incrementMutations: () => void
}

const PendingAddsContext = createContext<Ctx | null>(null)

const LAST_ADD_SENT_AT_KEY = 'karaoke.lastAddSentAt'
const RECENT_ADD_WARNING_MS = 10_000

export const PendingAddsProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(pendingAddsReducer, initialPendingAdds)
  // Provider must be mounted INSIDE <Toaster> (see PhoneApp wrap). The Toaster
  // provides the imperative showToast hook directly — calling it avoids the
  // race where a synth-dispatched CustomEvent fires before Toaster's window
  // listener mounts (it does in strict mode's first pass).
  const { showToast } = useToaster()

  // §4.3 "Persistence across reloads + recent-add warning." pendingAdds is
  // in-memory only, so a phone reload drops the map. Mitigation: a single
  // timestamp in localStorage. If a reload lands within 10 s, warn the user
  // a recent add may still be processing.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(LAST_ADD_SENT_AT_KEY)
      if (!raw) return
      const ts = Number(raw)
      if (!isFinite(ts)) return
      const age = Date.now() - ts
      if (age >= 0 && age < RECENT_ADD_WARNING_MS) {
        showToast({
          level: 'warn',
          message: 'A recent add may still be processing — wait a moment before retrying',
        })
      }
    } catch {
      // localStorage unavailable; silently skip.
    }
  }, [showToast])
  const add = useCallback((msgId: string, videoId: string, prePitch: number, epoch: number, title?: string) =>
    dispatch({ type: 'add', msgId, videoId, title, prePitch, sentAt: Date.now(), epoch }), [])
  const ack = useCallback((msgId: string, ok: boolean, error?: string) =>
    dispatch({ type: 'ack', msgId, ok, error }), [])
  const dismiss = useCallback((msgId: string) => dispatch({ type: 'dismiss', msgId }), [])
  const incrementMutations = useCallback(() => dispatch({ type: 'incrementMutations' }), [])

  // Global ack listener — owns the "did the server respond to my queue.add"
  // contract regardless of which tab the user is on. §4.3: the pendingAdds
  // map survives tab switches; the ack-handler that clears entries MUST also
  // be tab-agnostic, otherwise unmounting a tab mid-flight orphans the entry.
  // We dispatch only — the reducer is a no-op for unknown msgIds, so this
  // listener is safe to run even when this provider's pendingAdds is empty.
  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type === 'state.ack') {
        dispatch({ type: 'ack', msgId: m.msgId, ok: m.ok, error: m.error })
      }
    }
    window.addEventListener('karaoke-msg', handler)
    return () => window.removeEventListener('karaoke-msg', handler)
  }, [])

  const value = useMemo<Ctx>(
    () => ({ pendingAdds: state, add, ack, dismiss, incrementMutations }),
    [state, add, ack, dismiss, incrementMutations],
  )
  return <PendingAddsContext.Provider value={value}>{children}</PendingAddsContext.Provider>
}

export const usePendingAdds = (): Ctx => {
  const v = useContext(PendingAddsContext)
  if (!v) throw new Error('usePendingAdds must be used inside <PendingAddsProvider>')
  return v
}
```

The dispatcher's `state.ack` reaches every connected client (per the base spec WS contract), and the reducer is a no-op for unknown `msgId`s, so the listener is harmless when there are no pending entries.

Note: the pure module above (`pending-adds.ts`) must NOT import React, JSX, or any DOM type, or vitest will pull React into the test environment. Keep it import-clean.

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit  # clean
npx vitest run tests/unit/pending-adds.test.ts  # all green
git add src/lib/client/pending-adds.ts src/lib/client/pending-adds-context.tsx tests/unit/pending-adds.test.ts
git commit -m "$(cat <<'EOF'
feat(phone): add pending-adds reducer + React context per §4.3

Pure .ts (reducer + classifier + constants) tested headless; React
provider in sibling .tsx owns the global state.ack listener so
pending entries clear independently of which tab is mounted.

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
import { classifyPendingState, type PendingClassification } from '@/lib/client/pending-adds'
import { usePendingAdds } from '@/lib/client/pending-adds-context'

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
        const displayName = entry.title ?? entry.videoId
        // §4.3: stale-visual (5+ min) allows ONLY dismiss; retry is removed.
        // expired-window / retry / queueing all use the primary tap.
        const allowRetry = cls !== 'stale-visual'
        return (
          <div
            key={entry.msgId}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <button
              type="button"
              className="hit-target uc"
              aria-label={allowRetry ? `Retry pending add for ${displayName}` : `${displayName} expired — dismiss with ×`}
              onClick={() => { if (allowRetry) onRetry(entry.msgId) }}
              disabled={!allowRetry}
              aria-disabled={!allowRetry || undefined}
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
              {displayName} · key {entry.prePitch >= 0 ? '+' : ''}{entry.prePitch} · {labelFor(cls)}
            </button>
            <button
              type="button"
              className="hit-target uc"
              aria-label={cls === 'stale-visual' ? `Dismiss expired add for ${displayName}` : `Cancel pending add for ${displayName}`}
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

### Task 10: Update `Toaster.tsx` for `--top-occluder-height` anchor and UNDO support, then scaffold phone/source roots

**Files:**
- Modify: `src/components/shared/Toaster.tsx`
- Modify: `src/app/page.tsx` (scaffold — keeps existing children, just wraps them in `<Toaster><PendingAddsProvider>`)

(`src/app/source/page.tsx` is rewritten in Task 11 — no edits to it in this task.)

**Context:** §5.4 anchors the toaster at `top: var(--top-occluder-height, 0)` (it does NOT own a safe-area inset). §5.5 reduced-motion keeps the opacity fade and drops the translate. UNDO toasts are CLIENT-side only — we expose an imperative `showToast({ level, message, undo })` through a `useToaster()` context.

**Why scaffold both roots now:** later tasks (QueueView/SearchTab/PasteTab/YoureUpView/SetlistPanel) call `useToaster()` and `usePendingAdds()`. Without the providers mounted, those components would crash at runtime ("must be used inside …"). Wrapping `app/page.tsx` and `source/page.tsx` here — even though the children are still the OLD components — keeps every intermediate task functional. The final composition in Task 26 just upgrades the children; it does not re-introduce the providers.

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

// Each toast wraps its element in a small mount component so the `.toast`
// CSS transition from opacity:0 / translateY(-8px) → visible can fire. The
// element mounts with data-visible="0" (matching the .toast base rule),
// then flips to "1" after the first paint via rAF. Without this two-phase
// render the data-visible attribute would always be "1" and the §5.5 mount
// animation would never play.
const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) => {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div
      className="paper-card paper-grain toast"
      data-visible={visible ? '1' : '0'}
      style={{
        pointerEvents: 'auto',
        minWidth: 220,
        maxWidth: 360,
        borderLeft: `4px solid ${COLORS[toast.level]}`,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <div className="uc" style={{ fontSize: 9, color: COLORS[toast.level], marginBottom: 2 }}>{toast.level}</div>
        <div style={{ fontFamily: 'var(--mono-font)', fontSize: 12, wordBreak: 'break-word' }}>{toast.message}</div>
      </div>
      {toast.undo && (
        <button
          type="button"
          className="hit-target uc"
          onClick={() => { toast.undo!.onTap(); onDismiss() }}
          style={{
            background: 'transparent',
            color: COLORS[toast.level],
            border: `1px solid ${COLORS[toast.level]}`,
            padding: '6px 10px',
            fontSize: 10,
          }}
        >
          {toast.undo.label}
        </button>
      )}
    </div>
  )
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
          top: 'var(--top-occluder-height, 0px)',
          paddingTop: 12, // breathing room between chrome and the first toast
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
          <ToastItem
            key={t.id}
            toast={t}
            onDismiss={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
          />
        ))}
      </div>
    </ToasterContext.Provider>
  )
}
```

The Toaster is now a context provider — it wraps its children with the `useToaster` context AND renders the toast surface. The old prop-less `<Toaster />` shape changes to `<Toaster>{children}</Toaster>`; passing `children` is required for `useToaster()` consumers to see the provider, but the empty form (`<Toaster />`) stays valid for sites that only render server-driven toasts.

- [ ] **Step 2: Scaffold the phone root with both providers**

Edit `src/app/page.tsx` to wrap its existing return in `<Toaster><PendingAddsProvider>…</PendingAddsProvider></Toaster>`. Keep all existing children unchanged — this is purely a provider wrap so later tasks can call `useToaster()` / `usePendingAdds()` without crashing.

Concretely, the new shape of `src/app/page.tsx` is:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { NameEntry } from '@/components/phone/NameEntry'
import { QueueView } from '@/components/phone/QueueView'
import { SearchTab } from '@/components/phone/SearchTab'
import { PasteTab } from '@/components/phone/PasteTab'
import { LivePitchSheet } from '@/components/phone/LivePitchSheet'
import { Toaster } from '@/components/shared/Toaster'
import { PendingAddsProvider } from '@/lib/client/pending-adds-context'
import { getSessionId, getStoredName, useConnection } from '@/lib/client/ws'

type Tab = 'queue' | 'search' | 'paste'

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
  const conn = useConnection({ name })
  if (!name) return <NameEntry onSubmit={setName} />
  return (
    <main style={{ paddingBottom: 140 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: '1px solid var(--ink-deep)' }}>
        <div className="uc" style={{ fontSize: 11 }}>● {name}</div>
        <nav style={{ display: 'flex', gap: 8 }}>
          {(['queue', 'search', 'paste'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)} className="uc"
              style={{ padding: '6px 10px', fontSize: 10, background: tab === t ? 'var(--hanko-red)' : 'transparent', color: 'var(--paper-cream)' }}>
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

Note: `<QueueView>` here is still the OLD signature (`conn`, `sessionId` only). Task 22 expands the prop list; Task 26 plumbs the new props. The scaffolding intentionally keeps the OLD components mounted so the app keeps working through the rewrites.

- [ ] **Step 3: Note on the source root**

The source `src/app/source/page.tsx` will be rewritten in the upcoming Task 11 to wrap the running show in `<Toaster>…</Toaster>`. That rewrite is the source-side equivalent of this step — no edits to source/page.tsx are made here. The Toaster provider's empty-children form (used in old code today) stays type-compatible with the rewrite that lands in Task 11.

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add src/components/shared/Toaster.tsx src/app/page.tsx
git commit -m "$(cat <<'EOF'
refactor(toaster): provider + UNDO support; wrap phone root early

Toaster now exposes useToaster() for imperative client toasts with
optional UNDO actions per §3.6 and §4.2. Anchored at
--top-occluder-height per §5.4; .toast class supplies the
reduced-motion-aware mount animation per §5.5. Phone root wraps the
old app in <Toaster><PendingAddsProvider> so later component
rewrites can consume both hooks without crashing.

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
      // padding is owned by the .now-playing-strip class (riso.css):
      // desktop 8px 12px, phone 8px 10px per §5.6. Adding inline `padding`
      // shorthand would clobber the mobile override.
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', gap: 12,
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
            letterSpacing: '0.16em', borderRadius: 2, pointerEvents: 'none',
            // font-size enforced by .live-badge cascade (12 desktop, 13 phones).
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
      <div className="uc" style={{ fontSize: 12, letterSpacing: '0.2em', color: 'var(--ink-muted)' }}>scan to join</div>
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
import { useCallback, useEffect, useRef, useState } from 'react'
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

// Compact landscape: QR shrinks to 160 CSS px when height ≤ 480 (§5.6).
const useCompactLandscape = (): boolean => {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-height: 480px)')
    const apply = () => setCompact(mql.matches)
    apply()
    if (mql.addEventListener) mql.addEventListener('change', apply)
    else mql.addListener(apply)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', apply)
      else mql.removeListener(apply)
    }
  }, [])
  return compact
}

export const JoinUrlModal = ({ open, onClose }: JoinUrlModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const url = useJoinUrl()
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const compact = useCompactLandscape()
  const qrPx = compact ? 160 : 240

  // Stabilize onClose so the dialog-effect doesn't re-fire on every parent render.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const stableClose = useCallback(() => onCloseRef.current(), [])

  useEffect(() => {
    if (!url) return
    qrcode.toDataURL(url, { margin: 1, width: qrPx * 1.5 }).then(setQrDataUrl).catch(() => setQrDataUrl(''))
  }, [url, qrPx])
  useScrollLock(open)
  useEffect(() => {
    if (!open) return
    if (supportsDialog() && dialogRef.current) {
      const d = dialogRef.current
      const prev = document.activeElement as HTMLElement | null
      // Strict-mode double-mount or rapid re-render can re-enter this effect
      // while the dialog is already open. Guard so showModal() doesn't throw
      // InvalidStateError.
      if (!d.open) d.showModal()
      closeBtnRef.current?.focus()
      const onCancel = (e: Event) => { e.preventDefault(); stableClose() }
      d.addEventListener('cancel', onCancel)
      return () => {
        d.removeEventListener('cancel', onCancel)
        if (d.open) d.close()
        prev?.focus()
      }
    }
    // Fallback path. Must implement focus trap manually per §5.6.
    const root = containerRef.current
    const prev = document.activeElement as HTMLElement | null
    closeBtnRef.current?.focus()
    const focusables = (): HTMLElement[] => {
      if (!root) return []
      return Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hidden && el.offsetParent !== null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { stableClose(); return }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (f.length === 0) { e.preventDefault(); return }
      const active = document.activeElement as HTMLElement | null
      const idx = active ? f.indexOf(active) : -1
      // Always handle Tab inside the modal — otherwise focus escapes to elements
      // outside the dialog when the user tabs from the middle of the list.
      e.preventDefault()
      if (idx === -1) { f[0]!.focus(); return }
      if (e.shiftKey) {
        f[idx === 0 ? f.length - 1 : idx - 1]!.focus()
      } else {
        f[idx === f.length - 1 ? 0 : idx + 1]!.focus()
      }
    }
    // Capture-phase keydown so we win over child handlers.
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true); prev?.focus() }
  }, [open, stableClose])

  const onBackdropTap = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) stableClose()
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
      ref={containerRef}
      className="join-url-modal__body"
      style={{
        padding: 'env(safe-area-inset-top, 12px) env(safe-area-inset-right, 12px) env(safe-area-inset-bottom, 12px) env(safe-area-inset-left, 12px)',
        maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
        background: 'var(--ink-deep)', color: 'var(--paper-cream)',
        minWidth: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
      }}
    >
      <div className="uc" style={{ fontSize: 12, letterSpacing: '0.2em' }}>scan to join</div>
      <div className="join-url-modal__qr" style={{ width: qrPx, height: qrPx, background: 'var(--paper-cream)' }}>
        {qrDataUrl && <img src={qrDataUrl} alt={`Join URL ${url}`} width={qrPx} height={qrPx} style={{ display: 'block' }} />}
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
import { getSessionId } from '@/lib/client/ws'
import type { Connection } from '@/lib/client/ws'
import type { QueueItem } from '@/lib/types/state'
import type { ServerMessage } from '@/lib/types/protocol'
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
    // §3.6 undo: re-add via queue.add and, when the re-added item appears in
    // the queue snapshot, chain a queue.move to the original index. Since
    // queue.add mints a NEW item.id server-side, we can't use the old id;
    // we identify the new entry by listening for the next queue update and
    // matching on (videoId, queuedBy.sessionId === source's session, addedAt >
    // sentAt). "If possible" — if the queue update doesn't arrive within 4 s
    // (e.g. server error), the move is skipped silently and the song stays
    // wherever queue.add placed it.
    showToast({
      level: 'warn', message: `Removed: ${item.title}`, ttlMs: UNDO_TTL_MS,
      undo: { label: 'UNDO', onTap: () => {
        const addMsgId = randomUUID()
        const mySession = getSessionId()
        // Snapshot the queue's current item IDs BEFORE sending the add. The
        // newly-added item will appear in a state.queue / state.full update
        // as an item whose id wasn't in the snapshot. Note: state.queue is
        // broadcast BEFORE state.ack by the server's dispatcher (see
        // dispatch.ts), so we must NOT gate the scan on the ack arriving
        // first — we'd miss the very update that contains our new item.
        const knownIds = new Set(queue.map((q) => q.id))
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        const cleanup = () => {
          window.removeEventListener('karaoke-msg', onMsg)
          if (timeoutId) { clearTimeout(timeoutId); timeoutId = null }
        }
        const onMsg = (e: Event) => {
          const m = (e as CustomEvent).detail as ServerMessage
          // ok=false ack short-circuits — the add was rejected, nothing to move.
          if (m.type === 'state.ack' && m.msgId === addMsgId && !m.ok) {
            cleanup()
            return
          }
          if (m.type !== 'state.queue' && m.type !== 'state.full') return
          const q = m.type === 'state.full' ? m.state.queue : m.queue
          // The newly-added item is one whose id is NOT in the pre-add snapshot
          // AND whose (videoId, queuedBy.sessionId) match our add. That two-way
          // filter survives concurrent same-videoId adds from other clients
          // AND clock skew (we don't depend on addedAt at all). Scan in reverse
          // so the most-recent new entry wins if multiple were added concurrently
          // (the previous queue snapshot rules out earlier additions).
          const candidate = [...q].reverse().find((it) =>
            !knownIds.has(it.id) &&
            it.videoId === item.videoId &&
            it.queuedBy.sessionId === mySession
          )
          if (!candidate) return
          if (originalIndex >= 0 && originalIndex < q.length) {
            conn.send({ type: 'queue.move', msgId: randomUUID(), itemId: candidate.id, toIndex: originalIndex })
          }
          cleanup()
        }
        window.addEventListener('karaoke-msg', onMsg)
        conn.send({ type: 'queue.add', msgId: addMsgId, videoId: item.videoId, prePitch: item.prePitch })
        timeoutId = setTimeout(cleanup, 4000)
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

**Context:** §3.6 — slider 0–1 ties directly to `getAudioGraph().setVolume()`. Persisted to `localStorage["karaoke.volume"]`. Re-applied on every `subscribeAudioGraph` callback (so unlocking after a reload restores the level).

- [ ] **Step 1: Verify the subscribe API exists**

```bash
grep -n "subscribeAudioGraph" /Users/jonathanyapeter/Documents/Karaoke\ App/src/lib/client/audio-graph-ref.ts
```

Expected output: `export const subscribeAudioGraph = (cb: () => void): (() => void) => { ... }` (or equivalent). The current file (post-base implementation) already exports `subscribeAudioGraph` with a no-argument callback signature. If it's missing for any reason, add a minimal listener set that matches the existing pattern:

```ts
// Add to src/lib/client/audio-graph-ref.ts
const listeners = new Set<() => void>()
export const subscribeAudioGraph = (cb: () => void): (() => void) => {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
// And modify setAudioGraph to notify:
export const setAudioGraph = (g: AudioGraph | null) => {
  current = g
  for (const l of listeners) l()
}
```

The VolumePanel below uses the no-argument form: `const apply = () => { getAudioGraph()?.setVolume(volumeRef.current) }`.

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
git add src/components/source/VolumePanel.tsx
# Also stage src/lib/client/audio-graph-ref.ts ONLY if Step 1 actually edited it
# (i.e., subscribeAudioGraph wasn't already exported). In the current
# codebase it IS exported, so nothing to stage there.
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
      // Overlay variant — `--overlay` resets 100dvh + safe-area to fill the
      // parent video frame instead of the viewport.
      className="source-idle-splash source-idle-splash--overlay"
      style={{
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
// Overlay variant: `source-offline--overlay` resets 100dvh + safe-area to fill
// the parent video frame instead of the viewport. See riso.css.
export const SourceOfflineState = () => (
  <div
    className="source-offline source-offline--overlay"
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

- [ ] **Step 4: Hook `IdleSplash` and `SourceOfflineState` into `VideoPlayer`**

In `VideoPlayer.tsx`, replace the `isPlaying` ternary from Task 13 with state-aware branches:

```tsx
const isPlaying = player && player.status !== 'idle'
const queueLen = conn.state?.queue.length ?? 0
const sourceConnected = conn.state?.sourceConnected ?? false
const sourceReady = conn.state?.sourceReady ?? false
// §3.3a: source-offline with queued items renders the dedicated offline panel
// INSIDE the video frame (replacing the splash). Idle with no queue still
// shows the regular splash even when offline — there's nothing to be lost.
const showOfflinePanel = !isPlaying && queueLen > 0 && (!sourceConnected || !sourceReady)
// §3.3-bis: the transient-recovery "▶ Start next song" button only appears
// when the source IS ready (otherwise auto-advance can't fire and the button
// would do nothing on tap).
const transientWithQueue = queueLen > 0 && sourceConnected && sourceReady
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
) : showOfflinePanel ? (
  <SourceOfflineState />
) : (
  <IdleSplash conn={conn} transientWithQueue={transientWithQueue} />
)}
```

Add the imports:

```tsx
import { IdleSplash } from './IdleSplash'
import { SourceOfflineState } from './SourceOfflineState'
```

Both `IdleSplash` and `SourceOfflineState` use the `--overlay` modifier class (defined in riso.css), which resets the page-root 100dvh + safe-area rules to `position: absolute; inset: 0`, fitting the parent video frame cleanly. No additional inline positioning is required — the class does the work.

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
      // padding is owned by the .name-entry class (riso.css) — safe-area +
      // 24px breathing room baked in. Adding an inline `padding` shorthand
      // here would clobber the safe-area calc.
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
        <div className="next-up-badge uc" style={{ fontWeight: 700, color: 'var(--ink-black)' }}>▌ NEXT UP</div>
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
      ? (<div className="paused-badge uc" style={{ fontWeight: 700, color: 'var(--ink-black)' }}>▌ PAUSED</div>)
      : (<div className="now-playing-badge uc" style={{ color: 'var(--riso-pink)' }}>▌ NOW PLAYING</div>)
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
        {/* No CSS transition on the width — that would be a decorative
            animation outside the §5.4/§5.5 registry. The bar steps with
            React state on every state.player tick, which is smooth enough
            given heartbeat cadence (~500 ms). */}
        <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--hanko-red)' }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update the caller in `src/app/page.tsx`**

`QueueView` now requires `sourceConnected` and `sourceReady`. Update the existing call site in the scaffolded `PhoneApp` (from Task 10) so the build stays green between tasks:

```tsx
// In src/app/page.tsx, replace the existing QueueView call with:
{tab === 'queue' && (
  <QueueView
    conn={conn}
    sessionId={sessionId}
    sourceConnected={conn.state?.sourceConnected ?? false}
    sourceReady={conn.state?.sourceReady ?? false}
  />
)}
```

If `ServerState.sourceConnected` / `.sourceReady` are not yet declared in `src/lib/types/state.ts`, add them now (`boolean` fields, sourced from `Store.snapshot()` which already tracks them per base spec §5.4). The downstream Task 26 will rely on the same flags.

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add src/components/phone/QueueView.tsx src/app/page.tsx src/lib/types/state.ts
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
- `pendingAdds` map is global (lives in the PhoneRoot provider from Task 8); a queue.add operation has a single `msgId` (the "operation id") used for retries. The ack handler is global to the provider — SearchTab does NOT listen for `state.ack` itself.
- ADD button pending lock: native `disabled` + `aria-disabled`; stepper buttons AND the row's expand/collapse toggle disabled during pending.
- Off-tab success path: on `ok` ack, if the originating row is still mounted+expanded, switch to QUEUE tab and reset search; otherwise fire a non-blocking `▌ Added — N in queue` toast and leave the user where they are. The "still mounted+expanded" check uses the parent's `activeTab` state passed in as a prop.
- Search race protection: `activeSearchMsgId` filter; submit lock until results / timeout / cancel. Pressing Enter while locked is a no-op.
- Cancel current search action while in flight.
- Semantic markup: `<button>` row header, body is a sibling, `aria-expanded` on the button.
- **Composite row key**: results from one query can contain duplicate `videoId`s (rare but possible — caption channels often re-upload). Keying purely on `videoId` causes React reconciliation collisions and per-row pending-state collapse. Use `${videoId}:${resultIndex}` as the row key AND as the expand state key.

- [ ] **Step 1: Rewrite**

```tsx
'use client'
import { randomUUID } from '@/lib/client/uuid'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { SearchResult } from '@/lib/types/state'
import type { ServerMessage } from '@/lib/types/protocol'
import { KeyStepper, clampPitch } from './KeyStepper'
import { usePendingAdds } from '@/lib/client/pending-adds-context'
import { classifyPendingState, type PendingAdd } from '@/lib/client/pending-adds'
import { useToaster } from '@/components/shared/Toaster'

const SEARCH_TIMEOUT_MS = 8000
const ADD_ACK_TIMEOUT_MS = 6000

// Live-tick the "queueing → tap to retry → start new add anyway → expired"
// classification so per-row labels and lock states update in real time.
const usePendingTick = (active: boolean) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return now
}

export type SearchTabProps = {
  conn: Connection
  currentEpoch: number
  isActive: boolean                // true iff the parent's activeTab is "search"
  queueLen: number
  onAddedSwitchToQueue: () => void
}

// Row identity = (videoId, index-in-results-list). Lets duplicate videoIds in
// the same result set behave as independent rows per §4.3 "two distinct rows
// for the same videoId" rule.
const rowKey = (videoId: string, idx: number) => `${videoId}:${idx}`

export const SearchTab = ({ conn, currentEpoch, isActive, queueLen, onAddedSwitchToQueue }: SearchTabProps) => {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [activeSearchMsgId, setActiveSearchMsgId] = useState<string | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [pitch, setPitch] = useState(0)
  const [errorByMsg, setErrorByMsg] = useState<Record<string, string>>({})
  // Track which row originated each pending op, so off-tab acks know whether
  // the originator is still around. Map<msgId, rowKey>.
  const originatorRef = useRef<Map<string, string>>(new Map())
  // Outstanding per-msgId window listeners so we can clean them up on unmount.
  // Map<msgId, EventListener>.
  const ackListenersRef = useRef<Map<string, EventListener>>(new Map())
  const searchCleanupRef = useRef<(() => void) | null>(null)
  const { pendingAdds, add: addPending, dismiss: dismissPending } = usePendingAdds()
  const { showToast } = useToaster()
  const now = usePendingTick(pendingAdds.size > 0)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const connRef = useRef(conn)
  connRef.current = conn
  const expandedKeyRef = useRef(expandedKey)
  expandedKeyRef.current = expandedKey
  const queueLenRef = useRef(queueLen)
  queueLenRef.current = queueLen

  // Cleanup any in-flight search AND any outstanding per-msgId ack listeners on unmount.
  useEffect(() => () => {
    searchCleanupRef.current?.()
    for (const [, fn] of ackListenersRef.current) {
      window.removeEventListener('karaoke-msg', fn)
    }
    ackListenersRef.current.clear()
  }, [])

  // §4.3 canonical collapse contract: "Switching tabs collapses any expanded
  // row." Tabs are now kept mounted (PhoneRoot uses `hidden` instead of
  // unmounting), so this component watches its own `isActive` prop and
  // collapses on each transition to inactive.
  useEffect(() => {
    if (!isActive) {
      setExpandedKey(null)
      setPitch(0)
    }
  }, [isActive])

  // Per-add success/failure side effects. The provider's global ack listener
  // already dispatches into pendingAdds; this listener is purely UX (switch
  // tab / show toast / surface inline error). Listening BY msgId restricts
  // each add to its own observer so we don't react to other tabs' adds. The
  // listener is registered in a Map so unmount can remove every outstanding
  // one — otherwise a tab switch mid-flight leaks listeners.
  const addAckListener = useCallback((msgId: string, rk: string) => {
    const onMsg: EventListener = (e) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type !== 'state.ack' || m.msgId !== msgId) return
      window.removeEventListener('karaoke-msg', onMsg)
      ackListenersRef.current.delete(msgId)
      originatorRef.current.delete(msgId)
      if (m.ok) {
        if (isActiveRef.current && expandedKeyRef.current === rk) {
          setResults([])
          setQ('')
          setExpandedKey(null)
          onAddedSwitchToQueue()
        } else {
          // Use the freshest queue length from conn.state — the server's
          // state.queue broadcast for this add typically lands before (or in
          // the same dispatch as) the state.ack, so the count is already
          // ticked. Fall back to queueLen+1 if state isn't yet observed.
          const liveLen = connRef.current.state?.queue.length
          const reportLen = typeof liveLen === 'number' ? liveLen : queueLenRef.current + 1
          showToast({ level: 'info', message: `Added — ${reportLen} in queue`, ttlMs: 2000 })
        }
      } else {
        if (m.error) setErrorByMsg((prev) => ({ ...prev, [msgId]: m.error! }))
      }
    }
    ackListenersRef.current.set(msgId, onMsg)
    window.addEventListener('karaoke-msg', onMsg)
  }, [onAddedSwitchToQueue, showToast])

  const doSearch = useCallback(() => {
    if (!q.trim()) return
    if (activeSearchMsgId !== null) return // §4.3 submit lock
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
    setExpandedKey(null)
    conn.send({ type: 'search', msgId, query: q.trim() })
  }, [conn, q, activeSearchMsgId])

  const cancelSearch = useCallback(() => {
    searchCleanupRef.current?.()
    setActiveSearchMsgId(null)
  }, [])

  const onQueryChange = (v: string) => {
    setQ(v)
    setExpandedKey(null) // §4.3: every keystroke collapses any expanded row
  }

  const toggle = (rk: string) => {
    setExpandedKey((cur) => (cur === rk ? null : rk))
    setPitch(0)
  }

  // Look up the pending op originated FROM this specific row (not just any op
  // for the same videoId — that would cross-couple duplicate-result rows).
  const pendingForRow = (rk: string) => {
    for (const [msgId, originKey] of originatorRef.current.entries()) {
      if (originKey !== rk) continue
      const entry = pendingAdds.get(msgId)
      if (entry) return entry
    }
    return null
  }

  const doAdd = (r: SearchResult, rk: string) => {
    const existing = pendingForRow(rk)
    // §4.3 bounded-retry-window:
    //   - queueing/retry: reuse existing msgId (server dedup short-circuits).
    //   - expired-window: mint a NEW msgId — user accepted dup risk via the
    //     "start new add anyway" affordance.
    //   - stale-visual: per spec line 329, "Tapping dismiss removes the entry
    //     from the map; NOTHING ELSE does at this stage." → tap is a no-op.
    let msgId: string
    if (existing) {
      const cls = classifyPendingState(existing, { now, currentEpoch, ackedTimeoutMs: ADD_ACK_TIMEOUT_MS })
      if (cls === 'stale-visual') {
        return // 5+ min stale — only dismiss is allowed, no retry.
      }
      if (cls === 'expired-window') {
        msgId = randomUUID()
        addPending(msgId, r.videoId, clampPitch(pitch), currentEpoch, r.title)
        originatorRef.current.set(msgId, rk)
        addAckListener(msgId, rk)
      } else {
        msgId = existing.msgId
      }
    } else {
      msgId = randomUUID()
      addPending(msgId, r.videoId, clampPitch(pitch), currentEpoch, r.title)
      originatorRef.current.set(msgId, rk)
      addAckListener(msgId, rk)
    }
    setErrorByMsg((prev) => { const { [msgId]: _, ...rest } = prev; return rest })
    conn.send({ type: 'queue.add', msgId, videoId: r.videoId, prePitch: clampPitch(pitch) })
    // §4.3 lastAddSentAt: record so a phone reload within 10s warns the user
    // a recent add may still be processing.
    try { localStorage.setItem('karaoke.lastAddSentAt', String(Date.now())) } catch {}
  }

  const cancelPending = (msgId: string) => {
    dismissPending(msgId)
    originatorRef.current.delete(msgId)
    const listener = ackListenersRef.current.get(msgId)
    if (listener) {
      window.removeEventListener('karaoke-msg', listener)
      ackListenersRef.current.delete(msgId)
    }
    setErrorByMsg((prev) => { const { [msgId]: _, ...rest } = prev; return rest })
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="search-tab__query-row" style={{ display: 'flex', gap: 8 }}>
        <input
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              // §4.3 submit lock: no-op on Enter while a search is in flight.
              if (activeSearchMsgId === null) doSearch()
            }
          }}
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
          data-keyboard-primary-action="go"
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
        {results.map((r, idx) => {
          const rk = rowKey(r.videoId, idx)
          const isExpanded = expandedKey === rk
          const bodyId = `search-row-${rk}-body`
          const pending = pendingForRow(rk)
          const rowError = pending ? errorByMsg[pending.msgId] : undefined
          const cls = pending
            ? classifyPendingState(pending, { now, currentEpoch, ackedTimeoutMs: ADD_ACK_TIMEOUT_MS })
            : null
          return (
            <SearchRow
              key={rk}
              result={r}
              isExpanded={isExpanded}
              bodyId={bodyId}
              onToggle={() => toggle(rk)}
              pitch={isExpanded ? pitch : 0}
              setPitch={setPitch}
              onAdd={() => doAdd(r, rk)}
              pending={pending}
              classification={cls}
              error={rowError}
              onCancelPending={pending ? () => cancelPending(pending.msgId) : undefined}
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
  pending: PendingAdd | null
  classification: 'queueing' | 'retry' | 'expired-window' | 'stale-visual' | null
  error?: string
  onCancelPending?: () => void
}

const SearchRow = ({ result, isExpanded, bodyId, onToggle, pitch, setPitch, onAdd, pending, classification, error, onCancelPending }: SearchRowProps) => {
  const isPending = !!pending
  // §4.3 lock matrix:
  //   - queueing (no error): ADD + stepper LOCKED until ack / timeout.
  //   - retry / expired-window / on inline error: ADD must be tappable.
  //   - stale-visual (5+ min, spec line 329): dismiss-only; ADD LOCKED.
  // The row's expand toggle locks only during queueing so the row layout
  // doesn't shift mid-flight.
  const isQueueing = classification === 'queueing'
  const lockToggle = isQueueing
  const lockAdd = (isQueueing && !error) || classification === 'stale-visual'
  const addLabel =
    !isPending ? 'ADD'
    : error ? 'tap to retry'
    : classification === 'retry' ? 'tap to retry'
    : classification === 'expired-window' ? 'start new add anyway'
    : classification === 'stale-visual' ? 'expired'
    : 'queueing…'

  // §5.5 search-row expand/collapse — measure the body's natural height so the
  // max-height transition lands on a real value. If measurement is 0 (body not
  // yet rendered, fonts swapping, etc.), set data-no-measure so the CSS falls
  // back to an instant `max-height: none` and skips the animation rather than
  // clipping or flashing.
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [bodyHeight, setBodyHeight] = useState<number>(0)
  useEffect(() => {
    if (!isExpanded) return
    const measure = () => {
      const el = bodyRef.current
      if (!el) return
      // scrollHeight reflects the body's natural height including padding.
      setBodyHeight(el.scrollHeight)
    }
    measure()
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {})
    }
    if (!bodyRef.current) return
    const ro = new ResizeObserver(measure)
    ro.observe(bodyRef.current)
    return () => ro.disconnect()
  }, [isExpanded])

  const noMeasure = bodyHeight === 0
  const rowStyle = bodyHeight > 0
    ? ({ ['--row-content-h' as any]: `${bodyHeight}px` })
    : undefined

  return (
    <li
      className={`search-row paper-card paper-grain ${isExpanded ? 'paper-card--accent' : ''}`}
      data-expanded={isExpanded ? '1' : '0'}
      data-no-measure={noMeasure ? '1' : '0'}
      style={rowStyle}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={lockToggle}
        aria-disabled={lockToggle || undefined}
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
      <div ref={bodyRef} id={bodyId} className="search-row__body" hidden={!isExpanded}>
        <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>KEY</span>
            <KeyStepper value={pitch} onChange={setPitch} disabled={lockAdd} />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              data-keyboard-primary-action={isExpanded ? 'add' : undefined}
              onClick={onAdd}
              disabled={lockAdd}
              aria-disabled={lockAdd || undefined}
              className="hit-target uc"
              style={{
                padding: '10px 16px',
                background: isPending && !error && classification === 'queueing' ? 'var(--ink-muted)' : 'var(--hanko-red)',
                color: 'var(--paper-cream)', fontSize: 11,
              }}
            >
              {addLabel}
            </button>
            {isPending && onCancelPending && (
              <button
                type="button"
                onClick={onCancelPending}
                aria-label={classification === 'stale-visual' ? `Dismiss pending add for ${result.title}` : `Cancel pending add for ${result.title}`}
                className="hit-target uc"
                style={{ background: 'transparent', color: 'var(--riso-pink)', fontSize: 12 }}
              >×</button>
            )}
          </div>
        </div>
        {error && (
          <div className="uc" style={{ padding: '4px 10px', fontSize: 11, color: 'var(--riso-pink)' }}>▌ {error}</div>
        )}
        {classification === 'stale-visual' && !error && (
          <div className="uc" style={{ padding: '4px 10px', fontSize: 11, color: 'var(--riso-pink)' }}>
            ▌ expired (server may have applied this)
          </div>
        )}
      </div>
    </li>
  )
}
```

Note: the body height is measured via the body ref's `scrollHeight` and re-measured on `document.fonts.ready` + `ResizeObserver` per §5.5. Until measurement lands a non-zero value, the row sets `data-no-measure="1"` so the riso.css cascade falls back to instant expand (no height animation) instead of clipping. The `--row-content-h` CSS var is set inline on the `<li>` and inherits down to `.search-row__body`.

- [ ] **Step 2: Update the caller in `src/app/page.tsx`**

`SearchTab`'s prop list has grown. Update the scaffolded `PhoneApp` (from Task 10) call site so the build stays green between tasks:

```tsx
// In src/app/page.tsx PhoneApp body, add (above the return):
const onAddedSwitchToQueue = () => setTab('queue')

// Replace the existing SearchTab call with:
{tab === 'search' && (
  <SearchTab
    conn={conn}
    currentEpoch={
      conn.state?.player && conn.state.player.status !== 'idle'
        ? conn.state.player.epoch
        : 0
    }
    isActive={tab === 'search'}
    queueLen={conn.state?.queue.length ?? 0}
    onAddedSwitchToQueue={onAddedSwitchToQueue}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add src/components/phone/SearchTab.tsx src/app/page.tsx
git commit -m "feat(phone): SearchTab inline-expand + pendingAdds + collapse contract

Implements §4.3: <button> row header with aria-expanded; expanded
body is a sibling; canonical collapse on keystroke / submit / different
row tap; ADD pending-lock keyed on shared pendingAdds map; cancel
button while search in flight. Caller updated to pass isActive,
queueLen, and the switch-to-queue callback.

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
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { ServerMessage } from '@/lib/types/protocol'
import { KeyStepper, clampPitch } from './KeyStepper'
import { usePendingAdds } from '@/lib/client/pending-adds-context'
import { classifyPendingState } from '@/lib/client/pending-adds'
import { useToaster } from '@/components/shared/Toaster'

const VIDEO_ID = /(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/
const RESOLVE_TIMEOUT_MS = 12000
const ADD_ACK_TIMEOUT_MS = 6000

type Meta = { videoId: string; title: string; thumbnail: string; durationSec: number }

// Compact-landscape (height ≤ 480 CSS px) — textarea drops to 2 rows.
const useCompactLandscape = (): boolean => {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(max-height: 480px)')
    const apply = () => setCompact(mql.matches)
    apply()
    if (mql.addEventListener) mql.addEventListener('change', apply)
    else mql.addListener(apply)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', apply)
      else mql.removeListener(apply)
    }
  }, [])
  return compact
}

export type PasteTabProps = {
  conn: Connection
  currentEpoch: number
  isActive: boolean
  queueLen: number
}

export const PasteTab = ({ conn, currentEpoch, isActive, queueLen }: PasteTabProps) => {
  const [url, setUrl] = useState('')
  const [meta, setMeta] = useState<Meta | null>(null)
  const [pitch, setPitch] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // Tracks the in-flight add msgId originated by THIS PasteTab's current
  // preview. A different preview (new resolve) starts a NEW msgId; the
  // pendingAdds map keeps both as independent ops per §4.3.
  const [activeAddMsgId, setActiveAddMsgId] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const ackListenerRef = useRef<EventListener | null>(null)
  const { pendingAdds, add: addPending, dismiss: dismissPending } = usePendingAdds()
  const { showToast } = useToaster()
  const compact = useCompactLandscape()
  // Live tick so classification (queueing → retry → expired) updates the UI.
  const [tickNow, setTickNow] = useState(() => Date.now())
  useEffect(() => {
    if (!activeAddMsgId) return
    const id = setInterval(() => setTickNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [activeAddMsgId])
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive
  const queueLenRef = useRef(queueLen)
  queueLenRef.current = queueLen
  const connRef = useRef(conn)
  connRef.current = conn

  useEffect(() => () => {
    cleanupRef.current?.()
    if (ackListenerRef.current) {
      window.removeEventListener('karaoke-msg', ackListenerRef.current)
      ackListenerRef.current = null
    }
  }, [])

  // Per-add ack listener — listens only for OUR active add's msgId. The global
  // ack listener in PendingAddsProvider already removes the map entry; here we
  // just handle UX (toast / clear / error).
  const addAckListener = useCallback((msgId: string) => {
    const onMsg: EventListener = (e) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type !== 'state.ack' || m.msgId !== msgId) return
      window.removeEventListener('karaoke-msg', onMsg)
      if (ackListenerRef.current === onMsg) ackListenerRef.current = null
      setActiveAddMsgId((cur) => (cur === msgId ? null : cur))
      if (m.ok) {
        if (isActiveRef.current) {
          setMeta(null); setUrl(''); setAddError(null)
        } else {
          const liveLen = connRef.current.state?.queue.length
          const reportLen = typeof liveLen === 'number' ? liveLen : queueLenRef.current + 1
          showToast({ level: 'info', message: `Added — ${reportLen} in queue`, ttlMs: 2000 })
        }
      } else if (m.error) {
        setAddError(m.error)
      }
    }
    // Replace any prior listener (defensive — there should never be more than one
    // active add at a time on a single PasteTab).
    if (ackListenerRef.current) {
      window.removeEventListener('karaoke-msg', ackListenerRef.current)
    }
    ackListenerRef.current = onMsg
    window.addEventListener('karaoke-msg', onMsg)
  }, [showToast])

  const resolve = () => {
    const m = url.match(VIDEO_ID)
    if (!m) { setErr('Could not find a YouTube video id in that URL.'); return }
    cleanupRef.current?.()
    setBusy(true); setErr(null); setMeta(null); setAddError(null); setActiveAddMsgId(null)
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

  // Pending status for the ADD button is keyed on activeAddMsgId, not on
  // pendingAdds.has(...) for the videoId. This lets the same videoId be
  // re-queued (at a different key) without the button being locked just
  // because a previous-attempt-from-this-tab still happens to be pending.
  const activePending = activeAddMsgId ? pendingAdds.get(activeAddMsgId) ?? null : null
  const classification = activePending
    ? classifyPendingState(activePending, { now: tickNow, currentEpoch, ackedTimeoutMs: ADD_ACK_TIMEOUT_MS })
    : null

  const doAdd = () => {
    if (!meta) return
    const isQueueing = classification === 'queueing'
    if (isQueueing && !addError) return // pending lock during in-flight
    // §4.3 line 329: stale-visual is dismiss-only. Tap is a no-op.
    if (classification === 'stale-visual') return
    // §4.3 bounded-retry-window: on expired-window the user explicitly
    // accepts dup risk; mint a new msgId. On retry/error, reuse the same msgId
    // so server dedup short-circuits if the server already saw it.
    const needNewMsgId =
      !activeAddMsgId ||
      classification === 'expired-window'
    const msgId = needNewMsgId ? randomUUID() : activeAddMsgId!
    if (needNewMsgId) {
      addPending(msgId, meta.videoId, clampPitch(pitch), currentEpoch, meta.title)
      setActiveAddMsgId(msgId)
      addAckListener(msgId)
    }
    setAddError(null)
    conn.send({ type: 'queue.add', msgId, videoId: meta.videoId, prePitch: clampPitch(pitch) })
    try { localStorage.setItem('karaoke.lastAddSentAt', String(Date.now())) } catch {}
  }

  const cancelPending = () => {
    if (!activeAddMsgId) return
    dismissPending(activeAddMsgId)
    if (ackListenerRef.current) {
      window.removeEventListener('karaoke-msg', ackListenerRef.current)
      ackListenerRef.current = null
    }
    setActiveAddMsgId(null)
    setAddError(null)
  }

  // §4.3 line 329: stale-visual allows ONLY dismiss — ADD is locked.
  const lockAdd = (classification === 'queueing' && !addError) || classification === 'stale-visual'

  const addLabel =
    !activePending ? 'ADD'
    : addError ? 'tap to retry'
    : classification === 'retry' ? 'tap to retry'
    : classification === 'expired-window' ? 'start new add anyway'
    : classification === 'stale-visual' ? 'expired'
    : 'queueing…'

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="paste-tab__action-row" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          className="paste-tab__textarea hit-target"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://youtube.com/watch?v=…"
          aria-label="YouTube URL"
          rows={compact ? 2 : 3}
          style={{ width: '100%', padding: 10, fontFamily: 'var(--mono-font)', fontSize: 16, background: 'var(--paper-cream)', color: 'var(--ink-black)', minHeight: 48 }}
        />
        <button
          type="button"
          data-keyboard-primary-action="resolve"
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
              <KeyStepper value={pitch} onChange={setPitch} disabled={lockAdd} />
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                data-keyboard-primary-action="add"
                onClick={doAdd}
                disabled={lockAdd}
                aria-disabled={lockAdd || undefined}
                className="hit-target uc"
                style={{
                  padding: '10px 16px',
                  background: classification === 'queueing' && !addError ? 'var(--ink-muted)' : 'var(--hanko-red)',
                  color: 'var(--paper-cream)', fontSize: 11,
                }}
              >
                {addLabel}
              </button>
              {activePending && (
                <button
                  type="button"
                  onClick={cancelPending}
                  aria-label={classification === 'stale-visual' ? 'Dismiss pending add' : 'Cancel pending add'}
                  className="hit-target uc"
                  style={{ background: 'transparent', color: 'var(--riso-pink)', fontSize: 12 }}
                >×</button>
              )}
            </div>
          </div>
          {addError && (
            <div className="uc" style={{ marginTop: 6, fontSize: 11, color: 'var(--riso-pink)' }}>▌ {addError}</div>
          )}
          {classification === 'stale-visual' && !addError && (
            <div className="uc" style={{ marginTop: 6, fontSize: 11, color: 'var(--riso-pink)' }}>
              ▌ expired (server may have applied this)
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update the caller in `src/app/page.tsx`**

```tsx
// Replace the existing PasteTab call in the scaffolded PhoneApp with:
{tab === 'paste' && (
  <PasteTab
    conn={conn}
    currentEpoch={
      conn.state?.player && conn.state.player.status !== 'idle'
        ? conn.state.player.epoch
        : 0
    }
    isActive={tab === 'paste'}
    queueLen={conn.state?.queue.length ?? 0}
  />
)}
```

- [ ] **Step 3: Commit**

```bash
npx tsc --noEmit
git add src/components/phone/PasteTab.tsx src/app/page.tsx
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
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Connection } from '@/lib/client/ws'
import type { PlayerState } from '@/lib/types/state'
import type { ServerMessage } from '@/lib/types/protocol'
import { clampPitch } from './KeyStepper'

const NO_ACK_RETRY_MS = 6000

const fmtMmSs = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

type PendingPitch = {
  value: number
  itemId: string
  epoch: number
  msgId: string | null   // null while we're offline (no send yet)
  timer: ReturnType<typeof setTimeout> | null
}

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
  // Latest server-authoritative livePitch so the ack handler can snap the
  // local readout back if the server rejects our value (§3.3a).
  const serverPitchRef = useRef(player.livePitch)
  serverPitchRef.current = player.livePitch

  const clearPendingTimer = () => {
    const p = pendingRef.current
    if (p && p.timer) { clearTimeout(p.timer); p.timer = null }
  }

  useEffect(() => () => clearPendingTimer(), [])

  // Source-driven live pitch updates sync the readout when we're online and
  // have no in-flight pending — otherwise the user's local edit wins until ack.
  useEffect(() => {
    const p = pendingRef.current
    if (sourceConnected && sourceReady && !p) {
      setPitch(player.livePitch)
    }
  }, [player.livePitch, sourceConnected, sourceReady])

  // Global state.ack listener clears OUR pending entry. (PendingAddsProvider
  // clears its own map for queue.add msgIds; this listener handles the
  // player.setLivePitch msgIds we mint.)
  useEffect(() => {
    const handler = (e: Event) => {
      const m = (e as CustomEvent<ServerMessage>).detail
      if (m.type !== 'state.ack') return
      const p = pendingRef.current
      if (!p || p.msgId !== m.msgId) return
      // §3.3a: on ok=true we clear pending and let server-driven livePitch
      // sync the readout. On ok=false we ALSO drop pending silently AND snap
      // the local pitch back to the server's authoritative value — otherwise
      // the readout would keep showing the rejected user-tapped value
      // indefinitely.
      clearPendingTimer()
      pendingRef.current = null
      if (!m.ok) {
        setPitch(serverPitchRef.current)
      }
    }
    window.addEventListener('karaoke-msg', handler)
    return () => window.removeEventListener('karaoke-msg', handler)
  }, [])

  const scheduleNoAckRetry = useCallback((msgId: string, value: number) => {
    const t = setTimeout(() => {
      const p = pendingRef.current
      if (!p || p.msgId !== msgId) return
      // No ack within 6 s → resend with the SAME msgId. Server dedup returns
      // the cached ack if it had already processed the original; otherwise it
      // processes the resend.
      conn.send({ type: 'player.setLivePitch', msgId, semitones: clampPitch(value) })
      p.timer = setTimeout(() => {
        // Bound the retry count to one: if the second send also goes unacked
        // for 6 s, give up. The next user tap will mint a new msgId.
        if (pendingRef.current && pendingRef.current.msgId === msgId) {
          clearPendingTimer()
          pendingRef.current = null
        }
      }, NO_ACK_RETRY_MS)
    }, NO_ACK_RETRY_MS)
    return t
  }, [conn])

  const sendLivePitch = useCallback((value: number, opts?: { reuseMsgId?: string }) => {
    clearPendingTimer()
    const msgId = opts?.reuseMsgId ?? randomUUID()
    pendingRef.current = {
      value,
      itemId: player.item.id,
      epoch: player.epoch,
      msgId,
      timer: scheduleNoAckRetry(msgId, value),
    }
    conn.send({ type: 'player.setLivePitch', msgId, semitones: clampPitch(value) })
  }, [conn, player.item.id, player.epoch, scheduleNoAckRetry])

  // Reconnect replay per §3.3a.
  const wasConnectedRef = useRef(sourceConnected && sourceReady)
  useEffect(() => {
    const nowConnected = sourceConnected && sourceReady
    if (!wasConnectedRef.current && nowConnected) {
      const p = pendingRef.current
      if (p && p.itemId === player.item.id && p.epoch === player.epoch && p.value !== player.livePitch) {
        // Replay with same msgId (or new msgId if rejected once) — server
        // dedup makes this safe.
        sendLivePitch(p.value, p.msgId ? { reuseMsgId: p.msgId } : undefined)
      } else if (p && (p.itemId !== player.item.id || p.epoch !== player.epoch)) {
        // Song changed under us — discard.
        clearPendingTimer()
        pendingRef.current = null
      }
    }
    wasConnectedRef.current = nowConnected
  }, [sourceConnected, sourceReady, player.item.id, player.epoch, player.livePitch, sendLivePitch])

  const onPitchChange = (v: number) => {
    const clamped = clampPitch(v)
    setPitch(clamped)
    if (sourceConnected && sourceReady) {
      sendLivePitch(clamped)
    } else {
      // Hold while offline; replay on reconnect. No msgId yet.
      clearPendingTimer()
      pendingRef.current = {
        value: clamped,
        itemId: player.item.id,
        epoch: player.epoch,
        msgId: null,
        timer: null,
      }
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
          letterSpacing: '0.2em',
          display: 'flex',
          justifyContent: 'space-between',
          // font-size enforced by .youre-up__sub-header cascade.
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
      <div className="youre-up__controls" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 'auto', color: 'var(--paper-cream)' }}>
        <div className="uc" style={{ fontSize: 12, color: 'var(--paper-cream)', opacity: 0.8 }}>KEY</div>
        <div className="youre-up__readout" aria-live="polite" style={{ fontFamily: 'var(--display-font)', fontStyle: 'italic', fontWeight: 900, fontSize: 32, color: 'var(--hanko-red)' }}>
          {pitch >= 0 ? `+${pitch}` : pitch}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="youre-up__btn uc"
            aria-label="Lower pitch by one semitone"
            onClick={() => onPitchChange(pitch - 1)}
            style={{
              minWidth: 56, minHeight: 56, padding: '8px 14px',
              background: 'transparent', color: 'var(--paper-cream)',
              border: '1px solid var(--paper-cream)', fontSize: 24,
            }}
          >−</button>
          <button
            type="button"
            className="youre-up__btn uc"
            aria-label="Raise pitch by one semitone"
            onClick={() => onPitchChange(pitch + 1)}
            style={{
              minWidth: 56, minHeight: 56, padding: '8px 14px',
              background: 'transparent', color: 'var(--paper-cream)',
              border: '1px solid var(--paper-cream)', fontSize: 24,
            }}
          >+</button>
        </div>
        <div className="uc" style={{ fontSize: 12, color: 'var(--paper-cream)', opacity: 0.7, letterSpacing: '0.2em' }}>
          source has override
        </div>
      </div>
    </section>
  )
}
```

Notes:
- Buttons use `.youre-up__btn` directly with explicit 56×56 px min sizing (≥ §5.4's 48 floor even on fine pointer — §3.2 mandates 48 always on the source strip and §5.4 §5.6 force 48 on `.youre-up__btn` on phones; the explicit min-width/height above keeps them ≥48 on desktop, satisfying both rules). The `.youre-up__btn` namespace is also used by the §5.5 `tap-flash` keyframes.
- `KeyStepper` is no longer reused here — its `.hit-target` cascade drops to 32 px on fine pointer, which violates the takeover requirement. The big ± buttons above are takeover-specific and 56×56 always.
- Drag-to-change is phase-2 (flag-gated per spec); buttons cover criterion #15.

- [ ] **Step 3: Update the caller in `src/app/page.tsx`**

`LivePitchSheet.tsx` no longer exists; the scaffolded `PhoneApp` (from Task 10) still imports it. Swap the import and rendering for `YoureUpView` so the build stays green between this task and Task 26 (which adds the full PhoneRoot composition). Minimal swap:

```tsx
// Top of src/app/page.tsx — replace:
import { LivePitchSheet } from '@/components/phone/LivePitchSheet'
// with:
import { YoureUpView } from '@/components/phone/YoureUpView'

// In PhoneApp, replace the existing
//     <LivePitchSheet conn={conn} sessionId={sessionId} />
// with the same predicate the takeover uses in Task 26 (idle wins over offline):
const player = conn.state?.player
const isOwnTurn =
  player && player.status !== 'idle' && player.item.queuedBy.sessionId === sessionId
const showTakeover = !!isOwnTurn

// Render in place of LivePitchSheet:
{showTakeover && (
  <YoureUpView
    conn={conn}
    player={player!}
    sourceConnected={conn.state?.sourceConnected ?? false}
    sourceReady={conn.state?.sourceReady ?? false}
  />
)}
```

This is intentionally minimal — the rest of the takeover/tab-precedence wiring is finalized in Task 26.

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit
git add src/components/phone/LivePitchSheet.tsx src/components/phone/YoureUpView.tsx src/app/page.tsx
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

**Context:** This task assembles every shared phone-shell piece built in earlier tasks (the Toaster + PendingAddsProvider wrap was scaffolded in Task 10; here we replace the scaffold body with the real composition):
- Renders `<Tabs>`, optional `<OfflineBanner>`, optional `<PendingAddsTray>`, and the active tab body (QueueView / SearchTab / PasteTab) OR the takeover (YoureUpView).
- Owns the `--top-occluder-height` measurement via `useTopOccluderHeight`. The hook is fed an explicit `mountVersion` integer that bumps every time the offline banner or pending tray mounts/unmounts, so the sum recomputes even though the ref array length stays constant.
- Sets `data-takeover-mounted` on `.phone-root` so the safe-area-inset-bottom owner switches per §5.4.
- Implements the takeover precedence per §4.5 (idle wins over offline; same-user back-to-back keeps mounted).
- Tracks an `incrementMutations` call on every outbound mutating message so `pendingAdds.classifyPendingState` advances the bounded-retry counter. We wrap the `conn` once and forward the tracked version to every child.
- Implements the §5.4 keyboard-visibility behavior (visualViewport + focusin/focusout fallback, hysteresis, scrollIntoView).
- Passes `isActive` and `queueLen` to `SearchTab`/`PasteTab` so their off-tab success path knows to fire the toast instead of switching.

- [ ] **Step 1: Rewrite the file**

```tsx
'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NameEntry } from '@/components/phone/NameEntry'
import { QueueView } from '@/components/phone/QueueView'
import { SearchTab } from '@/components/phone/SearchTab'
import { PasteTab } from '@/components/phone/PasteTab'
import { YoureUpView } from '@/components/phone/YoureUpView'
import { Tabs, type Tab } from '@/components/phone/Tabs'
import { OfflineBanner } from '@/components/phone/OfflineBanner'
import { PendingAddsTray } from '@/components/phone/PendingAddsTray'
import { Toaster } from '@/components/shared/Toaster'
import { PendingAddsProvider, usePendingAdds } from '@/lib/client/pending-adds-context'
import { classifyPendingState } from '@/lib/client/pending-adds'
import { useTopOccluderHeight } from '@/lib/client/use-top-occluder-height'
import { randomUUID } from '@/lib/client/uuid'
import { getSessionId, getStoredName, useConnection } from '@/lib/client/ws'
import type { ClientMessage } from '@/lib/types/protocol'
import type { Connection } from '@/lib/client/ws'

const MUTATING_PREFIXES = ['queue.', 'player.set']
const MUTATING_EXACT = new Set(['player.skip', 'player.prev', 'player.pause', 'player.play'])

const isMutatingClientMessage = (m: ClientMessage): boolean => {
  if (MUTATING_EXACT.has(m.type)) return true
  return MUTATING_PREFIXES.some((p) => m.type.startsWith(p))
}

// Wrap conn so mutating sends advance the pendingAdds mutation counter.
// `useConnection` returns a fresh object every render; we keep the wrapped
// `send` itself stable across renders by reading the latest `conn` from a
// ref. The returned Connection object is still fresh per render (we expose
// `state` / `ready` / `ack` from the latest conn), but consumers that close
// over `send` get a stable reference, which keeps their useEffect deps
// quiet.
const useTrackedConn = (conn: Connection): Connection => {
  const { incrementMutations } = usePendingAdds()
  const connRef = useRef(conn)
  connRef.current = conn
  const send = useCallback<Connection['send']>((msg) => {
    if (isMutatingClientMessage(msg)) incrementMutations()
    connRef.current.send(msg)
  }, [incrementMutations])
  return { state: conn.state, ready: conn.ready, ack: conn.ack, send }
}

// §5.4 iOS keyboard visibility — hysteresis + visualViewport + focus-correlated
// fallback. On open, scrolls the focused input into view; if the active tab's
// primary action button is still occluded after that scroll, scrolls it too
// (single follow-up — never both at once).
const useKeyboardScrollIntoView = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return

    let keyboardOpen = false
    let trailing: ReturnType<typeof setTimeout> | null = null
    let fallbackRecentFocusAt = 0 // ms timestamp of last focus on form field

    const isFormFocused = () => {
      const a = document.activeElement
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')
    }

    // Best-effort primary-action lookup. Candidate controls tag themselves
    // with `data-keyboard-primary-action="add" | "resolve" | "go"`. Priority
    // is ADD > RESOLVE > GO — an expanded Search row's ADD button beats the
    // GO button above it; a Paste preview's ADD beats RESOLVE. First visible
    // tagged element of the highest-priority kind wins. Returns null if no
    // tagged element is currently visible.
    const PRIORITY: Array<'add' | 'resolve' | 'go'> = ['add', 'resolve', 'go']
    const primaryAction = (): HTMLElement | null => {
      for (const kind of PRIORITY) {
        const els = document.querySelectorAll<HTMLElement>(`[data-keyboard-primary-action="${kind}"]`)
        for (const el of els) {
          if (el.offsetParent === null) continue
          return el
        }
      }
      return null
    }

    const scrollFocused = () => {
      const a = document.activeElement as HTMLElement | null
      if (!a || (a.tagName !== 'INPUT' && a.tagName !== 'TEXTAREA')) return
      a.scrollIntoView({ block: 'center', behavior: 'auto' })
      // After the input scroll lands, check whether the primary action button
      // is still occluded; if so, do ONE follow-up scrollIntoView for it.
      // Wrapped in rAF so layout settles between the two scrolls (iOS otherwise
      // oscillates on back-to-back visualViewport-triggered scrolls).
      requestAnimationFrame(() => {
        const btn = primaryAction()
        const vvHeight = window.visualViewport?.height ?? window.innerHeight
        if (btn) {
          const r = btn.getBoundingClientRect()
          if (r.bottom > vvHeight) {
            btn.scrollIntoView({ block: 'center', behavior: 'auto' })
          }
        }
      })
    }

    const handleVVResize = () => {
      if (trailing) clearTimeout(trailing)
      trailing = setTimeout(() => {
        const vv = window.visualViewport
        if (!vv) return
        const delta = window.innerHeight - vv.height
        const OPEN_THRESHOLD = Math.max(120, window.innerHeight * 0.18)
        const CLOSE_THRESHOLD = Math.max(80, window.innerHeight * 0.10)
        if (!keyboardOpen && delta > OPEN_THRESHOLD && isFormFocused()) {
          keyboardOpen = true
          requestAnimationFrame(scrollFocused)
        } else if (keyboardOpen && (delta < CLOSE_THRESHOLD || !isFormFocused())) {
          keyboardOpen = false
        }
      }, 50)
    }

    // Fallback (no visualViewport): keyboard is "open" iff a focus on a form
    // field is followed by a window resize within 300 ms (per spec). It
    // "closes" on focusout OR on a resize that returns to within 100 px of
    // screen height.
    const handleFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null
      if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return
      if (window.visualViewport) return // primary path handles it
      fallbackRecentFocusAt = Date.now()
    }
    const handleFocusOut = () => {
      if (window.visualViewport) return
      keyboardOpen = false
    }
    const handleFallbackResize = () => {
      if (window.visualViewport) return
      const sinceFocus = Date.now() - fallbackRecentFocusAt
      if (!keyboardOpen && sinceFocus < 300 && isFormFocused()) {
        keyboardOpen = true
        requestAnimationFrame(scrollFocused)
      } else if (keyboardOpen) {
        const heightDelta = Math.abs(screen.height - window.innerHeight)
        if (heightDelta < 100 || !isFormFocused()) keyboardOpen = false
      }
    }

    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', handleVVResize)
    } else {
      window.addEventListener('resize', handleFallbackResize)
    }
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    return () => {
      if (trailing) clearTimeout(trailing)
      if (vv) vv.removeEventListener('resize', handleVVResize)
      else window.removeEventListener('resize', handleFallbackResize)
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])
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

  const tabsRef = useRef<HTMLElement | null>(null)
  const offlineBannerRef = useRef<HTMLDivElement | null>(null)
  const trayRef = useRef<HTMLDivElement | null>(null)

  const state = conn.state
  const sourceConnected = state?.sourceConnected ?? false
  const sourceReady = state?.sourceReady ?? false
  const offline = !sourceConnected || !sourceReady

  const player = state?.player
  const isOwnTurn =
    player && player.status !== 'idle' && player.item.queuedBy.sessionId === sessionId
  const showTakeoverInQueueTab = isOwnTurn && tab === 'queue'

  const { pendingAdds, add: addPending } = usePendingAdds()
  const currentEpoch = player && 'epoch' in player ? player.epoch : 0

  // Mount-version: bumps whenever any conditionally-mounted occluder flips
  // visibility (offline banner — gated by showOfflineBanner — or pending
  // tray). Drives the occluder-height hook to re-observe.
  const mountVersion = ((offline && !showTakeoverInQueueTab) ? 1 : 0) + (pendingAdds.size > 0 ? 2 : 0)
  const refs = useMemo(() => [tabsRef, offlineBannerRef, trayRef], [])
  useTopOccluderHeight(refs, mountVersion)

  // §5.4 keyboard-visibility scroll.
  useKeyboardScrollIntoView()

  // Stable callback so child memoization doesn't break.
  const onAddedSwitchToQueue = useCallback(() => setTab('queue'), [])

  const queueLen = state?.queue.length ?? 0
  const takeoverMountedAttr = showTakeoverInQueueTab ? '1' : '0'
  // §3.3a banner-vs-takeover precedence: when the takeover is mounted, the
  // takeover's own sub-header carries the offline state. Hide the global
  // banner to avoid double-chrome.
  const showOfflineBanner = offline && !showTakeoverInQueueTab

  if (!name) return <NameEntry onSubmit={setName} />

  return (
    <div className="phone-root" data-takeover-mounted={takeoverMountedAttr}>
      <Tabs
        ref={tabsRef}
        name={name}
        activeTab={tab}
        onTabChange={setTab}
        onEditName={() => setName('')}
        queueBadge={queueLen}
      />
      {showOfflineBanner && <OfflineBanner ref={offlineBannerRef} />}
      {pendingAdds.size > 0 && (
        <PendingAddsTray
          ref={trayRef}
          currentEpoch={currentEpoch}
          onRetry={(msgId) => {
            const entry = pendingAdds.get(msgId)
            if (!entry) return
            const cls = classifyPendingState(entry, {
              now: Date.now(),
              currentEpoch,
              ackedTimeoutMs: 6000,
            })
            // §4.3 line 329: stale-visual is dismiss-only — the tray button is
            // disabled at that classification so this code path shouldn't run,
            // but ignore defensively.
            if (cls === 'stale-visual') return
            // §4.3 bounded-retry-window: when the entry crosses the threshold
            // (expired-window), the tray's "start new add anyway" affordance
            // mints a fresh msgId — the user has accepted dup risk.
            if (cls === 'expired-window') {
              const newMsgId = randomUUID()
              addPending(newMsgId, entry.videoId, entry.prePitch, currentEpoch, entry.title)
              conn.send({ type: 'queue.add', msgId: newMsgId, videoId: entry.videoId, prePitch: entry.prePitch })
              return
            }
            // queueing / retry: same-msgId retry (server dedup short-circuits
            // if the original was already processed).
            conn.send({ type: 'queue.add', msgId, videoId: entry.videoId, prePitch: entry.prePitch })
          }}
        />
      )}
      {/* All three tab bodies stay mounted across tab switches; only the
          visible one is unhidden. Without this, switching away from Search/Paste
          mid-flight unmounts the tab and tears down its per-msgId ack listener,
          making the §4.3 off-tab "Added — N in queue" toast impossible.
          The takeover lives INSIDE the queue tab branch per §4.5 ("Queue tab is
          replaced entirely by the takeover; other tabs still navigable"). */}
      <main aria-label={tab === 'queue' ? 'Queue' : tab === 'search' ? 'Search' : 'Paste'}>
        <div hidden={tab !== 'queue'}>
          {showTakeoverInQueueTab ? (
            <YoureUpView
              conn={conn}
              player={player!}
              sourceConnected={sourceConnected}
              sourceReady={sourceReady}
            />
          ) : (
            <QueueView
              conn={conn}
              sessionId={sessionId}
              sourceConnected={sourceConnected}
              sourceReady={sourceReady}
            />
          )}
        </div>
        <div hidden={tab !== 'search'}>
          <SearchTab
            conn={conn}
            currentEpoch={currentEpoch}
            isActive={tab === 'search'}
            queueLen={queueLen}
            onAddedSwitchToQueue={onAddedSwitchToQueue}
          />
        </div>
        <div hidden={tab !== 'paste'}>
          <PasteTab
            conn={conn}
            currentEpoch={currentEpoch}
            isActive={tab === 'paste'}
            queueLen={queueLen}
          />
        </div>
      </main>
    </div>
  )
}
```

**Caveat for the implementer:** `state.sourceConnected` / `state.sourceReady` are present on `ServerState` per the base spec. Verify by `grep "sourceConnected" src/lib/types/state.ts` — if absent, this task additionally surfaces those flags through `Store.snapshot()`. The base spec mandates them in the state shape; if they're missing in the current code, add them with `boolean` types matching the existing `sourceReady` semantics before the rewrite compiles.

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

Replaces Task 10's scaffolded body with the final composition.
Mounts Tabs / OfflineBanner / PendingAddsTray as the chrome stack
and renders all three tab bodies (visible one unhidden) with the
takeover swapped in inside the queue tab branch. Owns the
--top-occluder-height measurement and flips data-takeover-mounted
for the §5.4 safe-area-inset-bottom owner. Outbound mutating sends
are wrapped so pendingAdds advances mutationsSentSince.
Implements the §5.4 visualViewport keyboard-scroll hook.

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

- [ ] **Step 3: Commit any inline fixes from this review**

If the review found gaps and you made code edits, list the actually-modified files with `git status --short`, stage them by exact path (avoid `git add -p`; it's interactive and not scriptable), then commit. The commit body should be one bullet per fix — each bullet names the file path and the concrete change, not a placeholder section reference. Pattern:

```bash
git status --short
# Read the output, then stage explicitly. Do not use git add -A or git add .
# unless every untracked/modified file is intentional.
git add <each modified path>
git commit -m "fix(ui): close gaps from final review

- <component path>: <one-sentence on the concrete fix>
- <component path>: <one-sentence on the concrete fix>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If the review found zero issues, skip this step entirely — there is nothing to commit.

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

- **Spec coverage**: every §3, §4, §5 subsection is mapped to a task (verified during plan authoring).
- **TokenEntry removal**: commit `52e037a` already removed it; Task 1 is a no-op verification step (no spec edits — the spec's stale TokenEntry references are flagged but left in place). Task 11's `/source` rewrite skips the TokenEntry branch.
- **Server protocol**: untouched per §7 of the redesign spec.
- **Phase-2 drag**: deferred per §4.5 — buttons satisfy criterion #15 in Task 25.
- **Test cadence**: TDD where it pays (marquee math, occluder hook, pendingAdds reducer, KeyStepper clamp); visual rendering verified in browser.
- **Commit cadence**: one commit per task, conventional prefixes, co-author trailer.


