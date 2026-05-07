export class Dedup {
  private map = new Map<string, string[]>() // sessionId → recent msgIds (oldest first)

  constructor(private readonly capacity: number) {}

  /** Records (sessionId, msgId). Returns true if it was already seen. */
  seen(sessionId: string, msgId: string): boolean {
    const list = this.map.get(sessionId) ?? []
    if (list.includes(msgId)) return true
    list.push(msgId)
    if (list.length > this.capacity) list.shift()
    this.map.set(sessionId, list)
    return false
  }

  forget(sessionId: string) {
    this.map.delete(sessionId)
  }
}
