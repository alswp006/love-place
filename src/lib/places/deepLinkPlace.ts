// ?place= 딥링크 검증 — 우리 커플의 로드된 장소에만 매칭(RLS가 1차 방어, 여기선 미로드/타커플 가드).
export function resolveDeepLinkPlace(placeParam: string | null, ids: readonly string[]): string | null {
  if (!placeParam) return null
  return ids.includes(placeParam) ? placeParam : null
}
