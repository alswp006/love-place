import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { EventRow } from '@/hooks/useEvents'

// UpcomingFeed 카드(Task 15): TodayCard 승격 — buildUpcomingFeed(now 틱) 결과를 인앱 피드 카드로.
// 안 울리는 리마인더를 인앱 신호로(웹푸시는 PWA+iOS16.4 후속, 인앱 피드가 1차 알림 수단 — ux §6).
// useEvents를 모듈 레벨 가변 상태로 mock하고, fake timers로 now 틱을 고정한다.

let eventsState: { data: EventRow[] } = { data: [] }
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => eventsState }))
// 출처 아바타용 프로필 — 상대 개인 일정이 출처 없이 뜨던 것을 막으면서 붙었다.
vi.mock('@/hooks/useProfiles', () => ({
  useProfiles: () => ({
    data: {
      me: { id: 'me', displayName: '나', color: '#3b6db5', avatarUrl: null, avatarPath: null },
      you: { id: 'you', displayName: '지민', color: '#e58', avatarUrl: null, avatarPath: null },
    },
  }),
}))

// prefers-reduced-motion 기본은 false(미디어쿼리 미일치). 케이스에서 덮어쓴다.
let reduceMotion = false
vi.stubGlobal('matchMedia', (q: string) => ({
  matches: q.includes('prefers-reduced-motion') ? reduceMotion : false,
  media: q,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}))

import { UpcomingFeed } from '@/components/common/UpcomingFeed'

const NOW = new Date('2026-06-20T12:00:00+09:00')

