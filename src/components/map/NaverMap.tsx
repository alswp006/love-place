import { useEffect, useRef, useState } from 'react'
import { loadNaverMaps } from '@/lib/naver/loadNaverMaps'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { WishStatus } from '@/lib/places/wishStatus'
import { deriveWishStatus } from '@/lib/places/wishStatus'
import type { ProfileMap } from '@/hooks/useProfiles'
import type { ReactionMap } from '@/hooks/useReactions'
import { markerVisual } from '@/lib/places/markerVisual'
import { clusterPlaces, type ClusterPoint } from '@/lib/places/clusterPlaces'
import { markerIconHtml, BASE_ZINDEX, SELECTED_ZINDEX } from '@/lib/places/selectedMarker'
import { infoWindowHtml, previewWindowHtml, escapeHtml } from '@/lib/places/infoWindowHtml'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import { getCurrentPosition } from '@/lib/geo/currentPosition'
import styles from './NaverMap.module.css'

// 네이버 지도 + 장소 마커(§5.5). 네이버 검색 좌표(WGS84)를 그대로 핀으로 찍는다.
// 마커는 색만이 아니라 모양/라벨로도 구분(§8 접근성): 둘 다 찜=♥(퍼플), 그 외=★(브랜드).
// 가본 곳(채운 별+체크) 구분은 P3.
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 } // 서울 시청(빈 상태 기본 중심)

type MarkerPlace = PlaceRow & { wish?: WishStatus }

