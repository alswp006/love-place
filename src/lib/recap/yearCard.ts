import { KOREA_BOUNDS, KOREA_RINGS } from './koreaOutline'
import { projectWith, type Bounds, type YearMapData } from './yearMap'
import { formatTotalKm } from './sharePath'

// 전국 지도 카드 — "우리가 다닌 한 해".
//
// 여행별 카드가 하루의 증거라면 이건 **쌓인 것의 증거**다. 오래 쓸수록 좋아지는 아티팩트라
// 자랑거리이자 계속 쓸 이유가 된다(빈 지도가 채워지는 걸 보는 재미).
//
// 지도는 한국 전체 경계로 고정한다 — 방문지에 맞춰 확대하면 한 곳을 갔든 스무 곳을 갔든
// 같은 그림이 나와서 '얼마나 다녔는지'가 사라진다. 빈 곳이 보여야 다음 여행이 당긴다.

const W = 1080
const H = 1920

const BG = '#fff1f4'
const LAND = '#ffd9e3' // 채운 육지 — 배경과 너무 붙으면 실루엣이 안 읽힌다
const LAND_EDGE = '#f8b3c6'
const INK = '#4a3038'
const INK_SOFT = '#8d6b76'
const THREAD = '#e2638a'
const DOT = '#b23a60'
const ACCENT = '#b23a60'

export type YearCardData = {
  /** "2026" 같은 라벨. 한 해가 아니면 "우리가 다닌 길" 등으로 호출부가 정한다. */
  periodLabel: string
  map: YearMapData
  /** 함께 걸은 누적 거리(km). 없으면 줄을 그리지 않는다. */
  totalKm?: number | null
  /** 여행 횟수 — 지역 수만으로는 '몇 번 나갔는지'가 안 보인다. */
  tripCount?: number | null
  /** 지도 경계. 여행 하나를 골라 공유하면 그 여행으로 확대된다. */
  bounds?: Bounds
  /** 부제(여행 기간 등). 없으면 지역·곳 수를 쓴다. */
  subtitle?: string | null
}

/**
 * 지도만 그린다 — 실루엣 + 한 해의 실 + 다녀온 점.
 *
 * 앱 화면과 공유본이 **같은 함수**를 쓴다. 화면엔 지도만, 공유본은 이걸 감싸 제목·숫자·브랜딩을
 * 얹는다. 앱 안에 공유 카드를 통째로 박으면 제목이 두 번 나오고 워터마크가 앱에 떠 있게 된다.
 */
export function drawKoreaMap(
  ctx: CanvasRenderingContext2D,
  map: YearMapData,
  box: { x: number; y: number; w: number; h: number },
  bg = BG,
  bounds: Bounds = KOREA_BOUNDS,
): void {
  const zoomed = bounds !== KOREA_BOUNDS
  const project = (p: { lat: number; lng: number }) => projectWith(p, bounds, box)

  // 줌인하면 실루엣 대부분이 상자 밖으로 나간다 — 잘라내지 않으면 카드 전체를 덮는다.
  ctx.save()
  ctx.beginPath()
  ctx.rect(box.x, box.y, box.w, box.h)
  ctx.clip()

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const scale = Math.min(box.w / 900, 1) // 작게 그릴 땐 선·점도 같이 줄어야 한다

  // 여행 하나로 줌인하면 실루엣을 그리지 않는다.
  // 전국 216점짜리 외곽선은 속초 근처에 점이 두세 개뿐이라, 그 축척에서는 해안선이 아니라
  // 뭉툭한 분홍 쐐기로 보인다. 지리 정보를 주지도 못하면서 동선을 가린다.
  // 그 축척의 주인공은 동선 자체다(여행 공유 카드가 배경 없이 선만 그리는 것과 같은 이유).
  for (const ring of zoomed ? [] : KOREA_RINGS) {
    ctx.beginPath()
    ring.forEach(([lng, lat], i) => {
      const p = project({ lat, lng })
      if (i === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    })
    ctx.closePath()
    ctx.fillStyle = LAND
    ctx.fill()
    ctx.strokeStyle = LAND_EDGE
    ctx.lineWidth = Math.max(1.5, 4 * scale)
    ctx.stroke()
  }

  if (map.thread.length >= 2) {
    const pts = map.thread.map(project)
    ctx.strokeStyle = THREAD
    // 줌인하면 이 선이 그 여행의 동선이라 주인공이다. 전국 보기에서는 크게 물러난다 —
    // 전국을 가로지르는 선이 진하면 거미줄이 되어 '어디에 갔는가'를 덮는다.
    ctx.lineWidth = Math.max(2, (zoomed ? 9 : 5) * scale)
    ctx.globalAlpha = zoomed ? 0.9 : 0.3
    ctx.beginPath()
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  for (const d of map.dots) {
    const p = project(d)
    ctx.beginPath()
    ctx.arc(p.x, p.y, Math.max(5, (zoomed ? 16 : 13) * scale), 0, Math.PI * 2)
    ctx.fillStyle = DOT
    ctx.fill()
    ctx.lineWidth = Math.max(2, 6 * scale)
    ctx.strokeStyle = bg // 배경색 테두리 — 점이 겹쳐도 개수가 세어진다
    ctx.stroke()
  }
  ctx.restore()
}

/** 점 하나가 상자 안 어디에 찍히는지 — 캔버스 탭을 장소로 되돌릴 때 쓴다. */
export function projectForHitTest(
  p: { lat: number; lng: number },
  box: { x: number; y: number; w: number; h: number },
  bounds: Bounds = KOREA_BOUNDS,
): { x: number; y: number } {
  return projectWith(p, bounds, box)
}

export function drawYearCard(ctx: CanvasRenderingContext2D, data: YearCardData, w = W, h = H): void {
  const { periodLabel, map, totalKm, tripCount, bounds = KOREA_BOUNDS, subtitle } = data

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, w, h)

  ctx.textAlign = 'center'
  ctx.fillStyle = INK
  ctx.font = '700 88px sans-serif'
  ctx.fillText(periodLabel, w / 2, 190)

  ctx.fillStyle = INK_SOFT
  ctx.font = '500 44px sans-serif'
  ctx.fillText(
    subtitle ||
      (map.stopCount > 0 ? `${map.regionCount}개 지역 · ${map.stopCount}곳` : '아직 지도가 비어 있어요'),
    w / 2,
    258,
  )

  // ── 지도 ──
  const box = { x: 90, y: 330, w: w - 180, h: 1080 }
  drawKoreaMap(ctx, map, box, BG, bounds)

  // ── 숫자 ──
  const statY = box.y + box.h + 130
  const parts: string[] = []
  if (tripCount != null && tripCount > 0) parts.push(`여행 ${tripCount}번`)
  if (totalKm != null && totalKm > 0) parts.push(`함께 ${formatTotalKm(totalKm)}`)
  if (parts.length > 0) {
    ctx.fillStyle = ACCENT
    ctx.font = '700 72px sans-serif'
    ctx.fillText(parts.join(' · '), w / 2, statY)
  }

  ctx.fillStyle = INK_SOFT
  ctx.font = '500 40px sans-serif'
  ctx.fillText(
    map.stopCount > 0 ? '우리가 함께 다녀온 자리' : '첫 여행을 기록하면 지도가 채워져요',
    w / 2,
    statY + (parts.length > 0 ? 68 : 0),
  )

  ctx.fillStyle = ACCENT
  ctx.font = '600 48px sans-serif'
  ctx.fillText('love place', w / 2, h - 130)
}
