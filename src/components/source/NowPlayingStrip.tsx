'use client'
import { randomUUID } from '@/lib/client/uuid'
import type { Connection } from '@/lib/client/ws'
import type { PlayerState } from '@/lib/types/state'
import { MarqueeText } from '@/components/shared/MarqueeText'

const fmtMmSs = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
const fmtKey = (p: number) => (p >= 0 ? `+${p}` : String(p))

export const NowPlayingStrip = ({ conn, player }: { conn: Connection; player: Exclude<PlayerState, { status: 'idle' }> }) => {
  const setLive = (sem: number) =>
    conn.send({ type: 'player.setLivePitch', msgId: randomUUID(), semitones: sem })
  const skip = () => conn.send({ type: 'player.skip', msgId: randomUUID(), epoch: player.epoch })
  const prev = () => conn.send({ type: 'player.prev', msgId: randomUUID(), epoch: player.epoch })
  const togglePause = () =>
    conn.send({ type: player.status === 'paused' ? 'player.play' : 'player.pause', msgId: randomUUID() })

  const subline = `${player.item.queuedBy.name} · KEY ${fmtKey(player.livePitch)} · ${fmtMmSs(player.positionSec)} / ${fmtMmSs(player.item.durationSec)}`

  return (
    <div
      className="now-playing-strip paper-card paper-grain"
      // padding / display / align-items / gap are owned by the
      // .now-playing-strip class (riso.css). Desktop default is
      // flex+center+gap 12; the @media (max-width: 720px) block flips it
      // to column with gap 6 per §5.6, and `padding` follows the same
      // pattern (desktop 8px 12px, phone 8px 10px). Adding ANY of those
      // properties inline would clobber the mobile/narrow-phone overrides.
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
    >
      <div className="now-playing-strip__text" style={{ flex: '1 1 auto', minWidth: 0 }}>
        <MarqueeText text={player.item.title} className="now-playing-strip__title" />
        <div className="uc" style={{ fontSize: 12, color: 'var(--ink-muted)', letterSpacing: '0.15em' }}>{subline}</div>
      </div>
      {/* display / align-items / gap owned by .now-playing-strip__controls
          in riso.css — desktop + phone keep flex+center+gap 8; narrow-phone
          (≤390px) flips to column+stretch. No inline overrides here. */}
      <div className="now-playing-strip__controls">
        <div className="now-playing-strip__pitch" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="hit-target uc" aria-label="Lower pitch by one semitone" onClick={() => setLive(player.livePitch - 1)} style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}>−</button>
          <span className="hanko" aria-live="polite" style={{ minWidth: '2.4em', textAlign: 'center' }}>{fmtKey(player.livePitch)}</span>
          <button type="button" className="hit-target uc" aria-label="Raise pitch by one semitone" onClick={() => setLive(player.livePitch + 1)} style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}>+</button>
        </div>
        <div className="now-playing-strip__transport" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="hit-target uc" aria-label="Previous song" onClick={prev} style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}>⏮</button>
          <button type="button" className="hit-target uc" aria-label={player.status === 'paused' ? 'Play' : 'Pause'} onClick={togglePause} style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}>{player.status === 'paused' ? '▶' : '⏸'}</button>
          <button type="button" className="hit-target uc" aria-label="Skip" onClick={skip} style={{ background: 'transparent', color: 'var(--ink-black)', fontSize: 14 }}>⏭</button>
        </div>
      </div>
    </div>
  )
}
