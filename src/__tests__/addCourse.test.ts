import { describe, it, expect, vi, beforeEach } from 'vitest'

const upsert = vi.fn()
const insert = vi.fn()
const selectEvents = vi.fn()
// useEventMutations imports `import { supabase } from '@/lib/supabase/client'` — mock THAT exact path.
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'itineraries') {
        return {
          upsert: (...a: unknown[]) => { upsert(...a); return { select: () => ({ single: () => ({ data: { id: 'itin-1' }, error: null }) }) } },
        }
      }
      // events
      return {
        select: () => ({ eq: () => ({ is: () => ({ limit: () => { return selectEvents() } }) }) }),
        insert: (...a: unknown[]) => { insert(...a); return { then: undefined, error: null } },
      }
    },
  },
}))

import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { useEventMutations } from '@/hooks/useEventMutations'

function wrap() {
  const qc = new QueryClient()
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}
const stops = [
  { placeId: 'p1', title: 'A', start: '2026-06-20T01:00:00.000Z', end: '2026-06-20T02:30:00.000Z' },
  { placeId: 'p2', title: 'B', start: '2026-06-20T03:00:00.000Z', end: '2026-06-20T04:30:00.000Z' },
]

beforeEach(() => { upsert.mockClear(); insert.mockClear() })

describe('addCourse idempotency', () => {
  it('created: upserts itinerary with course_key + inserts events', async () => {
    selectEvents.mockResolvedValue({ data: [], error: null })
    const { result } = renderHook(() => useEventMutations('c1', 'u1', () => {}), { wrapper: wrap() })
    // Full payload — dayKeyStr + startMin are REQUIRED by the new mutation type (TS strict won't compile without them).
    const res = await result.current.addCourse.mutateAsync({ stops, dayKeyStr: '2026-06-20', startMin: 600 })
    expect(upsert).toHaveBeenCalledWith(
      // Tightened: assert the dayKey segment so a missing dayKeyStr (undefined) fails the test.
      expect.objectContaining({ couple_id: 'c1', course_key: expect.stringContaining('c1:2026-06-20:') }),
      expect.objectContaining({ onConflict: 'couple_id,course_key' }),
    )
    expect(insert).toHaveBeenCalledTimes(1)
    expect(res).toEqual({ status: 'created', itineraryId: 'itin-1' })
  })
  it('exists: events already present → no insert, status exists', async () => {
    selectEvents.mockResolvedValue({ data: [{ id: 'e0' }], error: null })
    const { result } = renderHook(() => useEventMutations('c1', 'u1', () => {}), { wrapper: wrap() })
    const res = await result.current.addCourse.mutateAsync({ stops, dayKeyStr: '2026-06-20', startMin: 600 })
    expect(insert).not.toHaveBeenCalled()
    expect(res).toEqual({ status: 'exists', itineraryId: 'itin-1' })
  })
})
