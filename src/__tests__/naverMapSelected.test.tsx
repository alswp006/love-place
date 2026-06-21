import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import type { PlaceRow } from '@/hooks/usePlaces'
import { markerIconHtml, SELECTED_ZINDEX } from '@/lib/places/selectedMarker'
import { markerVisual } from '@/lib/places/markerVisual'
import styles from '@/components/map/NaverMap.module.css'

// loadNaverMaps를 모킹. window.naver를 먼저 세팅하면 NaverMap이 existing 분기로 즉시 build().
const loadNaverMaps = vi.fn()
vi.mock('@/lib/naver/loadNaverMaps', () => ({
  loadNaverMaps: () => loadNaverMaps(),
  isNaverMapConfigured: () => true,
}))

// 자동 locate가 끼어들지 않게(geo는 이 테스트와 무관) — granted 아님으로 폴백 경로만.
vi.mock('@/lib/geo/currentPosition', () => ({
  getPermissionState: () => Promise.resolve('prompt'),
  shouldAutoLocate: () => false,
  getCurrentPosition: () => Promise.resolve({ ok: false, reason: 'denied' }),
}))

// 마커 탭 햅틱(R4.1) — vibrate 자체를 모킹해 호출 단언(ux §1, 시각=상세 오픈 병행).
vi.mock('@/lib/haptics', () => ({ haptic: vi.fn() }))
import { haptic } from '@/lib/haptics'

import { NaverMap } from '@/components/map/NaverMap'

// 생성된 마커들과 지도 이벤트 리스너를 캡처하는 스텁.
type CapturedMarker = {
  opts: Record<string, unknown>
  zIndex: number
  setZIndex: (z: number) => void
  setIcon: (icon: unknown) => void
}
const markers: CapturedMarker[] = []
// 지도(map) 객체에 등록된 idle/zoom_changed 리스너를 모은다(재렌더 시뮬레이션용).
const mapListeners: Record<string, Array<() => void>> = {}
// 단일 마커에 등록된 'click' 리스너를 등록 순서대로 모은다(마커 탭 디스패치용).
const markerClickHandlers: Array<() => void> = []
let mapObj: unknown
// 맵 컨테이너 element(NaverMap이 keydown 위임을 거는 대상) — 마커 content를 여기에 append해야
// closest('[data-place-id]')가 잡히고 위임 listener가 발화한다(e2e 하베스 _node→map._el과 동일 경로).
let mapEl: HTMLElement | null = null
// addListener가 마커 인스턴스를 식별하도록 Marker 생성 시 이 집합에 등록한다.
const markerInstances = new Set<unknown>()

