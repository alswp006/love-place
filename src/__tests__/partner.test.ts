import { describe, it, expect } from 'vitest'
import { daysTogether, partnerLabel } from '@/lib/partner'

// 상대 표시 보조 — 함께한 지 D+N / 빈 이름 폴백(dossier 02 §4, R3.4).
describe('partner — daysTogether / partnerLabel', () => {
  it('daysTogether: 10일 경과 → 10', () => {
    expect(daysTogether('2026-06-10T00:00:00Z', new Date('2026-06-20T00:00:00Z'))).toBe(10)
  })

  it('daysTogether: 같은 날 → 0', () => {
    expect(daysTogether('2026-06-20T00:00:00Z', new Date('2026-06-20T00:00:00Z'))).toBe(0)
  })

  it('daysTogether: connectedAt 없으면 null', () => {
    expect(daysTogether(null, new Date('2026-06-20T00:00:00Z'))).toBeNull()
  })

  it("partnerLabel: display_name 있으면 그 이름('민지')", () => {
    expect(partnerLabel({ displayName: '민지' }, null)).toBe('민지')
  })

  it("partnerLabel: display_name 빈값이면 로컬 닉네임('자기')으로 폴백", () => {
    expect(partnerLabel({ displayName: '' }, '자기')).toBe('자기')
  })

  it("partnerLabel: display_name·닉네임 모두 없으면 '상대'", () => {
    expect(partnerLabel({ displayName: '' }, null)).toBe('상대')
  })
})
