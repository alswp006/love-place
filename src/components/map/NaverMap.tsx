import { useEffect, useRef, useState } from 'react'
import { loadNaverMaps } from '@/lib/naver/loadNaverMaps'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { WishStatus } from '@/lib/places/wishStatus'
import type { ProfileMap } from '@/hooks/useProfiles'
import type { ReactionMap } from '@/hooks/useReactions'
import { markerVisual } from '@/lib/places/markerVisual'
import { markerIconHtml, BASE_ZINDEX, SELECTED_ZINDEX } from '@/lib/places/selectedMarker'
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
}: {
  places: MarkerPlace[]
  visitedIds?: Set<string>
  profiles?: ProfileMap
  myId?: string | null
  reactions?: ReactionMap
  selectedId?: string | null
  onSelect?: (id: string) => void
  onClose?: () => void
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<naver.maps.Map | null>(null)
  const markersRef = useRef<naver.maps.Marker[]>([])
  const markerMapRef = useRef<Map<string, naver.maps.Marker>>(new Map())
  const listenersRef = useRef<naver.maps.MapEventListener[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // 출처/리액션/닫기 props는 P-C·P-D에서 와이어링 예정 — 이번 커밋은 no-op 골격(미사용 경고 억제).
  void onClose
  void profiles
  void myId
  void reactions

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
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
      window.naver?.maps.Event.removeListener(listenersRef.current)
      listenersRef.current = []
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
