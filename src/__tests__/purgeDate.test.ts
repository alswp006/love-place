import { describe, it, expect } from 'vitest'
import { purgeDate, daysUntilPurge, PURGE_GRACE_DAYS } from '@/lib/trash/purgeDate'

// 삭제 예정일(purge horizon) — soft-delete된 행이 영구삭제되는 날(복구 유예 §4.3 / security-privacy §4).
// 순수 함수(테스트로 못박음): deleted_at + graceDays = purgeDate, 남은 일수는 음수 없음(과거면 0).

describe('purgeDate (삭제 예정일)', () => {
  it('기본 유예는 30일', () => {
    expect(PURGE_GRACE_DAYS).toBe(30)
  })

  it("purgeDate('2026-06-01T00:00:00Z', 30) → 2026-07-01 ISO", () => {
    expect(purgeDate('2026-06-01T00:00:00Z', 30)).toBe('2026-07-01T00:00:00.000Z')
  })

  it('graceDays 생략 시 PURGE_GRACE_DAYS(30) 사용', () => {
    expect(purgeDate('2026-06-01T00:00:00Z')).toBe('2026-07-01T00:00:00.000Z')
  })
})

describe('daysUntilPurge (영구삭제까지 남은 일수)', () => {
  it("daysUntilPurge('2026-06-01T00:00:00Z', 30, 2026-06-20) → 11", () => {
    expect(daysUntilPurge('2026-06-01T00:00:00Z', 30, new Date('2026-06-20T00:00:00Z'))).toBe(11)
  })

  it('유예 경과(now가 purgeDate 이후) → 0 (음수 없음)', () => {
    expect(daysUntilPurge('2026-06-01T00:00:00Z', 30, new Date('2026-08-01T00:00:00Z'))).toBe(0)
  })

  it('정확히 purgeDate 시점 → 0', () => {
    expect(daysUntilPurge('2026-06-01T00:00:00Z', 30, new Date('2026-07-01T00:00:00Z'))).toBe(0)
  })
})
