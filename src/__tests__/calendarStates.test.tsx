import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

// 완료 체크(0021)는 오프라인 큐 프로바이더를 요구한다 — 페이지 테스트에서는 훅째로 목.
vi.mock('@/hooks/useEventCompletions', () => ({
  useEventCompletions: () => ({ data: [] }),
  useToggleEventDone: () => ({ mutate: vi.fn(), isPending: false }),
  occurrenceKey: (id: string, start: string) => `${id}@${start}`,
}))
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
    category_id: null,
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

  it('연결됨-빈(ACTIVE & events 0) → 빈 카드 없이 한 줄 입력만 남는다', () => {
    // 빈 상태 카드 + '＋ 일정 추가' 버튼을 걷어냈다: 바로 위 '할 일 입력' 칸이 이미 무엇을
    // 하면 되는지 말하고 있어서, 같은 행동을 두 번 권하며 화면만 길어졌다.
    renderCalendar()
    expect(screen.queryByText('이 날 일정이 없어요')).toBeNull()
    expect(screen.queryByRole('button', { name: '＋ 일정 추가' })).toBeNull()
    // 죽은 화면이 되면 안 된다 — 추가 경로(한 줄 입력)는 그대로 있다.
    expect(screen.getByPlaceholderText(/할 일/)).toBeInTheDocument()
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
