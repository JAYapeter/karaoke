import { describe, it, expect } from 'vitest'
import { clampPitch, atPitchFloor, atPitchCeil } from '@/components/phone/KeyStepper'

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

describe('atPitchFloor', () => {
  it('is true at or below the minimum, false above it', () => {
    expect(atPitchFloor(-6)).toBe(true)
    expect(atPitchFloor(-7)).toBe(true)
    expect(atPitchFloor(-5)).toBe(false)
    expect(atPitchFloor(0)).toBe(false)
    expect(atPitchFloor(6)).toBe(false)
  })
})

describe('atPitchCeil', () => {
  it('is true at or above the maximum, false below it', () => {
    expect(atPitchCeil(6)).toBe(true)
    expect(atPitchCeil(7)).toBe(true)
    expect(atPitchCeil(5)).toBe(false)
    expect(atPitchCeil(0)).toBe(false)
    expect(atPitchCeil(-6)).toBe(false)
  })
})
