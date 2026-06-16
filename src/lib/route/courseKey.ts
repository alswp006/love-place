// 추천 코스 멱등 키(R1.1) — 결정론·장소순서 무관. itineraries.course_key에 저장해 중복 차단.
// 형식: `${coupleId}:${dayKey}:${sortedPlaceIds.join(',')}:${startMin}`
export function courseKey(
  coupleId: string,
  dayKey: string,
  placeIds: readonly string[],
  startMin: number,
): string {
  const sorted = [...placeIds].sort()
  return `${coupleId}:${dayKey}:${sorted.join(',')}:${startMin}`
}
