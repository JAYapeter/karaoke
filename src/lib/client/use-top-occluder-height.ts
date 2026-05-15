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
