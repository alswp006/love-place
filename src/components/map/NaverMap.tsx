import { useEffect, useRef, useState } from 'react'
import { loadNaverMaps } from '@/lib/naver/loadNaverMaps'
import type { PlaceRow } from '@/hooks/usePlaces'
import type { WishStatus } from '@/lib/places/wishStatus'
import { markerVisual } from '@/lib/places/markerVisual'
import { clusterPlaces, type ClusterPoint } from '@/lib/places/clusterPlaces'
import { markerIconHtml, BASE_ZINDEX, SELECTED_ZINDEX } from '@/lib/places/selectedMarker'
import { escapeHtml } from '@/lib/places/infoWindowHtml'
import type { KakaoPlaceHit } from '@/lib/kakao/types'
import type { SnapStop } from '@/lib/places/sheetSnap'
import { getCurrentPosition, getPermissionState, shouldAutoLocate } from '@/lib/geo/currentPosition'
import styles from './NaverMap.module.css'

// 네이버 지도 + 장소 마커(§5.5). 네이버 검색 좌표(WGS84)를 그대로 핀으로 찍는다.
// 마커는 색만이 아니라 모양/라벨로도 구분(§8 접근성): 둘 다 찜=♥(퍼플), 그 외=★(브랜드).
// 가본 곳(채운 별+체크) 구분은 P3.
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 } // 서울 시청(빈 상태 기본 중심)

type MarkerPlace = PlaceRow & { wish?: WishStatus }

