'use client'

const PITCH_MIN = -6
const PITCH_MAX = 6

export const clampPitch = (n: number): number => {
  if (!isFinite(n)) return 0
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(n)))
}

// Boundary predicates: a step in that direction would be clamped to a no-op,
// so the corresponding button is disabled (no dead taps at ±6).
export const atPitchFloor = (n: number): boolean => n <= PITCH_MIN
export const atPitchCeil = (n: number): boolean => n >= PITCH_MAX

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
  const lowerDisabled = disabled || atPitchFloor(value)
  const raiseDisabled = disabled || atPitchCeil(value)
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        className="hit-target uc btn-disable-dim"
        aria-label="Lower pitch by one semitone"
        onClick={() => bump(-1)}
        disabled={lowerDisabled}
        aria-disabled={lowerDisabled || undefined}
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
        className="hit-target uc btn-disable-dim"
        aria-label="Raise pitch by one semitone"
        onClick={() => bump(1)}
        disabled={raiseDisabled}
        aria-disabled={raiseDisabled || undefined}
        style={{ background: 'transparent', color: 'inherit', fontSize: isLg ? 24 : 14 }}
      >+</button>
    </div>
  )
}
