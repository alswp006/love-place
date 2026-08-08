import { describe, it, expect } from 'vitest'
import { dailyDoneCounts, monthStars, recentMonths, monthOf, filledToday } from '@/lib/streak/garden'
import {
  constellationOfMonth,
  starSlots,
  starsNeededForMonth,
  daysInMonth,
  CONSTELLATIONS,
} from '@/lib/streak/constellations'

// 별자리는 집계 테이블 없이 event_completions에서 도출한다(§7) — 그 도출 규칙을 못박는다.

const metas = new Map<
  string,
  { owner_id: string; visibility: 'SHARED' | 'PERSONAL'; category_id: string | null }
>()
const metaOf = (id: string) => metas.get(id)

/** 완료 기록 하나 + 그 회차가 가리키는 일정 메타를 함께 만든다. */
const done = (
  eventId: string,
  at: string,
  by: string,
  over: Partial<{ visibility: 'SHARED' | 'PERSONAL'; category_id: string | null }> = {},
) => {
  metas.set(eventId, {
    owner_id: 'me',
    visibility: over.visibility ?? ('PERSONAL' as const),
    category_id: over.category_id ?? null,
  })
  return { event_id: eventId, done_at: at, created_by: by }
}

const kst = (day: string, hhmm = '12:00') => new Date(`${day}T${hhmm}:00+09:00`).toISOString()

describe('dailyDoneCounts', () => {
  it('지워진 일정의 완료는 빠진다 — 없는 일을 했다고 하지 않는다', () => {
    const orphan = { event_id: 'gone', done_at: kst('2026-08-05'), created_by: 'me' }
    expect(dailyDoneCounts([orphan], metaOf, 'me').size).toBe(0)
  })

  it('별의 주인은 일정 소유자가 아니라 체크한 사람이다', () => {
    // 함께 일정을 내가 끝내면 내 별이다 — 하루 한 사람 한 별 규칙과 앞뒤가 맞아야 한다.
    const counts = dailyDoneCounts(
      [done('a', kst('2026-08-05'), 'me', { visibility: 'SHARED' })],
      metaOf,
      'me',
    )
    expect(counts.get('2026-08-05')).toMatchObject({ mine: 1, partner: 0 })
  })

  it('카테고리를 주면 그 카테고리만 — 전체 보기는 필터하지 않는다', () => {
    const evs = [
      done('a', kst('2026-08-05', '09:00'), 'me', { category_id: 'study' }),
      done('b', kst('2026-08-05', '10:00'), 'me', { category_id: 'gym' }),
      done('c', kst('2026-08-05', '11:00'), 'me', { category_id: null }),
    ]
    expect(dailyDoneCounts(evs, metaOf, 'me').get('2026-08-05')?.total).toBe(3)
    expect(dailyDoneCounts(evs, metaOf, 'me', { categoryId: 'study' }).get('2026-08-05')?.total).toBe(1)
    expect(dailyDoneCounts(evs, metaOf, 'me', { categoryId: null }).get('2026-08-05')?.total).toBe(1)
  })

  it('한국 시간 자정 직전/직후가 다른 날로 갈린다', () => {
    const counts = dailyDoneCounts(
      [done('a', kst('2026-08-05', '23:59'), 'me'), done('b', kst('2026-08-06', '00:01'), 'me')],
      metaOf,
      'me',
    )
    expect(counts.get('2026-08-05')?.total).toBe(1)
    expect(counts.get('2026-08-06')?.total).toBe(1)
  })
})

describe('monthStars — 하루에 한 사람이 별 하나', () => {
  it('같은 사람이 그 날 여러 번 끝내도 별은 하나', () => {
    // 개수 경쟁이 되면 하루에 몰아치고 나머지 날을 비우는 게 유리해진다 — 그걸 막는 규칙이다.
    const counts = dailyDoneCounts(
      [
        done('a', kst('2026-08-05', '09:00'), 'me'),
        done('b', kst('2026-08-05', '15:00'), 'me'),
        done('c', kst('2026-08-05', '21:00'), 'me'),
      ],
      metaOf,
      'me',
    )
    const stars = monthStars(counts, '2026-08')
    expect(stars).toHaveLength(1)
    // 그 날 '처음' 챙긴 순간이 기록이다.
    expect(stars[0]).toMatchObject({ eventId: 'a', dayKey: '2026-08-05' })
  })

  it('같은 날이라도 사람이 다르면 별 둘', () => {
    const counts = dailyDoneCounts(
      [done('a', kst('2026-08-05', '09:00'), 'me'), done('b', kst('2026-08-05', '10:00'), 'you')],
      metaOf,
      'me',
    )
    const stars = monthStars(counts, '2026-08')
    expect(stars.map((s) => s.owner)).toEqual(['mine', 'partner'])
  })

  it('다른 달의 완료는 섞이지 않는다', () => {
    const counts = dailyDoneCounts(
      [done('a', kst('2026-07-31'), 'me'), done('b', kst('2026-08-01'), 'me')],
      metaOf,
      'me',
    )
    expect(monthStars(counts, '2026-08')).toHaveLength(1)
    expect(monthStars(counts, '2026-07')).toHaveLength(1)
  })

  it('체크한 순서대로 늘어선다', () => {
    const counts = dailyDoneCounts(
      [done('a', kst('2026-08-06', '08:00'), 'me'), done('b', kst('2026-08-05', '20:00'), 'you')],
      metaOf,
      'me',
    )
    expect(monthStars(counts, '2026-08').map((s) => s.dayKey)).toEqual(['2026-08-05', '2026-08-06'])
  })
})

