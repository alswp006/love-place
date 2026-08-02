import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// 여행 상세(Day 계획) — Day 슬롯은 기간에서 도출, 스톱은 events에서 도출(별도 저장소 없음).
// 오늘을 2026-07-25로 고정해야 '오늘 Day 자동 선택'이 결정적으로 검증된다.
vi.mock('@/lib/journey/autoLink', async (orig) => {
  const real = await orig<typeof import('@/lib/journey/autoLink')>()
  return { ...real, localDayKey: () => '2026-07-25' }
})

const kst = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+09:00`).toISOString()

const state = vi.hoisted(() => ({
  trips: [] as unknown[],
  events: [] as unknown[],
  places: [] as unknown[],
  wishes: { byPlace: {} as Record<string, unknown>, mine: {} },
  // directions 프록시 결과 — undefined = 미배포/실패(칩 없음이 기본 경로).
  legResults: undefined as { distanceMeters: number | null; polyline: null; degraded: boolean }[] | undefined,
  visits: [] as unknown[],
  create: vi.fn(),
  saveReview: vi.fn(),
  remove: vi.fn(),
  openDirections: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@/components/common/ToastProvider', () => ({ useToast: () => ({ show: state.toast }) }))

vi.mock('@/state/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/hooks/useCouple', () => ({ useCouple: () => ({ data: { coupleId: 'c1' } }) }))
vi.mock('@/hooks/useTrips', () => ({ useTrips: () => ({ data: state.trips, isLoading: false }) }))
vi.mock('@/hooks/useEvents', () => ({ useEvents: () => ({ data: state.events }) }))
vi.mock('@/hooks/usePlaces', () => ({ usePlaces: () => ({ data: state.places }) }))
vi.mock('@/hooks/useWishes', () => ({ useWishes: () => ({ data: state.wishes }) }))
vi.mock('@/hooks/useEventMutations', () => ({
  useEventMutations: () => ({
    create: { mutate: state.create, isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
  }),
}))
// 스톱 빼기는 공용 soft-delete+Undo 훅으로 통일됐다(캘린더·장소·여행과 같은 계약).
vi.mock('@/hooks/useTrash', () => ({
  useSoftDeleteWithUndo: () => ({ deleteWithUndo: state.remove, isPending: false }),
}))
// 리뷰는 visits 행의 rating/memo다(스키마 변경 없음) — 훅을 목으로 갈아 저장 호출만 검증한다.
vi.mock('@/hooks/useVisits', () => ({
  useVisits: () => ({ data: state.visits }),
  useSaveVisitReview: () => ({ mutate: state.saveReview, isPending: false }),
}))
vi.mock('@/hooks/useProfiles', () => ({
  useProfiles: () => ({
    data: {
      u1: { id: 'u1', displayName: '나', color: '#3b6db5', avatarUrl: null },
      u2: { id: 'u2', displayName: '지민', color: '#e58', avatarUrl: null },
    },
  }),
}))

vi.mock('@/hooks/useDirectionLegs', () => ({
  useDirectionLegs: () => ({ data: state.legResults }),
}))
// 지도는 키 미설정이면 렌더하지 않는다 — 칩/목록은 지도와 무관하게 검증된다.
vi.mock('@/lib/naver/loadNaverMaps', () => ({ isNaverMapConfigured: () => false }))
vi.mock('@/lib/places/directionsUrl', () => ({ openDirections: state.openDirections }))

import TripDetailPage from '@/pages/TripDetailPage'

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={['/trips/t1']}>
      <Routes>
        <Route path="/trips/:tripId" element={<TripDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

const TRIP = {
  id: 't1',
  title: '속초 1박2일',
  start_date: '2026-07-25',
  end_date: '2026-07-26',
  region_code: null,
  version: 1,
}

beforeEach(() => {
  state.trips = [TRIP]
  state.events = []
  state.places = []
  state.wishes = { byPlace: {}, mine: {} }
  state.legResults = undefined
  state.visits = []
  state.create.mockReset()
  state.saveReview.mockReset()
  state.remove.mockReset()
  state.openDirections.mockReset()
  state.toast.mockReset()
  // create는 기본적으로 성공 콜백을 태워 담기 흐름(토스트·패널 유지)을 검증할 수 있게 한다.
  state.create.mockImplementation((_vars, opts) => {
    opts?.onSuccess?.()
    opts?.onSettled?.()
  })
})

// 좌표를 가진 두 스톱이 붙어 있는 Day 1 시나리오(거리 칩 검증용 공통 세팅).
function seedTwoStops() {
  state.places = [
    { id: 'p1', name: '칠성조선소', lat: 38.2, lng: 128.59 },
    { id: 'p2', name: '영금정', lat: 38.21, lng: 128.6 },
  ]
  state.events = [
    { id: 'e1', title: '칠성조선소', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
    { id: 'e2', title: '영금정', start: kst('2026-07-25', '14:00'), end: kst('2026-07-25', '15:00'), place_id: 'p2', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
  ]
}

describe('TripDetailPage — 여행 Day 계획', () => {
  it('여행 기간에서 Day 슬롯을 도출한다(1박2일 → Day 1·2)', () => {
    renderDetail()
    // Day는 이제 '전환'이 아니라 '이어진 흐름'이다 — 상단 바는 점프 앵커로 바뀌었다(트리플 구조).
    const nav = screen.getByRole('navigation', { name: '날짜로 이동' })
    expect(within(nav).getByText('Day 1')).toBeInTheDocument()
    expect(within(nav).getByText('Day 2')).toBeInTheDocument()
    expect(within(nav).queryByText('Day 3')).not.toBeInTheDocument()
    // 각 Day 섹션도 실제로 렌더된다(하나만 보여주던 것에서 바뀜).
    expect(screen.getByRole('region', { name: /Day 1/ })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Day 2/ })).toBeInTheDocument()
  })

  it('오늘에 해당하는 Day에 오늘 표시가 붙는다', () => {
    // Day를 전부 이어 붙이므로 '선택된 Day'라는 개념이 없어졌다 — 대신 오늘을 표시로 알린다.
    renderDetail()
    const today = screen.getByRole('region', { name: /Day 1/ })
    expect(within(today).getByText('오늘')).toBeInTheDocument()
  })

  it('그 날의 스톱을 시간순으로, 장소 없는 일정은 메모로 보여준다', () => {
    state.places = [{ id: 'p1', name: '칠성조선소' }, { id: 'p2', name: '영금정' }]
    state.events = [
      { id: 'e2', title: '영금정', start: kst('2026-07-25', '14:00'), end: kst('2026-07-25', '15:00'), place_id: 'p2', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
      { id: 'e0', title: '휴가 신청', start: kst('2026-07-25', '08:00'), end: kst('2026-07-25', '08:30'), place_id: null, memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
    ]
    renderDetail()
    const day1 = screen.getByRole('region', { name: /Day 1/ })
    const items = within(day1).getAllByRole('listitem')
    // 스톱이 먼저(시간순), 그 뒤에 메모.
    expect(items[0]!.textContent).toContain('칠성조선소')
    expect(items[1]!.textContent).toContain('영금정')
    // 장소 없는 일정을 숨기던 것을 바꿨다: 그 날 챙길 것이라 여행에서도 보여야 한다.
    // 이전엔 캘린더에만 적히고 여행을 열면 안 보여서, 정작 필요한 순간에 못 봤다.
    expect(within(day1).getByText('휴가 신청')).toBeInTheDocument()
  })

  it('Day마다 그 날 스톱만 들어간다(전환이 아니라 각 섹션에 갈려 렌더)', () => {
    state.places = [{ id: 'p1', name: '칠성조선소' }, { id: 'p3', name: '속초해변' }]
    state.events = [
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
      { id: 'e3', title: '속초해변', start: kst('2026-07-26', '09:00'), end: kst('2026-07-26', '10:00'), place_id: 'p3', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
    ]
    renderDetail()
    const day1 = screen.getByRole('region', { name: /Day 1/ })
    const day2 = screen.getByRole('region', { name: /Day 2/ })
    expect(within(day1).getByText('칠성조선소')).toBeInTheDocument()
    expect(within(day1).queryByText('속초해변')).toBeNull()
    expect(within(day2).getByText('속초해변')).toBeInTheDocument()
    expect(within(day2).queryByText('칠성조선소')).toBeNull()
  })

  it('빈 날은 죽은 화면 대신 담기 유도를 보여준다', () => {
    renderDetail()
    // Day마다 추가 경로가 붙었으므로 안내도 그 자리 기준으로 바뀌었다.
    expect(screen.getAllByText(/아직 비어 있어요/).length).toBeGreaterThan(0)
  })

  it('위시에서 담으면 그 Day·그 장소로 이벤트를 만든다', () => {
    state.places = [{ id: 'p1', name: '칠성조선소', region_label: '속초' }]
    state.wishes = { byPlace: { p1: { userIds: ['u1'], totalPriority: 3, maxPriority: 3 } }, mine: {} }
    renderDetail()
    // 추가 경로가 Day마다 생겼다 — Day 1 섹션 안에서 연다(전역 버튼 하나였던 것에서 바뀜).
    const day1 = screen.getByRole('region', { name: /Day 1/ })
    fireEvent.click(within(day1).getByRole('button', { name: '장소 추가' }))
    fireEvent.click(within(day1).getByRole('button', { name: /칠성조선소/ }))

    expect(state.create).toHaveBeenCalledOnce()
    const arg = state.create.mock.calls[0]![0] as { placeId: string; start: string; visibility: string }
    expect(arg.placeId).toBe('p1')
    expect(arg.visibility).toBe('SHARED')
    // 빈 날의 첫 스톱은 기본 10:00(KST) — 01:00Z.
    expect(arg.start).toBe(kst('2026-07-25', '10:00'))
  })

  it('이미 그 Day에 담긴 장소는 후보에서 빠진다(중복 담기 방지)', () => {
    state.places = [{ id: 'p1', name: '칠성조선소' }]
    state.wishes = { byPlace: { p1: { userIds: ['u1'], totalPriority: 3, maxPriority: 3 } }, mine: {} }
    state.events = [
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
    ]
    renderDetail()
    // 추가 경로가 Day마다 생겼다 — Day 1 섹션 안에서 연다(전역 버튼 하나였던 것에서 바뀜).
    const day1 = screen.getByRole('region', { name: /Day 1/ })
    fireEvent.click(within(day1).getByRole('button', { name: '장소 추가' }))
    expect(screen.getByText(/담을 수 있는 가고싶은 곳이 없어요/)).toBeInTheDocument()
  })

  // 계약 변경(의도적): 예전엔 ✕ 1탭에 즉시 삭제였다. 같은 events를 캘린더는 '확인 2탭 + 되돌리기'로
  // 지우는데 여행 탭만 달라서, 오탭 한 번에 상대가 담아둔 스톱이 날아갔다. 공용 훅으로 통일했다.
  it('스톱 빼기는 1탭으로 지우지 않는다 — 인라인 확인 먼저', () => {
    state.places = [{ id: 'p1', name: '칠성조선소' }]
    state.events = [
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 7, visibility: 'SHARED', owner_id: 'u1' },
    ]
    renderDetail()
    fireEvent.click(screen.getByLabelText('칠성조선소 빼기'))
    expect(state.remove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '정말 뺄까요?' })).toBeInTheDocument()
  })

  it('스톱 빼기는 낙관적 락(version)으로 보낸다 — LWW 금지(§4.3)', () => {
    state.places = [{ id: 'p1', name: '칠성조선소' }]
    state.events = [
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 7, visibility: 'SHARED', owner_id: 'u1' },
    ]
    renderDetail()
    fireEvent.click(screen.getByLabelText('칠성조선소 빼기'))
    fireEvent.click(screen.getByRole('button', { name: '정말 뺄까요?' }))
    // 되돌리기 토스트 문구까지 공용 훅에 넘긴다(캘린더 삭제와 같은 계약).
    expect(state.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e1', expectedVersion: 7 }),
    )
  })

  it('상대의 PERSONAL 스톱은 ✕가 없다 — 눌러도 못 지우는데 충돌로 오안내하던 것 차단', () => {
    state.places = [{ id: 'p1', name: '상대만의 일정 장소' }]
    state.events = [
      { id: 'e1', title: '지민 개인 일정', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'PERSONAL', owner_id: 'u2' },
    ]
    renderDetail()
    expect(screen.queryByLabelText(/빼기/)).not.toBeInTheDocument()
  })

  it('내 PERSONAL·SHARED 스톱에는 ✕가 있다', () => {
    state.places = [{ id: 'p1', name: '내 일정 장소' }]
    state.events = [
      { id: 'e1', title: '내 개인 일정', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'PERSONAL', owner_id: 'u1' },
    ]
    renderDetail()
    expect(screen.getByLabelText(/빼기/)).toBeInTheDocument()
  })

  it('스톱에 소유자 트랙을 색이 아니라 심볼+라벨로 표시한다(§8)', () => {
    state.places = [{ id: 'p1', name: '칠성조선소' }, { id: 'p2', name: '지민 일정' }]
    state.events = [
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
      { id: 'e2', title: '지민 일정', start: kst('2026-07-25', '11:00'), end: kst('2026-07-25', '12:00'), place_id: 'p2', memo: null, version: 1, visibility: 'PERSONAL', owner_id: 'u2' },
    ]
    renderDetail()
    expect(screen.getByText('● 함께')).toBeInTheDocument()
    expect(screen.getByText('■ 상대')).toBeInTheDocument()
  })

  it('거리 칩 — 스톱 사이에 거리 + 길찾기를 텍스트로 보여준다', () => {
    seedTwoStops()
    state.legResults = [{ distanceMeters: 1240, polyline: null, degraded: false }]
    renderDetail()
    expect(screen.getByRole('button', { name: /칠성조선소에서 영금정까지 1.2km/ })).toBeInTheDocument()
    expect(screen.getByText(/1.2km · 길찾기/)).toBeInTheDocument()
  })

  it('거리 칩 — 1km 미만은 m 단위로', () => {
    seedTwoStops()
    state.legResults = [{ distanceMeters: 352, polyline: null, degraded: false }]
    renderDetail()
    expect(screen.getByText(/350m · 길찾기/)).toBeInTheDocument()
  })

  it('거리 칩 탭 → 다음 스톱으로 길찾기 딥링크', () => {
    seedTwoStops()
    state.legResults = [{ distanceMeters: 1240, polyline: null, degraded: false }]
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: /칠성조선소에서 영금정까지/ }))
    expect(state.openDirections).toHaveBeenCalledWith({ lat: 38.21, lng: 128.6, name: '영금정' })
  })

  it('프록시 미배포/실패면 칩을 숨긴다 — 목록은 그대로 뜬다', () => {
    seedTwoStops()
    state.legResults = undefined
    renderDetail()
    expect(screen.queryByText(/길찾기/)).not.toBeInTheDocument()
    expect(screen.getByText('칠성조선소')).toBeInTheDocument()
  })

  it('거리 미상(null)이면 0km 같은 거짓말 대신 칩을 숨긴다', () => {
    seedTwoStops()
    state.legResults = [{ distanceMeters: null, polyline: null, degraded: true }]
    renderDetail()
    expect(screen.queryByText(/길찾기/)).not.toBeInTheDocument()
  })

  it('좌표 없는 스톱이 끼면 그 구간엔 칩을 만들지 않는다(거짓 거리 방지)', () => {
    state.places = [
      { id: 'p1', name: '칠성조선소', lat: 38.2, lng: 128.59 },
      { id: 'p2', name: '이름만 있는 곳', lat: null, lng: null },
    ]
    state.events = [
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
      { id: 'e2', title: '이름만 있는 곳', start: kst('2026-07-25', '14:00'), end: kst('2026-07-25', '15:00'), place_id: 'p2', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
    ]
    state.legResults = [{ distanceMeters: 1240, polyline: null, degraded: false }]
    renderDetail()
    expect(screen.queryByText(/길찾기/)).not.toBeInTheDocument()
  })

  it('담은 뒤에도 패널이 열려 있어 연속으로 담을 수 있다 + 성공 토스트', () => {
    state.places = [
      { id: 'p1', name: '칠성조선소', lat: 38.2, lng: 128.59 },
      { id: 'p2', name: '영금정', lat: 38.21, lng: 128.6 },
    ]
    state.wishes = {
      byPlace: {
        p1: { userIds: ['u1'], totalPriority: 3, maxPriority: 3 },
        p2: { userIds: ['u1'], totalPriority: 2, maxPriority: 2 },
      },
      mine: {},
    }
    renderDetail()
    // 추가 경로가 Day마다 생겼다 — Day 1 섹션 안에서 연다(전역 버튼 하나였던 것에서 바뀜).
    const day1 = screen.getByRole('region', { name: /Day 1/ })
    fireEvent.click(within(day1).getByRole('button', { name: '장소 추가' }))
    fireEvent.click(within(day1).getByRole('button', { name: /칠성조선소/ }))

    expect(state.toast).toHaveBeenCalledWith(expect.stringContaining('칠성조선소'))
    // 패널이 닫히지 않아 다음 후보를 바로 담을 수 있다(곳당 2탭 → 1탭).
    expect(screen.getByRole('button', { name: /영금정/ })).toBeInTheDocument()
  })

  it('스톱 이름은 그 날짜 캘린더로 가는 링크 — 시각 편집 경로(6탭→2탭)', () => {
    state.places = [{ id: 'p1', name: '칠성조선소', lat: 38.2, lng: 128.59 }]
    state.events = [
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
    ]
    renderDetail()
    expect(screen.getByRole('link', { name: /칠성조선소 — 캘린더에서 시간 바꾸기/ })).toHaveAttribute(
      'href',
      '/calendar?date=2026-07-25',
    )
  })

  it('스톱에 순번을 매긴다 — 지도 마커 숫자와 같은 값(트리플식 번호 매칭)', () => {
    seedTwoStops()
    renderDetail()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('1')
    expect(items[1]).toHaveTextContent('2')
    // 스크린리더도 순서를 읽는다(숫자가 시각 배지에만 있지 않게).
    expect(screen.getByRole('link', { name: /^1\. 칠성조선소/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^2\. 영금정/ })).toBeInTheDocument()
  })

  it('스톱 카드에 카테고리·지역을 보여준다(사진 썸네일은 데이터가 없어 만들지 않는다)', () => {
    state.places = [{ id: 'p1', name: '칠성조선소', lat: 38.2, lng: 128.59, category: '카페', region_label: '속초' }]
    state.events = [
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-25', '09:00'), end: kst('2026-07-25', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
    ]
    renderDetail()
    expect(screen.getByText('카페 · 속초')).toBeInTheDocument()
  })

  it('없는 여행이면 친근한 빈 상태로 — 흰 화면 금지', () => {
    state.trips = []
    renderDetail()
    expect(screen.getByText('여행을 찾을 수 없어요')).toBeInTheDocument()
  })

  it('지난 여행에는 리캡 링크가 붙는다(계획 → 기록 연결)', () => {
    state.trips = [{ ...TRIP, start_date: '2026-05-01', end_date: '2026-05-02' }]
    renderDetail()
    expect(screen.getByRole('link', { name: /리캡 보기/ })).toHaveAttribute(
      'href',
      '/trips/t1/recap',
    )
  })

  // ── 리뷰(다녀온 뒤) ──────────────────────────────────────────────
  // 리뷰는 새 테이블이 아니라 내 visits 행의 rating/memo다(CLAUDE.md §7 — 스키마 안 늘림).

  it('아직 안 간 날에는 리뷰를 묻지 않는다', () => {
    seedTwoStops()
    renderDetail()
    // 오늘(2026-07-25)이 Day 1 — 지나지 않았으니 빈칸만 늘리는 리뷰 칸을 띄우지 않는다.
    expect(screen.queryByRole('button', { name: /리뷰 남기기/ })).toBeNull()
  })

  it('지난 날의 스톱에는 별점 + 한 줄 리뷰를 남길 수 있다', () => {
    state.trips = [{ ...TRIP, start_date: '2026-07-20', end_date: '2026-07-20' }]
    state.places = [{ id: 'p1', name: '칠성조선소' }]
    state.events = [
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-20', '09:00'), end: kst('2026-07-20', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
    ]
    renderDetail()
    fireEvent.click(screen.getByRole('button', { name: /리뷰 남기기/ }))
    // 별점은 색·모양만으로 말하지 않는다(§8) — 점수 라벨이 붙는다.
    fireEvent.click(screen.getByRole('radio', { name: '5점 중 4점' }))
    fireEvent.change(screen.getByLabelText(/리뷰 한 줄/), { target: { value: '커피가 좋았다' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))

    expect(state.saveReview).toHaveBeenCalledTimes(1)
    expect(state.saveReview.mock.calls[0]![0]).toMatchObject({
      placeId: 'p1',
      rating: 4,
      memo: '커피가 좋았다',
      tripId: 't1',
      visitDate: '2026-07-20',
    })
  })

  it('상대 리뷰는 읽기 전용 — 내 칸이 상대 글을 덮지 않는다', () => {
    state.trips = [{ ...TRIP, start_date: '2026-07-20', end_date: '2026-07-20' }]
    state.places = [{ id: 'p1', name: '칠성조선소' }]
    state.events = [
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-20', '09:00'), end: kst('2026-07-20', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
    ]
    // visits에 유니크 제약이 없어 둘이 각각 자기 행을 갖는다(created_by로 갈림).
    state.visits = [
      { id: 'v2', place_id: 'p1', trip_id: 't1', visit_date: '2026-07-20', rating: 5, memo: '또 가고 싶다', version: 1, created_by: 'u2' },
    ]
    renderDetail()
    expect(screen.getByText('또 가고 싶다')).toBeInTheDocument()
    expect(screen.getByLabelText('지민 리뷰')).toBeInTheDocument()
    // 상대 것이 있어도 내 리뷰 칸은 여전히 비어 있다(덮어쓰기 아님).
    expect(screen.getByRole('button', { name: /리뷰 남기기/ })).toBeInTheDocument()
  })

  it('내 리뷰가 있으면 보여주고 고칠 수 있다', () => {
    state.trips = [{ ...TRIP, start_date: '2026-07-20', end_date: '2026-07-20' }]
    state.places = [{ id: 'p1', name: '칠성조선소' }]
    state.events = [
      { id: 'e1', title: '칠성조선소', start: kst('2026-07-20', '09:00'), end: kst('2026-07-20', '10:00'), place_id: 'p1', memo: null, version: 1, visibility: 'SHARED', owner_id: 'u1' },
    ]
    state.visits = [
      { id: 'v1', place_id: 'p1', trip_id: 't1', visit_date: '2026-07-20', rating: 3, memo: '무난', version: 1, created_by: 'u1' },
    ]
    renderDetail()
    expect(screen.getByText('무난')).toBeInTheDocument()
    expect(screen.getByText('3/5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '고치기' }))
    // 기존 값이 폼에 들어와 있어야 한다 — 지우고 다시 쓰게 만들지 않는다.
    expect(screen.getByLabelText(/리뷰 한 줄/)).toHaveValue('무난')
    expect(screen.getByRole('radio', { name: '5점 중 3점' })).toHaveAttribute('aria-checked', 'true')
  })
})
