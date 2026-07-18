import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// OrphanSessionsTray — 미연결 동선 목록·연결·삭제, 14일 자동삭제 경고.
const state = vi.hoisted(() => ({
  createTrip: vi.fn(),
  orphans: [] as Array<{ id: string; version: number; status: string; trip_id: null; ended_at: string | null; started_at: string; point_count: number }>,
  trips: [{ id: 't9', title: '속초 여행' }] as Array<{ id: string; title: string }>,
  link: vi.fn(async () => {}),
  withdraw: vi.fn(async () => {}),
}))
vi.mock('@/hooks/useOrphanSessions', () => ({
  useOrphanSessions: () => ({ data: state.orphans }),
  useLinkSessionToTrip: () => ({ link: state.link, isPending: false }),
}))
vi.mock('@/hooks/useTrips', () => ({
  useTrips: () => ({ data: state.trips }),
  // '동선으로 여행 만들기' 원탭 — 생성 mutate mock(onSuccess에 trip id 전달)
  useCreateTrip: () => ({ mutate: state.createTrip, isPending: false }),
}))
vi.mock('@/hooks/useLocationWithdraw', () => ({ useLocationWithdraw: () => ({ withdraw: state.withdraw, isPending: false }) }))

import { OrphanSessionsTray } from '@/components/journey/OrphanSessionsTray'

beforeEach(() => {
  state.orphans = []
  state.link.mockReset().mockResolvedValue(undefined)
  state.withdraw.mockReset().mockResolvedValue(undefined)
})

describe('OrphanSessionsTray', () => {
  it('미연결 동선 없으면 아무것도 렌더 안 함(부분 빈상태)', () => {
    const { container } = render(<OrphanSessionsTray coupleId="c1" userId="u1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('목록 + 14일 자동삭제 경고 표시', () => {
    state.orphans = [
      { id: 's1', version: 1, status: 'DONE', trip_id: null, ended_at: '2026-06-20T10:00:00Z', started_at: '2026-06-20T08:00:00Z', point_count: 120 },
    ]
    render(<OrphanSessionsTray coupleId="c1" userId="u1" />)
    expect(screen.getByText(/14일 후 자동 삭제/)).toBeInTheDocument()
    expect(screen.getByText(/2026-06-20 · 120점/)).toBeInTheDocument()
  })

  it('여행 선택 후 "연결" → link 호출(낙관적 락 version 전달)', () => {
    state.orphans = [
      { id: 's1', version: 3, status: 'DONE', trip_id: null, ended_at: '2026-06-20T10:00:00Z', started_at: '2026-06-20T08:00:00Z', point_count: 5 },
    ]
    render(<OrphanSessionsTray coupleId="c1" userId="u1" />)
    fireEvent.change(screen.getByLabelText('여행 선택'), { target: { value: 't9' } })
    fireEvent.click(screen.getByRole('button', { name: '연결' }))
    expect(state.link).toHaveBeenCalledWith({ id: 's1', version: 3, tripId: 't9' })
  })

  it('"삭제" → withdraw 호출(하드 파기)', () => {
    state.orphans = [
      { id: 's1', version: 1, status: 'DONE', trip_id: null, ended_at: '2026-06-20T10:00:00Z', started_at: '2026-06-20T08:00:00Z', point_count: 5 },
    ]
    render(<OrphanSessionsTray coupleId="c1" userId="u1" />)
    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(state.withdraw).toHaveBeenCalledWith({ sessionId: 's1' })
  })
})
