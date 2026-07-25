import type { LatLng } from '@/lib/recap/legs'

// 여행 Day의 스톱 사이 구간(leg) 도출 — 순수 함수.
// 리캡의 legs.ts(방문 정점 → 연속 동선)와 목적이 다르다: 여기선 '리스트에서 붙어 있는 두 스톱'만 잇는다.
// 좌표 없는 스톱(수동 입력 등)이 중간에 끼면 그 구간은 건너뛴다 — 억지로 이어 붙이면
// 칩이 실제와 다른 두 장소 사이 거리를 말하게 되고(거짓 정보), 리스트 위치도 어긋난다.

/** i번째 구간은 fromId 스톱 '아래'에 붙는다(리스트 렌더와 1:1). */
export type DayLeg = { fromId: string; toId: string; from: LatLng; to: LatLng }

/**
 * 인접 스톱 쌍 중 **양쪽 모두 좌표가 있는** 것만 구간으로.
 * coordOf가 null을 주면(좌표 미상) 그 스톱이 걸린 두 구간 모두 생기지 않는다.
 */
export function dayLegs<T extends { id: string }>(
  stops: readonly T[],
  coordOf: (stop: T) => LatLng | null,
): DayLeg[] {
  const out: DayLeg[] = []
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!
    const b = stops[i]!
    const from = coordOf(a)
    const to = coordOf(b)
    if (!from || !to) continue
    out.push({ fromId: a.id, toId: b.id, from, to })
  }
  return out
}

/** 스톱 id → 그 아래 붙을 구간의 인덱스. 프록시 결과(LegResult[])와 자리를 맞출 때 쓴다. */
export function legIndexByFromId(legs: readonly DayLeg[]): Record<string, number> {
  const m: Record<string, number> = {}
  legs.forEach((l, i) => {
    m[l.fromId] = i
  })
  return m
}

/**
 * 거리 표기 — 1km 미만은 m(10m 단위 반올림), 이상은 km(소수 1).
 * 미상(null)이면 null을 돌려 호출측이 칩 자체를 숨긴다(0km 같은 거짓말 금지).
 */
export function formatDistance(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return null
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`
  return `${Math.round((meters / 1000) * 10) / 10}km`
}

/** 캐시 키 — 스톱 순서·좌표가 바뀌면 새 쿼리(좌표는 5자리로 절사해 미세 흔들림 무시). */
export function legsKey(legs: readonly DayLeg[]): string {
  return legs
    .map(
      (l) =>
        `${l.fromId}>${l.toId}:${l.from.lat.toFixed(5)},${l.from.lng.toFixed(5)}>${l.to.lat.toFixed(5)},${l.to.lng.toFixed(5)}`,
    )
    .join('|')
}
