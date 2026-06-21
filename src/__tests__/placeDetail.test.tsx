import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlaceDetail } from '@/components/places/PlaceDetail'
import type { WithWish } from '@/lib/places/wishStatus'
import type { PlaceRow } from '@/hooks/usePlaces'

const wish = { wishedByMe: true, wishedByPartner: true, bothWished: true, wishCount: 2, totalPriority: 2, maxPriority: 1 }
const place: WithWish<PlaceRow> = {
  id: 'p1', name: '칠성"조선소', address: '속초시', region_label: '속초', lat: 38, lng: 128,
  category: '카페', kakao_place_id: 'k1', added_by: 'u1', version: 1, wish,
}
function base() {
  return { place, visited: false, didIReact: false, reactionCount: 0, busy: false,
    onVisit: vi.fn(), onUnvisit: vi.fn(), onReact: vi.fn(), onClose: vi.fn() }
}

describe('PlaceDetail (선택 장소 시트 상세 — React)', () => {
  it('이름·상태(글리프+텍스트) 표시: 둘 다 찜=♥', () => {
    render(<PlaceDetail {...base()} />)
    expect(screen.getByText('칠성"조선소')).toBeInTheDocument()
    expect(screen.getByText('둘 다 찜')).toBeInTheDocument()
    expect(screen.getByLabelText('장소 상세')).toHaveAttribute('aria-live', 'polite')
  })
  it('가봤음이면 ★ + 가봤음(취소) 토글 → onUnvisit', () => {
    const p = base()
    render(<PlaceDetail {...p} visited />)
    fireEvent.click(screen.getByRole('button', { name: /가봤음 기록 취소/ }))
    expect(p.onUnvisit).toHaveBeenCalledTimes(1)
  })
  it('미방문이면 다녀왔어요 → onVisit', () => {
    const p = base()
    render(<PlaceDetail {...p} />)
    fireEvent.click(screen.getByRole('button', { name: /다녀왔어요/ }))
    expect(p.onVisit).toHaveBeenCalledTimes(1)
  })
  it('❤️ 리액션 버튼: 내가 안 눌렀으면 🤍, count>0이면 숫자, 클릭 시 onReact', () => {
    const p = { ...base(), reactionCount: 2 }
    render(<PlaceDetail {...p} />)
    const react = screen.getByRole('button', { name: /하트 리액션/ })
    expect(react).toHaveTextContent('2')
    fireEvent.click(react)
    expect(p.onReact).toHaveBeenCalledTimes(1)
  })
  it('닫기 버튼 → onClose', () => {
    const p = base()
    render(<PlaceDetail {...p} />)
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(p.onClose).toHaveBeenCalledTimes(1)
  })
  it('길찾기 버튼은 없다(spec §3.6 #5 제거)', () => {
    render(<PlaceDetail {...base()} />)
    expect(screen.queryByRole('button', { name: /길찾기/ })).toBeNull()
  })

  it('컬렉션 props가 없으면 목록 섹션을 렌더하지 않는다(기존 호출부 무회귀)', () => {
    render(<PlaceDetail {...base()} />)
    expect(screen.queryByRole('button', { name: '목록 관리' })).toBeNull()
  })

  it('컬렉션 props가 있으면 목록 칩을 렌더하고 토글 시 onToggleCollection(id)을 부른다', () => {
    const p = base()
    const onToggleCollection = vi.fn()
    render(
      <PlaceDetail
        {...p}
        collections={[{ id: 'c1', name: '데이트', version: 1 }]}
        memberCollIds={new Set()}
        onToggleCollection={onToggleCollection}
        onManageCollections={vi.fn()}
      />,
    )
    // 미소속이면 '담기' 라벨(+ 글리프). 클릭 시 토글.
    fireEvent.click(screen.getByRole('button', { name: '데이트 목록에 담기' }))
    expect(onToggleCollection).toHaveBeenCalledWith('c1')
  })

  it('이미 담긴 컬렉션은 aria-pressed=true + "빼기" 라벨로 표시(색만 의존 금지)', () => {
    const p = base()
    render(
      <PlaceDetail
        {...p}
        collections={[{ id: 'c1', name: '데이트', version: 1 }]}
        memberCollIds={new Set(['c1'])}
        onToggleCollection={vi.fn()}
      />,
    )
    const chip = screen.getByRole('button', { name: '데이트 목록에서 빼기' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })
})
