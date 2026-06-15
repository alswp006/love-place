import { describe, it, expect } from 'vitest'
import { dedupKey } from '@/lib/places/savePlace'

describe('savePlace dedup 키(좌표 포함) — 같은 건물 다른 가게 구분 + 지번/도로명 변형 흡수', () => {
  it('이름·주소·반올림 좌표(4자리)로 키를 만든다', () => {
    expect(dedupKey({ name: '칠성조선소', address: '강원 속초시 중앙로 6', lat: 38.20741, lng: 128.59123 }))
      .toBe('칠성조선소|강원 속초시 중앙로 6|38.2074|128.5912')
  })
  it('좌표가 4자리 이하 미세 차이면 같은 키(변형 흡수), 다른 가게면 이름이 달라 다른 키', () => {
    const a = dedupKey({ name: '카페A', address: '같은건물 1층', lat: 37.500001, lng: 127.000004 })
    const b = dedupKey({ name: '카페A', address: '같은건물 1층', lat: 37.500009, lng: 127.000001 })
    const c = dedupKey({ name: '카페B', address: '같은건물 2층', lat: 37.500001, lng: 127.000004 })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})
