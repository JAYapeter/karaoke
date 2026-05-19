// M1 — the decorative ▌ block-prefix is part of the riso visual identity but
// carries no meaning. In live regions (OfflineBanner, the YOU'RE UP/offline
// sub-header) screen readers would otherwise announce "left one quarter block
// …". Render it aria-hidden, trailing space included so call sites stay
// `<Tick />text` with identical spacing to the old `▌ text` literal.
export const Tick = () => <span aria-hidden="true">▌ </span>
