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
