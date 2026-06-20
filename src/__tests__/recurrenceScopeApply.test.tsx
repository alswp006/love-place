import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// Task 10(R2): 반복(WEEKLY) occurrence 편집/삭제 시 범위 선택 시트(이 일정만/이후/전체) 배선.
// - '이 일정만' 삭제 = 시리즈 update(recurrence_rule에 그 occurrence dayKey EXDATE append), softDelete 아님.
// - '이후' = 시리즈 update(truncatedRule) + 새 시리즈 create.
// - '전체' = 시리즈 softDelete(기존 R1.5 경로 재사용).
// - '이 일정만' 수정 = EXDATE update + override create(recurrenceRule:null, owner_id=myId).
// CalendarPage의 데이터 훅을 mock(eventDeleteUndo 테스트와 동일 스타일).
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

// WEEKLY 반복(매주 토요일) 시리즈 — 2026-06-20(토)부터. 선택일 2026-06-20 occurrence가 아젠다에 노출된다.
const series = {
  id: 'e1',
  title: '주말 데이트',
  start: '2026-06-20T01:00:00.000Z',
  end: '2026-06-20T02:00:00.000Z',
  is_all_day: false,
  time_zone: 'Asia/Seoul',
  visibility: 'SHARED' as const,
  participants: 'BOTH' as const,
  owner_id: 'u1',
  place_id: null,
  memo: null,
  recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1;COUNT=10',
  reminders: [],
  version: 4,
}

vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ data: [series] }) }))
vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: {} }) }))
vi.mock('@/hooks/usePlaces', () => ({ usePlaces: () => ({ data: [], isLoading: false }) }))

