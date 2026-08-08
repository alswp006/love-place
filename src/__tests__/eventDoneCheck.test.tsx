import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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
      u1: { id: 'u1', displayName: '나', color: '#3b6db5', avatarUrl: null, avatarPath: null },
      u2: { id: 'u2', displayName: '지민', color: '#e58', avatarUrl: null, avatarPath: null },
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
// occurrenceKey는 **진짜를 쓴다**. 예전엔 이걸 단순 문자열 결합으로 목했는데, 그래서
// 클라/서버 포맷 불일치(반복 회차가 영영 안 켜지던 버그)를 테스트가 통째로 가렸다.
vi.mock('@/hooks/useEventCompletions', async (orig) => {
  const real = await orig<typeof import('@/hooks/useEventCompletions')>()
  return {
    ...real,
    useEventCompletions: () => ({ data: state.completions }),
    useToggleEventDone: () => ({ mutate: state.toggle, isPending: false }),
  }
})

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
    // 월 셀 칩에도 같은 제목이 뜨므로 아젠다 영역으로 좁힌다.
    const agenda = screen.getByRole('region', { name: new RegExp(`^${DAY} 일정$`) })
    expect(within(agenda).getByText('상대 운동')).toBeInTheDocument()
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

  it('접힌 줄은 진행도 숫자만 — 글자를 더 얹지 않고 별자리에 자리를 준다', () => {
    state.completions = [
      { id: 'c1', event_id: 'e1', occurrence_start: at('09:00'), done_at: at('09:30'), version: 1, created_by: 'u1' },
    ]
    renderPage()
    expect(screen.getByText(/^\d+\/\d+$/)).toBeInTheDocument()
    expect(screen.queryByText(/오늘 채움/)).toBeNull()
  })

  it('올해 열두 달을 전부 보여준다 — 몇 개 남았는지가 보여야 한다', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /별자리 펼치기/ }))
    const year = screen.getByLabelText('올해 열두 달')
    expect(within(year).getAllByRole('img')).toHaveLength(12)
  })
})

// ── 회귀: 오늘 리뷰에서 나온 두 결함 ───────────────────────────────────────────
describe('완료 체크 회귀(리뷰 A1·A2)', () => {
  it('반복 회차: 서버가 돌려준 timestamptz 포맷과 클라 ISO가 같은 회차로 인식된다', () => {
    // rrule은 `...T00:00:00.000Z`를, PostgREST는 `...+00:00`을 준다. 정규화가 없으면
    // 체크가 저절로 풀리고 재탭이 no-op가 되어 그 회차는 영영 안 켜졌다.
    const occIso = at('09:00') // 클라이언트 ISO(밀리초 포함, Z)
    const serverIso = occIso.replace('.000Z', '+00:00') // PostgREST 렌더 포맷
    expect(serverIso).not.toBe(occIso) // 포맷이 실제로 다르다는 것부터 못박는다

    state.events = [ev({ id: 'e1', title: '매일 운동', recurrence_rule: 'FREQ=DAILY;INTERVAL=1' })]
    state.completions = [
      { id: 'c1', event_id: 'e1', occurrence_start: serverIso, done_at: serverIso, version: 1, created_by: 'u1' },
    ]
    renderPage()
    expect(screen.getByRole('checkbox', { name: /매일 운동 완료 해제/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('상대가 체크한 것은 내 체크가 아니다 — 내 칸은 비어 있고 해제가 아니라 완료를 보낸다', () => {
    // 유니크 키에 created_by가 없어 상대 행을 지우던 버그(0023이 스키마도 고쳤다).
    state.completions = [
      { id: 'c1', event_id: 'e1', occurrence_start: at('09:00'), done_at: at('09:30'), version: 1, created_by: 'u2' },
    ]
    renderPage()
    const box = screen.getByRole('checkbox', { name: /운동 완료/ })
    expect(box).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(box)
    expect(state.toggle).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'e1', done: true }),
    )
  })

  it('상대가 끝냈으면 그 사실을 아바타로 알려준다(빈 체크칸만 두면 오해한다)', () => {
    state.completions = [
      { id: 'c1', event_id: 'e1', occurrence_start: at('09:00'), done_at: at('09:30'), version: 1, created_by: 'u2' },
    ]
    renderPage()
    expect(screen.getByLabelText('지민 완료함')).toBeInTheDocument()
  })

  it('둘 다 체크하면 별이 둘 — 한 회차에 두 사람의 완료가 공존한다', () => {
    state.completions = [
      { id: 'c1', event_id: 'e1', occurrence_start: at('09:00'), done_at: at('09:30'), version: 1, created_by: 'u1' },
      { id: 'c2', event_id: 'e1', occurrence_start: at('09:00'), done_at: at('09:40'), version: 1, created_by: 'u2' },
    ]
    renderPage()
    // 내 체크는 켜져 있고, 상대 표시도 함께 뜬다.
    expect(screen.getByRole('checkbox', { name: /운동 완료 해제/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByLabelText('지민 완료함')).toBeInTheDocument()
  })
})
