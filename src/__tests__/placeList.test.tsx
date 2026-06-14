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
  profiles: {},
  myId: 'u1',
  placesLoading: false,
  placeFilter: 'all' as const,
  selectedId: null as string | null,
  onSelect: noop,
  setPriority: noop,
  priorityPending: false,
  markVisited: { mutate: noop, isPending: false } as never,
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
})
