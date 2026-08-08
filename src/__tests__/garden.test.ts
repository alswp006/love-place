import { describe, it, expect } from 'vitest'
import {
  dailyDoneCounts,
  weekStars,
  recentWeeks,
  mondayOf,
  constellationOf,
  STARS_PER_WEEK,
} from '@/lib/streak/garden'

// 잔디·여정은 집계 테이블 없이 event_completions에서 도출한다(§7) — 그 도출 규칙을 못박는다.

// 완료는 event_completions 행이고, 색·카테고리는 그 회차가 가리키는 events에서 온다.
// 테스트에서는 한 번에 둘을 만들어 metaOf에 실어 준다.
const metas = new Map<string, { owner_id: string; visibility: 'SHARED' | 'PERSONAL'; category_id: string | null }>()
const metaOf = (id: string) => metas.get(id)

const done = (
  id: string,
  at: string | null,
  over: Partial<{ owner_id: string; visibility: 'SHARED' | 'PERSONAL'; category_id: string | null }> = {},
) => {
  metas.set(id, {
    owner_id: over.owner_id ?? 'me',
    visibility: over.visibility ?? ('PERSONAL' as const),
    category_id: over.category_id ?? null,
  })
  return { event_id: id, done_at: at ?? '' }
}

const kst = (day: string, hhmm = '12:00') => new Date(`${day}T${hhmm}:00+09:00`).toISOString()

describe('dailyDoneCounts', () => {
  it('지워진 일정의 완료는 잔디에서 빠진다 — 없는 일을 했다고 하지 않는다', () => {
    const orphan = { event_id: 'gone', done_at: kst('2026-08-05') }
    expect(dailyDoneCounts([orphan], metaOf, 'me').size).toBe(0)
  })

  it('완료 기록이 있는 날만 잔디가 찬다', () => {
    // done_at이 없는 회차는 애초에 완료 기록이 아니다 — 행이 없으면 잔디도 없다.
    const counts = dailyDoneCounts([done('b', kst('2026-08-05'))], metaOf, 'me')
    expect(counts.size).toBe(1)
    expect(counts.get('2026-08-05')?.total).toBe(1)
  })

  it('누구 칸인지 갈린다 — 함께는 소유자와 무관하게 함께', () => {
    const counts = dailyDoneCounts(
      [
        done('a', kst('2026-08-05'), { owner_id: 'me' }),
        done('b', kst('2026-08-05'), { owner_id: 'you' }),
        done('c', kst('2026-08-05'), { owner_id: 'you', visibility: 'SHARED' }),
      ],
      metaOf,
      'me',
    )
    const cell = counts.get('2026-08-05')!
    expect(cell).toMatchObject({ total: 3, mine: 1, partner: 1, shared: 1 })
  })

  it('카테고리를 주면 그 카테고리만 — 전체 보기는 필터하지 않는다', () => {
    const evs = [
      done('a', kst('2026-08-05'), { category_id: 'study' }),
      done('b', kst('2026-08-05'), { category_id: 'gym' }),
      done('c', kst('2026-08-05'), { category_id: null }),
    ]
    expect(dailyDoneCounts(evs, metaOf, 'me').get('2026-08-05')?.total).toBe(3)
    expect(dailyDoneCounts(evs, metaOf, 'me', { categoryId: 'study' }).get('2026-08-05')?.total).toBe(1)
    // 분류 없음(null)도 하나의 칸으로 고를 수 있어야 한다.
    expect(dailyDoneCounts(evs, metaOf, 'me', { categoryId: null }).get('2026-08-05')?.total).toBe(1)
  })

  it('한국 시간 자정 직전/직후가 다른 날로 갈린다', () => {
    const counts = dailyDoneCounts(
      [done('a', kst('2026-08-05', '23:59')), done('b', kst('2026-08-06', '00:01'))],
      metaOf,
      'me',
    )
    expect(counts.get('2026-08-05')?.total).toBe(1)
    expect(counts.get('2026-08-06')?.total).toBe(1)
  })
})

describe('별자리 — 완료 1건이 별 하나, 한 주에 7개면 완성', () => {
  it('그 주 완료를 날짜순으로 편다 — 같은 날은 함께→나→상대 순(위치가 흔들리면 안 된다)', () => {
    const counts = dailyDoneCounts(
      [
        done('a', kst('2026-08-04'), { owner_id: 'you' }), // 화 · 상대
        done('b', kst('2026-08-03'), { owner_id: 'me' }), // 월 · 나
        done('c', kst('2026-08-03'), { owner_id: 'you', visibility: 'SHARED' }), // 월 · 함께
      ],
      metaOf,
      'me',
    )
    expect(weekStars(counts, '2026-08-03')).toEqual(['shared', 'mine', 'partner'])
  })

  it('7개를 채우면 그 주 별자리가 완성된다', () => {
    const many = Array.from({ length: 7 }, (_, i) => done(`s${i}`, kst('2026-08-05')))
    const counts = dailyDoneCounts(many, metaOf, 'me')
    const weeks = recentWeeks(counts, '2026-08-05', 2)
    expect(weeks).toHaveLength(2)
    expect(weeks[1]!.complete).toBe(true)
    expect(weeks[0]!.complete).toBe(false) // 지난주는 비어 있다
  })

  it('오늘이 속한 주가 마지막이고, 월요일 키로 정렬된다', () => {
    const weeks = recentWeeks(new Map(), '2026-08-05', 3)
    expect(weeks.map((w) => w.mondayKey)).toEqual(['2026-07-20', '2026-07-27', '2026-08-03'])
  })

  it('mondayOf는 그 주 월요일 — 일요일도 그 주로 묶인다', () => {
    expect(mondayOf('2026-08-05')).toBe('2026-08-03') // 수
    expect(mondayOf('2026-08-03')).toBe('2026-08-03') // 월
    expect(mondayOf('2026-08-09')).toBe('2026-08-03') // 일
  })

  it('별자리 모양은 주 키에서 결정론적으로 나온다 — 새로고침해도 같은 별자리', () => {
    const a = constellationOf('2026-08-03')
    const b = constellationOf('2026-08-03')
    expect(a.name).toBe(b.name)
    expect(a.points).toHaveLength(STARS_PER_WEEK)
    // 주가 다르면 대체로 다른 모양이 나온다(전부 같은 모양이면 재미가 없다).
    const names = new Set(
      Array.from({ length: 12 }, (_, i) => constellationOf(`2026-0${(i % 9) + 1}-0${(i % 7) + 1}`).name),
    )
    expect(names.size).toBeGreaterThan(1)
  })
})
