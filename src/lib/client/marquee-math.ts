// §5.3: marquee scroll speed = 30 px/s; pause = 1.5 s at each end.
const SPEED_PX_PER_SEC = 30
const PAUSE_TOTAL_SEC = 3.0
// Sub-pixel jitter (browser font-metric drift) can falsely flip overflow at the
// wrap threshold. 1 CSS px is a comfortable floor — typical jitter is <0.5px.
const OVERFLOW_TOLERANCE_PX = 1

export const computeMarqueeDuration = (overflowPx: number): number =>
  Math.max(0, overflowPx) / SPEED_PX_PER_SEC + PAUSE_TOTAL_SEC

export const shouldMarquee = (scrollWidth: number, clientWidth: number): boolean =>
  scrollWidth - clientWidth > OVERFLOW_TOLERANCE_PX
