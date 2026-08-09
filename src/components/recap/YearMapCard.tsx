import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { usePlaces } from '@/hooks/usePlaces'
import { useVisits } from '@/hooks/useVisits'
import { useTrips } from '@/hooks/useTrips'
import { useCoupleTotalKm } from '@/hooks/useCoupleTotals'
import { buildYearMap, type YearStop } from '@/lib/recap/yearMap'
import { drawKoreaMap, drawYearCard } from '@/lib/recap/yearCard'
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
// 한국 실루엣의 가로:세로가 약 0.55라 그 비율로 잡아야 좌우 여백이 안 생긴다.
const MAP_W = 560
const MAP_H = 1020

export function YearMapCard({ coupleId }: { coupleId: string | null }) {
  const { data: places } = usePlaces(coupleId)
  const { data: visits } = useVisits(coupleId)
  const { data: trips } = useTrips(coupleId)
  const { data: totalKm } = useCoupleTotalKm(coupleId)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(false)

  const year = String(new Date().getFullYear())

  const stops: YearStop[] = useMemo(() => {
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
        } satisfies YearStop
      })
      .filter((s): s is YearStop => s !== null)
  }, [places, visits])

  const map = useMemo(() => buildYearMap(stops), [stops])
  const tripCount = trips?.length ?? 0

  const data = useMemo(
    () => ({ periodLabel: year, map, totalKm: totalKm ?? null, tripCount }),
    [year, map, totalKm, tripCount],
  )

  // 화면 미리보기 — **지도만**. 공유본과 같은 drawKoreaMap을 쓰므로 보이는 그림과
  // 올라가는 그림이 같다(다르면 공유 버튼을 누르는 순간 배신이다).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawKoreaMap(ctx, map, { x: 0, y: 0, w: MAP_W, h: MAP_H }, 'transparent')
  }, [map])

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
      await shareRecapBlob(blob, `우리가-다닌-${year}.png`)
      haptic()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.wrap} aria-label={`우리가 다닌 ${year} 지도`}>
      {/* 그림만으로 말하지 않는다(§8) — 같은 내용을 글자로도 둔다. */}
      <div className={styles.head}>
        <span className={styles.title}>우리가 다닌 {year}</span>
        <span className={styles.meta}>
          {map.stopCount > 0
            ? `${map.regionCount}개 지역 · ${map.stopCount}곳`
            : '아직 지도가 비어 있어요'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        width={MAP_W}
        height={MAP_H}
        role="img"
        aria-label={
          map.stopCount > 0
            ? `${year}년에 ${map.regionCount}개 지역 ${map.stopCount}곳을 다녀온 전국 지도`
            : `${year}년 전국 지도 — 아직 다녀온 곳이 없어요`
        }
      />
      <Button variant="ghost" onClick={() => void onShare()} disabled={busy} className={styles.share}>
        {busy ? '준비 중…' : '지도 공유하기'}
      </Button>
    </section>
  )
}
