import { describe, it, expect } from 'vitest'
import { matchesQuery, searchSaved, filterSaved } from '@/lib/places/searchSaved'

// 담은 장소 '다시 찾기' — 장소가 쌓였을 때 가장 먼저 무너지는 지점이 렌더 성능이 아니라 찾기였다.
// 매칭 규칙이 곧 UX라 여기서 못 박는다.

const P = (id: string, name: string, extra: Partial<Record<'address' | 'region_label' | 'category', string>> = {}) => ({
  id,
  name,
  address: extra.address ?? null,
  region_label: extra.region_label ?? null,
  category: extra.category ?? null,
})

const PLACES = [
  P('p1', '칠성조선소', { address: '강원 속초시 중앙로46번길 45', region_label: '속초', category: '카페' }),
  P('p2', '아바이마을', { address: '강원 속초시 청호동', region_label: '속초', category: '관광' }),
  P('p3', '안목해변 커피거리', { address: '강원 강릉시 창해로', region_label: '강릉', category: '카페' }),
  P('p4', 'Blue Bottle', { address: '서울 성동구', region_label: '서울', category: '카페' }),
]

describe('matchesQuery', () => {
  it('이름 부분 일치', () => {
    expect(matchesQuery(PLACES[0]!, '조선소')).toBe(true)
    expect(matchesQuery(PLACES[0]!, '아바이')).toBe(false)
  })

  it('지역으로도 찾힌다 — "속초"라고 치면 이름에 속초가 없는 그 지역 장소도 나와야 한다', () => {
    // 사람이 기대하는 결과. 이름만 보면 칠성조선소가 '속초' 검색에서 빠진다.
    expect(matchesQuery(PLACES[0]!, '속초')).toBe(true)
  })

  it('카테고리로도 찾힌다', () => {
    expect(matchesQuery(PLACES[0]!, '카페')).toBe(true)
    expect(matchesQuery(PLACES[1]!, '카페')).toBe(false)
  })

  it('주소로도 찾힌다', () => {
    expect(matchesQuery(PLACES[1]!, '청호동')).toBe(true)
  })

  it('대소문자를 무시한다', () => {
    expect(matchesQuery(PLACES[3]!, 'blue')).toBe(true)
    expect(matchesQuery(PLACES[3]!, 'BLUE BOTTLE')).toBe(true)
  })

  it('앞뒤·연속 공백을 무시한다', () => {
    expect(matchesQuery(PLACES[3]!, '  blue   bottle  ')).toBe(true)
  })

  it('빈 질의는 거르지 않는다 — 검색창이 비었을 때 목록이 사라지면 안 된다', () => {
    expect(matchesQuery(PLACES[0]!, '')).toBe(true)
    expect(matchesQuery(PLACES[0]!, '   ')).toBe(true)
  })

  it('null 필드가 있어도 터지지 않는다', () => {
    expect(matchesQuery({ name: '이름만' }, '이름')).toBe(true)
    expect(matchesQuery({ name: '이름만' }, '없는말')).toBe(false)
  })
})

describe('searchSaved', () => {
  it('원본 순서를 보존한다(정렬은 호출측 책임)', () => {
    expect(searchSaved(PLACES, '카페').map((p) => p.id)).toEqual(['p1', 'p3', 'p4'])
  })

  it('빈 질의면 원본을 그대로 돌려준다', () => {
    expect(searchSaved(PLACES, '')).toBe(PLACES)
  })

  it('안 맞으면 빈 배열', () => {
    expect(searchSaved(PLACES, '없는장소')).toEqual([])
  })
})

describe('filterSaved — 상태와 질의는 교차한다(AND)', () => {
  const visitedIds = new Set(['p2', 'p3'])

  it('가고싶음 = 방문 기록 없는 것', () => {
    expect(filterSaved(PLACES, { status: 'wish', query: '', visitedIds }).map((p) => p.id)).toEqual(['p1', 'p4'])
  })

  it('가봤음 = 방문 기록 있는 것', () => {
    expect(filterSaved(PLACES, { status: 'visited', query: '', visitedIds }).map((p) => p.id)).toEqual(['p2', 'p3'])
  })

  it('★ "가본 곳 중에 속초" — 두 축이 곱해진다', () => {
    // 지도 시트의 기존 구조(컬렉션 칩이 상태 칩을 덮어씀)로는 표현할 수 없던 질의다.
    // 장소 탭은 처음부터 교차로 간다.
    const r = filterSaved(PLACES, { status: 'visited', query: '속초', visitedIds })
    expect(r.map((p) => p.id)).toEqual(['p2'])
  })

  it('전체 + 질의', () => {
    expect(filterSaved(PLACES, { status: 'all', query: '강원', visitedIds }).map((p) => p.id)).toEqual([
      'p1',
      'p2',
      'p3',
    ])
  })

  it('교차 결과가 비면 빈 배열(빈 상태 UI가 받아야 한다)', () => {
    expect(filterSaved(PLACES, { status: 'wish', query: '강릉', visitedIds })).toEqual([])
  })
})
