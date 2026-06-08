// 카카오 검색 프록시(kakao-search) 응답 타입 — 03-proxy-contract.md (a)와 1:1.
export type KakaoPlaceHit = {
  kakaoPlaceId: string // 카카오 place id — UNIQUE per couple 키
  name: string
  address: string
  lat: number // WGS84 위도(네이버 지도에 그대로 핀)
  lng: number // WGS84 경도
  category: string
  placeUrl: string
  phone?: string
}

export type KakaoSearchRes = {
  ok: true
  hits: KakaoPlaceHit[]
  isEnd: boolean
  cached: boolean
}

export type ProxyErrorRes = {
  ok: false
  code: string
  message: string
  retryAfterSec?: number
}
