import { useEffect, useRef, useState } from 'react'
import { loadNaverMaps } from '@/lib/naver/loadNaverMaps'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { WishStatus } from '@/lib/places/wishStatus'
import { deriveWishStatus } from '@/lib/places/wishStatus'
import type { ProfileMap } from '@/hooks/useProfiles'
import type { ReactionMap } from '@/hooks/useReactions'
import { markerVisual } from '@/lib/places/markerVisual'
import { markerIconHtml, BASE_ZINDEX, SELECTED_ZINDEX } from '@/lib/places/selectedMarker'
import { infoWindowHtml } from '@/lib/places/infoWindowHtml'
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
  onSelect,
  onClose,
  onAction,
}: {
  places: MarkerPlace[]
  visitedIds?: Set<string>
  profiles?: ProfileMap
  myId?: string | null
  reactions?: ReactionMap
  selectedId?: string | null
  onSelect?: (id: string) => void
  onClose?: () => void
  onAction?: (action: string, id: string) => void
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<naver.maps.Map | null>(null)
  const markersRef = useRef<naver.maps.Marker[]>([])
  const markerMapRef = useRef<Map<string, naver.maps.Marker>>(new Map())
  const listenersRef = useRef<naver.maps.MapEventListener[]>([])
  const infoRef = useRef<naver.maps.InfoWindow | null>(null)
  const infoHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  const mapClickRef = useRef<naver.maps.MapEventListener | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // onClose/onAction은 ref로 읽어 지도/마커 재초기화를 피한다(deps에 넣지 않음).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction

  // 지도 1회 초기화
  useEffect(() => {
    let cancelled = false
    loadNaverMaps()
      .then((nv) => {
        if (cancelled || !elRef.current) return
        mapRef.current = new nv.maps.Map(elRef.current, {
          center: new nv.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          zoom: 11,
          logoControl: true,
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
      mapRef.current = null
    }
  }, [])

  // 장소 변경 시 마커 다시 그림
  useEffect(() => {
    const nv = window.naver
    const map = mapRef.current
    if (!ready || !nv || !map) return

    // 이전 마커/리스너 정리(리스너 누락 금지).
    nv.maps.Event.removeListener(listenersRef.current)
    listenersRef.current = []
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []
    markerMapRef.current.clear()

    const pts = places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
    if (pts.length === 0) return

    const bounds = new nv.maps.LatLngBounds(
      new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!),
      new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!),
    )

    for (const p of pts) {
      const pos = new nv.maps.LatLng(p.lat!, p.lng!)
      const visual = markerVisual({
        visited: visitedIds?.has(p.id) ?? false,
        bothWished: p.wish?.bothWished ?? false,
        name: p.name,
      })
      const modifier =
        visual.kind === 'visited' ? styles.pinVisited : visual.kind === 'both' ? styles.pinBoth : ''
      const pinClass = `${styles.pin} ${modifier}`.trim()
      const marker = new nv.maps.Marker({
        position: pos,
        map,
        title: visual.label,
        zIndex: BASE_ZINDEX,
        icon: {
          content: markerIconHtml({ glyph: visual.glyph, pinClass, label: visual.label, selected: false }),
          anchor: new nv.maps.Point(12, 24),
        },
      })
      const handle = nv.maps.Event.addListener(marker, 'click', () => onSelect?.(p.id))
      listenersRef.current.push(handle)
      markersRef.current.push(marker)
      markerMapRef.current.set(p.id, marker)
      bounds.extend(pos)
    }
    if (pts.length > 1) map.fitBounds(bounds)
    else map.setCenter(new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!))
  }, [places, ready, visitedIds, onSelect])

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

    if (!selectedId) {
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
      profiles ?? {},
      myId ?? null,
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
  }, [selectedId, places, ready, visitedIds, reactions, profiles, myId])

  // ESC로 말풍선 닫기(EventSheet 패턴). 선택 중일 때만 바인딩.
  useEffect(() => {
    if (!selectedId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedId, onClose])

  if (error) {
    return (
      <div className={styles.fallback} role="alert">
        <p>지도를 불러오지 못했어요.</p>
        <p className={styles.fallbackHint}>{error}</p>
      </div>
    )
  }

  return <div ref={elRef} className={styles.map} aria-label="장소 지도" />
}
