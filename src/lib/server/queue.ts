import type { QueueItem } from '@/lib/types/state'

export const addItem = (queue: readonly QueueItem[], item: QueueItem): QueueItem[] => [
  ...queue,
  item,
]

export const removeItem = (queue: readonly QueueItem[], itemId: string): QueueItem[] =>
  queue.filter((q) => q.id !== itemId)

export const moveItem = (
  queue: readonly QueueItem[],
  itemId: string,
  toIndex: number,
): QueueItem[] => {
  const fromIndex = queue.findIndex((q) => q.id === itemId)
  if (fromIndex < 0) return [...queue]
  const next = [...queue]
  const [moved] = next.splice(fromIndex, 1)
  if (!moved) return [...queue]
  const dest = Math.max(0, Math.min(next.length, toIndex))
  next.splice(dest, 0, moved)
  return next
}

export const shuffleQueue = (
  queue: readonly QueueItem[],
  rng: () => number = Math.random,
): QueueItem[] => {
  const out = [...queue]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const a = out[i]!
    const b = out[j]!
    out[i] = b
    out[j] = a
  }
  return out
}
