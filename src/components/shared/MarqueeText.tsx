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
    // Measure the container's scrollWidth, not the inner <span>'s. The span
    // is `display: inline` until overflow flips data-overflow to "1", and
    // `scrollWidth` on inline elements is browser-quirky (frequently returns
    // 0 or the line-box width rather than the rendered content extent). The
    // container is a block-level div with `overflow: hidden`, so its
    // scrollWidth reliably reports the full content width of its nowrap
    // child — exactly what §3.6 says drives the marquee trigger.
    const sw = c.scrollWidth
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
