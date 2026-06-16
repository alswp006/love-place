import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// CalendarPage의 데이터 훅을 mock(placeSheet/usPageTrash 테스트와 동일 스타일).
// 커플 ACTIVE + 이벤트 빈 상태로 두고 ?date= 딥링크가 선택일/월 그리드를 시드하는지만 검증.
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
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ data: [] }) }))
vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: {} }) }))
vi.mock('@/hooks/useEventMutations', () => ({
  useEventMutations: () => ({
    create: { mutate: () => {}, isPending: false },
    update: { mutate: () => {}, isPending: false },
    remove: { mutate: () => {}, isPending: false },
  }),
}))

import CalendarPage from '@/pages/CalendarPage'
import { dayKey } from '@/lib/calendar/eventDays'

function renderCalendar(entry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CalendarPage ?date= 딥링크(R1.1 — 코스 추가 후 점프)', () => {
  it('?date= 가 가리키는 날을 선택일로 시드한다(아젠다 헤더에 표시)', () => {
    renderCalendar('/calendar?date=2026-06-20')
    // 선택일 아젠다 헤더(<h2>)에 딥링크 날짜가 보여야 한다.
    expect(screen.getByRole('heading', { level: 2, name: '2026-06-20' })).toBeInTheDocument()
  })

  it('?date= 가 다른 달이면 월 그리드도 그 달로 시드한다', () => {
    renderCalendar('/calendar?date=2026-09-15')
    // 월 네비 라벨이 딥링크의 달(2026년 9월)을 가리켜야 한다(잘못된 달로 착지 금지).
    expect(screen.getByText('2026년 9월')).toBeInTheDocument()
  })

  it('?date= 가 없으면 오늘 기준으로 동작한다(딥링크 미사용 시 회귀 없음)', () => {
    renderCalendar('/calendar')
    // 페이지와 동일한 표시 타임존(Asia/Seoul) 기준으로 오늘 키를 계산(경계 플레이크 방지).
    const todayKey = dayKey(new Date().toISOString())
    expect(screen.getByRole('heading', { level: 2, name: todayKey })).toBeInTheDocument()
  })
})
