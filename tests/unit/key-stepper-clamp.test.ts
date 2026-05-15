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
