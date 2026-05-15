# Source-Page Follow-Up Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patch three usability defects on `/source` from the post-launch walkthrough: QR encodes `localhost`, the right rail truncates setlist titles, and source-page buttons have no hover/cursor/focus affordance.

**Architecture:** All changes are surgical. New plumbing: `serverHost: string | null` on `ServerState`, set once at server boot from `os.networkInterfaces()` (or `KARAOKE_LAN_HOST` env override), broadcast via the existing WS state pipe. Client uses a pure `deriveJoinHost` helper to pick `serverHost` over `window.location.host`. UI: rail widens 160→240 px, setlist row titles wrap in the existing `MarqueeText` component, and a new `.icon-btn` (+ `.icon-btn--on-dark`) CSS utility is applied to every interactive source-page button.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Vitest · existing `ws` server.

**Operating principles:**
- TDD where headless testability adds real value: only the `deriveJoinHost` helper. Everything else is visual or trivially type-checked plumbing.
- The spec is the source of truth (`docs/superpowers/specs/2026-05-12-source-page-follow-up-fixes-design.md`). When a task says "per §X.Y", read that section before coding — every selector, env var name, and contract is normative.
- Surgical edits only. No drive-by refactors. Server protocol untouched. Phone-side untouched.
- Commit after every task. Conventional prefixes (`feat`, `fix`, `style`, `test`, `docs`).
- Every commit MUST include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

## Conventions

- Vitest runs as `npm test -- --run`. Type-check is `npx tsc --noEmit`.
- All paths relative to repo root (`/Users/jonathanyapeter/Documents/Karaoke App`).
- `@/` is the path alias for `src/`.
- When the plan says "open file X line Y", line numbers are guidance — verify against the file before editing.

---

## Phase 1 — LAN IP propagation (Spec §3)

### Task 1: Extract `deriveJoinHost` pure helper with unit tests (TDD)

**Files:**
- Create: `src/lib/client/derive-join-host.ts`
- Create: `tests/unit/derive-join-host.test.ts`

