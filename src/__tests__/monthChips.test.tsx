import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { EventRow } from '@/hooks/useEvents'

// Task 11(R2.3): 월 셀이 트랙 점만 보여주던 것 → 제목 칩 1-2개 + `+N`(overflow).
// 칩은 색 단독 금지(§8) — 트랙 심볼(●/▲/■)을 텍스트로 동반. 셀 버튼 탭은 유지(칩은 비버튼 span).
// 데이터 훅 mock 스타일은 calendarDeepLink.test.tsx와 동일.
vi.mock('@/state/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } }, configured: true, initializing: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({
    data: { coupleId: 'c1', status: 'ACTIVE', userA: 'u1', userB: 'u2', connectedAt: null, partner: null },
    isLoading: false,
  }),
}))

// 한 날(2026-06-15, Asia/Seoul)에 SHARED 이벤트 3개 — 칩 2개 + `+1` overflow 검증.
const day = '2026-06-15'
function ev(id: string, title: string, hour: number): EventRow {
  const hh = hour < 10 ? `0${hour}` : `${hour}`
  return {
    id,
    title,
    start: `${day}T${hh}:00:00+09:00`,
    end: `${day}T${hh}:30:00+09:00`,
    is_all_day: false,
    time_zone: 'Asia/Seoul',
    visibility: 'SHARED',
    participants: 'BOTH',
    owner_id: 'u1',
    place_id: null,
    memo: null,
    recurrence_rule: null,
    reminders: [],
    version: 1,
  }
}
const EVENTS: EventRow[] = [ev('e1', '아침 산책', 9), ev('e2', '점심 데이트', 12), ev('e3', '저녁 영화', 19)]

vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ data: EVENTS }) }))
vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: {} }) }))
vi.mock('@/hooks/usePlaces', () => ({ usePlaces: () => ({ data: [], isLoading: false }) }))
vi.mock('@/hooks/useEventMutations', () => ({
  useEventMutations: () => ({
    create: { mutate: () => {}, isPending: false },
    update: { mutate: () => {}, isPending: false },
    remove: { mutate: () => {}, isPending: false },
  }),
}))
// Task 18: CalendarPage가 일정 삭제 Undo를 공용 헬퍼 useSoftDeleteWithUndo로 소비 — noop으로 mock(여기선 칩만 검증).
vi.mock('@/hooks/useTrash', () => ({
  useSoftDeleteWithUndo: () => ({ deleteWithUndo: async () => {}, isPending: false }),
}))

import CalendarPage from '@/pages/CalendarPage'
import { ToastProvider } from '@/components/common/ToastProvider'

function renderCalendar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        {/* 2026-06-15가 보이는 달로 시드 */}
        <MemoryRouter initialEntries={['/calendar?date=2026-06-15']}>
          <CalendarPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('월 셀 제목 칩(Task 11 — +N more, 색+심볼 이중화)', () => {
  it('한 날에 이벤트 3개 → 셀에 제목 칩 2개 + `+1` overflow', () => {
    renderCalendar()
    // 그 날 셀(button)을 aria-label(날짜 키 포함)로 찾는다.
    const cell = screen.getByRole('button', { name: new RegExp(`^${day}`) })
    // 칩 2개: 시작시각 순(9시·12시) 앞 2개 제목만.
    expect(within(cell).getByText(/아침 산책/)).toBeInTheDocument()
    expect(within(cell).getByText(/점심 데이트/)).toBeInTheDocument()
    // 3번째는 overflow(`+1`)로 접힘 — 제목 칩으로 노출 안 됨.
    expect(within(cell).queryByText(/저녁 영화/)).not.toBeInTheDocument()
    expect(within(cell).getByText('+1')).toBeInTheDocument()
  })

  it('칩에 트랙 심볼(●)이 텍스트로 동반(색 단독 금지 §8)', () => {
    renderCalendar()
    const cell = screen.getByRole('button', { name: new RegExp(`^${day}`) })
    // SHARED 트랙 심볼 ● 가 칩 텍스트에 동반(칩 2개 모두 ● 포함).
    expect(within(cell).getAllByText(/●/).length).toBeGreaterThanOrEqual(1)
  })

  it('셀 aria-label에 기존 트랙·count 요약이 유지된다', () => {
    renderCalendar()
    const cell = screen.getByRole('button', { name: new RegExp(`^${day}`) })
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining('함께'))
    expect(cell).toHaveAttribute('aria-label', expect.stringContaining('일정 3개'))
  })

  it('칩은 비인터랙티브(셀 버튼 탭 유지 — 중첩 버튼 회피)', () => {
    renderCalendar()
    const cell = screen.getByRole('button', { name: new RegExp(`^${day}`) })
    // 칩 자체는 button이 아니어야 한다(셀 button 하나만 탭 대상).
    expect(within(cell).queryAllByRole('button')).toHaveLength(0)
  })
})
