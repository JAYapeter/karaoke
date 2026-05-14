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
