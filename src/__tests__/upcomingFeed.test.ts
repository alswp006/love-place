import { describe, expect, it } from 'vitest'
import { buildUpcomingFeed } from '@/lib/calendar/upcomingFeed'
import type { EventRow } from '@/hooks/useEvents'

const NOW = '2026-06-20T03:00:00.000Z' // 12:00 KST
const nowMs = new Date(NOW).getTime()
const MIN = 60_000
const DAY = 86_400_000

function ev(over: Partial<EventRow> & { id: string; start: string; end: string }): EventRow {
  return {
    id: over.id,
    title: over.title ?? '제목',
    start: over.start,
    end: over.end,
    is_all_day: over.is_all_day ?? false,
    time_zone: over.time_zone ?? 'Asia/Seoul',
    visibility: over.visibility ?? 'SHARED',
    participants: over.participants ?? 'BOTH',
    owner_id: over.owner_id ?? 'me',
    place_id: over.place_id ?? null,
    memo: over.memo ?? null,
    recurrence_rule: over.recurrence_rule ?? null,
    reminders: over.reminders ?? [],
    version: over.version ?? 1,
  }
}

describe('buildUpcomingFeed', () => {
  it('D-day: 3일 뒤 시작 이벤트 → dday 항목 label D-3, title 일치', () => {
    const start = new Date(nowMs + 3 * DAY).toISOString()
    const feed = buildUpcomingFeed(
      [ev({ id: 'e1', title: '제주 여행', start, end: new Date(nowMs + 3 * DAY + MIN).toISOString() })],
      NOW,
      'me',
    )
    const item = feed.find((i) => i.kind === 'dday')
    expect(item).toBeDefined()
    expect(item!.label).toBe('D-3')
    expect(item!.title).toBe('제주 여행')
  })

  it('곧 시작(내 리마인더): start=now+10분, 내 리마인더 10분 → imminent, 10분 뒤, minutesUntil 10', () => {
    const start = new Date(nowMs + 10 * MIN).toISOString()
    const feed = buildUpcomingFeed(
      [
        ev({
          id: 'e2',
          title: '저녁 약속',
          start,
          end: new Date(nowMs + 70 * MIN).toISOString(),
          reminders: [{ userId: 'me', offsetMinutes: 10 }],
        }),
      ],
      NOW,
      'me',
    )
    const item = feed.find((i) => i.kind === 'imminent')
    expect(item).toBeDefined()
    expect(item!.label).toContain('10분 뒤')
    expect(item!.minutesUntil).toBe(10)
  })

  it('상대 리마인더는 나에게 imminent 아님(start=now+90분이면 soft도 0)', () => {
    const start = new Date(nowMs + 90 * MIN).toISOString()
    const feed = buildUpcomingFeed(
      [
        ev({
          id: 'e3',
          title: '상대 일정',
          start,
          end: new Date(nowMs + 150 * MIN).toISOString(),
          reminders: [{ userId: 'partner', offsetMinutes: 10 }],
        }),
      ],
      NOW,
      'me',
    )
    expect(feed.filter((i) => i.kind === 'imminent')).toHaveLength(0)
  })

  it('반복 전개: WEEKLY 시리즈(과거 start), 다음 occurrence가 now+2일 → dday D-2(시리즈 start 아님)', () => {
    // 시리즈 start = now - 5일, WEEKLY → 다음 회차는 now+2일
    const seriesStart = new Date(nowMs - 5 * DAY).toISOString()
    const seriesEnd = new Date(nowMs - 5 * DAY + MIN).toISOString()
    const feed = buildUpcomingFeed(
      [ev({ id: 'e4', title: '주간 데이트', start: seriesStart, end: seriesEnd, recurrence_rule: 'FREQ=WEEKLY;INTERVAL=1' })],
      NOW,
      'me',
    )
    const item = feed.find((i) => i.kind === 'dday')
    expect(item).toBeDefined()
    expect(item!.label).toBe('D-2')
    expect(item!.startIso).not.toBe(seriesStart)
  })

  it('과거/지난 일정 제외', () => {
    const past = ev({
      id: 'past',
      title: '지난 일정',
      start: new Date(nowMs - 2 * DAY).toISOString(),
      end: new Date(nowMs - 2 * DAY + MIN).toISOString(),
    })
    const feed = buildUpcomingFeed([past], NOW, 'me')
    expect(feed).toHaveLength(0)
  })

  it('cap N(기본 5) 적용', () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      ev({
        id: `f${i}`,
        title: `미래 ${i}`,
        start: new Date(nowMs + (i + 2) * DAY).toISOString(),
        end: new Date(nowMs + (i + 2) * DAY + MIN).toISOString(),
      }),
    )
    const feed = buildUpcomingFeed(events, NOW, 'me')
    expect(feed).toHaveLength(5)
  })

  it('soft 태그: 내 리마인더 점화 시 soft falsey(리마인더 점화 imminent)', () => {
    const start = new Date(nowMs + 10 * MIN).toISOString()
    const feed = buildUpcomingFeed(
      [
        ev({
          id: 'fired',
          title: '리마인더 점화',
          start,
          end: new Date(nowMs + 70 * MIN).toISOString(),
          reminders: [{ userId: 'me', offsetMinutes: 10 }],
        }),
      ],
      NOW,
      'me',
    )
    const item = feed.find((i) => i.kind === 'imminent')
    expect(item).toBeDefined()
    expect(item!.soft).toBeFalsy()
  })

  it('soft 태그: 리마인더 없고 60분 이내면 soft:true(곧 시작 soft)', () => {
    const start = new Date(nowMs + 30 * MIN).toISOString() // 30분 뒤, 리마인더 없음
    const feed = buildUpcomingFeed(
      [
        ev({
          id: 'soft',
          title: '곧 시작 soft',
          start,
          end: new Date(nowMs + 90 * MIN).toISOString(),
        }),
      ],
      NOW,
      'me',
    )
    const item = feed.find((i) => i.kind === 'imminent')
    expect(item).toBeDefined()
    expect(item!.soft).toBe(true)
  })

  it('dedupe: 같은 이벤트가 imminent이자 today면 imminent만(중복 1회)', () => {
    const start = new Date(nowMs + 10 * MIN).toISOString() // 오늘 + 곧 시작
    const feed = buildUpcomingFeed(
      [
        ev({
          id: 'dup',
          title: '오늘 곧',
          start,
          end: new Date(nowMs + 70 * MIN).toISOString(),
          reminders: [{ userId: 'me', offsetMinutes: 10 }],
        }),
      ],
      NOW,
      'me',
    )
    const matches = feed.filter((i) => i.id === `dup:${start}`)
    expect(matches).toHaveLength(1)
    expect(matches[0]!.kind).toBe('imminent')
  })
})
