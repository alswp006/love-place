// 결정론 폴백(§5.6) — AI 타임아웃·5xx·검증 실패 시 좌표 nearest-neighbor 순서로 최소한의 동선 제공.
// 순수·결정론(같은 입력 → 같은 출력). 테스트로 못박음.

export type GeoPlace = { id: string; lat: number; lng: number }

// 위경도 제곱거리(정렬용이므로 sqrt 불필요, 한국 좁은 범위에서 근사 충분).
function dist2(a: GeoPlace, b: GeoPlace): number {
  const dx = a.lat - b.lat
  const dy = a.lng - b.lng
  return dx * dx + dy * dy
}

/** nearest-neighbor 방문 순서(placeId 배열). startId가 있으면 거기서 시작, 없으면 첫 장소. */
export function nearestNeighborOrder(places: GeoPlace[], startId?: string): string[] {
  if (places.length === 0) return []
  const remaining = places.slice()
  let startIdx = startId ? remaining.findIndex((p) => p.id === startId) : 0
  if (startIdx < 0) startIdx = 0

  const order: string[] = []
  let current = remaining.splice(startIdx, 1)[0]!
  order.push(current.id)

  while (remaining.length > 0) {
    let best = 0
    for (let i = 1; i < remaining.length; i++) {
      if (dist2(current, remaining[i]!) < dist2(current, remaining[best]!)) best = i
    }
    current = remaining.splice(best, 1)[0]!
    order.push(current.id)
  }
  return order
}
