import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { functions: { invoke } },
}))

import { useSnappedPolyline } from '@/hooks/useSnappedPolyline'
import type { RecapVertex } from '@/lib/recap/recapStats'

const vtx = (id: string, lat: number, lng: number): RecapVertex => ({
  visitId: id,
  placeId: 'p' + id,
  name: id,
  lat,
  lng,
  visitDate: null,
  regionLabel: null,
})
const vertices = [vtx('a', 37, 127), vtx('b', 38, 128)]

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useSnappedPolyline', () => {
  beforeEach(() => invoke.mockReset())

  it('스냅 성공 시 도로 폴리라인 + 도로거리 반환', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        legs: [
          {
            polyline: [{ lat: 37, lng: 127 }, { lat: 37.5, lng: 127.5 }, { lat: 38, lng: 128 }],
            distanceMeters: 2000,
            degraded: false,
          },
        ],
      },
      error: null,
    })
    const { result } = renderHook(() => useSnappedPolyline('c1', 't1', vertices), { wrapper })
    await waitFor(() => expect(result.current.polyline).not.toBeNull())
    expect(result.current.polyline).toHaveLength(3)
    expect(result.current.roadDistanceKm).toBe(2)
    expect(result.current.degraded).toBe(false)
  })

  it('프록시 에러(미배포 등)면 polyline=null → 측지선 폴백', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const { result } = renderHook(() => useSnappedPolyline('c1', 't1', vertices), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.polyline).toBeNull()
    expect(result.current.roadDistanceKm).toBeNull()
  })
})