**Context:** Spec §3.3 introduces a derivation rule: prefer `serverHost` (from WS state, populated by server) over `window.location.host` (the page's own host). Treat empty string and nullish as "use fallback". Extract the rule as a pure function for headless test coverage. All later integration depends on this helper, so write it first.

- [ ] **Step 1: Write the failing test**

`tests/unit/derive-join-host.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { deriveJoinHost } from '@/lib/client/derive-join-host'

describe('deriveJoinHost', () => {
  it('returns serverHost when set to a non-empty string', () => {
    expect(deriveJoinHost('10.0.0.22:3000', 'localhost:3000')).toBe('10.0.0.22:3000')
  })

  it('falls back to windowHost when serverHost is null', () => {
    expect(deriveJoinHost(null, 'localhost:3000')).toBe('localhost:3000')
  })

  it('falls back to windowHost when serverHost is undefined', () => {
    expect(deriveJoinHost(undefined, 'localhost:3000')).toBe('localhost:3000')
  })

  it('falls back to windowHost when serverHost is the empty string', () => {
    expect(deriveJoinHost('', 'localhost:3000')).toBe('localhost:3000')
  })

  it('preserves serverHost verbatim including custom DNS hostnames with port', () => {
    expect(deriveJoinHost('shimokita.local:3000', 'localhost:3000')).toBe('shimokita.local:3000')
  })

  it('preserves serverHost verbatim when it lacks a port (custom DNS without port)', () => {
    expect(deriveJoinHost('shimokita.local', 'localhost:3000')).toBe('shimokita.local')
  })
})
```

- [ ] **Step 2: Run test to verify it fails (RED)**

```bash
npx vitest run tests/unit/derive-join-host.test.ts
```

Expected: 6 tests fail with `Cannot find package '@/lib/client/derive-join-host'`.

- [ ] **Step 3: Write the minimal implementation (GREEN)**

`src/lib/client/derive-join-host.ts`:

```ts
/**
 * Pick the host string that the source-page QR / phone-client URL should encode.
 *
 * Spec §3.3: prefer the server-detected LAN host (or KARAOKE_LAN_HOST override)
 * over the browser's own location.host, because the source page is forced to
 * load on http://localhost:3000 (gated by the source-trust guard) — that
 * hostname can't be reached by phones on the LAN. Empty/nullish serverHost
 * means "no LAN host known"; fall back to window.location.host so phone
 * clients (and SSR snapshots) keep working unchanged.
 */
export function deriveJoinHost(
  serverHost: string | null | undefined,
  windowHost: string,
): string {
  if (serverHost && serverHost.length > 0) return serverHost
  return windowHost
}
```

- [ ] **Step 4: Run test to verify it passes (GREEN)**

```bash
npx vitest run tests/unit/derive-join-host.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Run full type-check and full test suite**

```bash
npx tsc --noEmit
npm test -- --run
```

Expected: tsc clean; total test count = 102 + 6 = 107 (or whatever the prior baseline was, +6 new). Tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/client/derive-join-host.ts tests/unit/derive-join-host.test.ts
git commit -m "$(cat <<'EOF'
feat(client): add deriveJoinHost pure helper for QR URL host selection

Per spec §3.3: prefer server-detected serverHost over window.location.host
so /source's QR encodes the LAN address phones can actually reach.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Server-side `serverHost` plumbing — types, store, server.ts

**Files:**
- Modify: `src/lib/types/state.ts`
- Modify: `src/lib/server/store.ts`
- Modify: `server.ts`

**Context:** Spec §3.3 server steps 1–4. Add `serverHost: string | null` to the `ServerState` shape, expose a setter on the store, and call the setter at server boot using the same logic that produces the boot banner. Allow `KARAOKE_LAN_HOST` to override.

- [ ] **Step 1: Read the existing files first**

```bash
sed -n '1,80p' src/lib/types/state.ts
sed -n '1,120p' src/lib/server/store.ts
sed -n '1,80p' server.ts
```

Note the current shape of `ServerState`, the store's mutator pattern (e.g. `setSourceConnected(boolean)`), and where the boot banner formats its host string in `server.ts` (search for `os.networkInterfaces` or for the `Karaoke server running` log line). You'll match those patterns.

- [ ] **Step 2: Add `serverHost` to the `ServerState` type**

In `src/lib/types/state.ts`, add a field to `ServerState`:

```ts
serverHost: string | null
```

It MUST be required (not optional with `?`) because exactOptionalPropertyTypes is on. Default value lives in the store.

- [ ] **Step 3: Initialize `serverHost: null` in the store's initial state and add the setter**

In `src/lib/server/store.ts`:

1. In the function that builds the initial `ServerState` (look for an `initialState` const or `createStore` factory), add `serverHost: null` alongside the other fields.
2. Add a setter that mirrors the existing pattern for other top-level fields (e.g. `setSourceConnected`):

```ts
setServerHost(host: string | null): void {
  state.serverHost = host
  emit()
}
```

(Match the precise calling convention of the existing setters — if they don't return void explicitly, mirror that.)

- [ ] **Step 4: In `server.ts`, resolve the LAN host and call `setServerHost` at boot**

After the server's port is known but BEFORE `wss.on('connection', ...)` registration, add:

```ts
const overrideHost = process.env.KARAOKE_LAN_HOST?.trim()
const lanHost = overrideHost && overrideHost.length > 0
  ? overrideHost
  : (() => {
      // Reuse the same selection logic the boot banner uses.
      const ip = pickLanIp() // existing helper or inline call to os.networkInterfaces() — match the banner's source
      return ip ? `${ip}:${PORT}` : null
    })()
store.setServerHost(lanHost)
```

(`pickLanIp` is shorthand for whatever the file already calls to derive the boot-banner IP. If the file inlines the logic in the banner string, factor out a small local helper or duplicate the call inline — keep it minimal.)

If the boot banner uses an IPv4 address with a port suffix already, mirror that exact format. Do NOT introduce a new selection heuristic.

- [ ] **Step 5: Type-check and tests**

```bash
npx tsc --noEmit
npm test -- --run
```

Expected: tsc clean. Test count unchanged from Task 1 (no new tests in this task).

- [ ] **Step 6: Smoke-test the banner**

Restart the dev server briefly to verify nothing regressed at boot:

```bash
# In a separate shell, or kill any existing dev server first.
KARAOKE_LAN_HOST=test.local:9999 npm run dev &
sleep 3
# Server should still print its banner and accept WS connections.
# Stop it: pkill -f 'tsx server.ts'
```

This is a smoke check; full QR verification happens in Task 3 + Task 8.

- [ ] **Step 7: Commit**

```bash
git add src/lib/types/state.ts src/lib/server/store.ts server.ts
git commit -m "$(cat <<'EOF'
feat(server): broadcast serverHost via state for source-page QR

Adds ServerState.serverHost (string | null), set at boot from the same
LAN-IP picker that produces the banner, with KARAOKE_LAN_HOST env override.
Lets /source's QR encode the address phones can actually reach.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire `deriveJoinHost` into `QrPanel` and thread `serverHost` from parent

**Files:**
- Modify: `src/components/source/QrPanel.tsx`
- Modify: `src/components/source/QueueOverlay.tsx`
- Modify: `src/components/phone/JoinUrlModal.tsx` (only if it independently composes a join URL — verify first)

**Context:** Spec §3.3 client steps 5–7. `QrPanel` should consume `serverHost` from props (NOT from a context lookup — keep it simple and decoupled from the WS layer). The parent (`QueueOverlay`) threads `conn.state?.serverHost ?? null`. Same for `JoinUrlModal` if it composes a URL itself.

- [ ] **Step 1: Read the current files**

```bash
sed -n '1,80p' src/components/source/QrPanel.tsx
sed -n '1,80p' src/components/source/QueueOverlay.tsx
sed -n '1,80p' src/components/phone/JoinUrlModal.tsx
```

Identify:
- `QrPanel`'s current `useJoinUrl` hook (likely lines ~14–18) that reads `window.location.host`.
- `QrPanel`'s prop signature.
- `QueueOverlay`'s mounting of `<QrPanel ... />` in both `variant="full"` and `variant="chip"` paths.
- Whether `JoinUrlModal` independently calls `useJoinUrl` or receives a `url` prop. If it has its own URL derivation, it needs the same fix.

- [ ] **Step 2: Update `QrPanel` props and `useJoinUrl`**

In `src/components/source/QrPanel.tsx`:

1. Import the new helper:
   ```ts
   import { deriveJoinHost } from '@/lib/client/derive-join-host'
   ```
2. Add `serverHost` to the props interface (alongside `variant` and any existing props):
   ```ts
   serverHost: string | null
   ```
3. Pass `serverHost` into `useJoinUrl`:
   ```ts
   const useJoinUrl = (serverHost: string | null) => {
     const [url, setUrl] = useState('')
     useEffect(() => {
       const host = deriveJoinHost(serverHost, window.location.host)
       setUrl(`${window.location.protocol}//${host}/`)
     }, [serverHost])
     return url
   }
   ```
   The dependency `[serverHost]` makes the QR re-encode automatically when `serverHost` arrives via WS.
4. In the component body, call `const url = useJoinUrl(serverHost)`.

- [ ] **Step 3: Update `QueueOverlay` to thread `serverHost`**

In `src/components/source/QueueOverlay.tsx`, find every `<QrPanel ... />` mount (full + chip variants) and add the prop:

```tsx
<QrPanel variant="full" serverHost={conn.state?.serverHost ?? null} />
<QrPanel variant="chip" onOpenJoinModal={...} serverHost={conn.state?.serverHost ?? null} />
```

(Do not touch any other prop. Use the chip variant's existing prop list as the template.)

- [ ] **Step 4: Verify and update `JoinUrlModal` if it composes its own URL**

If `JoinUrlModal.tsx` has its own `window.location.host` reference (search the file), apply the same pattern:
1. Add `serverHost: string | null` prop.
2. Use `deriveJoinHost(serverHost, window.location.host)` to compose the URL.
3. Update the call site in `QueueOverlay.tsx` (or wherever the modal is mounted) to thread `serverHost`.

If `JoinUrlModal` instead receives a fully-composed URL prop from `QrPanel`/`QueueOverlay`, no changes needed.

- [ ] **Step 5: Type-check and tests**

```bash
npx tsc --noEmit
npm test -- --run
```

Expected: tsc clean. Test count unchanged from Task 2.

- [ ] **Step 6: Manual smoke-test**

```bash
npm run dev
```

Open `http://localhost:3000/source` in a browser. Inspect the QR panel: the URL line under the QR should now read `10.0.0.22:3000/` (or whatever IP the server detected) instead of `localhost:3000/`. Scan the QR with a phone — phone client should load.

