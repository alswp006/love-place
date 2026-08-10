// 담은 장소를 **이름으로 다시 찾는** 필터.
//
// 왜 새로 만드나: 지금 앱에는 저장된 장소를 검색할 수단이 없다. 지도 상단 검색창은 외부 API로
// *새* 장소를 발견하는 입구라서, 이미 담은 200곳 중 하나를 꺼내려면 목록을 손으로 훑는 게
// 유일한 길이다(장소가 쌓일수록 가장 먼저 무너지는 지점이 렌더 성능이 아니라 '찾기'였다).
//
// 순수 함수로 두는 이유: 매칭 규칙(어느 필드까지 볼 것인가)이 곧 사용자 경험이라 테스트로 못 박는다.

/** 검색 대상이 되는 최소 형태 — PlaceRow가 이걸 만족한다(구조적 타이핑). */
export type SearchablePlace = {
  name: string
  address?: string | null
  region_label?: string | null
  category?: string | null
}

/** 비교용 정규화 — 대소문자·앞뒤 공백·연속 공백을 무시한다. */
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * 이름·주소·지역·카테고리 중 **어디든** 부분 일치하면 통과.
 *
 * 주소·지역·카테고리까지 보는 이유: "속초"라고 치면 이름에 속초가 없는 그 지역 장소들도 나와야
 * 사람이 기대하는 결과가 된다("카페"로 치면 카테고리가 카페인 곳들이 나오는 것도 마찬가지).
 * 빈 질의는 **거르지 않는다**(전체 통과) — 검색창이 비었을 때 목록이 사라지면 안 된다.
 */
export function matchesQuery(place: SearchablePlace, query: string): boolean {
  const q = norm(query)
  if (q === '') return true
  const haystack = [place.name, place.address, place.region_label, place.category]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .map(norm)
  return haystack.some((h) => h.includes(q))
}

/** matchesQuery로 거른 새 배열. 원본 순서를 보존한다(정렬은 호출측 책임). */
export function searchSaved<T extends SearchablePlace>(places: T[], query: string): T[] {
  const q = norm(query)
  if (q === '') return places
  return places.filter((p) => matchesQuery(p, q))
}

/** 상태 필터 축 — 컬렉션과 달리 서로 배타적인 3값. */
export type StatusFilter = 'all' | 'wish' | 'visited'

/**
 * 상태 + 질의를 함께 적용. **두 축은 교차한다**(AND).
 *
 * 지금 지도 시트는 컬렉션 칩이 상태 칩을 덮어쓰는 배타 구조인데, 축이 늘어나면 그 방식은
 * "가본 곳 중에 속초"를 표현할 수 없다. 장소 탭은 처음부터 교차로 간다.
 */
export function filterSaved<T extends SearchablePlace & { id: string }>(
  places: T[],
  opts: { status: StatusFilter; query: string; visitedIds: Set<string> },
): T[] {
  const byStatus =
    opts.status === 'wish'
      ? places.filter((p) => !opts.visitedIds.has(p.id))
      : opts.status === 'visited'
        ? places.filter((p) => opts.visitedIds.has(p.id))
        : places
  return searchSaved(byStatus, opts.query)
}
