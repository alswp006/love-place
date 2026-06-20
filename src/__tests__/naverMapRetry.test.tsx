import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

// loadNaverMaps를 모킹해 1차 로드 실패(에러 폴백) → 재시도 시 재로드 가능함을 검증(ux §7 에러 상태).
const loadNaverMaps = vi.fn()
vi.mock('@/lib/naver/loadNaverMaps', () => ({
  loadNaverMaps: () => loadNaverMaps(),
  isNaverMapConfigured: () => true,
}))

import { NaverMap } from '@/components/map/NaverMap'

// 최소 naver.maps 스텁 — Map 생성/이벤트/좌표만 흉내(지도 init이 통과되게).
function makeNaverStub() {
  return {
    maps: {
      Map: class {
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
      // 컨트롤 위치 열거형(@types/navermaps) — 지도 init 옵션에서 참조하므로 스텁에 포함.
      Position: { TOP_LEFT: 1, TOP_RIGHT: 3 },
      Event: {
        addListener: () => ({}),
        removeListener: () => {},
      },
    },
  } as unknown as typeof naver
}

function renderMap() {
  return render(<NaverMap places={[]} snap="peek" />)
}

describe('NaverMap 로드 실패 시 재시도(ux §7)', () => {
  beforeEach(() => {
    loadNaverMaps.mockReset()
    // @ts-expect-error 테스트 정리
    delete window.naver
  })
  afterEach(() => {
    cleanup()
    // @ts-expect-error 테스트 정리
    delete window.naver
  })

  it('로드 실패 시 에러 폴백과 "다시 시도" 버튼을 보여준다', async () => {
    loadNaverMaps.mockRejectedValueOnce(new Error('네이버 지도 로드에 실패했어요.'))
    renderMap()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('네이버 지도 로드에 실패했어요.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('"다시 시도"를 누르면 init effect를 재실행해 회복 시 지도를 다시 로드한다', async () => {
    // 1차: 실패 → 에러 폴백.
    loadNaverMaps.mockRejectedValueOnce(new Error('네이버 지도 로드에 실패했어요.'))
    renderMap()
    const retryBtn = await screen.findByRole('button', { name: '다시 시도' })

    // 회복: 스크립트가 늦게 window.naver를 세팅했고, 2차 로드는 성공한다고 가정.
    window.naver = makeNaverStub()
    loadNaverMaps.mockResolvedValueOnce(makeNaverStub())

    fireEvent.click(retryBtn)

    // 에러 폴백이 사라지고(지도 호스트로 전환) loadKey 재실행으로 init이 다시 시도된다.
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('장소 지도')).toBeInTheDocument()
  })
})
