import { describe, it, expect } from 'vitest'
import { buildProvideFeed, type ProvideLogRow } from '@/lib/journey/provideLog'

const NOW = '2026-06-27T12:00:00Z'
function row(id: string, daysAgo: number): ProvideLogRow {
  const at = new Date(new Date(NOW).getTime() - daysAgo * 86_400_000).toISOString()
  return { id, recipient_id: 'partner', event_at: at, session_ref: 's1' }
}

describe('buildProvideFeed — 제3자 제공 통보(제19조)', () => {
  it('빈 입력 → 빈 피드', () => {
    expect(buildProvideFeed([], { notifyMode: 'IMMEDIATE', nowIso: NOW })).toEqual([])
    expect(buildProvideFeed([], { notifyMode: 'BATCHED_30D', nowIso: NOW })).toEqual([])
  })

  it('IMMEDIATE: 최근 7일 건별, 최신순, 상대 라벨', () => {
    const items = buildProvideFeed([row('a', 0), row('b', 1)], { notifyMode: 'IMMEDIATE', nowIso: NOW })
    expect(items).toHaveLength(2)
    expect(items[0]?.detail).toBe('오늘')
    expect(items[1]?.detail).toBe('어제')
    expect(items[0]?.label).toMatch(/열람/)
    expect(items[0]?.kind).toBe('provide')
  })

  it('IMMEDIATE: 7일 초과 행은 제외', () => {
    const items = buildProvideFeed([row('a', 0), row('old', 10)], { notifyMode: 'IMMEDIATE', nowIso: NOW })
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('provide:a')
  })

  it('BATCHED_30D: 30일 1건으로 집계(횟수)', () => {
    const items = buildProvideFeed([row('a', 0), row('b', 5), row('c', 20)], {
      notifyMode: 'BATCHED_30D',
      nowIso: NOW,
    })
    expect(items).toHaveLength(1)
    expect(items[0]?.detail).toBe('최근 30일 3회')
  })

  it('BATCHED_30D: 30일 초과만 있으면 빈 피드', () => {
    expect(buildProvideFeed([row('old', 40)], { notifyMode: 'BATCHED_30D', nowIso: NOW })).toEqual([])
  })
})
