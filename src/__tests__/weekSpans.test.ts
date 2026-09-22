import { describe, it, expect } from 'vitest'
import { weekSpans, spanOfEvent, spanOfTrip, spansDays, laneCount } from '@/lib/calendar/weekSpans'

// ⚠️ 기대값은 Flutter판 `app/test/calendar/week_spans_test.dart`와 **같다**.
//    같은 달력을 두 앱이 보여주므로 한쪽만 통과하는 값이 있으면 그게 곧 버그다.

// 2026-11-08(일) ~ 11-14(토).
const WEEK = [
  '2026-11-08',
  '2026-11-09',
  '2026-11-10',
  '2026-11-11',
  '2026-11-12',
  '2026-11-13',
  '2026-11-14',
]

/** 종일 일정: 마지막 날 23:59:59에 끝난다(eventTimes와 같은 모양). */
const ev = (id: string, from: string, to: string, title = '부산여행') =>
  spanOfEvent({ id, title, start: `${from}T00:00:00+09:00`, end: `${to}T23:59:59+09:00` })

const timed = (id: string, day: string, fromH: number, toH: number) =>
  spanOfEvent({
    id,
    title: '운동',
    start: `${day}T${String(fromH).padStart(2, '0')}:00:00+09:00`,
    end: `${day}T${String(toH).padStart(2, '0')}:00:00+09:00`,
  })

describe('무엇이 막대가 되나', () => {
  it('하루짜리 일정은 막대가 아니다 — 반복이 이어지면 안 된다', () => {
    // 매일 반복은 하루짜리가 여러 번이다. 전개된 회차마다 시작·끝이 같은 날이라 여기 오지 않는다.
    expect(spansDays({ start: '2026-11-09T00:00:00+09:00', end: '2026-11-09T23:59:59+09:00' })).toBe(false)
    expect(weekSpans(WEEK, [ev('a', '2026-11-09', '2026-11-09')])).toEqual([])
  })
  it('시작일과 종료일이 다르면 막대다', () => {
    expect(weekSpans(WEEK, [ev('t', '2026-11-09', '2026-11-11')])).toHaveLength(1)
  })
  it('자정을 넘기는 시각 일정도 두 날에 걸친다', () => {
    expect(weekSpans(WEEK, [timed('n', '2026-11-09', 23, 23)]).length).toBe(0)
    const overnight = spanOfEvent({
      id: 'n',
      title: '야근',
      start: '2026-11-09T23:00:00+09:00',
      end: '2026-11-10T01:00:00+09:00',
    })
    expect(weekSpans(WEEK, [overnight])).toHaveLength(1)
  })
  it('여행은 **하루짜리도** 막대다 — 그 자체가 하나의 일이다', () => {
    const s = weekSpans(WEEK, [
      spanOfTrip({ id: 't1', title: '부산여행', start_date: '2026-11-10', end_date: '2026-11-10' }),
    ])
    expect(s).toHaveLength(1)
    expect(s[0]!.item.title).toBe('부산여행')
    expect(s[0]!.item.isTrip).toBe(true)
  })
  it('여행 id는 일정과 섞이지 않는다', () => {
    expect(
      spanOfTrip({ id: 't1', title: '부산여행', start_date: '2026-10-04', end_date: '2026-10-06' }).id,
    ).toBe('trip:t1')
  })
})

describe('칸 범위', () => {
  it('주 안에 들어가면 시작·끝 칸이 그대로', () => {
    const s = weekSpans(WEEK, [ev('t', '2026-11-09', '2026-11-11')])[0]!
    expect([s.startCol, s.endCol, s.continuesLeft, s.continuesRight]).toEqual([1, 3, false, false])
  })
  it('앞 주에서 넘어오면 0번 칸부터, 이어짐 표시가 붙는다', () => {
    const s = weekSpans(WEEK, [ev('t', '2026-11-05', '2026-11-10')])[0]!
    expect([s.startCol, s.endCol, s.continuesLeft, s.continuesRight]).toEqual([0, 2, true, false])
  })
  it('다음 주로 넘어가면 6번 칸까지', () => {
    const s = weekSpans(WEEK, [ev('t', '2026-11-12', '2026-11-18')])[0]!
    expect([s.startCol, s.endCol, s.continuesRight]).toEqual([4, 6, true])
  })
  it('겹치지 않는 주는 버린다', () => {
    expect(weekSpans(WEEK, [ev('t', '2026-12-01', '2026-12-03')])).toEqual([])
  })
})

describe('줄 배정', () => {
  it('겹치는 막대는 다른 줄에 놓인다', () => {
    const s = weekSpans(WEEK, [ev('a', '2026-11-09', '2026-11-12'), ev('b', '2026-11-10', '2026-11-13')])
    expect(new Set(s.map((x) => x.lane))).toEqual(new Set([0, 1]))
    expect(laneCount(s)).toBe(2)
  })
  it('안 겹치면 같은 줄을 나눠 쓴다', () => {
    const s = weekSpans(WEEK, [ev('a', '2026-11-08', '2026-11-09'), ev('b', '2026-11-11', '2026-11-12')])
    expect(s.every((x) => x.lane === 0)).toBe(true)
    expect(laneCount(s)).toBe(1)
  })
  it('여행이 일정보다 위 — 그 주의 얼개라 먼저 읽혀야 한다', () => {
    const s = weekSpans(WEEK, [
      ev('a', '2026-11-09', '2026-11-12'),
      spanOfTrip({ id: 't1', title: '부산여행', start_date: '2026-11-09', end_date: '2026-11-12' }),
    ])
    expect(s.find((x) => x.item.isTrip)!.lane).toBeLessThan(s.find((x) => !x.item.isTrip)!.lane)
  })
  it('순서가 달라도 같은 배치 — 다시 그릴 때마다 줄이 바뀌면 안 된다', () => {
    const a = ev('a', '2026-11-09', '2026-11-12')
    const b = ev('b', '2026-11-10', '2026-11-13')
    const lanes = (xs: typeof a[]) => weekSpans(WEEK, xs).map((x) => x.lane)
    expect(lanes([a, b])).toEqual(lanes([b, a]))
  })
  it('같은 것이 두 번 들어와도 한 번만 그린다', () => {
    const e = ev('t', '2026-11-09', '2026-11-11')
    expect(weekSpans(WEEK, [e, e])).toHaveLength(1)
  })
})

it('주가 7칸이 아니면 아무것도 안 그린다 — 지어내지 않는다', () => {
  expect(weekSpans(['2026-11-08'], [ev('t', '2026-11-08', '2026-11-09')])).toEqual([])
})
