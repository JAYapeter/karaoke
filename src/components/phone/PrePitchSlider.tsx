'use client'
export const PrePitchSlider = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
  <div style={{ marginTop: 8 }}>
    <div className="uc" style={{ fontSize: 9, color: 'var(--ink-muted)' }}>
      key {value > 0 ? `+${value}` : value}
    </div>
    <input
      type="range" min={-6} max={6} step={1} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: '100%' }}
    />
  </div>
)
