import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// Task 15(R1.5)+Task 18: 일정 삭제 인라인 확인 + 되돌리기 Undo 토스트.
// Task 18에서 일정 삭제 Undo는 공용 헬퍼 useSoftDeleteWithUndo('events')로 통합(방문·여행과 단일 구현).
// CalendarPage의 데이터 훅을 mock(calendarDeepLink 테스트와 동일 스타일).
// 커플 ACTIVE + 이벤트 1개로 두고 EventSheet(수정 모드)에서 삭제→확인→deleteWithUndo(version)→Undo 토스트를 검증.
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

// 2026-06-20 종일 이벤트 1개 — 선택일(?date=2026-06-20) 아젠다에 노출돼 클릭으로 EventSheet 수정 모드를 연다.
const anEvent = {
  id: 'e1',
  title: '데이트',
  start: '2026-06-20T01:00:00.000Z',
  end: '2026-06-20T02:00:00.000Z',
  is_all_day: false,
  time_zone: 'Asia/Seoul',
  visibility: 'SHARED' as const,
  participants: 'BOTH' as const,
  owner_id: 'u1',
  place_id: null,
  memo: null,
  recurrence_rule: null,
  reminders: [],
  version: 3,
}

vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ data: [anEvent] }) }))
vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: {} }) }))

// Task 18: 삭제는 공용 헬퍼 useSoftDeleteWithUndo('events')의 deleteWithUndo로 위임된다.
// deleteWithUndo는 성공 시 자체적으로 '일정을 삭제했어요' + 되돌리기(restore) Undo 토스트를 띄운다.
// 여기선 헬퍼를 실제 구현(useToast·useOfflineQueue·restore에만 의존)으로 쓰되, restore를 mock해 Undo 호출을 검증한다.
const h = vi.hoisted(() => {
  const restore = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  const softDelete = vi.fn(async () => ({ status: 'ok' }) as { status: 'ok' | 'conflict' })
  return { restore, softDelete }
})
vi.mock('@/hooks/useEventMutations', () => ({
  useEventMutations: () => ({
    create: { mutate: () => {}, isPending: false },
    update: { mutate: () => {}, isPending: false },
    remove: { mutate: () => {}, isPending: false },
  }),
}))
vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: vi.fn(), channel: vi.fn(() => ({ on: () => ({ subscribe: () => ({}) }) })), removeChannel: vi.fn() },
  isSupabaseConfigured: true,
}))
vi.mock('@/lib/sync/versionedUpdate', async (orig) => {
  const real = await orig<typeof import('@/lib/sync/versionedUpdate')>()
  return { ...real, softDelete: h.softDelete, restore: h.restore }
})

import CalendarPage from '@/pages/CalendarPage'
import { ToastProvider } from '@/components/common/ToastProvider'
import { OfflineQueueProvider } from '@/state/OfflineQueueProvider'

function renderCalendar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <OfflineQueueProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={['/calendar?date=2026-06-20']}>
            <CalendarPage />
          </MemoryRouter>
        </ToastProvider>
      </OfflineQueueProvider>
    </QueryClientProvider>,
  )
}

// 아젠다의 이벤트를 눌러 EventSheet 수정 모드를 연다.
function openEditSheet() {
  fireEvent.click(screen.getByRole('button', { name: /데이트/ }))
}

beforeEach(() => {
  h.restore.mockClear()
  h.softDelete.mockClear()
  h.softDelete.mockResolvedValue({ status: 'ok' })
  h.restore.mockResolvedValue({ status: 'ok' })
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true, writable: true })
})

describe('일정 삭제 인라인 확인 + 되돌리기 Undo(R1.5 Task 15 / Task 18 공용 헬퍼)', () => {
  it('삭제 버튼은 바로 지우지 않고 인라인 확인(정말 삭제할까요?)을 먼저 띄운다', () => {
    renderCalendar()
    openEditSheet()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    // 1탭만으로는 softDelete가 호출되면 안 된다(실수 삭제 방지).
    expect(h.softDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '정말 삭제할까요?' })).toBeInTheDocument()
  })

  it('확인을 누르면 softDelete(events)를 expectedVersion으로 호출하고 성공 시 Undo 토스트를 띄운다', async () => {
    renderCalendar()
    openEditSheet()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    fireEvent.click(screen.getByRole('button', { name: '정말 삭제할까요?' }))
    await waitFor(() => expect(h.softDelete).toHaveBeenCalledWith('events', 'e1', 3, 'u1'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('일정을 삭제했어요'))
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument()
  })

  it('Undo(되돌리기)를 누르면 restore를 version+1로 호출한다(낙관적 락)', async () => {
    renderCalendar()
    openEditSheet()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    fireEvent.click(screen.getByRole('button', { name: '정말 삭제할까요?' }))
    const undo = await screen.findByRole('button', { name: '되돌리기' })
    fireEvent.click(undo)
    await waitFor(() => expect(h.restore).toHaveBeenCalledWith('events', 'e1', 4, 'u1'))
  })
})
