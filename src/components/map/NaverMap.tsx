import { useEffect, useRef, useState } from 'react'
import { loadNaverMaps } from '@/lib/naver/loadNaverMaps'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { WishStatus } from '@/lib/places/wishStatus'
import { markerVisual } from '@/lib/places/markerVisual'
import styles from './NaverMap.module.css'

// 네이버 지도 + 장소 마커(§5.5). 네이버 검색 좌표(WGS84)를 그대로 핀으로 찍는다.
// 마커는 색만이 아니라 모양/라벨로도 구분(§8 접근성): 둘 다 찜=♥(퍼플), 그 외=★(브랜드).
// 가본 곳(채운 별+체크) 구분은 P3.
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 } // 서울 시청(빈 상태 기본 중심)

type MarkerPlace = PlaceRow & { wish?: WishStatus }

// 마커 라벨은 innerHTML로 들어가므로 따옴표·꺾쇠 이스케이프(이름에 " 들어가도 안전).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function NaverMap({ places, visitedIds }: { places: MarkerPlace[]; visitedIds?: Set<string> }) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<naver.maps.Map | null>(null)
  const markersRef = useRef<naver.maps.Marker[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

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
      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []
      mapRef.current = null
    }
  }, [])

  // 장소 변경 시 마커 다시 그림
  useEffect(() => {
    const nv = window.naver
    const map = mapRef.current
    if (!ready || !nv || !map) return

    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []

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
      const modifier = visual.kind === 'visited' ? styles.pinVisited : visual.kind === 'both' ? styles.pinBoth : ''
      const pinClass = `${styles.pin} ${modifier}`.trim()
      const marker = new nv.maps.Marker({
        position: pos,
        map,
        title: visual.label,
        icon: {
          content: `<div class="${pinClass}" aria-label="${escapeHtml(visual.label)}">${visual.glyph}</div>`,
          anchor: new nv.maps.Point(12, 24),
        },
      })
      markersRef.current.push(marker)
      bounds.extend(pos)
    }
    if (pts.length > 1) map.fitBounds(bounds)
    else map.setCenter(new nv.maps.LatLng(pts[0]!.lat!, pts[0]!.lng!))
  }, [places, ready, visitedIds])

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
