import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { EventRow } from '@/hooks/useEvents'
import type { PlaceRow } from '@/hooks/usePlaces'

// CalendarPage 상태 분기 검증(Task 13): 로딩 스켈레톤 / 미연결 EmptyState(회귀) /
// 연결됨-빈 아젠다 CTA / 장소 연결 이벤트의 장소 칩+지도 링크.
// 데이터 훅을 mock하되, 모듈 레벨 가변 상태로 각 테스트가 couple/events/places를 바꾼다.

type CoupleState = { status: 'ACTIVE' | 'PENDING' | 'DISCONNECTED' }
let coupleState: CoupleState = { status: 'ACTIVE' }
let eventsState: { data: EventRow[]; isLoading: boolean } = { data: [], isLoading: false }
let placesState: { data: PlaceRow[]; isLoading: boolean } = { data: [], isLoading: false }

vi.mock('@/state/auth', () => ({
  useAuth: () => ({ user: { id: 'u1' }, session: { user: { id: 'u1' } }, configured: true, initializing: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({
    data: { coupleId: 'c1', status: coupleState.status, userA: 'u1', userB: 'u2', connectedAt: null, partner: null },
    isLoading: false,
  }),
}))
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => eventsState }))
vi.mock('@/hooks/usePlaces', () => ({ usePlaces: () => placesState }))
vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: {} }) }))
vi.mock('@/hooks/useEventMutations', () => ({
  useEventMutations: () => ({
    create: { mutate: () => {}, isPending: false },
    update: { mutate: () => {}, isPending: false },
    remove: { mutate: () => {}, isPending: false },
  }),
}))
// Task 18: CalendarPage가 일정 삭제 Undo를 공용 헬퍼 useSoftDeleteWithUndo로 소비 — noop으로 mock(여기선 상태 분기만 검증).
vi.mock('@/hooks/useTrash', () => ({
  useSoftDeleteWithUndo: () => ({ deleteWithUndo: async () => {}, isPending: false }),
}))

import CalendarPage from '@/pages/CalendarPage'
import { ToastProvider } from '@/components/common/ToastProvider'

function makeEvent(over: Partial<EventRow> = {}): EventRow {
  return {
    id: 'e1',
    title: '데이트',
    start: '2026-06-20T10:00:00+09:00',
    end: '2026-06-20T11:00:00+09:00',
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
    ...over,
  }
}

function renderCalendar(entry = '/calendar?date=2026-06-20') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <CalendarPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe('CalendarPage 상태 분기(Task 13)', () => {
  beforeEach(() => {
    coupleState = { status: 'ACTIVE' }
    eventsState = { data: [], isLoading: false }
    placesState = { data: [], isLoading: false }
  })

  it('로딩 중(ACTIVE & events isLoading) → role="status" 스켈레톤 노출, 월 그리드 미노출', () => {
    eventsState = { data: [], isLoading: true }
    renderCalendar()
    // 스켈레톤(role=status, aria-label) — ToastProvider 뷰포트도 role=status라 라벨로 특정.
    expect(screen.getByRole('status', { name: '일정 불러오는 중' })).toBeInTheDocument()
    // 스켈레톤일 땐 월 그리드/네비(예: 이전 달 버튼)가 없어야 한다.
    expect(screen.queryByRole('button', { name: '이전 달' })).not.toBeInTheDocument()
  })

  it('미연결(couple.status!=="ACTIVE") → 기존 연결 안내 EmptyState 유지(회귀)', () => {
    coupleState = { status: 'PENDING' }
    renderCalendar()
    expect(screen.getByText('먼저 상대와 연결해요')).toBeInTheDocument()
  })

  it('연결됨-빈(ACTIVE & events 0) → 아젠다가 EmptyState(이모지+title+CTA)로, CTA 클릭 시 시트 open', () => {
    renderCalendar()
    expect(screen.getByText('이 날 일정이 없어요')).toBeInTheDocument()
    const cta = screen.getByRole('button', { name: '＋ 일정 추가' })
    fireEvent.click(cta)
    // EventSheet가 열리면 dialog role이 보인다(시트 open 확인).
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('장소 연결된 이벤트 → 아젠다 항목에 장소 칩(이름) + 지도 링크(?place=)', () => {
    eventsState = {
      data: [makeEvent({ place_id: 'p1' })],
      isLoading: false,
    }
    placesState = {
      data: [
        {
          id: 'p1',
          name: '성수 카페',
          address: null,
          region_label: null,
          lat: 37.5,
          lng: 127.05,
          category: null,
          kakao_place_id: null,
          added_by: 'u1',
          version: 1,
        },
      ],
      isLoading: false,
    }
    renderCalendar()
    const chip = screen.getByRole('link', { name: /성수 카페/ })
    expect(chip).toBeInTheDocument()
    expect(chip).toHaveAttribute('href', '/?place=p1')
  })
})
