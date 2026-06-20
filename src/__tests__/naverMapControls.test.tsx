import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'

// loadNaverMaps를 모킹해 지도 init이 통과되게 한다. window.naver를 먼저 세팅하면
// NaverMap이 existing 분기로 즉시 build()를 호출한다.
const loadNaverMaps = vi.fn()
vi.mock('@/lib/naver/loadNaverMaps', () => ({
  loadNaverMaps: () => loadNaverMaps(),
  isNaverMapConfigured: () => true,
}))

import { NaverMap } from '@/components/map/NaverMap'

// nv.maps.Map을 spy로 두고, Position 열거형을 노출한다(@types/navermaps: TOP_LEFT=1, TOP_RIGHT=3).
const mapSpy = vi.fn()
function makeNaverStub() {
  return {
    maps: {
      Map: class {
        constructor(...args: unknown[]) {
          mapSpy(...args)
        }
        getZoom() {
          return 11
        }
      },
      LatLng: class {
        constructor(
          public lat: number,
          public lng: number,
        ) {}
      },
      Point: class {
        constructor(
          public x: number,
          public y: number,
        ) {}
      },
      Position: {
        CENTER: 0,
        TOP_LEFT: 1,
        TOP_CENTER: 2,
        TOP_RIGHT: 3,
        LEFT_CENTER: 4,
        LEFT_TOP: 5,
        LEFT_BOTTOM: 6,
        RIGHT_TOP: 7,
        RIGHT_CENTER: 8,
        RIGHT_BOTTOM: 9,
        BOTTOM_LEFT: 10,
        BOTTOM_CENTER: 11,
        BOTTOM_RIGHT: 12,
      },
      Event: {
        addListener: () => ({}),
        removeListener: () => {},
      },
    },
  } as unknown as typeof naver
}

describe('NaverMap 컨트롤 배치(spec R1.3)', () => {
  beforeEach(() => {
    mapSpy.mockReset()
    loadNaverMaps.mockReset()
    window.naver = makeNaverStub()
  })
  afterEach(() => {
    cleanup()
    // @ts-expect-error 테스트 정리
    delete window.naver
  })

  it('로고는 TOP_LEFT, 축척은 TOP_RIGHT로 두고 데이터 컨트롤은 끈다', async () => {
    render(<NaverMap places={[]} snap="peek" />)
    await waitFor(() => expect(mapSpy).toHaveBeenCalled())
    const options = mapSpy.mock.calls[0]![1] as Record<string, unknown>
    expect(options.logoControl).toBe(true)
    expect(options.logoControlOptions).toEqual({ position: 1 })
    expect(options.scaleControl).toBe(true)
    expect(options.scaleControlOptions).toEqual({ position: 3 })
    expect(options.mapDataControl).toBe(false)
  })
})