If `KARAOKE_LAN_HOST=foo.local:3000 npm run dev` is run, the URL line should read `foo.local:3000/`.

Stop the dev server before continuing.

- [ ] **Step 7: Commit**

```bash
git add src/components/source/QrPanel.tsx src/components/source/QueueOverlay.tsx
# Only add JoinUrlModal.tsx if it was modified in Step 4:
git add src/components/phone/JoinUrlModal.tsx 2>/dev/null || true
git commit -m "$(cat <<'EOF'
fix(source): QR encodes LAN host via deriveJoinHost(serverHost, location.host)

Per spec §3.3 — phones can now scan the source-page QR and reach the LAN
address. Falls back to window.location.host when serverHost is unset
(phone clients, SSR snapshots, sub-LAN testing).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Document `KARAOKE_LAN_HOST` in README

**Files:**
- Modify: `README.md`

**Context:** Spec §3.3 mentions the env override; document it so future users know it exists.

- [ ] **Step 1: Read the existing README**

```bash
sed -n '1,80p' README.md
```

Identify a sensible location to add the env-vars section (likely near a "Configuration" or "Running" section, or at the end if no such section exists).

- [ ] **Step 2: Add the env var documentation**

Append (or insert into the appropriate section) the following block:

```markdown
## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `KARAOKE_LAN_HOST` | (auto-detected from `os.networkInterfaces()`) | Override the host string the source-page QR encodes for phones to scan. Useful when the server is multi-homed (Wi-Fi + Ethernet + VPN) or reached via a custom DNS hostname (e.g. `shimokita.local:3000`). Set to `"<host-or-ip>:<port>"`. When unset, the server picks the same address it prints in the boot banner. When the auto-detection finds nothing (loopback only), the source page falls back to `window.location.host`. |
```

If a `## Environment variables` section already exists, just add the row.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs(readme): document KARAOKE_LAN_HOST env override

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Rail width + setlist marquee (Spec §4)

