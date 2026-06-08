import { describe, it, expect } from 'vitest'
import {
  normalizeInviteCode,
  formatInviteCode,
  isValidInviteCode,
  inviteShareText,
} from '@/lib/inviteCode'

describe('inviteCode 유틸 (P0d 커플 연결)', () => {
  it('정규화: 소문자·하이픈·공백을 흡수해 대문자 영숫자만', () => {
    expect(normalizeInviteCode('abcd-2345')).toBe('ABCD2345')
    expect(normalizeInviteCode('ABCD 2345')).toBe('ABCD2345')
    expect(normalizeInviteCode(' a b c d 2 3 4 5 ')).toBe('ABCD2345')
  })

  it('표시: 8자는 4-4 하이픈 분할', () => {
    expect(formatInviteCode('ABCD2345')).toBe('ABCD-2345')
    expect(formatInviteCode('abcd2345')).toBe('ABCD-2345')
  })

  it('표시: 8자 아니면 정규화만(분할 안 함)', () => {
    expect(formatInviteCode('ABC')).toBe('ABC')
  })

  it('검증: 8자 + 허용 문자셋만 통과', () => {
    expect(isValidInviteCode('ABCD2345')).toBe(true)
    expect(isValidInviteCode('abcd-2345')).toBe(true) // 정규화 후 통과
    expect(isValidInviteCode('ABCD234')).toBe(false) // 7자
    expect(isValidInviteCode('ABCD23451')).toBe(false) // 9자
  })

  it('검증: 혼동 문자(I,O,0,1)는 거부 (알파벳 32자에서 제외)', () => {
    expect(isValidInviteCode('ABCDO234')).toBe(false) // O 불가
    expect(isValidInviteCode('ABCD0234')).toBe(false) // 0 불가
    expect(isValidInviteCode('ABCDI234')).toBe(false) // I 불가
    expect(isValidInviteCode('ABCD1234')).toBe(false) // 1 불가
    // 주의: L은 알파벳에 포함됨(A-Z에서 I,O만 제외) → 유효
    expect(isValidInviteCode('ABCDL234')).toBe(true)
  })

  it('공유 텍스트에 포맷된 코드와 안내가 포함', () => {
    const text = inviteShareText('ABCD2345')
    expect(text).toContain('ABCD-2345')
    expect(text).toContain('48시간')
  })
})
