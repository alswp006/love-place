// 네이버 지역검색 응답 정규화(순수 함수 — 테스트로 못박음).
// Edge Function(서버)과 동일 로직을 클라/테스트에서 검증하기 위해 분리.

export type NaverLocalItem = {
  title: string // HTML <b> 태그 포함
  link: string
  category: string
  telephone: string
  address: string // 지번
  roadAddress: string // 도로명
  mapx: string // 경도 × 10^7 (WGS84, 2026 기준)
  mapy: string // 위도 × 10^7
}

// 공통 검색 결과(카카오 KakaoPlaceHit와 동일 형태 — 클라가 그대로 재사용).
export type PlaceHit = {
  kakaoPlaceId: string // 네이버는 고유 ID 없음 → norm(name)|norm(roadAddress) 합성키
  name: string
  address: string
  lat: number // WGS84 위도
  lng: number // WGS84 경도
  category: string
  placeUrl: string
  phone?: string
}

/** HTML 태그(<b></b> 등) 제거 + 엔티티 디코드. */
export function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** 합성키용 정규화: 소문자 + 연속공백 1개 + trim. */
export function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * 네이버 mapx/mapy → WGS84 lat/lng.
 * mapx=경도×1e7, mapy=위도×1e7 (배열 (lat,lng) 순서와 반대 주의).
 * 예: mapx="1270475020", mapy="375173050" → lng=127.047502, lat=37.517305
 */
export function naverCoordToWgs84(mapx: string, mapy: string): { lat: number; lng: number } {
  return { lat: Number(mapy) / 1e7, lng: Number(mapx) / 1e7 }
}

/** 한국 영역 좌표인지(변환 검증용). 위도 33~39, 경도 124~132. */
export function isInKorea(lat: number, lng: number): boolean {
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132
}

/** 네이버 item → 공통 PlaceHit. */
export function naverItemToHit(it: NaverLocalItem): PlaceHit {
  const name = stripTags(it.title)
  const address = it.roadAddress || it.address
  const { lat, lng } = naverCoordToWgs84(it.mapx, it.mapy)
  return {
    kakaoPlaceId: `${norm(name)}|${norm(address)}`,
    name,
    address,
    lat,
    lng,
    category: it.category,
    placeUrl: it.link,
    ...(it.telephone ? { phone: it.telephone } : {}),
  }
}