function makeEvent(over: Partial<EventRow> = {}): EventRow {
  return {
    id: 'e1',
    title: '데이트',
    start: '2026-06-20T12:10:00+09:00',
    end: '2026-06-20T13:10:00+09:00',
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

describe('UpcomingFeed 카드(Task 15)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    eventsState = { data: [] }
    reduceMotion = false
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('항목 0이면 카드 미렌더(self-hide, 죽은 카드 금지)', () => {
    eventsState = { data: [] }
    const { container } = render(
      <MemoryRouter>
        <UpcomingFeed coupleId="c1" myId="u1" />
      </MemoryRouter>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('imminent(곧 시작) 항목: N분 뒤 라벨 + 종 아이콘 + aria-live="polite"', () => {
    // 리마인더 점화 imminent(soft 아님) → 종 아이콘. (리마인더 없는 60분 이내는 soft → ⏱ 별도 케이스)
    eventsState = { data: [makeEvent({ id: 'soon', title: '곧 만나요', start: '2026-06-20T12:10:00+09:00', end: '2026-06-20T13:10:00+09:00', reminders: [{ userId: 'u1', offsetMinutes: 10 }] })] }
    render(
      <MemoryRouter>
        <UpcomingFeed coupleId="c1" myId="u1" />
      </MemoryRouter>,
    )
    expect(screen.getByText('곧 만나요')).toBeInTheDocument()
    expect(screen.getByText('10분 뒤')).toBeInTheDocument()
    // 색 단독 금지 — 아이콘+텍스트 동반(종).
    expect(document.querySelector('[data-icon="bell"]')).toBeInTheDocument()
    // imminent는 동적 갱신을 aria-live="polite"로 안내.
    const live = document.querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live?.textContent).toContain('곧 만나요')
  })

  it('soft imminent(리마인더 없음, 60분 이내): "곧 시작" 텍스트 + 시계 아이콘(색 단독 금지)', () => {
    // 리마인더 없음 → soft 점화(60분 이내). 30분 뒤.
    eventsState = { data: [makeEvent({ id: 'soft', title: '카페 데이트', start: '2026-06-20T12:30:00+09:00', end: '2026-06-20T13:30:00+09:00', reminders: [] })] }
    render(
      <MemoryRouter>
        <UpcomingFeed coupleId="c1" myId="u1" />
      </MemoryRouter>,
    )
    expect(screen.getByText('카페 데이트')).toBeInTheDocument()
    // soft는 시계 아이콘(리마인더 점화(종)와 구분).
    expect(document.querySelector('[data-icon="clock"]')).toBeInTheDocument()
    // soft 라벨 텍스트 이중화("곧 시작" 안내 — 색 단독 금지).
    expect(screen.getByText(/곧 시작/)).toBeInTheDocument()
    // 리마인더 점화 아이콘(종)은 없다.
    expect(document.querySelector('[data-icon="bell"]')).toBeNull()
  })

  it('비-soft imminent(내 리마인더 점화): 종 아이콘(시계 아님)', () => {
    eventsState = { data: [makeEvent({ id: 'fired', title: '리마인더 점화', start: '2026-06-20T12:10:00+09:00', end: '2026-06-20T13:10:00+09:00', reminders: [{ userId: 'u1', offsetMinutes: 10 }] })] }
    render(
      <MemoryRouter>
        <UpcomingFeed coupleId="c1" myId="u1" />
      </MemoryRouter>,
    )
    expect(document.querySelector('[data-icon="bell"]')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="clock"]')).toBeNull()
  })

  it('dday 항목: D-3 라벨 + 달력 아이콘(다가오는 일정)', () => {
    eventsState = {
      data: [makeEvent({ id: 'far', title: '제주 여행', start: '2026-06-23T10:00:00+09:00', end: '2026-06-23T11:00:00+09:00' })],
    }
    render(
      <MemoryRouter>
        <UpcomingFeed coupleId="c1" myId="u1" />
      </MemoryRouter>,
    )
    expect(screen.getByText('제주 여행')).toBeInTheDocument()
    expect(screen.getByText('D-3')).toBeInTheDocument()
    expect(document.querySelector('[data-icon="calendar"]')).toBeInTheDocument()
    // dday는 imminent가 아니므로 aria-live가 붙지 않는다.
    const live = document.querySelector('[aria-live="polite"]')
    expect(live).toBeNull()
  })

  it('prefers-reduced-motion이면 라벨이 즉시 최종값(카운트업 생략, 깨지지 않음)', () => {
    reduceMotion = true
    // 리마인더 점화 imminent(soft 아님) → 라벨 그대로 'N분 뒤'(soft 접두 없음).
    eventsState = { data: [makeEvent({ id: 'soon', title: '곧 만나요', start: '2026-06-20T12:10:00+09:00', end: '2026-06-20T13:10:00+09:00', reminders: [{ userId: 'u1', offsetMinutes: 10 }] })] }
    render(
      <MemoryRouter>
        <UpcomingFeed coupleId="c1" myId="u1" />
      </MemoryRouter>,
    )
    // 즉시 최종 라벨(애니메이션 중간 상태 없이).
    expect(screen.getByText('10분 뒤')).toBeInTheDocument()
  })

  it('누구 일정인지 색이 아니라 아바타+라벨로 말한다 — 상대 PERSONAL이 출처 없이 섞이던 것 차단(§8)', () => {
    eventsState = {
      data: [
        makeEvent({ id: 'mine', title: '내 일정', visibility: 'PERSONAL', owner_id: 'me', start: '2026-06-23T10:00:00+09:00', end: '2026-06-23T11:00:00+09:00' }),
        makeEvent({ id: 'theirs', title: '상대 일정', visibility: 'PERSONAL', owner_id: 'you', start: '2026-06-24T10:00:00+09:00', end: '2026-06-24T11:00:00+09:00' }),
      ],
    }
    render(
      <MemoryRouter>
        <UpcomingFeed coupleId="c1" myId="me" />
      </MemoryRouter>,
    )
    expect(screen.getAllByText('나').length).toBeGreaterThan(0)
    expect(screen.getAllByText('상대').length).toBeGreaterThan(0)
  })

  it('항목을 탭하면 그 날짜 캘린더로 간다(신호를 봤으면 갈 수 있어야)', () => {
    eventsState = {
      data: [makeEvent({ id: 'far', title: '제주 여행', start: '2026-06-23T10:00:00+09:00', end: '2026-06-23T11:00:00+09:00' })],
    }
    render(
      <MemoryRouter>
        <UpcomingFeed coupleId="c1" myId="u1" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/calendar?date=2026-06-23')
  })

  it('카드 컨테이너는 접근성 라벨(aria-label="다가오는 일정")을 가진다', () => {
    eventsState = {
      data: [makeEvent({ id: 'far', title: '제주 여행', start: '2026-06-23T10:00:00+09:00', end: '2026-06-23T11:00:00+09:00' })],
    }
    render(
      <MemoryRouter>
        <UpcomingFeed coupleId="c1" myId="u1" />
      </MemoryRouter>,
    )
    expect(screen.getByLabelText('다가오는 일정')).toBeInTheDocument()
  })
})
