import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { PlaceRow } from '@/hooks/usePlaces'
import { PlacePicker } from '@/components/calendar/PlacePicker'

// Task 8(R2): EventSheet 장소 연결 — 저장된 장소 피커.
// usePlaces(RLS-scope 저장 행)에서 place.id를 선택 → onPick(id). 선택되면 칩 + 제거 버튼.
// 빈 검색어=전체, 0건=안내, 로딩=상태 표시. (스키마/RLS 변경 불필요: events.place_id FK 기존.)

const places: PlaceRow[] = [
  {
    id: 'p1',
    name: '성수 카페',
    address: '서울 성동구 성수동',
    region_label: '서울 성동구',
    lat: 37.5,
    lng: 127.05,
    category: '카페',
    kakao_place_id: 'k1',
    added_by: 'u1',
    version: 1,
  },
  {
    id: 'p2',
    name: '망원 식당',
    address: '서울 마포구 망원동',
    region_label: '서울 마포구',
    lat: 37.55,
    lng: 126.9,
    category: '식당',
    kakao_place_id: 'k2',
    added_by: 'u1',
    version: 1,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PlacePicker (저장된 장소 → place_id 피커 + 칩)', () => {
  it('입력 "성수"로 필터하면 성수 카페만 보이고 클릭 시 onPick("p1") 1회', () => {
    const onPick = vi.fn()
    render(<PlacePicker places={places} loading={false} selectedId={null} onPick={onPick} />)

    fireEvent.change(screen.getByLabelText('장소 검색'), { target: { value: '성수' } })
    expect(screen.getByText('성수 카페')).toBeInTheDocument()
    expect(screen.queryByText('망원 식당')).toBeNull()

    fireEvent.click(screen.getByText('성수 카페'))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith('p1')
  })

  it('빈 검색어면 전체 목록을 보여준다(필터 없음)', () => {
    render(<PlacePicker places={places} loading={false} selectedId={null} onPick={() => {}} />)
    expect(screen.getByText('성수 카페')).toBeInTheDocument()
    expect(screen.getByText('망원 식당')).toBeInTheDocument()
  })

  it('selectedId가 있으면 칩(장소명) + 제거 버튼을 보이고, 제거 시 onPick(null)', () => {
    const onPick = vi.fn()
    render(<PlacePicker places={places} loading={false} selectedId="p1" onPick={onPick} />)

    // 칩에 선택된 장소명, 검색 입력은 숨김
    expect(screen.getByText('성수 카페')).toBeInTheDocument()
    expect(screen.queryByLabelText('장소 검색')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '장소 연결 해제' }))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(null)
  })

  it('로딩 중이면 상태 표시(role="status")', () => {
    render(<PlacePicker places={[]} loading={true} selectedId={null} onPick={() => {}} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('저장된 장소가 0건이면 안내 문구를 보여준다', () => {
    render(<PlacePicker places={[]} loading={false} selectedId={null} onPick={() => {}} />)
    expect(screen.getByText(/저장된 장소가 없어요/)).toBeInTheDocument()
  })
})
