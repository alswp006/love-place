import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const recap = vi.hoisted(() => ({
  trip: { id: 't1', title: '속초 여행', start_date: '2026-05-01', end_date: '2026-05-03', region_code: null, version: 1 },
  vertices: [
    { visitId: 'v1', placeId: 'p1', name: '칠성조선소', lat: 38, lng: 128, visitDate: '2026-05-01', regionLabel: '속초' },
    { visitId: 'v2', placeId: 'p2', name: '영금정', lat: 38.2, lng: 128.6, visitDate: '2026-05-02', regionLabel: '속초' },
  ],
  stats: { stopCount: 2, distanceKm: 52.3, days: 3 },
  isLoading: false,
}))
vi.mock('@/hooks/useCouple', () => ({ useCouple: () => ({ data: { coupleId: 'c1' } }) }))
vi.mock('@/hooks/useTripRecap', () => ({ useTripRecap: () => recap }))
vi.mock('@/hooks/usePlaces', () => ({ usePlaces: () => ({ data: [], isLoading: false }) }))
// 스냅 미적용(측지선 베이스) — 도로 스냅은 별도 훅 테스트로 검증.
vi.mock('@/hooks/useSnappedPolyline', () => ({
  useSnappedPolyline: () => ({ polyline: null, roadDistanceKm: null, degraded: false, isLoading: false }),
}))
// 지도는 테스트에서 렌더하지 않게(키 미설정) — 스탯/목록은 지도와 별개로 렌더된다.
vi.mock('@/lib/naver/loadNaverMaps', () => ({ isNaverMapConfigured: () => false }))
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }))
// R6 실측 동선 — 기본 없음(측지선 경로 유지). 일부 테스트에서 폴리라인 주입.
const recorded = vi.hoisted(() => ({
  points: [] as unknown[],
  polyline: [] as { lat: number; lng: number }[],
  distanceKm: 0,
  isLoading: false,
}))
vi.mock('@/hooks/useTripRecordedRoute', () => ({ useTripRecordedRoute: () => recorded }))

import RecapPage from '@/pages/RecapPage'

function renderRecap() {
  return render(
    <MemoryRouter initialEntries={['/trips/t1/recap']}>
      <Routes>
        <Route path="/trips/:tripId/recap" element={<RecapPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RecapPage (여행 리캡)', () => {
  it('제목·기간·3-스탯·순서 정거장 목록을 렌더한다', () => {
    renderRecap()
    expect(screen.getByRole('heading', { name: '속초 여행' })).toBeInTheDocument()
    expect(screen.getByText('2026-05-01 ~ 2026-05-03')).toBeInTheDocument()
    // 3-스탯(색만 의존 금지 — 텍스트 동반)
    expect(screen.getByText(/장소 2곳/)).toBeInTheDocument()
    expect(screen.getByText(/52.3km/)).toBeInTheDocument()
    expect(screen.getByText(/3일/)).toBeInTheDocument()
    // 순서 정거장
    const stops = screen.getByRole('list', { name: '정거장 순서' })
    expect(stops).toHaveTextContent('칠성조선소')
    expect(stops).toHaveTextContent('영금정')
    // 공유 버튼
    expect(screen.getByRole('button', { name: '리캡 카드 공유' })).toBeInTheDocument()
  })

  it('동선(정점)이 없으면 빈 상태 안내', () => {
    recap.vertices = []
    recap.stats = { stopCount: 0, distanceKm: 0, days: 3 }
    renderRecap()
    expect(screen.getByText('이 여행엔 아직 동선이 없어요')).toBeInTheDocument()
  })

  it('실측 GPS 동선이 있으면 정점이 없어도 표시(거리 "기록" 라벨)', () => {
    recap.vertices = []
    recap.stats = { stopCount: 0, distanceKm: 0, days: 3 }
    recorded.polyline = [
      { lat: 37.5, lng: 127.0 },
      { lat: 37.51, lng: 127.0 },
      { lat: 37.52, lng: 127.01 },
    ]
    recorded.distanceKm = 2.5
    renderRecap()
    expect(screen.queryByText('이 여행엔 아직 동선이 없어요')).not.toBeInTheDocument()
    expect(screen.getByText(/2.5km\(기록\)/)).toBeInTheDocument()
    // 정리(다른 테스트 영향 방지)
    recorded.polyline = []
    recorded.distanceKm = 0
  })
})
