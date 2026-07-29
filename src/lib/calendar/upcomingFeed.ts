// 다가오는 일정/활동 피드 — 순수 함수(테스트로 못박음). 안 울리는 리마인더를 인앱 신호로.
// (웹푸시는 PWA 홈화면+iOS16.4 한정 → 후속. 인앱 피드가 1차 알림 수단 — ux-and-accessibility §6.)
import type { EventRow } from '@/hooks/useEvents'
import { expandEvents } from './rrule'
import { dayKey, dDayLabel, upcomingEvents } from './eventDays'
import { deriveTrack, type Track } from './track'

export type FeedItem = {
  id: string // `${eventId}:${startIso}`
  kind: 'imminent' | 'dday'
  title: string
  startIso: string
  label: string // 'D-3' | '오늘' | '내일' | '10분 뒤'
  minutesUntil?: number
  soft?: boolean // imminent 중 '리마인더 없이 60분 이내(곧 시작)' soft 점화 — 리마인더 점화와 구분(라벨/아이콘 이중화)
  // 누구 일정인가 — useEvents는 SHARED와 양쪽 PERSONAL을 모두 준다. 이게 없으면 상대의 개인 일정이
  // 첫 화면에 출처 없이 섞여 뜬다(캘린더에선 트랙으로 구분되던 정보가 여기서만 사라짐).
  ownerId: string
  track: Track // 저장 아님 — deriveTrack 런타임 도출(§7)
  dayKey: string // 딥링크(/calendar?date=)용
}

const DAY_MS = 86400000

export function buildUpcomingFeed(
  events: EventRow[], nowIso: string, myId: string | null, max = 5,
): FeedItem[] {
  const nowMs = new Date(nowIso).getTime()
  const winEnd = new Date(nowMs + 30 * DAY_MS).toISOString()
  const occ = expandEvents(events, nowIso, winEnd)
  const todayKey = dayKey(nowIso)

  const imminent: FeedItem[] = []
  for (const e of occ) {
    const startMs = new Date(e.start).getTime()
    if (startMs < nowMs) continue
    const myReminders = (e.reminders ?? []).filter((r) => r.userId === myId)
    const offsets = myReminders.map((r) => r.offsetMinutes)
    // 내 리마인더 점화창 또는 60분 이내 soft
    const minUntil = Math.round((startMs - nowMs) / 60000)
    const reminderFired = offsets.some((off) => nowMs >= startMs - off * 60000)
    const softImminent = !reminderFired && minUntil <= 60
    if (reminderFired || softImminent) {
      imminent.push({
        id: `${e.id}:${e.start}`, kind: 'imminent', soft: softImminent,
        title: e.title, startIso: e.start, label: `${minUntil}분 뒤`, minutesUntil: minUntil,
        ownerId: e.owner_id, track: deriveTrack(e, myId), dayKey: dayKey(e.start),
      })
    }
  }
  imminent.sort((a, b) => a.startIso.localeCompare(b.startIso))

  const imminentIds = new Set(imminent.map((i) => i.id))
  const dday: FeedItem[] = upcomingEvents(occ, nowIso)
    .map((e) => ({
      id: `${e.id}:${e.start}`, kind: 'dday' as const, title: e.title, startIso: e.start,
      label: dDayLabel(dayKey(e.start), todayKey),
      ownerId: e.owner_id, track: deriveTrack(e, myId), dayKey: dayKey(e.start),
    }))
    .filter((i) => !imminentIds.has(i.id))

  return [...imminent, ...dday].slice(0, max)
}
