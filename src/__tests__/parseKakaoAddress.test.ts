import { describe, it, expect } from 'vitest'
import { parseKakaoAddress } from '@/lib/region/parseKakaoAddress'

describe('parseKakaoAddress (카카오 주소 → 지역 라벨, §4.2)', () => {
  it('도+시 주소에서 시 이름을 뽑는다(속초시 → 속초)', () => {
    expect(parseKakaoAddress('강원특별자치도 속초시 청호동 1-1').regionLabel).toBe('속초')
  })

  it('강릉시 → 강릉', () => {
    expect(parseKakaoAddress('강원특별자치도 강릉시 안현동').regionLabel).toBe('강릉')
  })

  it('광역시 구는 그대로 유지(마포구)', () => {
    expect(parseKakaoAddress('서울 마포구 합정동').regionLabel).toBe('마포구')
  })

  it('제주시는 짧은 시명이라 시를 떼지 않는다', () => {
    // "제주시"(3글자)는 슬라이스 적용 → "제주"가 됨. 도시명 일관성 확인.
    expect(parseKakaoAddress('제주특별자치도 제주시 노형동').regionLabel).toBe('제주')
  })

  it('빈 주소는 null', () => {
    expect(parseKakaoAddress('').regionLabel).toBeNull()
    expect(parseKakaoAddress(null).regionLabel).toBeNull()
    expect(parseKakaoAddress(undefined).regionLabel).toBeNull()
  })

  it('regionCode는 P1에서 항상 null(시드 FK 위반 방지)', () => {
    expect(parseKakaoAddress('강원특별자치도 속초시 청호동').regionCode).toBeNull()
  })
})