### Task 5: Widen `.source-root` rail to 240 px

**Files:**
- Modify: `src/styles/riso.css`

**Context:** Spec §4.3 — change the desktop grid template from `1fr 160px` to `1fr 240px`. The mobile collapse rule (≤720 px → single column) is unchanged. Also verify `.setlist-row__title` has `flex: 1 1 auto; min-width: 0` so the upcoming MarqueeText (Task 6) gets a finite container width.

- [ ] **Step 1: Read the existing rules**

```bash
grep -n "source-root\|setlist-row__title" src/styles/riso.css
```

Locate the existing `.source-root { grid-template-columns: 1fr 160px; ... }` rule (likely around line 216) and the `.setlist-row__title` rule if present.

- [ ] **Step 2: Edit `.source-root`**

Find the rule (search for `grid-template-columns: 1fr 160px`) and change `160px` to `240px`. Do not touch any other property of `.source-root` (gap, padding, etc.).

- [ ] **Step 3: Verify `.setlist-row__title` flex contract**

If `.setlist-row__title` exists and already declares `flex: 1 1 auto; min-width: 0`, no change. If it exists but lacks one or both, add them. If the rule does NOT exist at all, add a new rule near the existing setlist selectors:

```css
.setlist-row__title {
  flex: 1 1 auto;
  min-width: 0;
}
```

(MarqueeText needs a finite container width to compare against; without `min-width: 0`, a flex child can never shrink below its intrinsic content size, which defeats overflow detection.)

- [ ] **Step 4: Type-check, tests, and visual smoke**

```bash
npx tsc --noEmit
npm test -- --run
```

Expected: tsc clean. Test count unchanged.

Run the dev server and open `http://localhost:3000/source`. The right rail should now be visibly wider; titles in the setlist still ellipsize (Task 6 fixes that). Mobile narrow-window check: resize the window to <720 px wide; the rail should collapse below the video as before.

