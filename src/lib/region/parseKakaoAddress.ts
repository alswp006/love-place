// 카카오 주소 문자열에서 지역 라벨 추출(§4.2 region 이원화).
// 카카오 address 예: "강원특별자치도 속초시 청호동 ...", "서울 마포구 ...", "제주특별자치도 제주시 ..."
// region_label = 시/군/구 단위 표시명(예: "속초", "마포구", "제주시").
// region_code(법정동 b_code)는 정확 매핑이 어려우므로 P1에선 라벨만 채우고 code는 null 허용.
// (regions 시드에 없는 지역이어도 FK 위반 없이 저장되도록 code는 비워둔다 — 0006 주석 참고.)

const SIDO_SUFFIX = /(특별자치도|특별자치시|특별시|광역시|도|시)$/

export type ParsedRegion = {
  regionLabel: string | null
  // regionCode는 P1에선 미사용(null). P3 지역별 보기에서 시드/매핑 확장 시 채움.
  regionCode: string | null
}

export function parseKakaoAddress(address: string | null | undefined): ParsedRegion {
  if (!address) return { regionLabel: null, regionCode: null }
  const parts = address.trim().split(/\s+/)
  if (parts.length === 0) return { regionLabel: null, regionCode: null }

  // 두 번째 토큰이 보통 시/군/구(첫 토큰은 시도). 예: ["강원특별자치도","속초시",...] → "속초"
  // 단, 광역시 구는 ["서울","마포구"] → "마포구"로 그대로.
  const sido = parts[0] ?? ''
  const sigungu = parts[1] ?? ''

  if (sigungu) {
    // "속초시" → "속초", "제주시"는 "제주시" 유지(시 단독이면 시 떼면 모호)
    const trimmed = sigungu.endsWith('시') && sigungu.length > 2 ? sigungu.slice(0, -1) : sigungu
    return { regionLabel: trimmed, regionCode: null }
  }
  // 시군구가 없으면 시도라도
  const sidoLabel = sido.replace(SIDO_SUFFIX, '')
  return { regionLabel: sidoLabel || null, regionCode: null }
}