function makeNaverStub() {
  return {
    maps: {
      Map: class {
        constructor(el: HTMLElement) {
          mapObj = this
          mapEl = el
        }
        getZoom() {
          return 11
        }
        getCenter() {
          return new (window.naver.maps.LatLng as unknown as { new (a: number, b: number): unknown })(0, 0)
        }
        setCenter() {}
        setZoom() {}
        panTo() {}
        fitBounds() {}
      },
      Marker: class {
        zIndex: number
        opts: Record<string, unknown>
        _node: HTMLElement | null = null
        constructor(opts: Record<string, unknown>) {
          this.opts = opts
          this.zIndex = (opts.zIndex as number) ?? 0
          markerInstances.add(this)
          const rec: CapturedMarker = {
            opts,
            zIndex: this.zIndex,
            setZIndex: (z: number) => {
              this.zIndex = z
              rec.zIndex = z
            },
            setIcon: (icon: unknown) => {
              this.opts.icon = icon
              rec.opts.icon = icon
            },
          }
          markers.push(rec)
          // content(HTML 문자열)를 맵 컨테이너에 append → 위임 keydown이 닿는 실제 DOM 노드 생성.
          if ((opts.map ?? null) !== null) this._render()
        }
        _render() {
          const content = (this.opts.icon as { content?: string } | undefined)?.content
          if (typeof content === 'string' && mapEl) {
            const tmp = document.createElement('div')
            tmp.innerHTML = content
            this._node = (tmp.firstElementChild as HTMLElement) ?? null
            if (this._node) mapEl.appendChild(this._node)
          }
        }
        setMap(map: unknown) {
          if (map === null || map === undefined) {
            if (this._node && this._node.parentNode) this._node.parentNode.removeChild(this._node)
            this._node = null
          }
        }
        setPosition() {}
        getPosition() {
          return new (window.naver.maps.LatLng as unknown as { new (a: number, b: number): unknown })(0, 0)
        }
        setIcon(icon: unknown) {
          this.opts.icon = icon
        }
        setZIndex(z: number) {
          this.zIndex = z
        }
      },
      Circle: class {
        setCenter() {}
        setRadius() {}
        setMap() {}
      },
      LatLng: class {
        constructor(
          public lat: number,
          public lng: number,
        ) {}
      },
      LatLngBounds: class {
        extend() {}
      },
      Point: class {
        constructor(
          public x: number,
          public y: number,
        ) {}
      },
      Position: { TOP_LEFT: 1, TOP_RIGHT: 3 },
      Event: {
        addListener: (target: unknown, ev: string, fn: () => void) => {
          if (target === mapObj) {
            ;(mapListeners[ev] ??= []).push(fn)
          } else if (ev === 'click' && markerInstances.has(target)) {
            markerClickHandlers.push(fn)
          }
          return { target, ev, fn }
        },
        removeListener: () => {},
      },
    },
  } as unknown as typeof naver
}

function place(id: string, lat: number, lng: number): PlaceRow & { wish?: undefined } {
  return {
    id,
    name: id,
    address: null,
    region_label: null,
    lat,
    lng,
    category: null,
    kakao_place_id: null,
    added_by: 'u1',
    version: 1,
  }
}