- [ ] **Step 5: Commit**

```bash
git add src/styles/riso.css
git commit -m "$(cat <<'EOF'
style(source): widen rail 160px → 240px so setlist titles have room

Per spec §4.3. Video frame stays cinematic (~5% narrower); rail gets
+50% horizontal space. Mobile collapse rule unchanged. Sets the stage
for Task 6's MarqueeText on row titles.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Wrap setlist row titles in `MarqueeText`

**Files:**
- Modify: `src/components/source/SetlistPanel.tsx`

**Context:** Spec §4.3 — replace the row title `<span>` with the existing `<MarqueeText text={...} />` component (`src/components/shared/MarqueeText.tsx`). MarqueeText auto-detects overflow and animates only when needed; it already handles `prefers-reduced-motion` and `document.fonts.ready`.

- [ ] **Step 1: Read the existing files**

```bash
sed -n '1,40p' src/components/shared/MarqueeText.tsx
grep -n "title\|MarqueeText" src/components/source/SetlistPanel.tsx
```

Confirm the `MarqueeText` prop signature (likely `{ text: string; className?: string; title?: string }`). Locate the row title in `SetlistPanel.tsx` (search for the row's title `<span>` — likely around lines 130–140, alongside the `02` index and the ⤴/× action buttons).

- [ ] **Step 2: Add the MarqueeText import**

In `src/components/source/SetlistPanel.tsx`, add:

```ts
import { MarqueeText } from '@/components/shared/MarqueeText'
```

(Match the existing import style — relative or `@/` alias — used elsewhere in this file.)

- [ ] **Step 3: Replace the row title `<span>` with `<MarqueeText>`**

Find the existing title rendering. It will look roughly like:

```tsx
<span className="setlist-row__title" style={{ ... }}>{title}</span>
```

Replace with:

```tsx
<MarqueeText
  text={title}
  className="setlist-row__title"
/>
```

Drop any inline `style` that was setting `text-overflow: ellipsis`, `overflow: hidden`, `white-space: nowrap` — MarqueeText owns those internally now. Keep any inline style that controls font-size or color via tokens — those are still the row's responsibility.

(If the existing `<span>` has `font-style: italic` or `font-family: var(--display-font)` declared inline, prefer to move those into the `.setlist-row__title` CSS rule in `riso.css` so MarqueeText's inner `<span>` inherits them. Do this only if the inline styles would otherwise be lost — MarqueeText's outer container forwards `className` but does not forward inline `style`.)

- [ ] **Step 4: Type-check, tests, and visual smoke**

```bash
npx tsc --noEmit
npm test -- --run
```

Expected: tsc clean. Test count unchanged.

Run dev server. Queue 4–8 songs with mixed title lengths (a short one like "Africa - Toto" and a long one like "Rich It All - Bruno Mars (Karaoke Songs With Lyrics - Original Key)"). Confirm: short titles render statically; long titles begin marquee-scrolling at ~30 px/s with a brief pause at each end.

Toggle DevTools' "prefers-reduced-motion: reduce" and reload — long titles should NOT scroll; they ellipsize at the end (the existing MarqueeText reduced-motion override).

- [ ] **Step 5: Commit**

```bash
git add src/components/source/SetlistPanel.tsx src/styles/riso.css
git commit -m "$(cat <<'EOF'
fix(source): marquee long setlist titles via MarqueeText

Per spec §4.3 — short titles render statically; long titles auto-scroll
inside the now-wider rail. Reuses the existing MarqueeText component
(font-load aware, prefers-reduced-motion aware, ResizeObserver-driven).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Only stage `riso.css` if you moved any inline style into a CSS rule in Step 3. Otherwise just `SetlistPanel.tsx`.)

---

## Phase 3 — Universal button affordance (Spec §5)

### Task 7: Add `.icon-btn` and `.icon-btn--on-dark` CSS rules to `riso.css`

**Files:**
- Modify: `src/styles/riso.css`

**Context:** Spec §5.3 — add the new CSS utility class plus its dark-surface modifier. Reuse the existing `tap-flash` keyframe (already declared in riso.css for `.youre-up__btn`).

