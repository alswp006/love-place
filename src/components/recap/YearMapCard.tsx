import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { usePlaces } from '@/hooks/usePlaces'
import { useVisits } from '@/hooks/useVisits'
import { useTrips } from '@/hooks/useTrips'
import { useCoupleTotalKm } from '@/hooks/useCoupleTotals'
import { useCoupleRoutes } from '@/hooks/useCoupleRoutes'
import { buildYearMap, boundsOf, type YearStop } from '@/lib/recap/yearMap'
import { buildTripStops, tripAtPoint } from '@/lib/recap/tripStops'
import { drawKoreaMap, drawYearCard, projectForHitTest } from '@/lib/recap/yearCard'
import { KOREA_BOUNDS } from '@/lib/recap/koreaOutline'
import { shareRecapBlob } from '@/lib/recap/shareCard'
import { haptic } from '@/lib/haptics'
import styles from './YearMapCard.module.css'

// 전국 지도 — "우리가 다닌 한 해".
//
// 여행별 카드가 하루의 증거라면 이건 **쌓인 것의 증거**다. 오래 쓸수록 채워지는 그림이라
// 자랑거리이자 계속 쓸 이유가 된다(빈 곳이 보여야 다음 여행이 당긴다).
//
// 화면에도 공유본에도 **같은 draw 함수**를 쓴다 — 보이는 것과 올라가는 것이 다르면
// 공유 버튼을 누르는 순간 배신이다. 화면용은 축소 렌더일 뿐이다.

const CARD_W = 1080
const CARD_H = 1920
// 화면용 미리보기 — 지도만 그린다(제목·숫자·브랜딩은 아래 DOM이 맡는다).
// 전국 보기는 한국 실루엣 비율(가로:세로 ≈ 0.55). 여행 보기는 **그 동선의 비율**을 따른다 —
// 세로로 고정하면 가로로 뻗은 드라이브가 캔버스 절반만 쓰고 나머지는 빈 분홍이 된다.
const MAP_W = 560
const MAP_H = 1020
const TRIP_MAP_H = 820

