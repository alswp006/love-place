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
  onToastAction: noop,
  restorePlace: noop,
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

  it('삭제 시 실행취소 토스트를 띄우고, 실행취소 클릭은 restorePlace(version+1)을 호출한다', () => {
    // deletePlace는 onSuccess 콜백을 즉시 부르는 가짜(낙관적 성공 경로 시뮬레이션).
    const deletePlace = vi.fn((_v, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.())
    const onToastAction = vi.fn()
    const restorePlace = vi.fn()
    render(
      <PlaceList
        {...baseProps}
        deletePlace={deletePlace}
        onToastAction={onToastAction}
        restorePlace={restorePlace}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /휴지통으로 보내기/ }))
    expect(deletePlace).toHaveBeenCalledWith(
      { id: 'p1', expectedVersion: 1 },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
    // onSuccess가 실행취소 액션 토스트를 띄웠는지 검증.
    expect(onToastAction).toHaveBeenCalledTimes(1)
    const arg = onToastAction.mock.calls[0]![0] as {
      message: string
      action: { label: string; onClick: () => void }
    }
    expect(arg.message).toBe('휴지통으로 옮겼어요')
    expect(arg.action.label).toBe('실행취소')
    // 실행취소 클릭 → softDelete가 version을 v+1로 올리므로 restore는 expectedVersion: v+1.
    arg.action.onClick()
    expect(restorePlace).toHaveBeenCalledWith({ id: 'p1', expectedVersion: 2 })
  })
})
