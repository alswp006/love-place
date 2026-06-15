import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlaceList } from '@/components/places/PlaceList'
import type { WithWish } from '@/lib/places/wishStatus'
import type { PlaceRow } from '@/hooks/usePlaces'

const wishStatus = { wishedByMe: true, wishedByPartner: true, bothWished: true, wishCount: 2, totalPriority: 3, maxPriority: 2 }
const place: WithWish<PlaceRow> = {
  id: 'p1', name: '칠성조선소', address: '속초', region_label: '속초', lat: 38, lng: 128,
  category: '카페', kakao_place_id: 'k1', added_by: 'u1', version: 1, wish: wishStatus,
}

const noop = () => {}
const baseProps = {
  visible: [place] as WithWish<PlaceRow>[],
  wishes: { byPlace: {}, mine: {} },
  visitedIds: new Set<string>(),
  placesLoading: false,
  placeFilter: 'all' as const,
  selectedId: null as string | null,
  onSelect: noop,
  setPriority: noop,
  priorityPending: false,
  markVisited: { mutate: noop, isPending: false } as never,
  onUnvisit: noop,
  unvisitPending: false,
  deletePlace: noop,
  deletePending: false,
  onToast: noop,
}

describe('PlaceList (카드 리스트 추출)', () => {
  it('장소 이름과 둘 다 찜 배지를 렌더한다', () => {
    render(<PlaceList {...baseProps} />)
    expect(screen.getByText('칠성조선소')).toBeInTheDocument()
    // 배지는 색각 이상 대응으로 💑 이모지 + '둘 다 찜' 라벨을 한 span에 함께 렌더(§8) → 부분 일치로 검증.
    expect(screen.getByText(/둘 다 찜/)).toBeInTheDocument()
  })

  it('카드 본문 탭 시 onSelect(placeId)를 호출한다', () => {
    const onSelect = vi.fn()
    render(<PlaceList {...baseProps} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('칠성조선소'))
    expect(onSelect).toHaveBeenCalledWith('p1')
  })

  it('로딩 중이면 스켈레톤(아이템 없음)을 보여준다', () => {
    render(<PlaceList {...baseProps} visible={[]} placesLoading />)
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(screen.queryByText('칠성조선소')).not.toBeInTheDocument()
  })

  it('빈 목록이면 빈 상태 카피를 보여준다', () => {
    render(<PlaceList {...baseProps} visible={[]} />)
    expect(screen.getByText('첫 가고싶은 장소를 추가해보세요')).toBeInTheDocument()
  })

  it('가봤음이면 "가봤음 (취소)" 토글 버튼을 렌더하고 클릭 시 onUnvisit(placeId)', () => {
    const onUnvisit = vi.fn()
    render(<PlaceList {...baseProps} visitedIds={new Set(['p1'])} onUnvisit={onUnvisit} />)
    const btn = screen.getByRole('button', { name: /가봤음 기록 취소/ })
    fireEvent.click(btn)
    expect(onUnvisit).toHaveBeenCalledWith('p1')
  })

  it('미방문이면 "다녀왔어요" 버튼(가봤음 취소 버튼 없음)', () => {
    render(<PlaceList {...baseProps} visitedIds={new Set<string>()} />)
    expect(screen.getByRole('button', { name: /다녀왔어요/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /가봤음 기록 취소/ })).not.toBeInTheDocument()
  })
})