- [ ] **Step 1: Verify `tap-flash` keyframe exists**

```bash
grep -n "@keyframes tap-flash\|tap-flash" src/styles/riso.css
```

If the keyframe is absent, the spec assumes it exists (it was added in the original redesign). If genuinely missing, BLOCK and report — do not invent a new keyframe; ask the controller for guidance.

- [ ] **Step 2: Add the `.icon-btn` rules**

In `src/styles/riso.css`, add the following block. Place it AFTER the existing `.hit-target` rules and BEFORE any media-query block, so the desktop defaults can be overridden by media queries (none currently target `.icon-btn`, but the placement matches the file's convention):

```css
/* §5 affordance utility — applies to interactive icon-glyph buttons. */
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

- [ ] **Step 3: Type-check and tests**

```bash
npx tsc --noEmit
npm test -- --run
```

Expected: tsc clean. Test count unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/styles/riso.css
git commit -m "$(cat <<'EOF'
style(ui): add .icon-btn affordance utility (cursor + hover tint + tap-flash)

Per spec §5.3. Light tint (.icon-btn) for cream surfaces; cream tint
(.icon-btn--on-dark) for dark surfaces. Reuses the existing tap-flash
keyframe; honors prefers-reduced-motion. Applied to source-page buttons
in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Apply `.icon-btn` (and `--on-dark` modifier) to all source-page buttons

**Files:**
- Modify: `src/components/source/SetlistPanel.tsx`
- Modify: `src/components/source/NowPlayingStrip.tsx`
- Modify: `src/components/source/QrPanel.tsx`

**Context:** Spec §5.3 application table — six button sites, three with `--on-dark`. Apply class names alongside existing classes; do not remove any existing class.

- [ ] **Step 1: SetlistPanel — ⤴ and × per-row buttons (cream surface)**

In `src/components/source/SetlistPanel.tsx`, find the per-row action buttons (around lines 137–138). They currently look like:

```tsx
<button type="button" aria-label="Move to top" onClick={...} className="uc" style={{ ... }}>⤴</button>
<button type="button" aria-label="Remove from queue" onClick={...} className="uc" style={{ ... }}>✕</button>
```

Change `className="uc"` → `className="uc icon-btn"` on both. Do not touch `aria-label`, `onClick`, `type`, or the inline `style`.

- [ ] **Step 2: SetlistPanel — 🔀 shuffle button in header (cream surface)**

In the same file, find the shuffle button in the panel header (search for `aria-label="Shuffle"` or for the `🔀` glyph or for `className="shuffle-btn"`). Add `icon-btn` to its className alongside the existing `shuffle-btn`:

```tsx
className="shuffle-btn icon-btn"
```

(If the existing className was `"shuffle-btn uc"` or has additional tokens, append `icon-btn` to whatever's there.)

- [ ] **Step 3: NowPlayingStrip — pitch − / + and transport ⏮ ⏸/▶ ⏭ buttons (dark surface, video frame)**

In `src/components/source/NowPlayingStrip.tsx`, find the two pitch buttons and the three transport buttons. They currently have `className="hit-target uc"`. Append `icon-btn icon-btn--on-dark`:

```tsx
className="hit-target uc icon-btn icon-btn--on-dark"
```

Apply on all five buttons (− pitch, + pitch, ⏮ prev, ⏸/▶ play-pause, ⏭ skip).

- [ ] **Step 4: QrPanel — chip variant button (dark surface, sits on rail BG)**

In `src/components/source/QrPanel.tsx`, find the chip variant's wrapping `<button>` (only the `variant === 'chip'` branch). It currently has `className="qr-chip hit-target"` (or similar). Append `icon-btn icon-btn--on-dark`:

```tsx
className="qr-chip hit-target icon-btn icon-btn--on-dark"
```

Do NOT add the class to the full variant — that one isn't a button.

- [ ] **Step 5: Type-check and tests**

```bash
npx tsc --noEmit
npm test -- --run
```

Expected: tsc clean. Test count unchanged.

- [ ] **Step 6: Visual smoke-test**

Run dev server. On `http://localhost:3000/source`:

1. Hover each button (move-top ⤴, remove ×, shuffle 🔀, pitch − +, transport ⏮ ⏸ ⏭, QR chip if mobile width). Each shows a subtle background tint (cream tint on dark frame; ink tint on cream panel).
2. Cursor changes to pointer on hover.
3. Click each — brief tap-flash visible.
4. Tab through with keyboard — focus ring visible (already provided by global `:focus-visible` rule).
5. In DevTools, set "prefers-reduced-motion: reduce" and reload. Hover transitions disappear; tap-flash does not run; cursor + focus ring still work.

- [ ] **Step 7: Commit**

```bash
git add src/components/source/SetlistPanel.tsx src/components/source/NowPlayingStrip.tsx src/components/source/QrPanel.tsx
git commit -m "$(cat <<'EOF'
style(source): apply .icon-btn affordance to setlist/transport/pitch/QR-chip

Per spec §5.3 application table. SetlistPanel (cream surface): ⤴ × 🔀
get .icon-btn. NowPlayingStrip + QrPanel chip (dark surface): get
.icon-btn .icon-btn--on-dark. Cursor + hover tint + tap-flash now
visible across every interactive control on /source.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Final verification

### Task 9: Final type-check, test, build, and manual checklist

**Files:** none (verification only)

**Context:** Spec §7 — confirm all gates pass and walk the manual checklist on a real browser.

- [ ] **Step 1: Run all gates**

```bash
npx tsc --noEmit
npm test -- --run
npx next build
```

Expected:
- tsc clean (no output)
- All tests pass; total = baseline + 6 (the new `derive-join-host.test.ts` cases). Baseline before this plan was 101 tests; final should be **107**.
- `next build` succeeds; no new warnings introduced by these changes.

- [ ] **Step 2: Manual walk-through (spec §7)**

Start dev server (`npm run dev`). On the host machine:

| # | Check | Pass criterion |
|---|---|---|
| 1 | Open `http://localhost:3000/source`. Inspect QR. | URL line reads `<LAN-IP>:3000/`, NOT `localhost:3000/` |
| 2 | Open `KARAOKE_LAN_HOST=foo.local:9999 npm run dev`, reload `/source`. | URL line reads `foo.local:9999/` |
| 3 | Tap "▶ Start show", queue 4–8 songs (mix short + long titles). | Setlist renders; rail visibly wider than before; short titles static; long titles marquee-scroll |
| 4 | Hover each interactive button on `/source` (⤴ × 🔀 − + ⏮ ⏸/▶ ⏭). | Cursor → pointer; subtle background tint appears; click → brief tap-flash |
| 5 | Resize source window narrower than 720 px. | Rail collapses below video (mobile fallback intact) |
| 6 | DevTools → Rendering → "prefers-reduced-motion: reduce". Reload. | Marquee text stays static; transitions disappear; tap-flash does not run; cursor + focus ring still work |
| 7 | Scan source-page QR with a phone. | Phone client loads; can sign in and queue |

- [ ] **Step 3: Record outcomes and stop**

If every check passes, the patch is shipped — proceed to the development-finishing skill (or the controller's wrap-up). If any check fails, return to the relevant task and fix inline; do not defer.

```bash
# Stop the dev server when done.
pkill -f 'tsx server.ts' || true
```

---

## Plan self-review

- **Spec coverage:** §3 → Tasks 1–4. §4 → Tasks 5–6. §5 → Tasks 7–8. §6 affected files all touched. §7 verification → Task 9. ✓
- **TDD discipline:** Only Task 1 has headless-testable logic and is TDD'd. Other tasks are CSS / React JSX / type plumbing — verified via type-check and visual smoke.
- **Commit cadence:** One commit per task, conventional prefixes, Co-Authored-By trailer enforced.
- **No placeholders:** every code block is concrete; no "TODO" / "fill in later".
- **Type consistency:** `serverHost: string | null` used identically in `state.ts`, `store.ts`, `server.ts`, `QrPanel`, `QueueOverlay`, `JoinUrlModal`, and `deriveJoinHost`. Helper signature `(serverHost: string | null | undefined, windowHost: string) => string` accommodates both `null` (state default) and `undefined` (an absent field on a transitional WS message).