const h = vi.hoisted(() => {
  const createMutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
  const updateMutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
  const removeMutate = vi.fn((_vars: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
  const restoreEvent = vi.fn()
  return { createMutate, updateMutate, removeMutate, restoreEvent }
})
vi.mock('@/hooks/useEventMutations', () => ({
  useEventMutations: () => ({
    create: { mutate: h.createMutate, isPending: false },
    update: { mutate: h.updateMutate, isPending: false },
    remove: { mutate: h.removeMutate, isPending: false },
  }),
}))
vi.mock('@/hooks/useRestoreEvent', () => ({
  useRestoreEvent: () => ({ restoreEvent: h.restoreEvent, isPending: false }),
}))

import CalendarPage from '@/pages/CalendarPage'
import { ToastProvider } from '@/components/common/ToastProvider'
import { dayKey } from '@/lib/calendar/eventDays'

function renderCalendar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/calendar?date=2026-06-20']}>
          <CalendarPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

// 아젠다의 occurrence를 눌러 EventSheet 수정 모드를 연다(기본=선택일 2026-06-20 = 시리즈 첫 회차).
function openEditSheet() {
  fireEvent.click(screen.getByRole('button', { name: /주말 데이트/ }))
}

// 시리즈 앵커가 아닌 회차를 편집하려면 월 셀로 그 날을 먼저 선택한 뒤 아젠다의 occurrence를 연다.
// (셀 버튼 aria-label은 'YYYY-MM-DD …'로 시작 — MonthGrid.)
function selectDayAndEdit(occDay: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${occDay}`) }))
  fireEvent.click(screen.getByRole('button', { name: /주말 데이트/ }))
}

beforeEach(() => {
  h.createMutate.mockClear()
  h.updateMutate.mockClear()
  h.removeMutate.mockClear()
  h.restoreEvent.mockClear()
})

describe('반복 일정 범위 선택 시트 배선(Task 10)', () => {
  it('반복 occurrence 삭제 확인 시 바로 지우지 않고 범위 시트(이 일정만/이후/전체)를 띄운다', () => {
    renderCalendar()
    openEditSheet()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    fireEvent.click(screen.getByRole('button', { name: '정말 삭제할까요?' }))
    // 반복이므로 곧장 remove를 부르지 않고 범위 시트를 먼저 띄운다.
    expect(h.removeMutate).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: /반복 일정/ })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이 일정만' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이후 모두' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument()
  })

  it("'이 일정만' 삭제 → 시리즈 update(EXDATE append), softDelete(remove) 아님", () => {
    renderCalendar()
    openEditSheet()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    fireEvent.click(screen.getByRole('button', { name: '정말 삭제할까요?' }))
    fireEvent.click(screen.getByRole('button', { name: '이 일정만' }))
    expect(h.removeMutate).not.toHaveBeenCalled()
    expect(h.updateMutate).toHaveBeenCalledTimes(1)
    const [vars] = h.updateMutate.mock.calls[0] as [
      { id: string; expectedVersion: number; patch: { recurrence_rule?: string } },
    ]
    expect(vars.id).toBe('e1')
    expect(vars.expectedVersion).toBe(4)
    expect(vars.patch.recurrence_rule).toContain('EXDATE=2026-06-20')
    expect(vars.patch.recurrence_rule).toContain('FREQ=WEEKLY')
  })

  it("'전체' 삭제 → 시리즈 softDelete(remove) expectedVersion=시리즈 version", () => {
    renderCalendar()
    openEditSheet()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    fireEvent.click(screen.getByRole('button', { name: '정말 삭제할까요?' }))
    fireEvent.click(screen.getByRole('button', { name: '전체' }))
    expect(h.updateMutate).not.toHaveBeenCalled()
    expect(h.removeMutate).toHaveBeenCalledTimes(1)
    const [vars] = h.removeMutate.mock.calls[0] as [{ id: string; expectedVersion: number }]
    expect(vars).toMatchObject({ id: 'e1', expectedVersion: 4 })
  })

  it("'이후' 삭제 → 시리즈 update(truncatedRule UNTIL) + 분할일 이후 차단(새 시리즈 create 없음)", () => {
    renderCalendar()
    openEditSheet()
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    fireEvent.click(screen.getByRole('button', { name: '정말 삭제할까요?' }))
    fireEvent.click(screen.getByRole('button', { name: '이후 모두' }))
    // 삭제 '이후'는 시리즈를 그 회차 직전까지 절단(UNTIL)하면 끝 — 새 시리즈는 만들지 않는다.
    expect(h.updateMutate).toHaveBeenCalledTimes(1)
    const [vars] = h.updateMutate.mock.calls[0] as [
      { id: string; expectedVersion: number; patch: { recurrence_rule?: string } },
    ]
    expect(vars.id).toBe('e1')
    expect(vars.expectedVersion).toBe(4)
    expect(vars.patch.recurrence_rule).toContain('UNTIL=')
    expect(h.createMutate).not.toHaveBeenCalled()
  })

  it("'이 일정만' 수정 → EXDATE update 성공 후 override create(recurrenceRule:null)", async () => {
    renderCalendar()
    openEditSheet()
    fireEvent.change(screen.getByLabelText('일정 제목'), { target: { value: '이번주만 다른 곳' } })
    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    // 수정도 반복이면 범위 시트.
    fireEvent.click(screen.getByRole('button', { name: '이 일정만' }))
    // (1) 시리즈에 EXDATE update
    expect(h.updateMutate).toHaveBeenCalledTimes(1)
    const [uvars] = h.updateMutate.mock.calls[0] as [
      { id: string; expectedVersion: number; patch: { recurrence_rule?: string } },
    ]
    expect(uvars.patch.recurrence_rule).toContain('EXDATE=2026-06-20')
    // (2) override create — 비반복 단일 이벤트(recurrenceRule:null), 바뀐 제목
    await waitFor(() => expect(h.createMutate).toHaveBeenCalledTimes(1))
    const [cvars] = h.createMutate.mock.calls[0] as [{ recurrenceRule: string | null; title: string }]
    expect(cvars.recurrenceRule).toBeNull()
    expect(cvars.title).toBe('이번주만 다른 곳')
  })

  it("'이후' 수정 → 시리즈 update(truncatedRule) + 새 시리즈 create(반복 유지)", async () => {
    renderCalendar()
    openEditSheet()
    fireEvent.change(screen.getByLabelText('일정 제목'), { target: { value: '앞으로 바뀐 데이트' } })
    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.click(screen.getByRole('button', { name: '이후 모두' }))
    expect(h.updateMutate).toHaveBeenCalledTimes(1)
    const [uvars] = h.updateMutate.mock.calls[0] as [
      { expectedVersion: number; patch: { recurrence_rule?: string } },
    ]
    expect(uvars.patch.recurrence_rule).toContain('UNTIL=')
    await waitFor(() => expect(h.createMutate).toHaveBeenCalledTimes(1))
    const [cvars] = h.createMutate.mock.calls[0] as [{ recurrenceRule: string | null; title: string }]
    expect(cvars.recurrenceRule).toContain('FREQ=WEEKLY')
    expect(cvars.title).toBe('앞으로 바뀐 데이트')
  })

  // 회귀(이슈 #1): 시리즈 앵커가 아닌 회차(2026-06-27) '이 일정만' 수정 시 override가 앵커 날(06-20)이 아니라
  // 클릭한 회차 날(06-27)에 떨어져야 한다. EXDATE도 그 회차(06-27)를 제외해야 한다.
  it("'이 일정만' 수정 — 비(非)첫 회차(2026-06-27)면 override가 그 회차 날에 생기고 EXDATE도 그 날", async () => {
    renderCalendar()
    selectDayAndEdit('2026-06-27')
    fireEvent.change(screen.getByLabelText('일정 제목'), { target: { value: '둘째주만 다른 곳' } })
    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.click(screen.getByRole('button', { name: '이 일정만' }))
    // EXDATE는 클릭한 회차(06-27)를 제외 — 06-20 아님.
    expect(h.updateMutate).toHaveBeenCalledTimes(1)
    const [uvars] = h.updateMutate.mock.calls[0] as [{ patch: { recurrence_rule?: string } }]
    expect(uvars.patch.recurrence_rule).toContain('EXDATE=2026-06-27')
    expect(uvars.patch.recurrence_rule).not.toContain('2026-06-20')
    // override 의 start/end dayKey는 06-27(시리즈 앵커 06-20 아님), 기간 1h 보존.
    await waitFor(() => expect(h.createMutate).toHaveBeenCalledTimes(1))
    const [cvars] = h.createMutate.mock.calls[0] as [{ start: string; end: string; title: string }]
    expect(dayKey(cvars.start)).toBe('2026-06-27')
    expect(dayKey(cvars.end)).toBe('2026-06-27')
    expect(new Date(cvars.end).getTime() - new Date(cvars.start).getTime()).toBe(60 * 60 * 1000)
    expect(cvars.title).toBe('둘째주만 다른 곳')
  })

  // 회귀(이슈 #2): 비(非)첫 회차(2026-06-27) '이후' 수정 시 새 시리즈의 첫 회차 start/end가 같은 날에 떨어져야 한다
  // (start만 occStartIso로 두고 end를 앵커 날에 남기면 음수/다중일 기간이 됨).
  it("'이후' 수정 — 비(非)첫 회차(2026-06-27)면 새 시리즈 start/end가 같은 날·양(+)의 기간", async () => {
    renderCalendar()
    selectDayAndEdit('2026-06-27')
    fireEvent.change(screen.getByLabelText('일정 제목'), { target: { value: '둘째주부터 다른 데이트' } })
    fireEvent.click(screen.getByRole('button', { name: '수정' }))
    fireEvent.click(screen.getByRole('button', { name: '이후 모두' }))
    expect(h.updateMutate).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(h.createMutate).toHaveBeenCalledTimes(1))
    const [cvars] = h.createMutate.mock.calls[0] as [
      { start: string; end: string; recurrenceRule: string | null; title: string },
    ]
    expect(dayKey(cvars.start)).toBe('2026-06-27')
    expect(dayKey(cvars.end)).toBe(dayKey(cvars.start))
    // 양(+)의 기간(음수/0길이 금지) — 분할일 평행이동으로 기간 보존.
    expect(new Date(cvars.end).getTime()).toBeGreaterThan(new Date(cvars.start).getTime())
    expect(cvars.recurrenceRule).toContain('FREQ=WEEKLY')
    expect(cvars.title).toBe('둘째주부터 다른 데이트')
  })
})
