import { describe, it, expect } from 'vitest'
import {
  normalizeInviteCode,
  formatInviteCode,
  isValidInviteCode,
  inviteShareText,
  extractInviteCode,
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

  describe('extractInviteCode (붙여넣기 자동 추출)', () => {
    // 동작 메모: normalizeInviteCode가 한글·공백·하이픈 등 비 [A-Z0-9] 문자를 모두 제거하고
    //   ASCII 영문/숫자만 남긴다. 한글 안내문은 통째로 사라지므로 코드만 남고,
    //   8자 슬라이딩 윈도우 + isValidInviteCode(알파벳 32자 멤버십)로 첫 유효 윈도우를 찾는다.
    it('한글 안내문 사이의 하이픈 코드를 추출', () => {
      // 한글은 전부 탈락 → 'ABCD234548' 남음 → 첫 유효 윈도우 ABCD2345
      expect(
        extractInviteCode('초대코드: ABCD-2345 (48시간 내 입력)'),
      ).toBe('ABCD2345')
    })

    it('앱 공유 문구(inviteShareText) 전체에서 실제 코드를 추출 (브랜딩 오추출 방지)', () => {
      // 브랜드명 'Weave'는 전부 Base32 알파벳이라, 한글을 걷어내면 코드와 이어 붙어
      // **첫 유효 8자 윈도우가 WEAVEABC**가 된다(브랜드가 love place였을 때보다 더 나쁘다).
      // '초대코드' 라벨 뒤를 우선 탐색하기 때문에 실제 코드가 나온다 — 그 우선순위가 이 테스트의 요지다.
      expect(extractInviteCode(inviteShareText('ABCD2345'))).toBe('ABCD2345')
    })

    it('브랜드명이 코드로 오인될 수 있음을 못박는다 — 라벨 없이 훑으면 실제로 틀린다', () => {
      // 라벨을 뗀 같은 문구. 순진하게 훑으면 브랜드 글자가 먼저 잡힌다.
      // 이게 실패하기 시작하면 브랜드명이 바뀌었거나 추출 규칙이 바뀐 것이니 둘 다 다시 봐야 한다.
      const noLabel = inviteShareText('ABCD2345').replace('초대코드:', '')
      expect(extractInviteCode(noLabel)).not.toBe('ABCD2345')
    })

    it('하이픈/소문자만 있어도 정규화 후 추출', () => {
      expect(extractInviteCode('abcd-2345')).toBe('ABCD2345')
    })

    it('유효 코드가 없으면 null', () => {
      expect(extractInviteCode('안녕하세요 코드 없음')).toBe(null)
    })

    it('긴 토큰에 유효한 8자 구간이 박혀 있으면 첫 유효 윈도우를 고른다', () => {
      // 앞쪽 윈도우(IIII…)는 혼동문자 I 때문에 무효 → i=4의 ABCD2345가 첫 유효 윈도우
      expect(extractInviteCode('IIIIABCD2345XYZ')).toBe('ABCD2345')
    })

    it('9자 영숫자라도 유효한 8자 윈도우가 없으면 null', () => {
      // 두 윈도우 모두 0/1(혼동문자) 포함 → 무효
      expect(extractInviteCode('AB0CD1EF1')).toBe(null)
    })

    it('정규화 후 8자 미만이면 null', () => {
      expect(extractInviteCode('ABC')).toBe(null)
    })
  })
})
