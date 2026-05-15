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