export function YearMapCard({ coupleId }: { coupleId: string | null }) {
  const { data: places } = usePlaces(coupleId)
  const { data: visits } = useVisits(coupleId)
  const { data: trips } = useTrips(coupleId)
  const { data: totalKm } = useCoupleTotalKm(coupleId)
  // 실측 궤적 — 걸어간 길·차로 간 길. 지도의 주인공이다(0025 일괄 조회).
  const { data: routes } = useCoupleRoutes(coupleId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(false)
  // 고른 여행 — null이면 전국. 지도의 두 층(어디에 갔나 / 그날 어떻게 다녔나)을 오간다.
  const [tripId, setTripId] = useState<string | null>(null)

  const year = String(new Date().getFullYear())

  const stops = useMemo(() => {
    const byId = new Map((places ?? []).map((p) => [p.id, p]))
    return (visits ?? [])
      .map((v) => {
        const p = byId.get(v.place_id)
        if (!p || p.lat == null || p.lng == null) return null
        return {
          placeId: p.id,
          lat: p.lat,
          lng: p.lng,
          date: v.visit_date,
          regionLabel: p.region_label,
          tripId: v.trip_id,
        }
      })
      .filter((s): s is YearStop & { tripId: string | null } => s !== null)
  }, [places, visits])

  const tripStops = useMemo(() => buildTripStops(trips ?? [], stops), [trips, stops])
  const selected = tripStops.find((t) => t.tripId === tripId) ?? null

  // 여행 보기는 그 여행에 묶인 궤적만. 전국 보기는 전부.
  const traces = useMemo(
    () =>
      (routes ?? [])
        .filter((r) => (selected ? r.tripId === selected.tripId : true))
        .map((r) => r.points),
    [routes, selected],
  )

  // 전국 보기는 모든 방문, 여행 보기는 그 여행의 스톱만. 같은 buildYearMap을 쓴다.
  const map = useMemo(
    () =>
      selected
        ? buildYearMap(
            selected.stops.map((p, i) => ({
              placeId: `${selected.tripId}:${i}`,
              lat: p.lat,
              lng: p.lng,
              date: `${selected.startDate}T${String(i).padStart(2, '0')}`,
              regionLabel: null,
            })),
            traces,
          )
        : buildYearMap(stops, traces),
    [selected, stops, traces],
  )
  // 줌인 경계는 궤적까지 담아야 한다 — 스톱만 보면 차로 돌아온 길이 화면 밖으로 잘린다.
  const bounds = useMemo(
    () =>
      selected
        ? boundsOf([...selected.stops, ...traces.flat()])
        : KOREA_BOUNDS,
    [selected, traces],
  )
  const tripCount = trips?.length ?? 0

  const data = useMemo(
    () =>
      selected
        ? {
            periodLabel: selected.title,
            subtitle: `${selected.startDate} ~ ${selected.endDate} · ${selected.stopCount}곳`,
            map,
            totalKm: null,
            tripCount: null,
            bounds,
          }
        : {
            periodLabel: `우리가 다닌 ${year}`,
            map,
            totalKm: totalKm ?? null,
            tripCount,
            bounds,
          },
    [selected, year, map, totalKm, tripCount, bounds],
  )

  // 여행 보기 캔버스 크기 — 경계 비율에 맞춘다(위도에 따른 경도 압축 보정 포함).
  const canvasSize = useMemo(() => {
    if (!selected) return { w: MAP_W, h: MAP_H }
    const cos = Math.cos((((bounds.minLat + bounds.maxLat) / 2) * Math.PI) / 180)
    const aspect = ((bounds.maxLng - bounds.minLng) * cos) / Math.max(bounds.maxLat - bounds.minLat, 1e-9)
    // 극단적 비율은 조인다 — 한 방향으로만 간 여행이 실오라기나 띠가 되지 않게.
    const w = Math.round(Math.min(940, Math.max(420, TRIP_MAP_H * aspect)))
    return { w, h: TRIP_MAP_H }
  }, [selected, bounds])

  // 화면 미리보기 — **지도만**. 공유본과 같은 drawKoreaMap을 쓰므로 보이는 그림과
  // 올라가는 그림이 같다(다르면 공유 버튼을 누르는 순간 배신이다).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawKoreaMap(ctx, map, { x: 0, y: 0, w: canvasSize.w, h: canvasSize.h }, 'transparent', bounds)
  }, [map, bounds, canvasSize])

  // 캔버스 탭 → 그 자리의 여행. 전국 보기에서만 의미가 있다(이미 들어와 있으면 되돌아갈 뿐).
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selected) return
    const canvas = canvasRef.current
    if (!canvas) return
    const r = canvas.getBoundingClientRect()
    // CSS로 축소돼 있으므로 화면 좌표를 캔버스 좌표로 되돌린다.
    const x = ((e.clientX - r.left) / r.width) * MAP_W
    const y = ((e.clientY - r.top) / r.height) * MAP_H
    const hit = tripAtPoint(tripStops, { x, y }, (p) =>
      projectForHitTest(p, { x: 0, y: 0, w: MAP_W, h: MAP_H }, KOREA_BOUNDS),
    )
    // (전국 보기에서만 도달하므로 여기서는 항상 MAP_W/H가 맞다 — 위 early return 참조)
    if (hit) setTripId(hit.tripId)
  }

  const onShare = async () => {
    setBusy(true)
    try {
      const c = document.createElement('canvas')
      c.width = CARD_W
      c.height = CARD_H
      const ctx = c.getContext('2d')
      if (!ctx) return
      drawYearCard(ctx, data, CARD_W, CARD_H)
      const blob = await new Promise<Blob | null>((r) => c.toBlob((b) => r(b), 'image/png'))
      if (!blob) return
      await shareRecapBlob(blob, `${selected ? selected.title : `우리가-다닌-${year}`}.png`)
      haptic()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.wrap} aria-label={`우리가 다닌 ${year} 지도`}>
      {/* 그림만으로 말하지 않는다(§8) — 같은 내용을 글자로도 둔다. */}
      <div className={styles.head}>
        <span className={styles.title}>{selected ? selected.title : `우리가 다닌 ${year}`}</span>
        <span className={styles.meta}>
          {selected
            ? `${selected.startDate} ~ ${selected.endDate} · ${selected.stopCount}곳`
            : map.stopCount > 0
              ? `${map.regionCount}개 지역 · ${map.stopCount}곳`
              : '아직 지도가 비어 있어요'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className={selected ? styles.canvas : `${styles.canvas} ${styles.clickable}`}
        width={canvasSize.w}
        height={canvasSize.h}
        onClick={onCanvasClick}
        role="img"
        aria-label={
          map.stopCount > 0
            ? `${year}년에 ${map.regionCount}개 지역 ${map.stopCount}곳을 다녀온 전국 지도`
            : `${year}년 전국 지도 — 아직 다녀온 곳이 없어요`
        }
      />
      {/* 여행 고르기 — 캔버스 탭은 발견성이 낮고 키보드로 못 쓴다. 칩이 그 대체 경로다(ux §1).
          스톱이 없는 여행은 애초에 목록에 없다(눌러도 빈 지도가 나오는 항목은 잡음이다). */}
      {tripStops.length > 0 ? (
        <div className={styles.chips} role="group" aria-label="지도에서 볼 여행 고르기">
          <button
            type="button"
            className={`${styles.chip} ${selected ? '' : styles.chipOn}`}
            aria-pressed={!selected}
            onClick={() => setTripId(null)}
          >
            전국
          </button>
          {tripStops.map((t) => (
            <button
              key={t.tripId}
              type="button"
              className={`${styles.chip} ${selected?.tripId === t.tripId ? styles.chipOn : ''}`}
              aria-pressed={selected?.tripId === t.tripId}
              onClick={() => setTripId(t.tripId)}
            >
              {t.title}
            </button>
          ))}
        </div>
      ) : null}

      <Button variant="ghost" onClick={() => void onShare()} disabled={busy} className={styles.share}>
        {busy ? '준비 중…' : selected ? '이 여행 공유하기' : '지도 공유하기'}
      </Button>
    </section>
  )
}
