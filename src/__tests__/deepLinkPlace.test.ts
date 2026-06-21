import { describe, it, expect } from 'vitest'
import { resolveDeepLinkPlace } from '@/lib/places/deepLinkPlace'

// ?place= 딥링크 검증(R4.3) — 우리 커플의 로드된 장소에만 매칭.
// RLS가 1차 방어선이지만 여기선 미로드/타커플 id를 가드(없는 id로 selectedId 오염 방지).
describe('resolveDeepLinkPlace(placeParam, ids)', () => {
  it('param이 ids에 있으면 그 id를 돌려준다', () => {
    expect(resolveDeepLinkPlace('p2', ['p1', 'p2', 'p3'])).toBe('p2')
  })

  it('param이 ids에 없으면 null(미로드/타커플 가드)', () => {
    expect(resolveDeepLinkPlace('px', ['p1', 'p2'])).toBeNull()
  })

  it('param이 null이면 null(딥링크 미사용)', () => {
    expect(resolveDeepLinkPlace(null, ['p1'])).toBeNull()
  })

  it('param이 빈 문자열이면 null', () => {
    expect(resolveDeepLinkPlace('', ['p1', ''])).toBeNull()
  })

  it('ids가 비어 있으면(미로드) null', () => {
    expect(resolveDeepLinkPlace('p1', [])).toBeNull()
  })
})
