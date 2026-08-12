import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { EventRow } from '@/hooks/useEvents'
import type { ActivityItem } from '@/lib/feed/activityFeed'

// 신호 한 줄(SignalStrip) — 둘 사이의 신호를 지도 위에 접어 둔다.
//
// 이게 왜 필요한가: iOS 웹푸시는 PWA 홈화면+16.4 이상에서만 동작한다. 즉 "상대가 장소를 담았어요",
// "○○ 여행 D-3"를 놓치지 않으려면 앱 안에 1차 수단이 있어야 한다(ux §6). 그런데 지도 탭의
// 주인공은 지도라서 카드를 펼쳐 두면 방해가 된다 — 그래서 평소엔 한 줄, 탭하면 펼친다.

let eventsState: EventRow[] = []
let activityState: ActivityItem[] = []

vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ data: eventsState }) }))
vi.mock('@/hooks/useActivityFeed', () => ({ useActivityFeed: () => ({ data: activityState }) }))
vi.mock('@/hooks/useProfiles', () => ({ useProfiles: () => ({ data: {} }) }))

import { SignalStrip } from '@/components/common/SignalStrip'

const iso = (minsFromNow: number) => new Date(Date.now() + minsFromNow * 60_000).toISOString()

const ev = (id: string, title: string, minsFromNow: number): EventRow =>
  ({
    id,
    title,
    start: iso(minsFromNow),
    end: iso(minsFromNow + 60),
    is_all_day: false,
    time_zone: 'Asia/Seoul',
    visibility: 'SHARED',
    participants: 'BOTH',
    owner_id: 'u1',
    reminders: [],
    rrule: null,
    exdates: null,
    place_id: null,
    version: 1,
  }) as unknown as EventRow

const act = (id: string, text: string): ActivityItem =>
  ({ id, text, actorId: 'u2', createdAt: iso(-5) }) as ActivityItem

function renderStrip() {
  return render(
    <MemoryRouter>
      <SignalStrip coupleId="c1" myId="u1" />
    </MemoryRouter>,
  )
}

describe('신호 한 줄', () => {
  beforeEach(() => {
    eventsState = []
    activityState = []
  })

  it('신호가 0건이면 아무것도 그리지 않는다(죽은 UI 금지)', () => {
    const { container } = renderStrip()
    expect(container).toBeEmptyDOMElement()
  })

  it('★ 곧 시작하는 일정이 상대 활동보다 먼저다 — 급한 것 하나만 또렷하게', () => {
    eventsState = [ev('e1', '속초 카페 투어', 20)]
    activityState = [act('a1', '상대가 장소를 담았어요')]
    renderStrip()
    const pill = screen.getByRole('button', { expanded: false })
    expect(pill).toHaveTextContent('속초 카페 투어')
    expect(pill).not.toHaveTextContent('상대가 장소를 담았어요')
  })

  it('급한 일정이 없으면 상대의 최근 활동을 띄운다', () => {
    activityState = [act('a1', '상대가 장소를 담았어요')]
    renderStrip()
    expect(screen.getByRole('button', { expanded: false })).toHaveTextContent('상대가 장소를 담았어요')
  })

  it('여러 건이면 +N — 숫자만 두지 않고 스크린리더엔 "외 N건"으로 읽힌다(§8)', () => {
    activityState = [act('a1', '첫 신호'), act('a2', '둘째'), act('a3', '셋째')]
    const pill = (renderStrip(), screen.getByRole('button', { expanded: false }))
    expect(within(pill).getByText('+2')).toBeInTheDocument()
    expect(within(pill).getByText('외 2건')).toBeInTheDocument()
  })

  it('신호가 하나면 +N 배지를 붙이지 않는다', () => {
    activityState = [act('a1', '하나뿐')]
    renderStrip()
    expect(screen.queryByText(/^\+/)).toBeNull()
  })

  it('탭하면 펼쳐지고 다시 탭하면 접힌다(접힘이 기본 — 지도를 가리지 않게)', () => {
    activityState = [act('a1', '상대가 장소를 담았어요')]
    renderStrip()
    const pill = screen.getByRole('button', { expanded: false })
    expect(screen.queryByRole('region', { name: '상대의 최근 활동' })).toBeNull()

    fireEvent.click(pill)
    expect(pill).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: '상대의 최근 활동' })).toBeInTheDocument()

    fireEvent.click(pill)
    expect(pill).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: '상대의 최근 활동' })).toBeNull()
  })
})
