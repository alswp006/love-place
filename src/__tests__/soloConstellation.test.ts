import { describe, it, expect } from 'vitest'
import { starsNeededForMonth, daysInMonth } from '@/lib/streak/constellations'
import { monthsOfYear, dailyDoneCounts, type EventMeta } from '@/lib/streak/garden'

// 별자리 분모는 '날 수 × 사람 수'다.
// 혼자 쓰는 동안 2로 고정하면 한 달을 **다 채워도 절반**이라 별자리가 영원히 완성되지 않는다.
// 달성 불가능한 목표는 게이미피케이션이 아니라 그냥 실패 표시다(0024).

describe('starsNeededForMonth — 사람 수만큼', () => {
  it('둘이면 날 수 × 2 (기본값 유지)', () => {
    expect(starsNeededForMonth('2026-08')).toBe(31 * 2)
    expect(starsNeededForMonth('2026-08', 2)).toBe(62)
  })

  it('혼자면 날 수 × 1 — 한 달을 다 채우면 완성된다', () => {
    expect(starsNeededForMonth('2026-08', 1)).toBe(31)
    expect(starsNeededForMonth('2026-02', 1)).toBe(28)
  })

  it('윤년 2월도 실제 날 수를 따른다', () => {
    expect(daysInMonth('2028-02')).toBe(29)
    expect(starsNeededForMonth('2028-02', 1)).toBe(29)
  })
})

describe('monthsOfYear — 혼자 채운 한 달이 실제로 완성된다', () => {
  const meta: EventMeta = { owner_id: 'me', visibility: 'SHARED', category_id: null }
  const metaOf = () => meta

  it('혼자 31일을 다 채우면 complete — 예전엔 62가 필요해 영원히 미완성이었다', () => {
    const completions = Array.from({ length: 31 }, (_, i) => ({
      event_id: `e${i}`,
      occurrence_start: `2026-08-${String(i + 1).padStart(2, '0')}T01:00:00.000Z`,
      done_at: `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00+09:00`,
      created_by: 'me',
    }))
    const counts = dailyDoneCounts(completions, metaOf, 'me')
    const solo = monthsOfYear(counts, '2026-08-15', 1)
    const pair = monthsOfYear(counts, '2026-08-15', 2)
    const aug = (list: ReturnType<typeof monthsOfYear>) =>
      list.find((m) => m.monthKey === '2026-08')!

    expect(aug(solo).needed).toBe(31)
    expect(aug(solo).complete).toBe(true)
    // 같은 데이터라도 둘이면 아직 절반 — 분모가 사람 수를 따라간다는 뜻.
    expect(aug(pair).needed).toBe(62)
    expect(aug(pair).complete).toBe(false)
  })

  it('열두 달이 모두 나오고 분모가 달마다 실제 날 수를 따른다', () => {
    const months = monthsOfYear(new Map(), '2026-08-15', 1)
    expect(months).toHaveLength(12)
    expect(months.find((m) => m.monthKey === '2026-02')!.needed).toBe(28)
    expect(months.find((m) => m.monthKey === '2026-04')!.needed).toBe(30)
  })
})