export function NaverMap({
  places,
  visitedIds,
  selectedId,
  previewHit,
  snap,
  onSelect,
  onClose,
}: {
  places: MarkerPlace[]
  visitedIds?: Set<string>
  selectedId?: string | null
  previewHit?: KakaoPlaceHit | null
  snap: SnapStop
  onSelect?: (id: string) => void
  onClose?: () => void
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<naver.maps.Map | null>(null)
  const markersRef = useRef<naver.maps.Marker[]>([])
  const markerMapRef = useRef<Map<string, naver.maps.Marker>>(new Map())
  const clusterMarkersRef = useRef<naver.maps.Marker[]>([])
  const listenersRef = useRef<naver.maps.MapEventListener[]>([])
  const mapMoveRef = useRef<naver.maps.MapEventListener[]>([])
  const mapClickRef = useRef<naver.maps.MapEventListener | null>(null)
  const previewMarkerRef = useRef<naver.maps.Marker | null>(null)
  // 내 위치 self-dot + accuracy 원(spec §3.5). userMovedRef: 사용자가 지도를 드래그하면 자동 센터링 중단.
  const selfMarkerRef = useRef<naver.maps.Marker | null>(null)
  const accuracyCircleRef = useRef<naver.maps.Circle | null>(null)
  const userMovedRef = useRef(false)
  const userMovedListenerRef = useRef<naver.maps.MapEventListener | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [isLocating, setIsLocating] = useState(false)
  // 로드 실패 후 '다시 시도'로 init effect를 재실행하기 위한 버전 키(ux §7 에러 상태).
  const [loadKey, setLoadKey] = useState(0)
  const [locToast, setLocToast] = useState<string | null>(null)
  // 초기 센터링은 ready 직후 1회만(이후 마커 변경으로 지도가 튀지 않게, spec §3.5).
  // centeredRef: 한 번이라도 센터를 잡았으면(내 위치 성공 또는 저장장소 fitBounds) true → 더는 자동 이동 안 함.
  // geoSettledRef: geolocation 응답(성공/실패)이 왔는지. 실패로 끝났는데 그 시점 places가 비어 있던 경우,
  //   places가 나중에 채워지면 저장장소 fitBounds 폴백을 1회 재평가하기 위한 게이트(빈→채움 순서 가드, spec §2 폴백 체인).
  const centeredRef = useRef(false)
  const geoSettledRef = useRef<'pending' | 'ok' | 'failed'>('pending')

  // onClose는 ref로 읽어 지도/마커 재초기화를 피한다(deps에 넣지 않음).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // onSelect도 ref로 읽어 마커 재드로우 효과의 deps에서 제외(매 렌더 재구축 방지).
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  // selectedId도 ref로 읽는다 — render 효과(deps [places, ready])가 idle/zoom_changed에서
  // 마커를 재구축할 때 stale 클로저의 선택값을 쓰지 않게(선택 강조가 pan/zoom에서 깜빡 사라짐 방지, R1.6).
  const selectedIdRef = useRef<string | null>(selectedId ?? null)
  selectedIdRef.current = selectedId ?? null

  // 지도 초기화(loadKey 재시도 시 재실행). loadNaverMaps()는 promise를 메모이즈하므로
  // 1차 실패가 캐시되면 재시도가 같은 거부 promise를 다시 받는다 → window.naver.maps가
  // 이미 있으면 그것으로 바로 지도를 만들고, 없을 때만 loadNaverMaps()를 호출한다(회복 시 재로드 가능).
  useEffect(() => {
    let cancelled = false
    const build = (nv: typeof naver) => {
      if (cancelled || !elRef.current) return
      mapRef.current = new nv.maps.Map(elRef.current, {
        center: new nv.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
        zoom: 11,
        // 로고는 ToS상 유지(필수). 컨트롤을 상단으로 옮겨 하단 시트와 안 겹치게(spec R1.3).
        logoControl: true,
        logoControlOptions: { position: nv.maps.Position.TOP_LEFT },
        scaleControl: true,
        scaleControlOptions: { position: nv.maps.Position.TOP_RIGHT },
        mapDataControl: false,
      })
      setReady(true)
      // 지도 빈 곳 클릭 → 선택 해제(닫기).
      mapClickRef.current = nv.maps.Event.addListener(mapRef.current, 'click', () =>
        onCloseRef.current?.(),
      )
      // 사용자 드래그 → 자동 센터링 중단(dragend만 — 프로그램적 setZoom의 zoom_changed 오탐 방지, dossier 02 §4.4).
      userMovedListenerRef.current = nv.maps.Event.addListener(mapRef.current, 'dragend', () => {
        userMovedRef.current = true
      })
    }
    const existing =
      (typeof window !== 'undefined' && window.naver?.maps && window.naver) || null
    if (existing) {
      build(existing)
    } else {
      loadNaverMaps()
        .then((nv) => build(nv))
        .catch((e: Error) => {
          if (!cancelled) setError(e.message)
        })
    }
    return () => {
      cancelled = true
      window.naver?.maps.Event.removeListener(listenersRef.current)
      listenersRef.current = []
      if (mapClickRef.current) window.naver?.maps.Event.removeListener(mapClickRef.current)
      mapClickRef.current = null
      markersRef.current.forEach((m) => m.setMap(null))
      markersRef.current = []
      markerMapRef.current.clear()
      clusterMarkersRef.current.forEach((m) => m.setMap(null))
      clusterMarkersRef.current = []
      window.naver?.maps.Event.removeListener(mapMoveRef.current)
      mapMoveRef.current = []
      previewMarkerRef.current?.setMap(null)
      previewMarkerRef.current = null
      selfMarkerRef.current?.setMap(null)
      selfMarkerRef.current = null
      accuracyCircleRef.current?.setMap(null)
      accuracyCircleRef.current = null
      if (userMovedListenerRef.current)
        window.naver?.maps.Event.removeListener(userMovedListenerRef.current)
      userMovedListenerRef.current = null
      mapRef.current = null
    }
  }, [loadKey])

  // 장소/줌 변경 시 마커를 클러스터 인지 방식으로 다시 그림(spec §3.7).
  // 단일(single)은 기존처럼 markerMapRef에 등록(선택 강조 효과가 이를 사용).
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
          const isSelected = p.id === selectedIdRef.current
          const marker = new nv.maps.Marker({
            position: new nv.maps.LatLng(g.lat, g.lng),
            map: m,
            title: visual.label,
            zIndex: isSelected ? SELECTED_ZINDEX : BASE_ZINDEX,
            icon: {
              content: markerIconHtml({
                glyph: visual.glyph,
                pinClass,
                label: visual.label,
                selected: isSelected,
                badge: visual.badge,
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

  // 내 위치 self-dot(파란 점) + accuracy 원을 그리고 self+places로 fitBounds(spec §3.5).
  // 마커/원은 1개만 — 위치/반경만 갱신(재생성 금지). places의 좌표 유효 핀까지 bounds에 포함.
  const showSelf = (lat: number, lng: number, accuracy: number) => {
    const nv = window.naver
    const map = mapRef.current
    if (!nv || !map) return
    const pos = new nv.maps.LatLng(lat, lng)
    if (selfMarkerRef.current) selfMarkerRef.current.setPosition(pos)
    else
      selfMarkerRef.current = new nv.maps.Marker({
        position: pos,
        map,
        zIndex: SELECTED_ZINDEX + 2,
        icon: {
          content: `<div class="${styles.selfDot}" aria-label="내 위치"></div>`,
          anchor: new nv.maps.Point(8, 8),
        },
      })
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setCenter(pos)
      accuracyCircleRef.current.setRadius(accuracy)
    } else
      accuracyCircleRef.current = new nv.maps.Circle({
        map,
        center: pos,
        radius: accuracy,
        strokeColor: '#4285F4',
        strokeWeight: 1,
        strokeOpacity: 0.4,
        fillColor: '#4285F4',
        fillOpacity: 0.12,
        clickable: false,
        zIndex: 0,
      })
    const pts = places.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
    const b = new nv.maps.LatLngBounds(pos, pos)
    for (const p of pts) b.extend(new nv.maps.LatLng(p.lat!, p.lng!))
    map.fitBounds(b)
  }

  // 초기 센터링 1/2 — granted일 때만 자동 locate(추가 프롬프트 금지, spec §3.5 / dossier 02 §4.6).
  // 성공: self-dot + accuracy 원 + self+places fitBounds, centeredRef로 고정(이후 자동 이동 없음).
  //   단 사용자가 이미 지도를 드래그(userMovedRef)했으면 자동 센터링 생략.
  // 미granted/실패/미지원: 지도를 건드리지 않고 geoSettledRef='failed'만 기록 →
  //   저장장소 fitBounds 폴백은 아래 별도 효과가 places 적재 시점에 맞춰 1회 수행(빈→채움 순서 가드).
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !window.naver || !map || geoSettledRef.current !== 'pending') return
    let cancelled = false
    void getPermissionState().then((state) => {
      if (cancelled || !mapRef.current) return
      if (!shouldAutoLocate(state)) {
        // 추가 프롬프트 회피 — 자동 locate 안 함. 서울/저장장소 폴백에 위임.
        geoSettledRef.current = 'failed'
        return
      }
      void getCurrentPosition().then((r) => {
        if (cancelled || !mapRef.current) return
        if (r.ok) {
          geoSettledRef.current = 'ok'
          if (!userMovedRef.current) {
            centeredRef.current = true
            showSelf(r.lat, r.lng, r.accuracy)
          }
        } else {
          // 실패 — best-effort 폴백은 places 효과에 위임(아래). 지도는 그대로(서울 초기 center).
          geoSettledRef.current = 'failed'
        }
      })
    })
    return () => {
      cancelled = true
    }
    // showSelf는 매 렌더 재생성되지만 ready 직후 1회만 실행(geoSettledRef 가드) — deps 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        content: markerIconHtml({ glyph: visual.glyph, pinClass, label: visual.label, selected, badge: visual.badge }),
        anchor: new nv.maps.Point(12, 24),
      })
      marker.setZIndex(selected ? SELECTED_ZINDEX : BASE_ZINDEX)
    }
    if (selectedId) {
      const m = markerMapRef.current.get(selectedId)
      if (m) map.panTo(m.getPosition())
    }
  }, [selectedId, places, ready, visitedIds])

  // 프리뷰(미저장 검색 후보) — 전용 transient 마커만 구동(상세/액션은 시트, Task 12). 말풍선 없음.
  useEffect(() => {
    const nv = window.naver
    const map = mapRef.current
    if (!ready || !nv || !map) return

    if (!previewHit) {
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

  // '내 위치' 버튼(📍) — 명시적 사용자 탭. high-accuracy 요청 → self-dot+accuracy 원 + fitBounds.
  // isLocating 중 중복 호출 방지(스피너/비활성). 거부/타임아웃/insecure 별 복구 메시지(spec §3.5).
  const recenter = () => {
    const nv = window.naver
    const map = mapRef.current
    if (!nv || !map || isLocating) return
    setIsLocating(true)
    void getCurrentPosition({ highAccuracy: true })
      .then((r) => {
        if (r.ok) {
          userMovedRef.current = false
          showSelf(r.lat, r.lng, r.accuracy)
          setLocToast(null)
        } else {
          const msg = !window.isSecureContext
            ? '보안 연결(HTTPS)에서만 위치를 쓸 수 있어요.'
            : r.reason === 'denied'
              ? '위치 권한이 꺼져 있어요. 설정 > Safari > 위치에서 허용해 주세요.'
              : r.reason === 'timeout'
                ? '위치 확인이 오래 걸려요. 다시 시도해 주세요.'
                : '현재 위치를 가져오지 못했어요.'
          setLocToast(msg)
        }
      })
      .finally(() => setIsLocating(false))
  }

  if (error) {
    return (
      <div className={styles.fallback} role="alert">
        <p>지도를 불러오지 못했어요.</p>
        <p className={styles.fallbackHint}>{error}</p>
        <button
          type="button"
          className={styles.retryBtn}
          onClick={() => {
            setError(null)
            setReady(false)
            setLoadKey((k) => k + 1)
          }}
        >
          다시 시도
        </button>
      </div>
    )
  }

  // snap>peek면 확장된 시트에 가려지므로 플로팅 버튼/토스트를 숨긴다(트리 유지·data-hidden, spec §3.1).
  const floatingHidden = snap !== 'peek'

  return (
    <div className={styles.mapHost}>
      <div ref={elRef} className={styles.map} aria-label="장소 지도" />
      <button
        type="button"
        className={styles.myLocBtn}
        onClick={recenter}
        aria-label={isLocating ? '내 위치 확인 중' : '내 위치로 이동'}
        aria-busy={isLocating}
        disabled={isLocating}
        aria-hidden={floatingHidden}
        data-hidden={floatingHidden ? 'true' : undefined}
        tabIndex={floatingHidden ? -1 : 0}
      >
        {isLocating ? <span className={styles.spinner} aria-hidden="true" /> : '📍'}
      </button>
      {locToast ? (
        <div
          className={styles.locToast}
          role="status"
          aria-live="polite"
          aria-hidden={floatingHidden}
          data-hidden={floatingHidden ? 'true' : undefined}
        >
          {locToast}
        </div>
      ) : null}
    </div>
  )
}
