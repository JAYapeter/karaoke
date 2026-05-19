'use client'
import { forwardRef, useCallback, useEffect, useState } from 'react'

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
  // useCallback so the ref attaches once per element (not per render).
  // Without this, every parent re-render would generate a new callback ref,
  // causing React to detach + reattach the ref and bouncing setTarget(null)
  // / setTarget(el) — wasteful and triggers spurious useWriteTabsHeight runs.
  const setRefs = useCallback((el: HTMLElement | null) => {
    setTarget(el)
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }, [ref])

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
        {/* H2: name stays ellipsis-truncated — it shrinks via the parent
            div's minWidth:0 (overflow:hidden + ellipsis here). Deliberately
            NO hard min-width on the span: that could force horizontal
            overflow at ≤320px ("no horizontal scroll on mobile" is a hard
            rule), and the name can't then collapse to absorb it. The actual
            H2 fix is the count pill below — it no longer grows the nav with
            the queue count, so the name has room before it must ellipsize. */}
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
          {/* M2: U+FE0E forces text (monochrome) presentation so iOS/Android
              don't render ⚙ as a color emoji against the riso identity. */}
          {'\u2699\uFE0E'}
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
              aria-label={
                t === 'queue' && typeof queueBadge === 'number' && queueBadge > 0
                  ? `Queue — ${queueBadge} queued`
                  : undefined
              }
              className="hit-target uc"
              style={{
                padding: '8px 12px',
                fontSize: 12,
                background: active ? 'var(--hanko-red)' : 'transparent',
                color: 'var(--paper-cream)',
                border: '1px solid transparent',
              }}
            >
              {/* H2: count is a fixed-width on-brand pill, not part of the
                  label string — so the badge growing during a party no
                  longer bloats the nav and squeezes the name. The button's
                  aria-label carries the count for SR; the pill is decorative
                  (aria-hidden). Cream/ink reads on both the active
                  (hanko-red) and inactive tab surfaces. */}
              {t.toUpperCase()}
              {t === 'queue' && typeof queueBadge === 'number' && queueBadge > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    marginLeft: 6,
                    padding: '0 5px',
                    background: 'var(--paper-cream)',
                    color: 'var(--ink-black)',
                    fontSize: 10,
                    fontWeight: 700,
                    // letter-spacing is inherited: the parent .uc button sets
                    // 0.2em, which would track the digits apart. Reset to 0.
                    letterSpacing: 0,
                    borderRadius: 2,
                    lineHeight: 1.5,
                  }}
                >
                  {queueBadge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </header>
  )
})