export function NaverMap({
  places,
  visitedIds,
  profiles,
  myId,
  reactions,
  selectedId,
  previewHit,
  onSelect,
  onClose,
  onAction,
  onPreviewAction,
}: {
  places: MarkerPlace[]
  visitedIds?: Set<string>
  profiles?: ProfileMap
  myId?: string | null
  reactions?: ReactionMap
  selectedId?: string | null
  previewHit?: KakaoPlaceHit | null
  onSelect?: (id: string) => void
  onClose?: () => void
  onAction?: (action: string, id: string) => void
  onPreviewAction?: (action: string) => void
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<naver.maps.Map | null>(null)
  const markersRef = useRef<naver.maps.Marker[]>([])
  const markerMapRef = useRef<Map<string, naver.maps.Marker>>(new Map())
  const clusterMarkersRef = useRef<naver.maps.Marker[]>([])
  const listenersRef = useRef<naver.maps.MapEventListener[]>([])
  const mapMoveRef = useRef<naver.maps.MapEventListener[]>([])
  const infoRef = useRef<naver.maps.InfoWindow | null>(null)
  const infoHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  const mapClickRef = useRef<naver.maps.MapEventListener | null>(null)
  const previewMarkerRef = useRef<naver.maps.Marker | null>(null)
  // 프리뷰 전용 InfoWindow + 핸들러 — saved용 infoRef/infoHandlerRef와 분리(공유 소유권 경합 방지).
  const previewInfoRef = useRef<naver.maps.InfoWindow | null>(null)
  const previewHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [locToast, setLocToast] = useState<string | null>(null)
  // 초기 센터링은 ready 직후 1회만(이후 마커 변경으로 지도가 튀지 않게, spec §3.5).
  // centeredRef: 한 번이라도 센터를 잡았으면(내 위치 성공 또는 저장장소 fitBounds) true → 더는 자동 이동 안 함.
  // geoSettledRef: geolocation 응답(성공/실패)이 왔는지. 실패로 끝났는데 그 시점 places가 비어 있던 경우,
  //   places가 나중에 채워지면 저장장소 fitBounds 폴백을 1회 재평가하기 위한 게이트(빈→채움 순서 가드, spec §2 폴백 체인).
  const centeredRef = useRef(false)
  const geoSettledRef = useRef<'pending' | 'ok' | 'failed'>('pending')

  // onClose/onAction은 ref로 읽어 지도/마커 재초기화를 피한다(deps에 넣지 않음).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const onPreviewActionRef = useRef(onPreviewAction)
  onPreviewActionRef.current = onPreviewAction
  // onSelect/selectedId/previewHit도 ref로 읽어 마커 재드로우 효과의 deps에서 제외(매 렌더 재구축 방지).
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const previewHitRef = useRef(previewHit)
  previewHitRef.current = previewHit

  // 지도 1회 초기화
  useEffect(() => {
    let cancelled = false
    loadNaverMaps()
      .then((nv) => {
        if (cancelled || !elRef.current) return
        mapRef.current = new nv.maps.Map(elRef.current, {
          center: new nv.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          zoom: 11,
          // 로고는 ToS상 유지(필수), 축척 표시 명시(spec §3.1). 데이터 컨트롤은 숨김.
          logoControl: true,
          scaleControl: true,
          mapDataControl: false,
        })
        setReady(true)
        // 단일 InfoWindow 1회 생성(말풍선 재사용).
        infoRef.current = new nv.maps.InfoWindow({
          content: '',
          borderWidth: 0,
          disableAnchor: false,
          backgroundColor: 'transparent',
          pixelOffset: new nv.maps.Point(0, -8),
        })
        // 프리뷰 전용 InfoWindow(saved와 분리) — 동일 옵션(테두리 없음/배경 투명, CSS가 말풍선 그림).
        previewInfoRef.current = new nv.maps.InfoWindow({
          content: '',
          borderWidth: 0,
          disableAnchor: false,
          backgroundColor: 'transparent',
          pixelOffset: new nv.maps.Point(0, -8),
        })
        // 지도 빈 곳 클릭 → 선택 해제(닫기).
        mapClickRef.current = nv.maps.Event.addListener(mapRef.current, 'click', () =>
          onCloseRef.current?.(),
        )
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
      window.naver?.maps.Event.removeListener(listenersRef.current)
      listenersRef.current = []
      if (mapClickRef.current) window.naver?.maps.Event.removeListener(mapClickRef.current)
      mapClickRef.current = null
      if (infoHandlerRef.current && infoRef.current) {
        infoRef.current.getContentElement()?.removeEventListener('click', infoHandlerRef.current)
      }
      infoHandlerRef.current = null
      infoRef.current?.close()
      infoRef.current = null
      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []
      markerMapRef.current.clear()
      clusterMarkersRef.current.forEach((m) => m.setMap(null))
      clusterMarkersRef.current = []
      window.naver?.maps.Event.removeListener(mapMoveRef.current)
      mapMoveRef.current = []
      previewMarkerRef.current?.setMap(null)
      previewMarkerRef.current = null
      if (previewHandlerRef.current && previewInfoRef.current) {
        previewInfoRef.current.getContentElement()?.removeEventListener('click', previewHandlerRef.current)
      }
      previewHandlerRef.current = null
      previewInfoRef.current?.close()
      previewInfoRef.current = null
      mapRef.current = null
    }
  }, [])

  // 장소/줌 변경 시 마커를 클러스터 인지 방식으로 다시 그림(spec §3.7).
  // 단일(single)은 기존처럼 markerMapRef에 등록(highlight/InfoWindow 효과가 이를 사용).
  // 클러스터는 별도 clusterMarkersRef에 — 클릭 시 줌인(개별 강조/onSelect는 단일 마커에서만).
  useEffect(() => {
    const nv = window.naver
    const map = mapRef.current
    if (!ready || !nv || !map) return

    const render = () => {
      const m = mapRef.current
      if (!nv || !m) return
      // 이전 마커/리스너 정리(리스너 누락 금지).
      nv.maps.Event.removeListener(listenersRef.current)
      listenersRef.current = []
      markersRef.current.forEach((mk) => mk.setMap(null))
      markersRef.current = []
      markerMapRef.current.clear()
      clusterMarkersRef.current.forEach((mk) => mk.setMap(null))
      clusterMarkersRef.current = []

      const pts: ClusterPoint[] = places
        .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
        .map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng! }))
      if (pts.length === 0) return

      const groups = clusterPlaces(pts, m.getZoom())
      for (const g of groups) {
        if (g.kind === 'single') {
          const p = places.find((pl) => pl.id === g.id)
          if (!p) continue
          const visual = markerVisual({
            visited: visitedIds?.has(p.id) ?? false,
            bothWished: p.wish?.bothWished ?? false,
            name: p.name,
          })
          const modifier =
            visual.kind === 'visited'
              ? styles.pinVisited
              : visual.kind === 'both'
                ? styles.pinBoth
                : ''
          const pinClass = `${styles.pin} ${modifier}`.trim()
          const marker = new nv.maps.Marker({
            position: new nv.maps.LatLng(g.lat, g.lng),
            map: m,
            title: visual.label,
            zIndex: BASE_ZINDEX,
            icon: {
              content: markerIconHtml({
                glyph: visual.glyph,
                pinClass,
                label: visual.label,
                selected: p.id === selectedId,
              }),
              anchor: new nv.maps.Point(12, 24),
            },
          })
          const handle = nv.maps.Event.addListener(marker, 'click', () => onSelectRef.current?.(p.id))
          listenersRef.current.push(handle)
          markersRef.current.push(marker)
          markerMapRef.current.set(p.id, marker)
        } else {
          // 클러스터 마커 — 색+개수 텍스트 이중화(§8). 클릭 시 그 위치로 줌인.
          const label = `장소 ${g.count}곳 묶음`
          const cluster = new nv.maps.Marker({
            position: new nv.maps.LatLng(g.lat, g.lng),
            map: m,
            title: label,
            zIndex: BASE_ZINDEX,
            icon: {
              content: `<div class="${styles.cluster}" aria-label="${escapeHtml(label)}">${g.count}</div>`,
              anchor: new nv.maps.Point(18, 18),
            },
          })
          const pos = new nv.maps.LatLng(g.lat, g.lng)
          const handle = nv.maps.Event.addListener(cluster, 'click', () => {
            m.setCenter(pos)
            m.setZoom(Math.min(m.getZoom() + 3, 19))
          })
          listenersRef.current.push(handle)
          clusterMarkersRef.current.push(cluster)
        }
      }
      // 열린 saved 말풍선이 있으면 재구축된 마커에 다시 앵커 — 팬/줌으로 마커가 새로 그려져도 말풍선 유지
      // (idle/zoom_changed → render()가 마커를 교체하므로 옛 마커에 붙은 말풍선이 끊긴다, research 02).
      // 해당 장소가 클러스터로 묶여 개별 마커가 없으면 말풍선을 닫는다(줌인 시 render가 다시 앵커).
      const sid = selectedIdRef.current
      if (sid && !previewHitRef.current && infoRef.current) {
        const mk = markerMapRef.current.get(sid)
        if (mk) infoRef.current.open(m, mk)
        else infoRef.current.close()
      }
    }

    render()
    // 줌/이동 정착 시 재계산(과도한 fitBounds 금지 — 센터/줌만 사용자가 바꿈, research 02 §4).
    mapMoveRef.current = [
      nv.maps.Event.addListener(map, 'idle', render),
      nv.maps.Event.addListener(map, 'zoom_changed', render),
    ]
    return () => {
      nv.maps.Event.removeListener(mapMoveRef.current)
      mapMoveRef.current = []
    }
    // selectedId/visitedIds는 강조 효과가 setIcon으로 갱신하므로 deps 제외(지도 튐/재구독 방지).
    // onSelect/selectedId/previewHit은 ref로 읽으므로 deps에서 제외 — 매 렌더(인라인 핸들러)마다
    // 마커를 통째로 재구축해 깜빡이거나 idle/zoom 리스너를 재구독하지 않게 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, ready])

  // 초기 센터링 1/2 — geolocation 시도(ready 직후 1회, spec §3.5).
  // 성공: 내 위치 setCenter+zoom 14, centeredRef로 고정(이후 자동 이동 없음).
  // 실패/거부/미지원: 여기서 지도를 건드리지 않고 geoSettledRef='failed'만 기록 →
  //   저장장소 fitBounds 폴백은 아래 별도 효과가 places 적재 시점에 맞춰 1회 수행(빈→채움 순서 가드).
  useEffect(() => {
    const nv = window.naver
    const map = mapRef.current
    if (!ready || !nv || !map || geoSettledRef.current !== 'pending') return
    let cancelled = false
    void getCurrentPosition().then((r) => {
      if (cancelled || !mapRef.current) return
      if (r.ok) {
        geoSettledRef.current = 'ok'
        centeredRef.current = true
        mapRef.current.setCenter(new nv.maps.LatLng(r.lat, r.lng))
        mapRef.current.setZoom(14)
      } else {
        // 실패 — best-effort 폴백은 places 효과에 위임(아래). 의도적으로 지도는 그대로(서울 초기 center).
        geoSettledRef.current = 'failed'
      }
    })
    return () => {
      cancelled = true
    }
  }, [ready])

  // 초기 센터링 2/2 — geolocation 실패 시 저장장소 폴백(best-effort, spec §2).
  // geo가 places보다 먼저 실패로 끝나면 이 효과는 places가 채워지는 순간 1회 fitBounds(빈→채움 순서 가드).
  // 저장장소가 끝까지 없으면 서울 초기 center 유지. centeredRef로 1회만(이후 마커/줌 변경엔 반응 안 함).
  useEffect(() => {
    const nv = window.naver
    const map = mapRef.current
    if (!ready || !nv || !map) return
    if (geoSettledRef.current !== 'failed' || centeredRef.current) return
    const pts = places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
    if (pts.length === 0) return
    centeredRef.current = true
    const b = new nv.maps.LatLngBounds(
      new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!),
      new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!),
    )
    for (const p of pts) b.extend(new nv.maps.LatLng(p.lat!, p.lng!))
    map.fitBounds(b)
  }, [ready, places])

  // 선택 강조 — 해당 마커 아이콘만 교체(확대+링)·zIndex↑·panTo. fitBounds 재실행 안 함(지도 튐 방지).
  useEffect(() => {
    const nv = window.naver
    const map = mapRef.current
    if (!ready || !nv || !map) return
    for (const [id, marker] of markerMapRef.current) {
      const p = places.find((pl) => pl.id === id)
      if (!p) continue
      const visual = markerVisual({
        visited: visitedIds?.has(id) ?? false,
        bothWished: p.wish?.bothWished ?? false,
        name: p.name,
      })
      const modifier =
        visual.kind === 'visited' ? styles.pinVisited : visual.kind === 'both' ? styles.pinBoth : ''
      const pinClass = `${styles.pin} ${modifier}`.trim()
      const selected = id === selectedId
      marker.setIcon({
        content: markerIconHtml({ glyph: visual.glyph, pinClass, label: visual.label, selected }),
        anchor: new nv.maps.Point(12, 24),
      })
      marker.setZIndex(selected ? SELECTED_ZINDEX : BASE_ZINDEX)
    }
    if (selectedId) {
      const m = markerMapRef.current.get(selectedId)
      if (m) map.panTo(m.getPosition())
    }
  }, [selectedId, places, ready, visitedIds])

  // 단일 InfoWindow — selectedId/방문/리액션 변경 시 콘텐츠 재생성 후 위임 클릭 리스너 재바인딩.
  useEffect(() => {
    const nv = window.naver
    const map = mapRef.current
    const info = infoRef.current
    if (!ready || !nv || !map || !info) return

    // 이전 위임 리스너 제거(중복 바인딩 방지).
    const prevEl = info.getContentElement()
    if (prevEl && infoHandlerRef.current) prevEl.removeEventListener('click', infoHandlerRef.current)
    infoHandlerRef.current = null

    // 프리뷰가 떠 있으면 saved 말풍선은 자기 것만 닫고 즉시 종료(preview 우선, spec §3.6 — 동시 표시 안 함).
    // 프리뷰 effect의 previewInfoRef/previewHandlerRef는 절대 건드리지 않는다(소유권 분리 → realtime
    // places/reactions 무효화로 이 effect가 재실행돼도 열려 있는 프리뷰 말풍선을 부수지 않음, research 02 §3(3)).
    if (previewHit || !selectedId) {
      info.close()
      return
    }
    const marker = markerMapRef.current.get(selectedId)
    const place = places.find((p) => p.id === selectedId)
    if (!marker || !place) {
      info.close()
      return
    }

    const html = infoWindowHtml(
      { ...place, wish: place.wish ?? deriveWishStatus(undefined, myId ?? null) },
      {
        visited: visitedIds?.has(selectedId) ?? false,
        didIReact: reactions?.[selectedId]?.didIReact ?? false,
        count: reactions?.[selectedId]?.count ?? 0,
      },
    )
    info.setContent(html)
    info.open(map, marker)

    const el = info.getContentElement()
    if (el) {
      const handler = (e: MouseEvent) => {
        const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null
        if (!btn) return
        const action = btn.dataset.action
        const id = btn.dataset.id
        if (!id) return
        if (action === 'close') onCloseRef.current?.()
        else onActionRef.current?.(action ?? '', id)
      }
      el.addEventListener('click', handler)
      infoHandlerRef.current = handler
    }
  }, [selectedId, places, ready, visitedIds, reactions, profiles, myId, previewHit])

  // 프리뷰(미저장 검색 후보) — 전용 transient 마커 + 전용 InfoWindow(previewInfoRef)를 구동(saved와 배타).
  // saved용 infoRef/infoHandlerRef는 절대 만지지 않는다(소유권 분리, research 02 §3(3)).
  useEffect(() => {
    const nv = window.naver
    const map = mapRef.current
    const info = previewInfoRef.current
    if (!ready || !nv || !map || !info) return

    // 이전 프리뷰 위임 리스너 제거(중복 바인딩 방지) — 프리뷰 핸들러 ref만 사용.
    const prevEl = info.getContentElement()
    if (prevEl && previewHandlerRef.current) prevEl.removeEventListener('click', previewHandlerRef.current)
    previewHandlerRef.current = null

    if (!previewHit) {
      info.close()
      previewMarkerRef.current?.setMap(null)
      previewMarkerRef.current = null
      return
    }

    const pos = new nv.maps.LatLng(previewHit.lat, previewHit.lng)
    // 프리뷰 마커는 1개만 — 위치만 갱신(클러스터 대상 아님, transient).
    if (previewMarkerRef.current) {
      previewMarkerRef.current.setPosition(pos)
    } else {
      previewMarkerRef.current = new nv.maps.Marker({
        position: pos,
        map,
        zIndex: SELECTED_ZINDEX + 1,
        icon: {
          content: `<div class="${styles.pin} ${styles.pinPreview}" aria-label="${escapeHtml(previewHit.name)} 미리보기">＋</div>`,
          anchor: new nv.maps.Point(12, 24),
        },
      })
    }
    map.panTo(pos)

    info.setContent(previewWindowHtml(previewHit))
    info.open(map, previewMarkerRef.current)

    const el = info.getContentElement()
    if (el) {
      const handler = (e: MouseEvent) => {
        const btn = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null
        if (!btn) return
        onPreviewActionRef.current?.(btn.dataset.action ?? '')
      }
      el.addEventListener('click', handler)
      previewHandlerRef.current = handler
    }
  }, [previewHit, ready])

  // ESC로 말풍선 닫기(EventSheet 패턴). 선택 중일 때만 바인딩.
  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, onClose])

  // '내 위치' 버튼 — 현재 위치 재요청 후 panTo. 거부/실패면 토스트(최소 폴백, spec §3.5).
  const recenter = () => {
    const nv = window.naver
    const map = mapRef.current
    if (!nv || !map) return
    void getCurrentPosition().then((r) => {
      if (r.ok) {
        map.panTo(new nv.maps.LatLng(r.lat, r.lng))
        map.setZoom(14)
        setLocToast(null)
      } else {
        setLocToast(
          r.reason === 'denied'
            ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요.'
            : '현재 위치를 가져오지 못했어요.',
        )
        window.setTimeout(() => setLocToast(null), 3000)
      }
    })
  }

  if (error) {
    return (
      <div className={styles.fallback} role="alert">
        <p>지도를 불러오지 못했어요.</p>
        <p className={styles.fallbackHint}>{error}</p>
      </div>
    )
  }

  return (
    <div className={styles.mapHost}>
      <div ref={elRef} className={styles.map} aria-label="장소 지도" />
      <button type="button" className={styles.myLocBtn} onClick={recenter} aria-label="내 위치로 이동">
        📍
      </button>
      {locToast ? (
        <div className={styles.locToast} role="status" aria-live="polite">
          {locToast}
        </div>
      ) : null}
    </div>
  )
}
