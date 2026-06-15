import { describe, it, expect } from 'vitest'
import { OfflineQueue } from '@/state/offlineQueue'
import { createMemoryStore, type OutboxEntry } from '@/state/outboxStore'

// 결정론 시계/ID 주입.
function makeQueue() {
  let t = 0
  let n = 0
  const store = createMemoryStore()
  const queue = new OfflineQueue(store, { now: () => ++t, genId: () => `id${++n}` })
  return { queue, store }
}

describe('OfflineQueue (D2 — 유실 0)', () => {
  it('enqueue가 대기 건수를 늘린다', async () => {
    const { queue } = makeQueue()
    expect(await queue.pending()).toBe(0)
    await queue.enqueue('place.save', { a: 1 })
    await queue.enqueue('place.save', { a: 2 })
    expect(await queue.pending()).toBe(2)
  })

  it('flush 전원 성공 → 전부 제거, done=N', async () => {
    const { queue } = makeQueue()
    await queue.enqueue('a', {})
    await queue.enqueue('b', {})
    const res = await queue.flush(async () => 'ok')
    expect(res.done).toBe(2)
    expect(res.remaining).toBe(0)
    expect(await queue.pending()).toBe(0)
  })

  it('createdAt 오름차순으로 재생한다', async () => {
    const { queue } = makeQueue()
    await queue.enqueue('first', {})
    await queue.enqueue('second', {})
    await queue.enqueue('third', {})
    const seen: string[] = []
    await queue.flush(async (e) => {
      seen.push(e.kind)
      return 'ok'
    })
    expect(seen).toEqual(['first', 'second', 'third'])
  })

  it('네트워크 오류(throw) 시 중단하고 나머지는 큐에 남긴다 (유실 0)', async () => {
    const { queue } = makeQueue()
    await queue.enqueue('a', {})
    await queue.enqueue('b', {})
    await queue.enqueue('c', {})
    let calls = 0
    const res = await queue.flush(async () => {
      calls++
      if (calls === 2) throw new Error('offline')
      return 'ok'
    })
    expect(res.done).toBe(1) // 첫 건만 성공
    expect(res.stoppedEarly).toBe(true)
    expect(res.remaining).toBe(2) // b, c는 버려지지 않고 잔류 → 재연결 시 재시도
    expect(await queue.pending()).toBe(2)
  })

  it('충돌(conflict)은 제거하되 보고한다 (무음 덮어쓰기 아님)', async () => {
    const { queue } = makeQueue()
    await queue.enqueue('a', { v: 1 })
    await queue.enqueue('b', { v: 2 })
    const res = await queue.flush(async (e) => ((e.payload as { v: number }).v === 1 ? 'conflict' : 'ok'))
    expect(res.done).toBe(1)
    expect(res.conflicts).toHaveLength(1)
    expect(res.remaining).toBe(0)
  })

  it('동일 dedupeKey 재편집은 coalesce — 최신 의도만 유지 (유실 0)', async () => {
    const { queue } = makeQueue()
    await queue.enqueue('wish.setPriority', { priority: 1 }, 'wish.setPriority:w1')
    await queue.enqueue('wish.setPriority', { priority: 2 }, 'wish.setPriority:w1') // 같은 행 재편집
    await queue.enqueue('wish.setPriority', { priority: 5 }, 'wish.setPriority:w2') // 다른 행
    expect(await queue.pending()).toBe(2) // w1 1개(최신) + w2 1개
    const seen: Array<{ priority: number }> = []
    await queue.flush(async (e) => {
      seen.push(e.payload as { priority: number })
      return 'ok'
    })
    const w1 = seen.find((p) => p.priority === 2 || p.priority === 1)
    expect(w1?.priority).toBe(2) // 첫 편집(1)은 버려지고 최신(2)만 적용 — '충돌'로 유실되지 않음
  })

  it('durability: 같은 store를 쓰는 새 큐 인스턴스가 대기 항목을 본다 (재로드 생존)', async () => {
    const store = createMemoryStore()
    const q1 = new OfflineQueue(store, { genId: () => 'x' })
    await q1.enqueue('place.save', { keep: true })
    const q2 = new OfflineQueue(store)
    expect(await q2.pending()).toBe(1)
    const all: OutboxEntry[] = await store.getAll()
    expect(all[0]?.kind).toBe('place.save')
  })

  // (append) 새 종류(visit/reaction)도 dedupeKey로 마지막 의도만 유지되고 ok면 큐에서 제거된다.
  it('reaction.toggle/visit.add는 dedupeKey로 같은 placeId 중복을 1건으로 접는다', async () => {
    const { OfflineQueue } = await import('@/state/offlineQueue')
    const { createMemoryStore } = await import('@/state/outboxStore')
    const q = new OfflineQueue(createMemoryStore(), { now: () => 1, genId: (() => { let i = 0; return () => `id${i++}` })() })
    await q.enqueue('reaction.toggle', { placeId: 'p1' }, 'reaction.toggle:p1')
    await q.enqueue('reaction.toggle', { placeId: 'p1' }, 'reaction.toggle:p1')
    expect(await q.pending()).toBe(1)
    const res = await q.flush(async () => 'ok')
    expect(res.done).toBe(1)
    expect(res.remaining).toBe(0)
  })
})