describe('recentMonths · filledToday', () => {
  it('한 달을 다 채우려면 날 수 × 2개가 필요하다', () => {
    expect(starsNeededForMonth('2026-08')).toBe(62) // 31일 × 2
    expect(starsNeededForMonth('2026-02')).toBe(56) // 28일 × 2
    expect(starsNeededForMonth('2024-02')).toBe(58) // 윤년 29일 × 2
  })

  it('이번 달이 마지막이고 최근 n개월이 순서대로 온다', () => {
    const ms = recentMonths(new Map(), '2026-08-05', 3)
    expect(ms.map((m) => m.monthKey)).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(ms[2]!.needed).toBe(62)
  })

  it('다 채우면 완성', () => {
    const entries = Array.from({ length: 31 }, (_, i) => {
      const d = `2026-08-${String(i + 1).padStart(2, '0')}`
      return [done(`m${i}`, kst(d, '09:00'), 'me'), done(`y${i}`, kst(d, '10:00'), 'you')]
    }).flat()
    const counts = dailyDoneCounts(entries, metaOf, 'me')
    const ms = recentMonths(counts, '2026-08-31', 1)
    expect(ms[0]!.stars).toHaveLength(62)
    expect(ms[0]!.complete).toBe(true)
  })

  it('오늘 각자 채웠는지 따로 말한다', () => {
    const counts = dailyDoneCounts([done('a', kst('2026-08-05'), 'me')], metaOf, 'me')
    expect(filledToday(counts, '2026-08-05')).toEqual({ mine: true, partner: false })
    expect(filledToday(counts, '2026-08-06')).toEqual({ mine: false, partner: false })
  })

  it('monthOf는 그 날이 속한 달', () => {
    expect(monthOf('2026-08-05')).toBe('2026-08')
  })
})

describe('별자리 — 그 계절에 실제로 뜨는 것', () => {
  it('달이 정해지면 별자리도 정해진다 — 새로고침해도 같다', () => {
    expect(constellationOfMonth('2026-08').key).toBe(constellationOfMonth('2026-08').key)
  })

  it('그 계절에 실제로 보이는 별자리가 배정된다', () => {
    expect(['cygnus', 'lyra', 'scorpius']).toContain(constellationOfMonth('2026-07').key)
    expect(['orion', 'gemini']).toContain(constellationOfMonth('2026-01').key)
    expect(['cassiopeia', 'pegasus']).toContain(constellationOfMonth('2026-10').key)
  })

  it('해가 바뀌면 같은 달이라도 다른 별자리가 나온다', () => {
    const keys = ['2026-07', '2027-07', '2028-07'].map((k) => constellationOfMonth(k).key)
    expect(new Set(keys).size).toBeGreaterThan(1)
  })

  it('모든 별자리의 edge는 실재하는 별을 가리킨다(선이 허공으로 가지 않게)', () => {
    for (const c of CONSTELLATIONS) {
      for (const [a, b] of c.edges) {
        expect(a).toBeLessThan(c.points.length)
        expect(b).toBeLessThan(c.points.length)
        expect(a).not.toBe(b)
      }
      expect(c.points.length).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('starSlots — 밝은 별 먼저, 나머지는 선 위에', () => {
  it('요구 개수만큼 자리를 낸다', () => {
    for (const c of CONSTELLATIONS) {
      expect(starSlots(c, 62)).toHaveLength(62)
      expect(starSlots(c, 56)).toHaveLength(56)
    }
  })

  it('앞자리는 실제 밝은 별(anchor) — 초반에도 모양이 읽혀야 한다', () => {
    const c = CONSTELLATIONS[0]!
    const slots = starSlots(c, 62)
    expect(slots.slice(0, c.points.length).every((s) => s.anchor)).toBe(true)
    expect(slots.slice(c.points.length).every((s) => !s.anchor)).toBe(true)
  })

  it('채움 별은 선 위에 놓인다 — 허공에 흩어지지 않는다', () => {
    for (const c of CONSTELLATIONS) {
      const onEdge = starSlots(c, 40)
        .filter((s) => !s.anchor)
        .every((s) =>
          c.edges.some(([a, b]) => {
            const p = c.points[a]!
            const q = c.points[b]!
            // 점이 선분 위에 있으면 외적이 0이다(부동소수 오차 허용).
            const cross = (s.x - p[0]) * (q[1] - p[1]) - (s.y - p[1]) * (q[0] - p[0])
            return Math.abs(cross) < 1e-6
          }),
        )
      expect(onEdge).toBe(true)
    }
  })

  it('요구 개수가 밝은 별보다 적으면 밝은 별만 낸다', () => {
    const c = CONSTELLATIONS[0]!
    expect(starSlots(c, 3)).toHaveLength(3)
  })

  it('daysInMonth는 달마다 맞다', () => {
    expect(daysInMonth('2026-08')).toBe(31)
    expect(daysInMonth('2026-04')).toBe(30)
    expect(daysInMonth('2026-02')).toBe(28)
  })
})
