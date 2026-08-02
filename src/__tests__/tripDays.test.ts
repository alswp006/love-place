import { describe, it, expect } from 'vitest'
import {
  addDays,
  tripDays,
  tripPhase,
  tripPhaseLabel,
  sortTripsForList,
  stopsOfDay,
  stopCountInTrip,
  slotIso,
  nextStopStartMin,
  DEFAULT_FIRST_STOP_MIN,
  MAX_STOP_START_MIN, memosOfDay,
} from '@/lib/trips/tripDays'
import { dayKey, formatTime } from '@/lib/calendar/eventDays'

// 표시 tz는 Asia/Seoul(UTC+9) 고정 — KST 09:00 = 전날 00:00Z.
const kst = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const iso = new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`)
  return iso.toISOString()
}

describe('addDays', () => {
  it('월·연 경계를 넘어간다', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('tripDays', () => {
  it('1박2일 → Day 1·Day 2', () => {
    expect(tripDays({ start_date: '2026-07-25', end_date: '2026-07-26' })).toEqual([
      { key: '2026-07-25', index: 1 },
      { key: '2026-07-26', index: 2 },
    ])
  })

  it('당일치기는 Day 1 하나', () => {
    expect(tripDays({ start_date: '2026-07-25', end_date: '2026-07-25' })).toHaveLength(1)
  })

  it('end < start(잘못된 행)면 빈 배열 — 화면이 터지지 않는다', () => {
    expect(tripDays({ start_date: '2026-07-26', end_date: '2026-07-25' })).toEqual([])
  })

  it('상한을 넘는 기간은 잘라낸다(폭주 방어)', () => {
    expect(tripDays({ start_date: '2026-01-01', end_date: '2026-12-31' }, 5)).toHaveLength(5)
  })
})

describe('tripPhase / tripPhaseLabel', () => {
  const trip = { start_date: '2026-07-25', end_date: '2026-07-27' }

  it('시작 전·기간 중·종료 후를 가른다', () => {
    expect(tripPhase(trip, '2026-07-24')).toBe('UPCOMING')
    expect(tripPhase(trip, '2026-07-25')).toBe('ONGOING') // 시작일 포함
    expect(tripPhase(trip, '2026-07-27')).toBe('ONGOING') // 종료일 포함
    expect(tripPhase(trip, '2026-07-28')).toBe('PAST')
  })

  it('라벨은 색이 아닌 텍스트로 상태를 말한다(§8 이중화)', () => {
    expect(tripPhaseLabel(trip, '2026-07-26')).toBe('여행 중')
    expect(tripPhaseLabel(trip, '2026-07-24')).toBe('내일 출발')
    expect(tripPhaseLabel(trip, '2026-07-22')).toBe('D-3')
    expect(tripPhaseLabel(trip, '2026-07-28')).toBe('어제')
    expect(tripPhaseLabel(trip, '2026-07-30')).toBe('3일 전')
  })
})

describe('sortTripsForList', () => {
  it('진행중 → 예정(임박순) → 지난(최근순)', () => {
    const trips = [
      { id: 'past-old', start_date: '2026-01-01', end_date: '2026-01-02' },
      { id: 'soon', start_date: '2026-08-01', end_date: '2026-08-02' },
      { id: 'now', start_date: '2026-07-24', end_date: '2026-07-26' },
      { id: 'later', start_date: '2026-09-01', end_date: '2026-09-02' },
      { id: 'past-recent', start_date: '2026-06-01', end_date: '2026-06-02' },
    ]
    expect(sortTripsForList(trips, '2026-07-25').map((t) => t.id)).toEqual([
      'now',
      'soon',
      'later',
      'past-recent',
      'past-old',
    ])
  })

  it('원본 배열을 변형하지 않는다(쿼리 캐시 안전)', () => {
    const trips = [
      { id: 'a', start_date: '2026-09-01', end_date: '2026-09-02' },
      { id: 'b', start_date: '2026-08-01', end_date: '2026-08-02' },
    ]
    const before = trips.map((t) => t.id)
    sortTripsForList(trips, '2026-07-25')
    expect(trips.map((t) => t.id)).toEqual(before)
  })
})

describe('stopsOfDay', () => {
  const events = [
    { id: 'e2', start: kst('2026-07-25', '14:00'), place_id: 'p2' },
    { id: 'e1', start: kst('2026-07-25', '09:00'), place_id: 'p1' },
    { id: 'no-place', start: kst('2026-07-25', '11:00'), place_id: null },
    { id: 'next-day', start: kst('2026-07-26', '09:00'), place_id: 'p3' },
  ]

  it('그 날의 장소 연결 이벤트만 시간순으로', () => {
    expect(stopsOfDay(events, '2026-07-25').map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('장소 없는 일정은 여행 스톱이 아니다', () => {
    expect(stopsOfDay(events, '2026-07-25').some((e) => e.id === 'no-place')).toBe(false)
  })

  it('KST 자정 직전/직후가 같은 날로 새지 않는다', () => {
    const late = [
      { id: 'late', start: kst('2026-07-25', '23:30'), place_id: 'p1' },
      { id: 'early', start: kst('2026-07-26', '00:30'), place_id: 'p2' },
    ]
    expect(stopsOfDay(late, '2026-07-25').map((e) => e.id)).toEqual(['late'])
    expect(stopsOfDay(late, '2026-07-26').map((e) => e.id)).toEqual(['early'])
  })
})

describe('slotIso', () => {
  it('표시 tz(KST) 기준 시각으로 만든다', () => {
    const iso = slotIso('2026-07-25', 10 * 60)
    expect(dayKey(iso)).toBe('2026-07-25')
    expect(formatTime(iso)).toBe('10:00')
  })

  it('하루를 넘는 분은 23:59로 클램프 — 다음 날로 새지 않는다', () => {
    const iso = slotIso('2026-07-25', 30 * 60)
    expect(dayKey(iso)).toBe('2026-07-25')
    expect(formatTime(iso)).toBe('23:59')
  })
})

describe('nextStopStartMin', () => {
  it('비어 있으면 기본 시각(10:00)', () => {
    expect(nextStopStartMin([], '2026-07-25')).toBe(DEFAULT_FIRST_STOP_MIN)
  })

  it('마지막 스톱 끝에 이어붙인다', () => {
    const stops = [{ start: kst('2026-07-25', '10:30'), end: kst('2026-07-25', '11:30') }]
    expect(nextStopStartMin(stops, '2026-07-25')).toBe(11 * 60 + 30)
  })

  it('늦은 시각은 상한(22:00)으로 누른다', () => {
    const stops = [{ start: kst('2026-07-25', '20:00'), end: kst('2026-07-25', '23:30') }]
    expect(nextStopStartMin(stops, '2026-07-25')).toBe(MAX_STOP_START_MIN)
  })

  it('마지막 스톱이 자정을 넘겼으면 상한으로', () => {
    const stops = [{ start: kst('2026-07-25', '20:00'), end: kst('2026-07-26', '01:00') }]
    expect(nextStopStartMin(stops, '2026-07-25')).toBe(MAX_STOP_START_MIN)
  })

  // 회귀: 상한(22:00)을 지키느라 같은 분에 포개지던 버그. 하루가 찬 뒤에도 시작시각은 단조 증가해야
  // 정렬(start 오름차순)이 흔들리지 않는다.
  it('상한에 눌려도 직전 스톱과 같은 분에 놓지 않는다(겹침 금지)', () => {
    const stops = [{ start: kst('2026-07-25', '22:00'), end: kst('2026-07-25', '23:00') }]
    expect(nextStopStartMin(stops, '2026-07-25')).toBe(22 * 60 + 1)
  })

  it('하루를 몰아 담아도 시작시각이 계속 앞서지 않는다(단조 증가)', () => {
    // 10:00부터 60분짜리로 계속 담는 상황을 시뮬레이션 — 어느 지점에서도 이전과 같아지면 안 된다.
    const stops: { start: string; end: string }[] = []
    let prev = -1
    for (let i = 0; i < 20; i++) {
      const min = nextStopStartMin(stops, '2026-07-25')
      expect(min).toBeGreaterThan(prev)
      prev = min
      stops.push({ start: slotIso('2026-07-25', min), end: slotIso('2026-07-25', min + 60) })
    }
  })
})

describe('stopCountInTrip', () => {
  it('여행 기간에 든 장소 연결 이벤트만 센다', () => {
    const events = [
      { start: kst('2026-07-24', '10:00'), place_id: 'p0' }, // 기간 전
      { start: kst('2026-07-25', '10:00'), place_id: 'p1' },
      { start: kst('2026-07-26', '10:00'), place_id: 'p2' },
      { start: kst('2026-07-26', '12:00'), place_id: null }, // 장소 없음
      { start: kst('2026-07-27', '10:00'), place_id: 'p3' }, // 기간 후
    ]
    expect(stopCountInTrip(events, { start_date: '2026-07-25', end_date: '2026-07-26' })).toBe(2)
  })
})

describe('memosOfDay — 장소 없는 일정 = 그날의 메모', () => {
  const ev = (id: string, start: string, place: string | null) => ({ id, start, place_id: place })

  it('place_id가 없는 그 날 일정만, 시간순으로 준다', () => {
    const evs = [
      ev('m2', '2026-07-25T14:00:00+09:00', null),
      ev('s1', '2026-07-25T09:00:00+09:00', 'p1'),
      ev('m1', '2026-07-25T08:00:00+09:00', null),
      ev('m3', '2026-07-26T08:00:00+09:00', null), // 다른 날
    ]
    expect(memosOfDay(evs, '2026-07-25').map((e) => e.id)).toEqual(['m1', 'm2'])
  })

  it('스톱과 메모는 서로 겹치지 않는다 — 같은 날 일정을 둘로 정확히 가른다', () => {
    const evs = [
      ev('s1', '2026-07-25T09:00:00+09:00', 'p1'),
      ev('m1', '2026-07-25T10:00:00+09:00', null),
    ]
    const stops = stopsOfDay(evs, '2026-07-25').map((e) => e.id)
    const memos = memosOfDay(evs, '2026-07-25').map((e) => e.id)
    expect(stops).toEqual(['s1'])
    expect(memos).toEqual(['m1'])
    expect(stops.filter((id) => memos.includes(id))).toEqual([])
  })
})
