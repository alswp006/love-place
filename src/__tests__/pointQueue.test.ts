import { describe, it, expect, vi } from 'vitest'
import { createMemoryStore } from '@/state/outboxStore'
import { enqueuePoint, pendingPoints, flush } from '@/lib/journey/pointQueue'
import type { PendingPoint } from '@/lib/journey/types'

function pt(id: string, t: string): PendingPoint {
  return { client_point_id: id, recorded_at: t, lat: 37.5, lng: 127.0 }
}

describe('pointQueue — 오프라인 점 큐(유실 0·중복 0)', () => {
  it('enqueue → pendingPoints 반환(시간순)', async () => {
    const s = createMemoryStore()
    await enqueuePoint(s, 'sess', pt('b', '2026-06-01T10:01:00Z'))
    await enqueuePoint(s, 'sess', pt('a', '2026-06-01T10:00:00Z'))
    const pend = await pendingPoints(s, 'sess')
    expect(pend.map((p) => p.client_point_id)).toEqual(['a', 'b'])
  })

  it('같은 client_point_id는 멱등(중복 enqueue 1건)', async () => {
    const s = createMemoryStore()
    expect(await enqueuePoint(s, 'sess', pt('a', '2026-06-01T10:00:00Z'))).toBe(true)
    expect(await enqueuePoint(s, 'sess', pt('a', '2026-06-01T10:00:00Z'))).toBe(false)
    expect(await pendingPoints(s, 'sess')).toHaveLength(1)
  })

  it('세션별 격리', async () => {
    const s = createMemoryStore()
    await enqueuePoint(s, 'A', pt('a', '2026-06-01T10:00:00Z'))
    await enqueuePoint(s, 'B', pt('b', '2026-06-01T10:00:00Z'))
    expect(await pendingPoints(s, 'A')).toHaveLength(1)
    expect(await pendingPoints(s, 'B')).toHaveLength(1)
  })

  it('flush 성공 → 큐에서 제거', async () => {
    const s = createMemoryStore()
    await enqueuePoint(s, 'sess', pt('a', '2026-06-01T10:00:00Z'))
    await enqueuePoint(s, 'sess', pt('b', '2026-06-01T10:01:00Z'))
    const sender = vi.fn(async (_sid: string, pts: PendingPoint[]) => pts.length)
    const n = await flush(s, 'sess', sender)
    expect(n).toBe(2)
    expect(sender).toHaveBeenCalledOnce()
    expect(await pendingPoints(s, 'sess')).toHaveLength(0)
  })

  it('flush 실패(throw) → 점 보존(유실 0)', async () => {
    const s = createMemoryStore()
    await enqueuePoint(s, 'sess', pt('a', '2026-06-01T10:00:00Z'))
    await enqueuePoint(s, 'sess', pt('b', '2026-06-01T10:01:00Z'))
    const sender = vi.fn(async () => {
      throw new Error('network')
    })
    await expect(flush(s, 'sess', sender)).rejects.toThrow('network')
    expect(await pendingPoints(s, 'sess')).toHaveLength(2)
  })

  it('빈 큐 flush는 sender 미호출·0 반환', async () => {
    const s = createMemoryStore()
    const sender = vi.fn(async () => 0)
    expect(await flush(s, 'sess', sender)).toBe(0)
    expect(sender).not.toHaveBeenCalled()
  })
})
