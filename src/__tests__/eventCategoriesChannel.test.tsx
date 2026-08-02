import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// 회귀: useEventCategories는 한 화면에서 두 번 쓰인다(CalendarPage의 칩 조회맵 + EventSheet의
// CategoryPicker). 채널 토픽이 같으면 supabase-js가 이미 subscribe()된 채널을 재사용하고
// `.on()`이 "cannot add `postgres_changes` callbacks ... after `subscribe()`"로 던져
// 캘린더 화면 전체가 에러 폴백으로 떨어졌다. 토픽은 인스턴스마다 달라야 한다.

const channel = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/client', () => {
  const chain = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }
  return {
    isSupabaseConfigured: true,
    supabase: {
      channel: (name: string) => {
        channel(name)
        return chain
      },
      removeChannel: vi.fn(),
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
            }),
          }),
        }),
      }),
    },
  }
})

import { useEventCategories } from '@/hooks/useEventCategories'

function Consumer() {
  useEventCategories('c1')
  return null
}

beforeEach(() => {
  channel.mockReset()
})

describe('useEventCategories 실시간 채널', () => {
  it('한 화면에서 두 번 써도 채널 토픽이 겹치지 않는다', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <Consumer />
        <Consumer />
      </QueryClientProvider>,
    )
    const topics = channel.mock.calls.map((c) => c[0] as string)
    expect(topics).toHaveLength(2)
    expect(topics[0]).not.toBe(topics[1])
    // couple 범위는 유지 — 토픽 접두는 그대로여야 필터/디버깅이 읽힌다.
    for (const t of topics) expect(t.startsWith('event_categories:c1:')).toBe(true)
  })
})
