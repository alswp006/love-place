import { describe, it, expect } from 'vitest'
import { escapeHtml, infoWindowHtml } from '@/lib/places/infoWindowHtml'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { WithWish } from '@/lib/places/wishStatus'

const wish = { wishedByMe: true, wishedByPartner: true, bothWished: true, wishCount: 2, totalPriority: 2, maxPriority: 1 }
const place: WithWish<PlaceRow> = {
  id: 'p1', name: '칠성"조선소', address: '속초시', region_label: '속초', lat: 38, lng: 128,
  category: '카페', kakao_place_id: 'k1', added_by: 'u1', version: 1, wish,
}

describe('infoWindowHtml (말풍선 HTML — 순수)', () => {
  it('escapeHtml: 따옴표/꺾쇠를 이스케이프한다', () => {
    expect(escapeHtml('a"<b>')).toBe('a&quot;&lt;b&gt;')
  })

  it('이름을 이스케이프하고 둘 다 찜 글리프(♥)+텍스트를 포함한다(색만 의존 금지)', () => {
    const html = infoWindowHtml(place,{ visited: false, didIReact: false, count: 0 })
    expect(html).toContain('칠성&quot;조선소')
    expect(html).toContain('♥')
    expect(html).toContain('둘 다 찜')
  })

  it('가봤음이면 채운 별(★)+가봤음 라벨(둘 다 찜보다 우선)', () => {
    const html = infoWindowHtml(place,{ visited: true, didIReact: false, count: 0 })
    expect(html).toContain('★')
    expect(html).toContain('가봤음')
  })

  it('세 액션(길찾기/가봤어요/리액션)에 data-action·data-id를 부여한다', () => {
    const html = infoWindowHtml(place,{ visited: false, didIReact: false, count: 0 })
    expect(html).toContain('data-action="directions"')
    expect(html).toContain('data-action="visit"')
    expect(html).toContain('data-action="react"')
    expect(html).toContain('data-action="close"')
    expect(html).toContain('data-id="p1"')
  })

  it('내가 리액션했으면 채운 하트(❤️), 아니면 빈 하트(🤍)', () => {
    const on = infoWindowHtml(place,{ visited: false, didIReact: true, count: 1 })
    const off = infoWindowHtml(place,{ visited: false, didIReact: false, count: 0 })
    expect(on).toContain('❤️')
    expect(off).toContain('🤍')
  })

  it('리액션 총 개수가 1 이상이면 하트 옆에 숫자를 표시한다(spec §7 총 개수)', () => {
    const two = infoWindowHtml(place,{ visited: false, didIReact: true, count: 2 })
    const zero = infoWindowHtml(place,{ visited: false, didIReact: false, count: 0 })
    // 리액션 버튼 안에 하트 + 개수(2)가 함께 렌더.
    expect(two).toMatch(/❤️\s*2/)
    // 0개면 숫자를 노출하지 않는다(빈 하트만).
    expect(zero).not.toMatch(/🤍\s*0/)
  })

  it('방문 액션은 토글: 미방문이면 data-action=visit, 가봤음이면 data-action=unvisit(취소)', () => {
    const visited = infoWindowHtml(place, { visited: true, didIReact: false, count: 0 })
    const notVisited = infoWindowHtml(place, { visited: false, didIReact: false, count: 0 })
    // 미방문: 누를 수 있는 가봤어요 액션(visit).
    expect(notVisited).toContain('data-action="visit"')
    expect(notVisited).toContain('✅ 가봤어요')
    expect(notVisited).not.toContain('data-action="unvisit"')
    // 가봤음: 누르면 취소되는 토글(unvisit). 텍스트로도 취소 가능 표시(§8).
    expect(visited).toContain('data-action="unvisit"')
    expect(visited).toContain('가봤음 (취소)')
    expect(visited).not.toContain('data-action="visit"')
  })

  it('meta(카테고리·지역)는 해시된 클래스 안에 렌더된다(class="undefined" 회귀 방지)', () => {
    const html = infoWindowHtml(place,{ visited: false, didIReact: false, count: 0 })
    expect(html).toContain('카페 · 속초')
    // CSS module .meta가 존재해 해시 클래스가 들어가야 함(class="undefined" 금지).
    expect(html).not.toContain('class="undefined"')
  })
})
