import type { OutboxEntry, OutboxStore } from './outboxStore'

// 오프라인 쓰기 큐 매니저(D2). 유실 0 보장:
//  - 성공(ok): 큐에서 제거.
//  - 충돌(conflict): 제거 + 보고(무음 덮어쓰기 아님 — 사용자에게 표시).
//  - 네트워크 오류(executor throw): 중단하고 나머지는 큐에 남겨 재연결 시 재시도.
// store에 의존성 주입 → 메모리 store로 결정론 테스트 가능.

export type FlushOutcome = 'ok' | 'conflict'
export type OutboxExecutor = (entry: OutboxEntry) => Promise<FlushOutcome>
export type FlushResult = {
  done: number
  conflicts: OutboxEntry[]
  remaining: number
  stoppedEarly: boolean // 네트워크 오류로 중단됨(아직 오프라인)
}

export class OfflineQueue {
  private store: OutboxStore
  private now: () => number
  private genId: () => string

  constructor(store: OutboxStore, opts: { now?: () => number; genId?: () => string } = {}) {
    this.store = store
    this.now = opts.now ?? (() => Date.now())
    this.genId = opts.genId ?? (() => globalThis.crypto.randomUUID())
  }

  async enqueue(kind: string, payload: unknown, dedupeKey?: string): Promise<OutboxEntry> {
    // 같은 dedupeKey(예: 'wish.setPriority:<wishId>')의 기존 엔트리를 제거하고 최신 의도만 유지.
    // 오프라인 중엔 서버 version이 안 바뀌므로, 마지막 값 + 동일 expectedVersion으로 한 번에 적용된다(유실 0).
    if (dedupeKey) {
      const existing = await this.store.getAll()
      for (const e of existing) {
        if (e.dedupeKey === dedupeKey) await this.store.remove(e.id)
      }
    }
    const entry: OutboxEntry = { id: this.genId(), kind, payload, createdAt: this.now(), ...(dedupeKey ? { dedupeKey } : {}) }
    await this.store.add(entry)
    return entry
  }

  async pending(): Promise<number> {
    return (await this.store.getAll()).length
  }

  /** 큐를 createdAt 오름차순으로 재생. 유실 0(위 규칙). */
  async flush(executor: OutboxExecutor): Promise<FlushResult> {
    const entries = (await this.store.getAll()).sort((a, b) => a.createdAt - b.createdAt)
    let done = 0
    const conflicts: OutboxEntry[] = []
    let stoppedEarly = false

    for (const entry of entries) {
      let outcome: FlushOutcome
      try {
        outcome = await executor(entry)
      } catch {
        stoppedEarly = true // 아직 네트워크 불가 → 나머지 잔류(재시도). 절대 버리지 않음.
        break
      }
      if (outcome === 'ok') {
        await this.store.remove(entry.id)
        done++
      } else {
        await this.store.remove(entry.id)
        conflicts.push(entry) // 충돌도 제거하되 보고 → 무음 덮어쓰기 방지
      }
    }

    const remaining = (await this.store.getAll()).length
    return { done, conflicts, remaining, stoppedEarly }
  }
}
