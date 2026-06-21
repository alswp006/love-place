import type { PlaceCollectionRow } from '@/hooks/useCollections'

// 사용자 정의 컬렉션(저장 목록) 멤버십 도출 — 순수 함수(상태 저장 아님). place_collections 조인행에서
// "이 목록에 담긴 장소들" / "이 장소가 담긴 목록들"을 런타임에 도출한다(CLAUDE.md §7 도출 원칙과 일관).

/** 특정 컬렉션에 담긴 장소 id 집합(필터링용). */
export function memberPlaceIdSet(
  placeCollections: PlaceCollectionRow[],
  collectionId: string,
): Set<string> {
  const s = new Set<string>()
  for (const pc of placeCollections) if (pc.collection_id === collectionId) s.add(pc.place_id)
  return s
}

/** 특정 장소가 담긴 컬렉션 id 집합(상세의 목록 토글 체크 상태용). */
export function memberCollectionIdSet(
  placeCollections: PlaceCollectionRow[],
  placeId: string,
): Set<string> {
  const s = new Set<string>()
  for (const pc of placeCollections) if (pc.place_id === placeId) s.add(pc.collection_id)
  return s
}