describe('NaverMap 선택 강조가 pan/zoom 재렌더에서 유지(R1.6)', () => {
  beforeEach(() => {
    markers.length = 0
    markerClickHandlers.length = 0
    markerInstances.clear()
    for (const k of Object.keys(mapListeners)) delete mapListeners[k]
    mapObj = undefined
    mapEl = null
    loadNaverMaps.mockReset()
    window.naver = makeNaverStub()
  })
  afterEach(() => {
    cleanup()
    // @ts-expect-error 테스트 정리
    delete window.naver
  })

  it('selectedId 변경 후 idle 재렌더에서도 선택 마커가 강조 아이콘/zIndex로 다시 그려진다', async () => {
    // 멀리 떨어진 두 장소(클러스터 안 됨 → 각각 single 마커).
    const places = [place('p1', 35.0, 127.0), place('p2', 37.5, 126.9)]
    // 컴포넌트와 동일한 도출로 기대 콘텐츠 계산(CSS 모듈 해석은 vitest env에 맡김).
    const visual = markerVisual({ visited: false, bothWished: false, name: 'p1' })
    const pinClass = `${styles.pin} `.trim()
    const expected = markerIconHtml({
      glyph: visual.glyph,
      pinClass,
      label: visual.label,
      selected: true,
      badge: visual.badge,
      id: 'p1', // 단일 마커는 키 활성화 가능(role=button+tabindex+data-place-id, Task 17/R4.4).
    })

    // 처음엔 선택 없음으로 마운트(render 효과는 selectedId=null로 클로저를 캡처).
    const { rerender } = render(<NaverMap places={places} snap="peek" selectedId={null} />)
    await waitFor(() => expect(markers.length).toBeGreaterThanOrEqual(2))
    await waitFor(() => expect(mapListeners.idle?.length ?? 0).toBeGreaterThan(0))

    // 선택을 p1로 변경 — render 효과 deps([places, ready])는 안 바뀌므로 클로저 selectedId는 stale.
    rerender(<NaverMap places={places} snap="peek" selectedId="p1" />)

    // pan/zoom 정착(idle) 시뮬레이션 — 캡처된 idle 리스너를 호출해 마커를 통째로 재구축.
    markers.length = 0
    for (const fn of mapListeners.idle ?? []) fn()

    // 재구축된 마커 중 p1(첫 장소)이 선택 강조 아이콘 + SELECTED_ZINDEX로 그려져야 한다.
    expect(markers.length).toBeGreaterThanOrEqual(2)
    const p1 = markers[0]!
    const content = (p1.opts.icon as { content: string }).content
    expect(content).toBe(expected)
    expect(p1.opts.zIndex).toBe(SELECTED_ZINDEX)
  })

  it('단일 마커 click 시 onSelect 직전 haptic(가벼운 패턴)이 호출된다(시각=상세 오픈 병행, R4.1)', async () => {
    vi.mocked(haptic).mockClear()
    // 멀리 떨어진 두 장소 → 각각 single 마커 → 마커별 click 리스너가 캡처된다.
    const places = [place('p1', 35.0, 127.0), place('p2', 37.5, 126.9)]
    const onSelect = vi.fn()
    render(<NaverMap places={places} snap="peek" selectedId={null} onSelect={onSelect} />)
    await waitFor(() => expect(markerClickHandlers.length).toBeGreaterThanOrEqual(2))
    // 첫 단일 마커 탭 디스패치 → onSelect(p.id)와 함께 haptic이 1회 발화해야 한다.
    markerClickHandlers[0]!()
    expect(onSelect).toHaveBeenCalledWith('p1')
    expect(haptic).toHaveBeenCalledTimes(1)
  })

  it('마커 포커스 후 Enter keydown(위임) → onSelect(id) + haptic(click 경로와 동등, R4.4)', async () => {
    vi.mocked(haptic).mockClear()
    const places = [place('p1', 35.0, 127.0), place('p2', 37.5, 126.9)]
    const onSelect = vi.fn()
    render(<NaverMap places={places} snap="peek" selectedId={null} onSelect={onSelect} />)
    // 마커 content가 맵 컨테이너에 append됐는지(data-place-id 노드) 대기.
    await waitFor(() => expect(document.querySelector('[data-place-id="p1"]')).not.toBeNull())
    const hit = document.querySelector('[data-place-id="p1"]') as HTMLElement
    expect(hit.getAttribute('role')).toBe('button')
    expect(hit.getAttribute('tabindex')).toBe('0')
    // 위임 keydown: 마커 노드에서 버블 → 맵 컨테이너 리스너가 잡아 onSelect+haptic.
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(onSelect).toHaveBeenCalledWith('p1')
    expect(haptic).toHaveBeenCalledTimes(1)
  })

  it('마커에서 Space keydown(위임)도 선택을 활성화한다(키보드 동등)', async () => {
    vi.mocked(haptic).mockClear()
    const places = [place('p1', 35.0, 127.0), place('p2', 37.5, 126.9)]
    const onSelect = vi.fn()
    render(<NaverMap places={places} snap="peek" selectedId={null} onSelect={onSelect} />)
    await waitFor(() => expect(document.querySelector('[data-place-id="p2"]')).not.toBeNull())
    const hit = document.querySelector('[data-place-id="p2"]') as HTMLElement
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(onSelect).toHaveBeenCalledWith('p2')
    expect(haptic).toHaveBeenCalledTimes(1)
  })

  it('마커 외 다른 키(예: Tab)는 선택을 활성화하지 않는다(위임 키 가드)', async () => {
    vi.mocked(haptic).mockClear()
    const places = [place('p1', 35.0, 127.0), place('p2', 37.5, 126.9)]
    const onSelect = vi.fn()
    render(<NaverMap places={places} snap="peek" selectedId={null} onSelect={onSelect} />)
    await waitFor(() => expect(document.querySelector('[data-place-id="p1"]')).not.toBeNull())
    const hit = document.querySelector('[data-place-id="p1"]') as HTMLElement
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(onSelect).not.toHaveBeenCalled()
    expect(haptic).not.toHaveBeenCalled()
  })
})
