import { haversineKm } from './recapStats'

// 공유 카드에 그릴 경로 — **집을 인스타에 올리지 않기 위한** 가공.
//
// 동선 자랑은 이 앱의 성장 축이지만, 실측 경로를 그대로 올리면 시작점이 곧 집이다.
// Strava가 히트맵으로 군사기지를 노출한 사건이 이 문제였고, 그래서 '프라이버시 존'을 넣었다.
// 우리 legal 문서도 "비공개가 기본값"(§10.3)이라 공유 카드는 정면으로 충돌한다 —
// 그러니 트림은 기능이 아니라 **안전장치**다. 끄는 옵션을 두지 않는다.
//
// 무엇을 막고 무엇을 못 막나(정직하게):
//   막는다  — 시작·끝 좌표가 그림에 남는 것. 양 끝 반경 안의 점을 통째로 버린다.
//   못 막는다 — 그 동네를 아는 사람이 길 모양으로 알아보는 것. 그건 지명·눈금을 안 그리는 것으로
//              줄일 뿐 없앨 수 없다. 카드는 좌표·축척·지명을 일절 넣지 않는다.

/** 양 끝에서 잘라낼 반경(m). 도보 3~4분 거리 — 건물 특정이 어려워지는 선. */
export const SHARE_TRIM_M = 300

export type LatLng = { lat: number; lng: number }

/**
 * 경로 양 끝의 반경 안 점을 잘라낸다(순수).
 *
 * 잘라낸 뒤 2점 미만이면 **빈 배열**을 준다 — 반경보다 짧은 산책은 애초에 자랑할 동선이 아니고,
 * 억지로 남기면 그게 곧 집 앞 경로다. 호출부는 그때 경로 없이 숫자만 있는 카드를 그린다.
 */
export function trimEnds(points: readonly LatLng[], radiusM = SHARE_TRIM_M): LatLng[] {
  if (points.length < 2) return []
  const first = points[0]!
  const last = points[points.length - 1]!

  let i = 0
  while (i < points.length && haversineKm(first, points[i]!) * 1000 < radiusM) i++

  let j = points.length - 1
  // 되돌아오는 코스(집→어딘가→집)면 끝점 근처가 시작점 근처이기도 하다 — 양쪽에서 안쪽으로 판다.
  while (j >= 0 && haversineKm(last, points[j]!) * 1000 < radiusM) j--

  if (j - i + 1 < 2) return []
  return points.slice(i, j + 1)
}

/**
 * 카드에 그릴 경로를 고른다.
 *
 * 실측 GPS가 있으면 그것(삐뚤빼뚤한 진짜 경로가 자랑거리다). 없으면 장소를 이은 스케치.
 * 어느 쪽이든 트림을 거친다 — 장소 정점도 첫 곳이 집 근처일 수 있다.
 */
export function shareablePath(
  recorded: readonly LatLng[],
  fallback: readonly LatLng[],
): { path: LatLng[]; source: 'recorded' | 'places' | 'none' } {
  const fromRecorded = trimEnds(recorded)
  if (fromRecorded.length >= 2) return { path: fromRecorded, source: 'recorded' }
  const fromPlaces = trimEnds(fallback)
  if (fromPlaces.length >= 2) return { path: fromPlaces, source: 'places' }
  return { path: [], source: 'none' }
}

/** 누적 거리 표기 — 100km 넘으면 정수, 아니면 소수 첫째. "312km" / "8.4km" */
export function formatTotalKm(km: number): string {
  if (!Number.isFinite(km) || km <= 0) return '0km'
  return km >= 100 ? `${Math.round(km)}km` : `${km.toFixed(1)}km`
}
