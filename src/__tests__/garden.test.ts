import { describe, it, expect } from 'vitest'
import {
  dailyDoneCounts,
  levelOf,
  ownerOf,
  gardenGrid,
  journeyProgress,
  weekDoneCount,
  STEPS_PER_STATION,
  STATIONS,
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

describe('levelOf · ownerOf — 색만으로 구분하지 않으려면 단계가 결정론적이어야 한다', () => {
  it('0~4단계', () => {
    expect([0, 1, 2, 3, 7].map(levelOf)).toEqual([0, 1, 2, 3, 4])
  })

  it('가장 많은 쪽이 칸의 주인, 동수면 함께', () => {
    expect(ownerOf({ key: 'k', total: 3, mine: 2, partner: 1, shared: 0 })).toBe('mine')
    expect(ownerOf({ key: 'k', total: 2, mine: 1, partner: 1, shared: 0 })).toBe('shared')
    expect(ownerOf({ key: 'k', total: 0, mine: 0, partner: 0, shared: 0 })).toBe('none')
  })
})

describe('gardenGrid', () => {
  it('12주 × 7칸, 오늘이 마지막 열에 든다', () => {
    // 2026-08-05는 수요일 → 마지막 열의 3번째 칸.
    const counts = dailyDoneCounts([done('a', kst('2026-08-05'))], metaOf, 'me')
    const grid = gardenGrid(counts, '2026-08-05')
    expect(grid).toHaveLength(12)
    expect(grid[0]).toHaveLength(7)
    const last = grid[11]!
    expect(last[2]!.key).toBe('2026-08-05')
    expect(last[2]!.total).toBe(1)
  })

  it('빈 날도 자리를 지킨다 — 격자가 들쭉날쭉하면 안 된다', () => {
    const grid = gardenGrid(new Map(), '2026-08-05', 2)
    expect(grid.flat()).toHaveLength(14)
    expect(grid.flat().every((c) => c.total === 0)).toBe(true)
  })
})

describe('journeyProgress — 뒤로 가지 않는 여정', () => {
  it('완료 1건 = 한 걸음, 10걸음마다 정거장', () => {
    expect(journeyProgress(0)).toMatchObject({ stationsPassed: 0, stepInLeg: 0, remaining: 10 })
    expect(journeyProgress(4)).toMatchObject({ stationsPassed: 0, stepInLeg: 4, remaining: 6 })
    expect(journeyProgress(STEPS_PER_STATION)).toMatchObject({ stationsPassed: 1, stepInLeg: 0 })
  })

  it('정거장은 순환한다 — 끝나서 멈추는 여정이 아니다', () => {
    const p = journeyProgress(STEPS_PER_STATION * STATIONS.length)
    expect(p.from.key).toBe(STATIONS[0]!.key)
  })

  it('구간 진행도는 0~1', () => {
    expect(journeyProgress(5).ratio).toBe(0.5)
    expect(journeyProgress(0).ratio).toBe(0)
  })

  it('음수·소수를 넣어도 깨지지 않는다', () => {
    expect(journeyProgress(-3).steps).toBe(0)
    expect(journeyProgress(3.7).steps).toBe(3)
  })
})

describe('weekDoneCount', () => {
  it('이번 주 월요일부터 오늘까지만 센다 — 미래는 세지 않는다', () => {
    const counts = dailyDoneCounts(
      [
        done('a', kst('2026-08-03')), // 월
        done('b', kst('2026-08-05')), // 수(오늘)
        done('c', kst('2026-08-07')), // 금(미래)
        done('d', kst('2026-07-31')), // 지난주
      ],
      metaOf,
      'me',
    )
    expect(weekDoneCount(counts, '2026-08-05')).toBe(2)
  })
})
