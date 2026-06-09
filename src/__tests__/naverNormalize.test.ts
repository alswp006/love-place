import { describe, it, expect } from 'vitest'
import {
  stripTags,
  norm,
  naverCoordToWgs84,
  isInKorea,
  naverItemToHit,
  type NaverLocalItem,
} from '@/lib/naver/normalize'

describe('네이버 검색 정규화', () => {
  it('좌표 변환: mapx=경도, mapy=위도 (÷1e7)', () => {
    const { lat, lng } = naverCoordToWgs84('1270475020', '375173050')
    expect(lng).toBeCloseTo(127.047502, 5)
    expect(lat).toBeCloseTo(37.517305, 5)
    // 한국 영역 안
    expect(isInKorea(lat, lng)).toBe(true)
  })

  it('좌표 순서 실수 방지: mapx를 lat에 넣으면 한국 밖', () => {
    // mapx(127대)를 위도로 쓰면 isInKorea가 false여야(회귀 가드)
    expect(isInKorea(127.04, 37.51)).toBe(false)
  })

  it('HTML <b> 태그 제거 + 엔티티 디코드', () => {
    expect(stripTags('칠성<b>조선소</b>')).toBe('칠성조선소')
    expect(stripTags('A&amp;B 카페')).toBe('A&B 카페')
  })

  it('합성키 정규화: 대소문자·공백 무시', () => {
    expect(norm('  칠성  조선소 ')).toBe('칠성 조선소')
  })

  it('item → PlaceHit 매핑 (좌표·이름·합성키)', () => {
    const item: NaverLocalItem = {
      title: '칠성<b>조선소</b>',
      link: 'https://map.naver.com/x',
      category: '카페',
      telephone: '',
      address: '강원도 속초시 청호동 1-1',
      roadAddress: '강원특별자치도 속초시 청호로 122',
      mapx: '1285955000',
      mapy: '381890000',
    }
    const hit = naverItemToHit(item)
    expect(hit.name).toBe('칠성조선소')
    expect(hit.address).toBe('강원특별자치도 속초시 청호로 122') // 도로명 우선
    expect(hit.category).toBe('카페')
    expect(hit.placeUrl).toBe('https://map.naver.com/x')
    expect(hit.phone).toBeUndefined() // 빈 전화 → 생략
    expect(isInKorea(hit.lat, hit.lng)).toBe(true)
    // 합성키 = norm(name)|norm(roadAddress)
    expect(hit.kakaoPlaceId).toBe('칠성조선소|강원특별자치도 속초시 청호로 122')
  })

  it('중복 식별: 같은 이름+주소면 같은 합성키(공백·대소문자 차이 흡수)', () => {
    const base: NaverLocalItem = {
      title: '스타벅스 속초점',
      link: 'a',
      category: '카페',
      telephone: '',
      address: '지번',
      roadAddress: '강원 속초시 중앙로 1',
      mapx: '1285900000',
      mapy: '381800000',
    }
    const a = naverItemToHit(base)
    const b = naverItemToHit({ ...base, title: '스타벅스  속초점 ', link: 'b' })
    expect(a.kakaoPlaceId).toBe(b.kakaoPlaceId) // 점프(중복 식별)
  })
})
