// 지도 마커 모양 도출(§5.5·ux §4) — 색만이 아니라 모양으로 상태 구분(색각 이상 대응).
//  가고싶음=빈 별(☆) / 둘 다 찜=하트(♥) / 가봤음=채운 별(★). 우선순위: 가봤음 > 둘 다 찜 > 가고싶음.
// 순수 함수(테스트로 못박음).

export type MarkerKind = 'wish' | 'both' | 'visited'
export type MarkerVisual = { glyph: string; kind: MarkerKind; label: string }

export function markerVisual(opts: { visited: boolean; bothWished: boolean; name: string }): MarkerVisual {
  const { visited, bothWished, name } = opts
  if (visited) return { glyph: '★', kind: 'visited', label: `${name} — 가봤음` }
  if (bothWished) return { glyph: '♥', kind: 'both', label: `${name} — 둘 다 찜` }
  return { glyph: '☆', kind: 'wish', label: `${name} — 가고싶음` }
}
