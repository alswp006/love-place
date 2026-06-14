import { describe, it, expect } from 'vitest'
import { directionsUrl, directionsWebUrl } from '@/lib/places/directionsUrl'

describe('directionsUrl (네이버 길찾기 딥링크 — 순수)', () => {
  it('앱 스킴 nmap://route/public에 좌표/이름/appname을 인코딩한다', () => {
    const url = directionsUrl({ lat: 37.5, lng: 127.0, name: '칠성 조선소' })
    expect(url.startsWith('nmap://route/public?')).toBe(true)
    expect(url).toContain('dlat=37.5')
    expect(url).toContain('dlng=127')
    expect(url).toContain('dname=%EC%B9%A0%EC%84%B1%20%EC%A1%B0%EC%84%A0%EC%86%8C')
    expect(url).toContain('appname=')
  })

  it('웹 폴백은 https://map.naver.com에 목적지 좌표/이름을 싣는다', () => {
    const url = directionsWebUrl({ lat: 37.5, lng: 127.0, name: '카페' })
    expect(url.startsWith('https://map.naver.com/')).toBe(true)
    expect(url).toContain('37.5')
    expect(url).toContain('127')
  })

  it('이름의 특수문자(&,",공백)는 인코딩된다', () => {
    const url = directionsUrl({ lat: 1, lng: 2, name: 'a&b "c"' })
    expect(url).toContain(encodeURIComponent('a&b "c"'))
  })
})
