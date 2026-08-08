import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// 일정 완료 체크 — 회차 단위 기록(0021)이라는 계약을 페이지 배선까지 못박는다.
// 단위 테스트로 훅만 검증하면 "페이지가 회차 시작이 아니라 시리즈 시작을 넘기는" 버그를 못 잡는다.

const state = vi.hoisted(() => ({
  events: [] as unknown[],
  completions: [] as unknown[],
  toggle: vi.fn(),
}))

vi.mock('@/components/common/ToastProvider', () => ({ useToast: () => ({ show: vi.fn() }) }))
vi.mock('@/state/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/useCouple', () => ({
  useCouple: () => ({ data: { coupleId: 'c1', status: 'ACTIVE' }, isLoading: false }),
}))
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ data: state.events, isLoading: false }) }))
vi.mock('@/hooks/usePlaces', () => ({ usePlaces: () => ({ data: [] }) }))
vi.mock('@/hooks/useProfiles', () => ({
  useProfiles: () => ({
    data: {
      u1: { id: 'u1', displayName: '나', color: '#3b6db5', avatarUrl: null },
      u2: { id: 'u2', displayName: '지민', color: '#e58', avatarUrl: null },
    },
  }),
}))
vi.mock('@/hooks/useEventCategories', () => ({
  useEventCategories: () => ({ data: [] }),
  useCreateEventCategory: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useEventMutations', () => ({
  useEventMutations: () => ({
    create: { mutate: vi.fn(), isPending: false },
    update: { mutate: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
  }),
}))
vi.mock('@/hooks/useTrash', () => ({
  useSoftDeleteWithUndo: () => ({ deleteWithUndo: vi.fn(), isPending: false }),
}))
vi.mock('@/hooks/useEventCompletions', () => ({
  useEventCompletions: () => ({ data: state.completions }),
  useToggleEventDone: () => ({ mutate: state.toggle, isPending: false }),
  occurrenceKey: (id: string, start: string) => `${id}@${start}`,
}))

import CalendarPage from '@/pages/CalendarPage'

const TODAY = new Date()
const p2 = (n: number) => (n < 10 ? `0${n}` : `${n}`)
const DAY = `${TODAY.getFullYear()}-${p2(TODAY.getMonth() + 1)}-${p2(TODAY.getDate())}`
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00+09:00`).toISOString()

const ev = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  title: '운동',
  start: at('09:00'),
  end: at('10:00'),
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
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/calendar?date=${DAY}`]}>
      <CalendarPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.events = [ev()]
  state.completions = []
  state.toggle.mockReset()
})

// 캘린더 기본 트랙은 '함께'다 — 내 개인 일정을 보려면 '나' 트랙으로 옮겨야 한다.
const switchTrack = (label: string) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }))

describe('일정 완료 체크', () => {
  it('내 일정에는 체크박스가 붙고, 누르면 그 회차로 완료를 보낸다', () => {
    renderPage()
    const box = screen.getByRole('checkbox', { name: /운동 완료/ })
    expect(box).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(box)
    // occurrenceStart는 시리즈 시작이 아니라 **그 회차의 시작**이어야 한다(반복 일정의 핵심).
    expect(state.toggle).toHaveBeenCalledWith({
      eventId: 'e1',
      occurrenceStart: at('09:00'),
      done: true,
    })
  })

  it('이미 완료된 회차는 체크 상태로 뜨고, 다시 누르면 해제를 보낸다', () => {
    state.completions = [
      { id: 'c1', event_id: 'e1', occurrence_start: at('09:00'), done_at: at('09:30'), version: 1, created_by: 'u1' },
    ]
    renderPage()
    const box = screen.getByRole('checkbox', { name: /운동 완료 해제/ })
    expect(box).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(box)
    expect(state.toggle).toHaveBeenCalledWith({
      eventId: 'e1',
      occurrenceStart: at('09:00'),
      done: false,
    })
  })

  it('상대의 개인 일정은 체크할 수 없다 — 남의 할 일을 대신 지우지 않는다', () => {
    state.events = [ev({ id: 'e2', title: '상대 운동', owner_id: 'u2', visibility: 'PERSONAL' })]
    renderPage()
    // 상대 트랙으로 옮겨 실제로 화면에 띄운 뒤 확인한다(안 보여서 통과하면 의미가 없다).
    switchTrack('상대')
    expect(screen.getByText('상대 운동')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /상대 운동/ })).toBeNull()
  })

  it('내 개인 일정도 내 트랙에서 체크된다', () => {
    state.events = [ev({ id: 'e4', title: '내 운동', owner_id: 'u1', visibility: 'PERSONAL' })]
    renderPage()
    switchTrack('^나')
    expect(screen.getByRole('checkbox', { name: /내 운동 완료/ })).toBeInTheDocument()
  })

  it('함께 일정은 둘 중 누구나 체크한다', () => {
    state.events = [ev({ id: 'e3', title: '같이 장보기', owner_id: 'u2', visibility: 'SHARED' })]
    renderPage()
    expect(screen.getByRole('checkbox', { name: /같이 장보기 완료/ })).toBeInTheDocument()
  })
})

describe('별자리 스트립', () => {
  it('기본은 접힌 한 줄 — 캘린더 자리를 뺏지 않는다', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /별자리 펼치기/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '우리가 만든 별자리' })).toBeNull()
  })

  it('펼치면 이번 달 별자리와 지난 달들이 보인다', () => {
    state.completions = [
      { id: 'c1', event_id: 'e1', occurrence_start: at('09:00'), done_at: at('09:30'), version: 1, created_by: 'u1' },
    ]
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /별자리 펼치기/ }))
    const region = screen.getByRole('region', { name: '우리가 만든 별자리' })
    expect(region).toBeInTheDocument()
    // 별 수는 숫자로도 읽혀야 한다(색·그림만으로 말하지 않는다 §8).
    // 진행도는 숫자로 읽혀야 한다 — 별자리 이름은 계절마다 달라지므로 뼈대만 본다.
    expect(screen.getByText(/\d+\/\d+ · \d+개 남음/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /이번 달 .*별 \d+개/ })).toBeInTheDocument()
  })

  it('펼친 하늘에는 설명 문구를 더 얹지 않는다 — 별자리가 말하게 둔다', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /별자리 펼치기/ }))
    expect(screen.queryByText(/하루에 한 사람이 별 하나/)).toBeNull()
    expect(screen.queryByText(/오늘 · 나/)).toBeNull()
  })

  it('오늘 내 몫을 채웠는지는 접힌 줄에서만 말한다', () => {
    state.completions = [
      { id: 'c1', event_id: 'e1', occurrence_start: at('09:00'), done_at: at('09:30'), version: 1, created_by: 'u1' },
    ]
    renderPage()
    expect(screen.getByText(/오늘 채움/)).toBeInTheDocument()
  })
})
